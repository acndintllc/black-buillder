// PUBLISHER — PR-opening half only. See docs/agent-contracts.md #6.
//
// The full contract also deploys a web preview and sets runs.web_url, which
// this build deliberately does not do yet: the Vercel wildcard-subdomain
// provisioning mechanism it needs is still undecided (roadmap.md's Open
// blockers). Rather than invent that decision unilaterally, this half opens
// the real PR against FIXER's passing branch - a genuinely useful, complete
// deliverable on its own - and always ESCALATES rather than reporting
// "passed", since runs.web_url (a contractually required PUBLISHER output)
// is not set. That's an honest reflection of the run's real state: it needs
// a human decision (or a manual deploy) before it's actually done, exactly
// what "escalated" means in the shared conventions.
//
// No sandbox needed - this is pure GitHub API calls, same shape as
// SCAVENGER. Auth: internal service-to-service only, same pattern as every
// other agent.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const githubWriteToken = Deno.env.get("GITHUB_WRITE_TOKEN") ?? "";
const supabase = createClient(supabaseUrl, serviceRoleKey);

const AGENT = "publisher";

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
_Opened automatically by Black Builder's PUBLISHER stage. Web deploy is not yet automated (the Vercel wildcard-subdomain provisioning mechanism is still undecided) - this PR is ready for manual review/deploy in the meantime._`;

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
      const msg = `GitHub rejected PR creation with 403 - GITHUB_WRITE_TOKEN likely lacks the "Pull requests: Read and write" permission (it was scoped to Contents/Administration only). Add that permission to the token in GitHub settings, then re-run this stage. Raw error: ${bodyText}`;
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

    const reportPayload = {
      pr_url: prUrl,
      pr_number: prNumber,
      base_branch: defaultBranch,
      head_branch: branch,
      deploy_status: "not_implemented",
      deploy_note: "Vercel wildcard-subdomain provisioning mechanism is still undecided - web deploy deferred, see roadmap.md.",
      tests_summary: tests,
    };
    const storagePath = `${run_id}/report.json`;
    const { error: uploadErr } = await supabase.storage
      .from("artifacts")
      .upload(storagePath, JSON.stringify(reportPayload, null, 2), { contentType: "application/json", upsert: true });
    if (uploadErr) throw new Error(`Failed to store report artifact: ${uploadErr.message}`);

    const { error: artifactErr } = await supabase.from("artifacts").insert({ run_id, kind: "report", storage_path: storagePath });
    if (artifactErr) throw new Error(`Failed to record report artifact row: ${artifactErr.message}`);

    const reason = `PR opened: ${prUrl}. Web deploy is deliberately not implemented yet (Vercel wildcard-subdomain provisioning mechanism still undecided) - runs.web_url was not set, so this stage escalates rather than passes. Needs a human decision on deploy provisioning (or a manual deploy) before the run can complete.`;
    await callback(run_id, "escalated", { summary: reason, logs: [{ level: "info", message: `PR opened: ${prUrl}` }, { level: "warn", message: reason }], branch });
    return new Response(JSON.stringify({ run_id, status: "escalated", pr_url: prUrl, reason }), { status: 200 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await callback(run_id, "failed", { summary: msg, logs: [{ level: "error", message: msg }], branch });
    return new Response(JSON.stringify({ error: msg }), { status: 500 });
  }
});
