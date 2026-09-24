// FIXER — the terminal correctness gate. Takes STITCHER's merged project and
// makes it actually install, build, and pass a real test pass, or escalates
// if the problem traces to an earlier stage. See docs/agent-contracts.md #5.
//
// Same bare-E2B-sandbox pattern as BUILDER/STITCHER, even though FIXER's
// model (llm-proxy role "fixer") is Anthropic (claude-fable-5-1 @ effort
// max) - deliberately NOT switching to E2B's turnkey "claude" sandbox
// template. That template doesn't call llm-proxy, so run budget enforcement
// and cost tracking (runs.cost_usd/budget_usd) would silently stop applying
// to FIXER specifically, and it's a second, separately-verified integration
// for no real benefit over the pattern already proven in BUILDER/STITCHER.
//
// Auth: internal service-to-service only, same pattern as every other agent.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { Sandbox } from "npm:e2b@1.6.0";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const e2bApiKey = Deno.env.get("E2B_API_KEY") ?? "";
const githubWriteToken = Deno.env.get("GITHUB_WRITE_TOKEN") ?? "";
const supabase = createClient(supabaseUrl, serviceRoleKey);

const AGENT = "fixer";
const SANDBOX_TIMEOUT_MS = 900_000; // 15 minutes - the most work of any agent so far: install, build, multiple fix rounds, tests
const MAX_ROUNDS = 6;

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
type ManifestPayload = { entry_point: string; dependencies: Record<string, string>; files: { path: string; produced_by: string }[] };

async function runCmd(sandbox: Sandbox, cmd: string): Promise<{ stdout: string; stderr: string }> {
  const result = await sandbox.commands.run(`bash -lc ${JSON.stringify(cmd)}`);
  if (result.exitCode !== 0) {
    throw new Error(`Command failed (${result.exitCode}): ${cmd}\n${result.stderr || result.stdout}`);
  }
  return { stdout: result.stdout, stderr: result.stderr };
}

async function tryCmd(sandbox: Sandbox, cmd: string): Promise<{ ok: true; stdout: string } | { ok: false; stderr: string; stdout: string }> {
  const result = await sandbox.commands.run(`bash -lc ${JSON.stringify(cmd)}`);
  return result.exitCode === 0 ? { ok: true, stdout: result.stdout } : { ok: false, stderr: result.stderr, stdout: result.stdout };
}

function parseOwnerRepo(url: string): { owner: string; repo: string } | null {
  const match = url.match(/github\.com[/:]([^/]+)\/([^/.]+?)(?:\.git)?\/?$/);
  return match ? { owner: match[1], repo: match[2] } : null;
}

type FixerLlmResponse = {
  upstream_issue: boolean;
  upstream_reason?: string;
  files: { path: string; content: string }[];
  dev_dependencies?: Record<string, string>;
  test_command?: string;
  notes: string;
};

function extractJson(raw: string): unknown {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : raw;
  return JSON.parse(candidate.trim());
}

function validateFixerResponse(
  data: unknown,
  opts: { requirePathPrefix?: string; requireTestCommand?: boolean } = {},
): { ok: true; response: FixerLlmResponse } | { ok: false; error: string } {
  if (typeof data !== "object" || data === null) return { ok: false, error: "response is not a JSON object" };
  const d = data as Record<string, unknown>;

  if (typeof d.upstream_issue !== "boolean") return { ok: false, error: '"upstream_issue" must be a boolean' };
  if (typeof d.notes !== "string") return { ok: false, error: '"notes" must be a string' };

  if (d.upstream_issue) {
    if (typeof d.upstream_reason !== "string" || !d.upstream_reason.trim()) {
      return { ok: false, error: '"upstream_reason" is required and must be non-empty when upstream_issue is true' };
    }
    return { ok: true, response: { upstream_issue: true, upstream_reason: d.upstream_reason, files: [], notes: d.notes } };
  }

  if (!Array.isArray(d.files) || d.files.length === 0) return { ok: false, error: '"files" must be a non-empty array when upstream_issue is false' };
  for (const [i, f] of d.files.entries()) {
    if (typeof f !== "object" || f === null) return { ok: false, error: `files[${i}] is not an object` };
    const file = f as Record<string, unknown>;
    if (typeof file.path !== "string" || !file.path.trim()) return { ok: false, error: `files[${i}].path must be a non-empty string` };
    if (opts.requirePathPrefix && !file.path.startsWith(opts.requirePathPrefix)) {
      return { ok: false, error: `files[${i}].path must start with "${opts.requirePathPrefix}"` };
    }
    if (typeof file.content !== "string") return { ok: false, error: `files[${i}].content must be a string` };
  }

  if (d.dev_dependencies !== undefined && (typeof d.dev_dependencies !== "object" || d.dev_dependencies === null)) {
    return { ok: false, error: '"dev_dependencies" must be an object if present' };
  }
  if (opts.requireTestCommand && (typeof d.test_command !== "string" || !d.test_command.trim())) {
    return { ok: false, error: '"test_command" is required and must be a non-empty string for this call' };
  }

  return {
    ok: true,
    response: {
      upstream_issue: false,
      files: d.files as { path: string; content: string }[],
      dev_dependencies: d.dev_dependencies as Record<string, string> | undefined,
      test_command: typeof d.test_command === "string" ? d.test_command : undefined,
      notes: d.notes,
    },
  };
}

