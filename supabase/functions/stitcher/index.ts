// STITCHER — turns BUILDER's independently-written functions/<function_key>/
// folders into one coherent, installable project. See docs/agent-contracts.md
// #4 for the full contract.
//
// Same engine as BUILDER: a bare E2B sandbox (not the Anthropic-only "claude"
// template) for git/filesystem/shell work, Qwen via llm-proxy (role
// "stitcher") for the actual merge decisions. Unlike BUILDER, STITCHER can
// genuinely verify its own success signal - `npm install` either succeeds
// in the sandbox or it doesn't - rather than just asserting it.
//
// Auth: internal service-to-service only, same pattern as every other agent.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { Sandbox } from "npm:e2b@1.6.0";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const e2bApiKey = Deno.env.get("E2B_API_KEY") ?? "";
const githubWriteToken = Deno.env.get("GITHUB_WRITE_TOKEN") ?? "";
const supabase = createClient(supabaseUrl, serviceRoleKey);

const AGENT = "stitcher";
const SANDBOX_TIMEOUT_MS = 600_000; // 10 minutes - npm install can be slow

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
type NoticesPayload = {
  notices: { function_key: string; ref: string; commit_sha: string | null; license_spdx: string | null }[];
  extracted_paths: Record<string, string[]>;
};

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

// Reduces an import specifier ("@radix-ui/react-dialog/Foo" or "zod/v4") down
// to the actual installable package name ("@radix-ui/react-dialog", "zod").
function normalizePackageName(spec: string): string {
  if (spec.startsWith("@")) {
    const parts = spec.split("/");
    return parts.slice(0, 2).join("/");
  }
  return spec.split("/")[0];
}

function extractPackageNames(grepOutput: string): string[] {
  const names = new Set<string>();
  for (const line of grepOutput.split("\n")) {
    const match = line.match(/from\s+['"]([^'"]+)['"]/);
    if (!match) continue;
    const spec = match[1];
    if (spec.startsWith(".") || spec.startsWith("/")) continue; // relative/absolute - not an npm package
    names.add(normalizePackageName(spec));
  }
  return [...names].sort();
}

type PackageJson = {
  name: string;
  version?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  scripts?: Record<string, string>;
};

type StitcherLlmResponse = {
  incompatible: boolean;
  incompatible_reason?: string;
  package_json: PackageJson;
  additional_files: { path: string; content: string }[];
  entry_point: string;
  notes: string;
};

function extractJson(raw: string): unknown {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : raw;
  return JSON.parse(candidate.trim());
}

function validateStitcherResponse(data: unknown): { ok: true; response: StitcherLlmResponse } | { ok: false; error: string } {
  if (typeof data !== "object" || data === null) return { ok: false, error: "response is not a JSON object" };
  const d = data as Record<string, unknown>;

  if (typeof d.incompatible !== "boolean") return { ok: false, error: '"incompatible" must be a boolean' };
  if (typeof d.notes !== "string") return { ok: false, error: '"notes" must be a string' };

  if (d.incompatible) {
    if (typeof d.incompatible_reason !== "string" || !d.incompatible_reason.trim()) {
      return { ok: false, error: '"incompatible_reason" is required and must be non-empty when incompatible is true' };
    }
    return {
      ok: true,
      response: { incompatible: true, incompatible_reason: d.incompatible_reason, package_json: { name: "" }, additional_files: [], entry_point: "", notes: d.notes },
    };
  }

  if (typeof d.package_json !== "object" || d.package_json === null) return { ok: false, error: '"package_json" must be an object' };
  const pkg = d.package_json as Record<string, unknown>;
  if (typeof pkg.name !== "string" || !pkg.name.trim()) return { ok: false, error: '"package_json.name" must be a non-empty string' };
  if (pkg.dependencies !== undefined && typeof pkg.dependencies !== "object") return { ok: false, error: '"package_json.dependencies" must be an object if present' };

  if (!Array.isArray(d.additional_files)) return { ok: false, error: '"additional_files" must be an array' };
  for (const [i, f] of d.additional_files.entries()) {
    if (typeof f !== "object" || f === null) return { ok: false, error: `additional_files[${i}] is not an object` };
    const file = f as Record<string, unknown>;
    if (typeof file.path !== "string" || !file.path.trim()) return { ok: false, error: `additional_files[${i}].path must be a non-empty string` };
    if (file.path.startsWith("functions/")) return { ok: false, error: `additional_files[${i}].path must not touch functions/ - STITCHER only writes root-level glue files` };
    if (file.path === "package.json") return { ok: false, error: `additional_files[${i}].path must not be "package.json" - use the dedicated package_json field` };
    if (typeof file.content !== "string") return { ok: false, error: `additional_files[${i}].content must be a string` };
  }

  if (typeof d.entry_point !== "string" || !d.entry_point.trim()) return { ok: false, error: '"entry_point" must be a non-empty string' };

  return {
    ok: true,
    response: {
      incompatible: false,
      package_json: pkg as PackageJson,
      additional_files: d.additional_files as { path: string; content: string }[],
      entry_point: d.entry_point,
      notes: d.notes,
    },
  };
}

