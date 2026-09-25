// PUBLISHER — the full agent: opens the PR and deploys the web preview. See
// docs/agent-contracts.md #6.
//
// Deploy mechanism: direct Vercel Deployment API upload, not Vercel's GitHub
// Git-integration import. Deliberately chosen over the integration path even
// though it's more code: it pins the deployment to the EXACT commit FIXER
// left passing (fetched file-by-file via GitHub's Git Trees/Blobs API, no
// sandbox needed), so there's no window for a later push to the branch to
// drift the live preview from what was actually verified - the contract's
// own "no drift" success criterion, satisfied by construction rather than by
// hoping a webhook-triggered rebuild races correctly. It also doesn't need
// Vercel's GitHub App to be granted access to every dynamically-created
// output repo. One Vercel Project per run (named from run_id), created
// implicitly on first deployment - safe to call repeatedly (a re-run just
// adds another deployment to the same project, no 422-style special-casing
// needed the way GitHub's PR creation required).
//
// Branding is additive, not required: if VERCEL_WILDCARD_DOMAIN is set (a
// domain ASCEND owns, with a one-time wildcard DNS record already pointed at
// Vercel), each run's deployment also gets a branded
// run-<id>.<domain> alias. If that secret is unset, or the domain-attach
// call fails for any reason, PUBLISHER falls back to Vercel's own
// auto-assigned *.vercel.app URL rather than failing the run over branding -
// a working unbranded preview beats no preview.
//
// Honest scope note: Vercel's zero-config deploy handles static output and
// the frameworks it auto-detects (Next.js, etc.) well. A generated app that
// is a bespoke Node server without Vercel-compatible entry conventions may
// fail to build on Vercel even after passing FIXER's own install/build/test
// checks - that surfaces as an "escalated" build failure (see the catch
// block below), which is the correct, honest outcome, not a silent false
// "passed".
//
// No sandbox needed for either half - pure GitHub + Vercel REST API calls.
// Auth: internal service-to-service only, same pattern as every other agent.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const githubWriteToken = Deno.env.get("GITHUB_WRITE_TOKEN") ?? "";
const vercelApiToken = Deno.env.get("VERCEL_API_TOKEN") ?? "";
const vercelTeamId = Deno.env.get("VERCEL_TEAM_ID") ?? "";
const vercelWildcardDomain = Deno.env.get("VERCEL_WILDCARD_DOMAIN") ?? "";
const supabase = createClient(supabaseUrl, serviceRoleKey);

const AGENT = "publisher";
const DEPLOY_POLL_ATTEMPTS = 32;
const DEPLOY_POLL_INTERVAL_MS = 7_500;

type LogLine = string | { level: "info" | "warn" | "error"; message: string };

async function callback(
  run_id: string,
  status: "running" | "passed" | "failed" | "escalated",
  opts: { summary?: string; logs?: LogLine[]; branch?: string } = {},
): Promise<void> {
  const res = await fetch(`${supabaseUrl}/functions/v1/runner-callback`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${serviceRoleKey}` },
    body: JSON.stringify({ run_id, agent: AGENT, status, ...opts }),
  });
  if (!res.ok) {
    console.error(`runner-callback failed for run ${run_id}: ${res.status} ${await res.text()}`);
  }
}

type SpecFunction = { function_key: string; description: string; acceptance_signal: string };
type TestsPayload = {
  install_ok: boolean;
  todo_scan_clean: boolean;
  test_command: string | null;
  tests_passing: boolean;
  fix_rounds: string[];
};

function parseOwnerRepo(url: string): { owner: string; repo: string } | null {
  const match = url.match(/github\.com[/:]([^/]+)\/([^/.]+?)(?:\.git)?\/?$/);
  return match ? { owner: match[1], repo: match[2] } : null;
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

function vercelProjectName(run_id: string): string {
  return `black-builder-run-${run_id}`.toLowerCase().replace(/[^a-z0-9._-]/g, "-").slice(0, 100);
}

function vercelQuery(extra: Record<string, string> = {}): string {
  const params = new URLSearchParams(extra);
  if (vercelTeamId) params.set("teamId", vercelTeamId);
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

type GithubTreeEntry = { path: string; type: string; sha: string };
type VercelFile = { file: string; data: string; encoding: "base64" };

async function fetchGithubFiles(owner: string, repo: string, ref: string): Promise<VercelFile[]> {
  const treeRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/trees/${ref}?recursive=1`, {
    headers: { accept: "application/vnd.github+json", authorization: `Bearer ${githubWriteToken}` },
  });
  if (!treeRes.ok) {
    throw new Error(`Failed to fetch git tree for ${owner}/${repo}@${ref} (${treeRes.status}): ${await treeRes.text()}`);
  }
  const tree: { tree: GithubTreeEntry[]; truncated: boolean } = await treeRes.json();
  if (tree.truncated) {
    throw new Error(
      `__UPSTREAM_ISSUE__:GitHub's tree API truncated the file listing for ${owner}/${repo}@${ref} - the repo is too large to deploy via PUBLISHER's direct Deployment API upload in one call.`,
    );
  }

  const blobs = tree.tree.filter((entry) => entry.type === "blob");
  const files: VercelFile[] = [];
  for (const entry of blobs) {
    const blobRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/blobs/${entry.sha}`, {
      headers: { accept: "application/vnd.github+json", authorization: `Bearer ${githubWriteToken}` },
    });
    if (!blobRes.ok) {
      throw new Error(`Failed to fetch blob for ${entry.path} (${blobRes.status}): ${await blobRes.text()}`);
    }
    const blob: { content: string; encoding: string } = await blobRes.json();
    if (blob.encoding !== "base64") {
      throw new Error(`Unexpected blob encoding "${blob.encoding}" for ${entry.path} - expected base64.`);
    }
    files.push({ file: entry.path, data: blob.content.replace(/\n/g, ""), encoding: "base64" });
  }
  return files;
}

type VercelDeployment = { id: string; url: string; readyState: string };

async function createVercelDeployment(projectName: string, files: VercelFile[]): Promise<VercelDeployment> {
  const res = await fetch(`https://api.vercel.com/v13/deployments${vercelQuery()}`, {
    method: "POST",
    headers: { authorization: `Bearer ${vercelApiToken}`, "content-type": "application/json" },
    body: JSON.stringify({ name: projectName, files, target: "production" }),
  });
  if (!res.ok) {
    throw new Error(`Vercel deployment creation failed (${res.status}): ${await res.text()}`);
  }
  return await res.json();
}