const FIXER_SYSTEM_PROMPT = `You are FIXER, stage 5 of the Black Builder app-building swarm - the last stage that checks correctness before the app ships. Nothing downstream re-checks your work, so a missed bug ships silently.

You are called for one of four situations, named in "stage" in the user message:
- "fix_install": npm install failed. Fix package.json (or other files) so it installs cleanly.
- "fix_build": the project's build/typecheck step failed. Fix the actual code causing it.
- "fix_stubs": TODO/FIXME/stub markers were found inside functions/ - a required function_key can't be a stub. Implement it for real.
- "fix_test_failure": the smoke tests you authored are failing. Fix the actual implementation (not the test) unless the test itself is factually wrong about what the function should do.
- "author_tests": no tests exist yet. Write a minimal smoke-test suite - one real check per function_key, driven by its acceptance_signal - and tell us exactly how to run it.

Rules:
- Diagnose the REAL cause from the error/context given - don't guess blindly.
- Stay in scope: fix only what's broken. Never add a feature, dependency, or file unrelated to the spec's function_keys - that's scope creep and it's not your job.
- For "author_tests": pick whatever test approach actually fits the project's existing stack (check file extensions / package.json - plain Node's built-in "node:test", vitest, or anything else reasonable). Set "test_command" to the exact shell command to run them, add any devDependency you need via "dev_dependencies", and write files ONLY under "__fixer_tests__/".
- If the real cause is a fundamentally bad choice made upstream (SCAVENGER picked an incompatible source, BUILDER/STITCHER produced something architecturally broken) that you cannot repair by editing code - set "upstream_issue": true and explain why, rather than looping forever. This should be rare - prefer fixing over escalating.
- "notes" is one sentence: what you changed, or why you're flagging an upstream issue.

Respond with nothing but a single JSON object, no markdown fences, no commentary:
{
  "upstream_issue": boolean,
  "upstream_reason": string | null,
  "files": [ { "path": string, "content": string } ],
  "dev_dependencies": { [pkg: string]: string } | null,
  "test_command": string | null,
  "notes": string
}`;

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

  const { data: run, error: runErr } = await supabase.from("runs").select("output_repo_url").eq("id", run_id).single();
  if (runErr || !run) {
    return new Response(JSON.stringify({ error: `run ${run_id} not found: ${runErr?.message}` }), { status: 404 });
  }
  if (!run.output_repo_url) {
    const msg = `runs.output_repo_url is not set for run ${run_id} - BUILDER/STITCHER should have set it before FIXER runs.`;
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
  const spec: { functions: SpecFunction[] } = JSON.parse(await specBlob.text());

  const { data: manifestArtifact, error: manifestErr } = await supabase
    .from("artifacts")
    .select("storage_path")
    .eq("run_id", run_id)
    .eq("kind", "manifest")
    .limit(1)
    .maybeSingle();
  if (manifestErr || !manifestArtifact) {
    const msg = `No manifest artifact found for run ${run_id}: ${manifestErr?.message ?? "none exists"} - STITCHER should have produced one.`;
    await callback(run_id, "failed", { summary: msg, logs: [{ level: "error", message: msg }] });
    return new Response(JSON.stringify({ error: msg }), { status: 500 });
  }
  const { data: manifestBlob, error: manifestDlErr } = await supabase.storage.from("artifacts").download(manifestArtifact.storage_path);
  if (manifestDlErr || !manifestBlob) {
    const msg = `Failed to download manifest artifact: ${manifestDlErr?.message}`;
    await callback(run_id, "failed", { summary: msg, logs: [{ level: "error", message: msg }] });
    return new Response(JSON.stringify({ error: msg }), { status: 500 });
  }
  const manifest: ManifestPayload = JSON.parse(await manifestBlob.text());

  await callback(run_id, "running");

  const missingEnv = [!e2bApiKey && "E2B_API_KEY", !githubWriteToken && "GITHUB_WRITE_TOKEN"].filter(Boolean);
  if (missingEnv.length > 0) {
    const msg = `Missing required secret(s): ${missingEnv.join(", ")}. Add them in Supabase project secrets.`;
    await callback(run_id, "escalated", { summary: msg, logs: [{ level: "error", message: msg }] });
    return new Response(JSON.stringify({ run_id, status: "escalated", reason: msg }), { status: 200 });
  }

  const branch = `run/${run_id}`;
  const outputRepo = parseOwnerRepo(run.output_repo_url);
  if (!outputRepo) {
    const msg = `Could not parse owner/repo from runs.output_repo_url: ${run.output_repo_url}`;
    await callback(run_id, "failed", { summary: msg, logs: [{ level: "error", message: msg }] });
    return new Response(JSON.stringify({ error: msg }), { status: 500 });
  }
  const cloneUrl = `https://x-access-token:${githubWriteToken}@github.com/${outputRepo.owner}/${outputRepo.repo}.git`;

  let sandbox: Sandbox | undefined;
  try {
    sandbox = await Sandbox.create({ apiKey: e2bApiKey, timeoutMs: SANDBOX_TIMEOUT_MS });
    await runCmd(sandbox, `git config --global user.email "fixer@blackbuilder.app" && git config --global user.name "Black Builder"`);
    await runCmd(sandbox, `git clone ${JSON.stringify(cloneUrl)} /work && cd /work && git checkout ${branch}`);

    async function applyFiles(files: { path: string; content: string }[]): Promise<void> {
      for (const file of files) {
        await runCmd(sandbox!, `mkdir -p $(dirname ${JSON.stringify(`/work/${file.path}`)})`);
        await sandbox!.files.write(`/work/${file.path}`, file.content);
      }
    }

    async function callFixerLlm(
      userContent: string,
      opts: { requirePathPrefix?: string; requireTestCommand?: boolean } = {},
    ): Promise<FixerLlmResponse> {
      const llmResponse = await fetch(`${supabaseUrl}/functions/v1/llm-proxy`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${serviceRoleKey}` },
        body: JSON.stringify({
          role: "fixer",
          run_id,
          system: FIXER_SYSTEM_PROMPT,
          messages: [{ role: "user", content: userContent }],
          max_tokens: 8192,
        }),
      });
      if (!llmResponse.ok) {
        const bodyText = await llmResponse.text();
        if (llmResponse.status === 402) throw new Error(`__BUDGET_EXCEEDED__:${bodyText}`);
        throw new Error(`llm-proxy returned ${llmResponse.status}: ${bodyText}`);
      }
      const llmResult = await llmResponse.json();
      const parsed = extractJson(llmResult.content ?? "");
      const validation = validateFixerResponse(parsed, opts);
      if (!validation.ok) throw new Error(`FIXER's response failed validation: ${validation.error}`);
      return validation.response;
    }

    const functionsContext = JSON.stringify(spec.functions.map((f) => ({ function_key: f.function_key, description: f.description, acceptance_signal: f.acceptance_signal })));

    let testCommand: string | null = null;
    let todoFixAttempted = false;
    const fixRounds: string[] = [];
    let success = false;

    for (let round = 1; round <= MAX_ROUNDS; round++) {
      const installResult = await tryCmd(sandbox, `cd /work && npm install --no-audit --no-fund 2>&1`);
      if (!installResult.ok) {
        const resp = await callFixerLlm(
          `stage: fix_install\nfunctions: ${functionsContext}\nentry_point: ${manifest.entry_point}\n\nnpm install failed with this error:\n${installResult.stderr.slice(0, 4000)}`,
        );
        if (resp.upstream_issue) {
          const reason = `FIXER traced a broken npm install to an earlier stage: ${resp.upstream_reason}. Needs a re-run of that stage, not a FIXER workaround.`;
          await callback(run_id, "escalated", { summary: reason, logs: [{ level: "warn", message: reason }], branch });
          return new Response(JSON.stringify({ run_id, status: "escalated", reason }), { status: 200 });
        }
        await applyFiles(resp.files);
        fixRounds.push(`Round ${round}: fixed npm install failure - ${resp.notes}`);
        continue;
      }

      const { stdout: pkgJsonRaw } = await runCmd(sandbox, `cat /work/package.json`);
      const pkgJson = JSON.parse(pkgJsonRaw);
      const hasTsconfig = (await tryCmd(sandbox, `test -f /work/tsconfig.json`)).ok;
      const buildCmd: string | null = pkgJson.scripts?.build ? "npm run build" : hasTsconfig ? "npx tsc --noEmit" : null;

      if (buildCmd) {
        const buildResult = await tryCmd(sandbox, `cd /work && ${buildCmd} 2>&1`);
        if (!buildResult.ok) {
          const resp = await callFixerLlm(
            `stage: fix_build\nfunctions: ${functionsContext}\nentry_point: ${manifest.entry_point}\nbuild_command: ${buildCmd}\n\nIt failed with this error:\n${buildResult.stderr.slice(0, 4000)}`,
          );
          if (resp.upstream_issue) {
            const reason = `FIXER traced a build failure to an earlier stage: ${resp.upstream_reason}. Needs a re-run of that stage, not a FIXER workaround.`;
            await callback(run_id, "escalated", { summary: reason, logs: [{ level: "warn", message: reason }], branch });
            return new Response(JSON.stringify({ run_id, status: "escalated", reason }), { status: 200 });
          }
          await applyFiles(resp.files);
          fixRounds.push(`Round ${round}: fixed build failure (${buildCmd}) - ${resp.notes}`);
          continue;
        }
      }

      const { stdout: todoHits } = await runCmd(sandbox, `cd /work && (grep -rnE "TODO|FIXME|XXX" functions/ || true)`);
      const todoLines = todoHits.split("\n").map((l) => l.trim()).filter(Boolean);
      if (todoLines.length > 0) {
        if (todoFixAttempted) {
          const reason = `FIXER asked once to resolve stub markers (TODO/FIXME/XXX) inside functions/, but they're still present: ${todoLines.slice(0, 5).join("; ")}${todoLines.length > 5 ? "; ..." : ""}. A required function_key can't ship as a stub.`;
          await callback(run_id, "escalated", { summary: reason, logs: [{ level: "warn", message: reason }], branch });
          return new Response(JSON.stringify({ run_id, status: "escalated", reason }), { status: 200 });
        }
        const resp = await callFixerLlm(`stage: fix_stubs\nfunctions: ${functionsContext}\nentry_point: ${manifest.entry_point}\n\nStub markers found:\n${todoLines.join("\n").slice(0, 4000)}`);
        if (resp.upstream_issue) {
          const reason = `FIXER traced remaining stubs to an earlier stage: ${resp.upstream_reason}.`;
          await callback(run_id, "escalated", { summary: reason, logs: [{ level: "warn", message: reason }], branch });
          return new Response(JSON.stringify({ run_id, status: "escalated", reason }), { status: 200 });
        }
        await applyFiles(resp.files);
        todoFixAttempted = true;
        fixRounds.push(`Round ${round}: implemented ${todoLines.length} stub marker(s) - ${resp.notes}`);
        continue;
      }

      if (testCommand === null) {
        const resp = await callFixerLlm(
          `stage: author_tests\nfunctions: ${functionsContext}\nentry_point: ${manifest.entry_point}\ndependencies: ${JSON.stringify(manifest.dependencies)}`,
          { requirePathPrefix: "__fixer_tests__/", requireTestCommand: true },
        );
        await applyFiles(resp.files);
        if (resp.dev_dependencies && Object.keys(resp.dev_dependencies).length > 0) {
          const merged = { ...pkgJson, devDependencies: { ...(pkgJson.devDependencies ?? {}), ...resp.dev_dependencies } };
          await sandbox.files.write("/work/package.json", JSON.stringify(merged, null, 2));
        }
        testCommand = resp.test_command!;
        fixRounds.push(`Round ${round}: authored smoke tests (${resp.files.length} file(s), run via "${testCommand}") - ${resp.notes}`);
        continue;
      }

      const testResult = await tryCmd(sandbox, `cd /work && ${testCommand} 2>&1`);
      if (!testResult.ok) {
        const resp = await callFixerLlm(
          `stage: fix_test_failure\nfunctions: ${functionsContext}\nentry_point: ${manifest.entry_point}\ntest_command: ${testCommand}\n\nIt failed with this output:\n${testResult.stderr.slice(0, 4000) || testResult.stdout.slice(0, 4000)}`,
        );
        if (resp.upstream_issue) {
          const reason = `FIXER traced a failing test to an earlier stage: ${resp.upstream_reason}.`;
          await callback(run_id, "escalated", { summary: reason, logs: [{ level: "warn", message: reason }], branch });
          return new Response(JSON.stringify({ run_id, status: "escalated", reason }), { status: 200 });
        }
        await applyFiles(resp.files);
        fixRounds.push(`Round ${round}: fixed failing test(s) - ${resp.notes}`);
        continue;
      }

      success = true;
      break;
    }

    if (!success) {
      const msg = `FIXER did not reach a clean install+build+test pass after ${MAX_ROUNDS} rounds. Last state: ${fixRounds.at(-1) ?? "no fixes applied"}.`;
      await callback(run_id, "failed", { summary: msg, logs: fixRounds.map((r) => ({ level: "warn" as const, message: r })), branch });
      return new Response(JSON.stringify({ error: msg }), { status: 500 });
    }

    await runCmd(sandbox, `cd /work && git add -A && git commit -q -m "FIXER: ${fixRounds.length} fix round(s), all checks passing" --allow-empty`);
    await runCmd(sandbox, `cd /work && git push origin ${branch}`);

    const testsPayload = {
      install_ok: true,
      todo_scan_clean: true,
      test_command: testCommand,
      tests_passing: true,
      fix_rounds: fixRounds,
    };
    const storagePath = `${run_id}/tests.json`;
    const { error: uploadErr } = await supabase.storage
      .from("artifacts")
      .upload(storagePath, JSON.stringify(testsPayload, null, 2), { contentType: "application/json", upsert: true });
    if (uploadErr) throw new Error(`Failed to store tests artifact: ${uploadErr.message}`);

    const { error: artifactErr } = await supabase.from("artifacts").insert({ run_id, kind: "tests", storage_path: storagePath });
    if (artifactErr) throw new Error(`Failed to record tests artifact row: ${artifactErr.message}`);

    const summary = `FIXER passed after ${fixRounds.length} fix round(s) on ${branch}: install clean, no stub markers, smoke tests passing (${testCommand}).`;
    await callback(run_id, "passed", { summary, logs: fixRounds.map((r) => ({ level: "info" as const, message: r })), branch });
    return new Response(JSON.stringify({ run_id, status: "passed", fix_rounds: fixRounds.length }), { status: 200 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.startsWith("__BUDGET_EXCEEDED__:")) {
      const budgetMsg = `Run budget exceeded before FIXER could finish: ${msg.slice("__BUDGET_EXCEEDED__:".length)}`;
      await callback(run_id, "failed", { summary: budgetMsg, logs: [{ level: "error", message: budgetMsg }], branch });
      return new Response(JSON.stringify({ error: budgetMsg }), { status: 502 });
    }
    await callback(run_id, "failed", { summary: msg, logs: [{ level: "error", message: msg }], branch });
    return new Response(JSON.stringify({ error: msg }), { status: 500 });
  } finally {
    if (sandbox) {
      await sandbox.kill().catch((err) => console.error(`Failed to kill sandbox for run ${run_id}: ${err}`));
    }
  }
});