const STITCHER_SYSTEM_PROMPT = `You are STITCHER, stage 4 of the Black Builder app-building swarm.

BUILDER already wrote each function into its own functions/<function_key>/ folder in the repo. Your job: turn those independent folders into ONE coherent, installable project by producing a root-level package.json and any small glue files needed (an entry point that ties the functions together, tsconfig.json, etc.) - NOT by rewriting what's inside functions/*/.

You'll be given: the function list (key + description), a deterministic list of external package names actually imported across the code (no versions - infer sensible current version ranges yourself), and the full file listing under functions/.

Rules:
- Never touch files under functions/ - only write package.json and other ROOT-level files.
- package_json.dependencies must cover every package name you were given, with a reasonable version range (e.g. "^1.2.0"). If your version guess is wrong, you'll be shown the real npm error and asked to fix it - so make your best real guess, don't leave placeholders.
- entry_point should be a real root file (e.g. "index.ts") that at minimum imports/wires the functions together in a sensible way, even if minimally.
- If two functions fundamentally can't coexist in one project (e.g. one assumes React, another assumes a completely different, incompatible framework, with no reasonable way to reconcile them) - set "incompatible": true and explain why. This should be rare; prefer finding a way to merge over escalating.
- "notes" is one sentence: what you merged, or why you're flagging incompatibility.

Respond with nothing but a single JSON object, no markdown fences, no commentary:
{
  "incompatible": boolean,
  "incompatible_reason": string | null,
  "package_json": { "name": string, "version": string, "dependencies": { [pkg: string]: string }, "scripts": { [name: string]: string } },
  "additional_files": [ { "path": string, "content": string } ],
  "entry_point": string,
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
    const msg = `runs.output_repo_url is not set for run ${run_id} - BUILDER should have created it before STITCHER runs.`;
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

  const { data: noticesArtifact, error: noticesErr } = await supabase
    .from("artifacts")
    .select("storage_path")
    .eq("run_id", run_id)
    .eq("kind", "notices")
    .limit(1)
    .maybeSingle();
  if (noticesErr || !noticesArtifact) {
    const msg = `No notices artifact found for run ${run_id}: ${noticesErr?.message ?? "none exists"} - BUILDER should have produced one.`;
    await callback(run_id, "failed", { summary: msg, logs: [{ level: "error", message: msg }] });
    return new Response(JSON.stringify({ error: msg }), { status: 500 });
  }
  const { data: noticesBlob, error: noticesDlErr } = await supabase.storage.from("artifacts").download(noticesArtifact.storage_path);
  if (noticesDlErr || !noticesBlob) {
    const msg = `Failed to download notices artifact: ${noticesDlErr?.message}`;
    await callback(run_id, "failed", { summary: msg, logs: [{ level: "error", message: msg }] });
    return new Response(JSON.stringify({ error: msg }), { status: 500 });
  }
  const notices: NoticesPayload = JSON.parse(await noticesBlob.text());

  await callback(run_id, "running");

  const missingEnv = [!e2bApiKey && "E2B_API_KEY", !githubWriteToken && "GITHUB_WRITE_TOKEN"].filter(Boolean);
  if (missingEnv.length > 0) {
    const msg = `Missing required secret(s): ${missingEnv.join(", ")}. Add them in Supabase project secrets.`;
    await callback(run_id, "escalated", { summary: msg, logs: [{ level: "error", message: msg }] });
    return new Response(JSON.stringify({ run_id, status: "escalated", reason: msg }), { status: 200 });
  }

  const missingFunctions = spec.functions.filter((f) => !notices.extracted_paths[f.function_key]);
  if (missingFunctions.length > 0) {
    const msg = `BUILDER's output is missing function_key(s): ${missingFunctions.map((f) => f.function_key).join(", ")}. Cannot merge an incomplete set.`;
    await callback(run_id, "failed", { summary: msg, logs: [{ level: "error", message: msg }] });
    return new Response(JSON.stringify({ error: msg }), { status: 500 });
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
    await runCmd(sandbox, `git config --global user.email "stitcher@blackbuilder.app" && git config --global user.name "Black Builder"`);
    await runCmd(sandbox, `git clone ${JSON.stringify(cloneUrl)} /work && cd /work && git checkout ${branch}`);

    const { stdout: fileListRaw } = await runCmd(sandbox, `cd /work && find functions -type f -not -path '*/.git/*' 2>/dev/null || true`);
    const filePaths = fileListRaw.split("\n").map((p) => p.trim()).filter(Boolean);

    const { stdout: importLines } = await runCmd(
      sandbox,
      `cd /work && (grep -rhoE "from ['\\"][^'\\"]+['\\"]" functions/ || true)`,
    );
    const importedPackages = extractPackageNames(importLines);

    const stitcherInput = {
      functions: spec.functions.map((f) => ({ function_key: f.function_key, description: f.description })),
      imported_packages: importedPackages,
      file_paths: filePaths,
    };

    async function callStitcherLlm(userContent: string): Promise<StitcherLlmResponse> {
      const llmResponse = await fetch(`${supabaseUrl}/functions/v1/llm-proxy`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${serviceRoleKey}` },
        body: JSON.stringify({
          role: "stitcher",
          run_id,
          system: STITCHER_SYSTEM_PROMPT,
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
      const validation = validateStitcherResponse(parsed);
      if (!validation.ok) throw new Error(`STITCHER's response failed validation: ${validation.error}`);
      return validation.response;
    }

    let response: StitcherLlmResponse;
    try {
      response = await callStitcherLlm(JSON.stringify(stitcherInput));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.startsWith("__BUDGET_EXCEEDED__:")) {
        const budgetMsg = `Run budget exceeded before STITCHER could finish: ${msg.slice("__BUDGET_EXCEEDED__:".length)}`;
        await callback(run_id, "failed", { summary: budgetMsg, logs: [{ level: "error", message: budgetMsg }], branch });
        return new Response(JSON.stringify({ error: budgetMsg }), { status: 502 });
      }
      throw new Error(`STITCHER's initial merge call failed: ${msg}`);
    }

    if (response.incompatible) {
      const reason = `STITCHER found the accepted components architecturally incompatible: ${response.incompatible_reason}. Needs PLANNER/human to change the spec, not a STITCHER workaround.`;
      await callback(run_id, "escalated", { summary: reason, logs: [{ level: "warn", message: reason }], branch });
      return new Response(JSON.stringify({ run_id, status: "escalated", reason }), { status: 200 });
    }

    async function writeMergeOutput(r: StitcherLlmResponse): Promise<void> {
      await sandbox!.files.write("/work/package.json", JSON.stringify(r.package_json, null, 2));
      for (const file of r.additional_files) {
        await runCmd(sandbox!, `mkdir -p $(dirname ${JSON.stringify(`/work/${file.path}`)})`);
        await sandbox!.files.write(`/work/${file.path}`, file.content);
      }
    }

    await writeMergeOutput(response);

    let installResult = await tryCmd(sandbox, `cd /work && npm install --no-audit --no-fund 2>&1`);
    const logs: LogLine[] = [];

    if (!installResult.ok) {
      logs.push({ level: "warn", message: `First npm install attempt failed; asking STITCHER to fix it using the real error.` });
      const fixContent = `${JSON.stringify(stitcherInput)}\n\nYour previous package.json failed "npm install" with this error - fix the dependency versions (or anything else needed) and respond with the same JSON shape again:\n${installResult.stderr.slice(0, 4000)}`;
      try {
        response = await callStitcherLlm(fixContent);
      } catch (err) {
        throw new Error(`STITCHER's fix-up call after a failed npm install also failed: ${err instanceof Error ? err.message : String(err)}`);
      }
      if (response.incompatible) {
        const reason = `STITCHER found the accepted components architecturally incompatible after a failed npm install: ${response.incompatible_reason}.`;
        await callback(run_id, "escalated", { summary: reason, logs: [...logs, { level: "warn", message: reason }], branch });
        return new Response(JSON.stringify({ run_id, status: "escalated", reason }), { status: 200 });
      }
      await writeMergeOutput(response);
      installResult = await tryCmd(sandbox, `cd /work && npm install --no-audit --no-fund 2>&1`);
      if (!installResult.ok) {
        const msg = `npm install still failed after one retry: ${installResult.stderr.slice(0, 2000)}`;
        await callback(run_id, "failed", { summary: msg, logs: [...logs, { level: "error", message: msg }], branch });
        return new Response(JSON.stringify({ error: msg }), { status: 500 });
      }
      logs.push({ level: "info", message: "npm install succeeded after one fix-up retry." });
    }

    await runCmd(sandbox, `cd /work && git add -A && git commit -q -m "STITCHER: merge ${spec.functions.length} function(s) into one project" --allow-empty`);
    await runCmd(sandbox, `cd /work && git push origin ${branch}`);

    const manifestFiles = [
      ...Object.entries(notices.extracted_paths).flatMap(([function_key, paths]) => paths.map((path) => ({ path, produced_by: function_key }))),
      { path: "package.json", produced_by: "stitcher" },
      ...response.additional_files.map((f) => ({ path: f.path, produced_by: "stitcher" })),
    ];
    const manifestPayload = { entry_point: response.entry_point, dependencies: response.package_json.dependencies ?? {}, files: manifestFiles };
    const storagePath = `${run_id}/manifest.json`;
    const { error: uploadErr } = await supabase.storage
      .from("artifacts")
      .upload(storagePath, JSON.stringify(manifestPayload, null, 2), { contentType: "application/json", upsert: true });
    if (uploadErr) throw new Error(`Failed to store manifest artifact: ${uploadErr.message}`);

    const { error: artifactErr } = await supabase.from("artifacts").insert({ run_id, kind: "manifest", storage_path: storagePath });
    if (artifactErr) throw new Error(`Failed to record manifest artifact row: ${artifactErr.message}`);

    const summary = `Merged ${spec.functions.length} function(s) into one project on ${branch} (entry: ${response.entry_point}, ${
      Object.keys(response.package_json.dependencies ?? {}).length
    } dependencies). npm install verified in-sandbox. ${response.notes}`;

    await callback(run_id, "passed", { summary, logs, branch });
    return new Response(JSON.stringify({ run_id, status: "passed", function_count: spec.functions.length }), { status: 200 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await callback(run_id, "failed", { summary: msg, logs: [{ level: "error", message: msg }], branch });
    return new Response(JSON.stringify({ error: msg }), { status: 500 });
  } finally {
    if (sandbox) {
      await sandbox.kill().catch((err) => console.error(`Failed to kill sandbox for run ${run_id}: ${err}`));
    }
  }
});