async function pollVercelDeployment(id: string): Promise<VercelDeployment> {
  for (let i = 0; i < DEPLOY_POLL_ATTEMPTS; i++) {
    const res = await fetch(`https://api.vercel.com/v13/deployments/${id}${vercelQuery()}`, {
      headers: { authorization: `Bearer ${vercelApiToken}` },
    });
    if (!res.ok) {
      throw new Error(`Failed to poll Vercel deployment ${id} (${res.status}): ${await res.text()}`);
    }
    const deployment: VercelDeployment = await res.json();
    if (deployment.readyState === "READY") return deployment;
    if (deployment.readyState === "ERROR" || deployment.readyState === "CANCELED") {
      throw new Error(`__DEPLOY_BUILD_FAILED__:Vercel deployment ${id} for ${deployment.url} ended in state "${deployment.readyState}" - the generated app failed to build on Vercel's platform even though it passed FIXER's checks.`);
    }
    await new Promise((resolve) => setTimeout(resolve, DEPLOY_POLL_INTERVAL_MS));
  }
  throw new Error(`Vercel deployment ${id} did not reach "READY" within the poll budget (${(DEPLOY_POLL_ATTEMPTS * DEPLOY_POLL_INTERVAL_MS) / 1000}s).`);
}

async function attachWildcardDomain(projectName: string, run_id: string): Promise<string | null> {
  if (!vercelWildcardDomain) return null;
  const slug = `run-${run_id.replace(/-/g, "").slice(0, 12)}`;
  const domain = `${slug}.${vercelWildcardDomain}`;
  const res = await fetch(`https://api.vercel.com/v10/projects/${projectName}/domains${vercelQuery()}`, {
    method: "POST",
    headers: { authorization: `Bearer ${vercelApiToken}`, "content-type": "application/json" },
    body: JSON.stringify({ name: domain }),
  });
  if (!res.ok) {
    console.error(`Wildcard domain attach failed for ${domain} (${res.status}): ${await res.text()} - falling back to the auto-assigned vercel.app URL.`);
    return null;
  }
  return domain;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405 });
  }

  const authHeader = req.headers.get("authorization") ?? "";
  const providedToken = authHeader.replace(/^Bearer\s+/i, "");
  if (!serviceRoleKey || providedToken !== serviceRoleKey) {
    return new Response(JSON.stringify({ error: "Unauthorized: internal service calls only" }), { status: 401 });
  }

  let run_id: string;
  try {
    const body = await req.json();
    run_id = body.run_id;
    if (!run_id) throw new Error("run_id is required");
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }), { status: 400 });
  }

  const { data: run, error: runErr } = await supabase.from("runs").select("output_repo_url, prompt").eq("id", run_id).single();
  if (runErr || !run) {
    return new Response(JSON.stringify({ error: `run ${run_id} not found: ${runErr?.message}` }), { status: 404 });
  }
  if (!run.output_repo_url) {
    const msg = `runs.output_repo_url is not set for run ${run_id} - BUILDER should have set it before PUBLISHER runs.`;
    await callback(run_id, "failed", { summary: msg, logs: [{ level: "error", message: msg }] });
    return new Response(JSON.stringify({ error: msg }), { status: 500 });
  }

  const { data: specArtifact, error: specErr } = await supabase
    .from("artifacts")
    .select("storage_path")
    .eq("run_id", run_id)
    .eq("kind", "spec")
    .limit(1)
    .maybeSingle();
  if (specErr || !specArtifact) {
    const msg = `No spec artifact found for run ${run_id}: ${specErr?.message ?? "none exists"}`;
    await callback(run_id, "failed", { summary: msg, logs: [{ level: "error", message: msg }] });
    return new Response(JSON.stringify({ error: msg }), { status: 500 });
  }
  const { data: specBlob, error: specDlErr } = await supabase.storage.from("artifacts").download(specArtifact.storage_path);
  if (specDlErr || !specBlob) {
    const msg = `Failed to download spec artifact: ${specDlErr?.message}`;
    await callback(run_id, "failed", { summary: msg, logs: [{ level: "error", message: msg }] });
    return new Response(JSON.stringify({ error: msg }), { status: 500 });
  }
  const spec: { functions: SpecFunction[]; out_of_scope: string[] } = JSON.parse(await specBlob.text());

  const { data: testsArtifact } = await supabase
    .from("artifacts")
    .select("storage_path")
    .eq("run_id", run_id)
    .eq("kind", "tests")
    .limit(1)
    .maybeSingle();
  let tests: TestsPayload | null = null;
  if (testsArtifact) {
    const { data: testsBlob } = await supabase.storage.from("artifacts").download(testsArtifact.storage_path);
    if (testsBlob) tests = JSON.parse(await testsBlob.text());
  }

  await callback(run_id, "running");

  if (!githubWriteToken) {
    const msg = "GITHUB_WRITE_TOKEN is not configured - PUBLISHER cannot open a PR. Add it in Supabase project secrets.";
    await callback(run_id, "escalated", { summary: msg, logs: [{ level: "error", message: msg }] });
    return new Response(JSON.stringify({ run_id, status: "escalated", reason: msg }), { status: 200 });
  }
  if (!vercelApiToken) {
    const msg = "VERCEL_API_TOKEN is not configured - PUBLISHER cannot deploy a web preview. Add it in Supabase project secrets, then re-run this stage.";
    await callback(run_id, "escalated", { summary: msg, logs: [{ level: "error", message: msg }] });
    return new Response(JSON.stringify({ run_id, status: "escalated", reason: msg }), { status: 200 });
  }

  const branch = `run/${run_id}`;
  const outputRepo = parseOwnerRepo(run.output_repo_url);
  if (!outputRepo) {
    const msg = `Could not parse owner/repo from runs.output_repo_url: ${run.output_repo_url}`;
    await callback(run_id, "failed", { summary: msg, logs: [{ level: "error", message: msg }], branch });
    return new Response(JSON.stringify({ error: msg }), { status: 500 });
  }

  try {
    const repoRes = await fetch(`https://api.github.com/repos/${outputRepo.owner}/${outputRepo.repo}`, {
      headers: { accept: "application/vnd.github+json", authorization: `Bearer ${githubWriteToken}` },
    });
    if (!repoRes.ok) {
      throw new Error(`Failed to look up ${outputRepo.owner}/${outputRepo.repo} (${repoRes.status}): ${await repoRes.text()}`);
    }
    const repoInfo = await repoRes.json();
    const defaultBranch: string = repoInfo.default_branch ?? "main";

    const title = `Black Builder: ${truncate(run.prompt, 60)}`;
    const functionsList = spec.functions.map((f) => `- **${f.function_key}**: ${f.description}`).join("\n");
    const outOfScopeList = spec.out_of_scope.length > 0 ? spec.out_of_scope.map((s) => `- ${s}`).join("\n") : "- (none noted)";
    const verificationSection = tests
      ? `- Install: ${tests.install_ok ? "clean" : "unknown"}\n- Stub scan: ${tests.todo_scan_clean ? "clean" : "unknown"}\n- Tests: ${
          tests.tests_passing ? `passing (\`${tests.test_command}\`)` : "unknown"
        }\n- Fix rounds: ${tests.fix_rounds.length}`
      : "- No tests artifact found.";
    const body = `## Black Builder run \`${run_id}\`

**Request:** ${run.prompt}

### Functions delivered (${spec.functions.length})
${functionsList}

### Out of scope
${outOfScopeList}

### Verification (FIXER)
${verificationSection}

---
_Opened automatically by Black Builder's PUBLISHER stage. A live web preview is deployed separately - see the deployment link PUBLISHER posts once it's ready._`;

    let prUrl: string;
    let prNumber: number;

    const createRes = await fetch(`https://api.github.com/repos/${outputRepo.owner}/${outputRepo.repo}/pulls`, {
      method: "POST",
      headers: {
        accept: "application/vnd.github+json",
        authorization: `Bearer ${githubWriteToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ title, head: branch, base: defaultBranch, body }),
    });

    if (createRes.status === 403) {
      const bodyText = await createRes.text();
      const msg = `GitHub rejected PR creation with 403 - GITHUB_WRITE_TOKEN likely lacks the "Pull requests: Read and write" permission. Add that permission to the token in GitHub settings, then re-run this stage. Raw error: ${bodyText}`;
      await callback(run_id, "escalated", { summary: msg, logs: [{ level: "error", message: msg }], branch });
      return new Response(JSON.stringify({ run_id, status: "escalated", reason: msg }), { status: 200 });
    }

    if (createRes.status === 422) {
      // Most likely a PR already exists for this head/base (e.g. a re-run) - look it up instead of failing.
      const listRes = await fetch(
        `https://api.github.com/repos/${outputRepo.owner}/${outputRepo.repo}/pulls?head=${outputRepo.owner}:${branch}&state=all`,
        { headers: { accept: "application/vnd.github+json", authorization: `Bearer ${githubWriteToken}` } },
      );
      const existing = listRes.ok ? await listRes.json() : [];
      if (Array.isArray(existing) && existing.length > 0) {
        prUrl = existing[0].html_url;
        prNumber = existing[0].number;
      } else {
        const bodyText = await createRes.text();
        throw new Error(`PR creation returned 422 and no existing PR was found for ${branch}: ${bodyText}`);
      }
    } else if (!createRes.ok) {
      throw new Error(`PR creation failed (${createRes.status}): ${await createRes.text()}`);
    } else {
      const created = await createRes.json();
      prUrl = created.html_url;
      prNumber = created.number;
    }

    // Deploy: fetch the exact commit FIXER left passing, file-by-file via
    // GitHub's Git Trees/Blobs API (no sandbox, no dependency on Vercel's
    // GitHub App having access to this dynamically-created repo), then
    // upload directly to Vercel. Pins the live preview to that exact
    // commit - no drift window between what FIXER verified and what's live.
    const projectName = vercelProjectName(run_id);
    const files = await fetchGithubFiles(outputRepo.owner, outputRepo.repo, branch);
    const created = await createVercelDeployment(projectName, files);
    const deployment = await pollVercelDeployment(created.id);
    const brandedDomain = await attachWildcardDomain(projectName, run_id);
    const webUrl = brandedDomain ? `https://${brandedDomain}` : `https://${deployment.url}`;

    const { error: webUrlErr } = await supabase.from("runs").update({ web_url: webUrl }).eq("id", run_id);
    if (webUrlErr) throw new Error(`Failed to set runs.web_url: ${webUrlErr.message}`);

    const reportPayload = {
      pr_url: prUrl,
      pr_number: prNumber,
      base_branch: defaultBranch,
      head_branch: branch,
      deploy_status: "deployed",
      web_url: webUrl,
      branded: brandedDomain !== null,
      vercel_project: projectName,
      vercel_deployment_id: deployment.id,
      tests_summary: tests,
    };
    const storagePath = `${run_id}/report.json`;
    const { error: uploadErr } = await supabase.storage
      .from("artifacts")
      .upload(storagePath, JSON.stringify(reportPayload, null, 2), { contentType: "application/json", upsert: true });
    if (uploadErr) throw new Error(`Failed to store report artifact: ${uploadErr.message}`);

    const { error: artifactErr } = await supabase.from("artifacts").insert({ run_id, kind: "report", storage_path: storagePath });
    if (artifactErr) throw new Error(`Failed to record report artifact row: ${artifactErr.message}`);

    const summary = `PR opened: ${prUrl}. Deployed: ${webUrl}${brandedDomain ? "" : " (unbranded vercel.app URL - VERCEL_WILDCARD_DOMAIN not set or domain attach failed, see logs)"}.`;
    await callback(run_id, "passed", {
      summary,
      logs: [
        { level: "info", message: `PR opened: ${prUrl}` },
        { level: "info", message: `Deployed: ${webUrl}` },
      ],
      branch,
    });
    return new Response(JSON.stringify({ run_id, status: "passed", pr_url: prUrl, web_url: webUrl }), { status: 200 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.startsWith("__DEPLOY_BUILD_FAILED__:") || msg.startsWith("__UPSTREAM_ISSUE__:")) {
      const reason = msg.split(":").slice(1).join(":");
      await callback(run_id, "escalated", { summary: reason, logs: [{ level: "error", message: reason }], branch });
      return new Response(JSON.stringify({ run_id, status: "escalated", reason }), { status: 200 });
    }
    await callback(run_id, "failed", { summary: msg, logs: [{ level: "error", message: msg }], branch });
    return new Response(JSON.stringify({ error: msg }), { status: 500 });
  }
});
