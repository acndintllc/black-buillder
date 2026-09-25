// APP WRAPPER — the terminal stage. Wraps the exact live web app PUBLISHER
// shipped in a thin native Android shell and produces a signed AAB. See
// docs/agent-contracts.md #7.
//
// "Wraps the exact web app PUBLISHER ships" (HANDOFF.md #3) is taken
// literally: Capacitor's WebView is pointed at runs.web_url directly
// (capacitor.config.json's server.url), not at a locally re-bundled copy of
// the web source. That means this agent never clones the output GitHub repo
// at all - no git operations, no GITHUB_WRITE_TOKEN - it only needs the live
// URL PUBLISHER already verified. It's also more correct: BUILDER/STITCHER's
// output isn't guaranteed to be a static site, so bundling it locally could
// silently drop server-side behavior a remote WebView load wouldn't.
//
// Same bare-E2B-sandbox pattern as BUILDER/STITCHER/FIXER, on a CUSTOM
// template (not the default) - Capacitor's Android build needs a JDK +
// Android SDK toolchain the default template doesn't have. Template source:
// supabase/functions/wrapper/sandbox-template/. Not yet built/pushed to
// E2B's registry as of this build (this session's network policy blocks
// api.e2b.dev) - Sandbox.create will fail until someone with E2B CLI access
// runs the build command documented there.
//
// Signing: Play App Signing (decided - docs/agent-contracts.md #7). APP
// WRAPPER only ever signs with an *upload* keystore (ANDROID_UPLOAD_*
// secrets, base64-encoded keystore); Google re-signs with the real
// distribution key on ingest to Play Console. The signing config is
// injected into the Capacitor-generated android/app/build.gradle
// deterministically (a small Node patch script, not an LLM call) - it's a
// known, consistently-generated file shape, the same "prefer deterministic
// templating over an LLM call" choice made throughout this codebase
// (SCAVENGER's grep-based discovery, STITCHER's path map, PUBLISHER's PR
// body). The LLM role (`wrapper`) is reserved for what actually needs
// judgment: diagnosing and fixing real Gradle/native-project build failures
// that survive the deterministic scaffold - the one thing here comparable
// to FIXER's job, just scoped to the native Android project instead of the
// web app.
//
// Honest scope limit: this agent verifies the AAB builds and signs
// successfully - a real, meaningful structural check - but cannot boot an
// Android emulator to confirm first-load/crash behavior (the contract's
// second success criterion). E2B's container sandboxes have no KVM/graphics
// acceleration for that. A "passed" here means "builds and signs cleanly,"
// not "confirmed running on a device" - documented, not silently assumed.
//
// Known gap versus the written contract: PLANNER's own spec artifact
// (docs/agent-contracts.md #1) has no icon/app-name field - it's function
// specs, not app metadata. appName is derived from runs.prompt instead, and
// the app ships with Capacitor's default generated launcher icon rather
// than a custom one. Flagged rather than silently invented.
//
// Auth: internal service-to-service only, same pattern as every other agent.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { Sandbox } from "npm:e2b@1.6.0";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const e2bApiKey = Deno.env.get("E2B_API_KEY") ?? "";
const androidKeystoreB64 = Deno.env.get("ANDROID_UPLOAD_KEYSTORE_B64") ?? "";
const androidKeystorePassword = Deno.env.get("ANDROID_UPLOAD_KEYSTORE_PASSWORD") ?? "";
const androidKeyAlias = Deno.env.get("ANDROID_UPLOAD_KEY_ALIAS") ?? "";
const androidKeyPassword = Deno.env.get("ANDROID_UPLOAD_KEY_PASSWORD") ?? "";
const supabase = createClient(supabaseUrl, serviceRoleKey);

const AGENT = "wrapper";
const SANDBOX_TEMPLATE = "black-builder-app-wrapper";
const SANDBOX_TIMEOUT_MS = 1_200_000; // 20 minutes - cold Gradle/AGP dependency downloads on first build can be slow
const MAX_ROUNDS = 4;

type LogLine = string | { level: "info" | "warn" | "error"; message: string };

async function callback(
  run_id: string,
  status: "running" | "passed" | "failed" | "escalated",
  opts: { summary?: string; logs?: LogLine[] } = {},
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

async function runCmd(sandbox: Sandbox, cmd: string, opts: { envs?: Record<string, string> } = {}): Promise<{ stdout: string; stderr: string }> {
  const result = await sandbox.commands.run(`bash -lc ${JSON.stringify(cmd)}`, opts.envs ? { envs: opts.envs } : undefined);
  if (result.exitCode !== 0) {
    throw new Error(`Command failed (${result.exitCode}): ${cmd}\n${result.stderr || result.stdout}`);
  }
  return { stdout: result.stdout, stderr: result.stderr };
}

async function tryCmd(
  sandbox: Sandbox,
  cmd: string,
  opts: { envs?: Record<string, string> } = {},
): Promise<{ ok: true; stdout: string } | { ok: false; stderr: string; stdout: string }> {
  const result = await sandbox.commands.run(`bash -lc ${JSON.stringify(cmd)}`, opts.envs ? { envs: opts.envs } : undefined);
  return result.exitCode === 0 ? { ok: true, stdout: result.stdout } : { ok: false, stderr: result.stderr, stdout: result.stdout };
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

function androidAppId(run_id: string): string {
  const slug = run_id.replace(/-/g, "").slice(0, 12);
  return `com.blackbuilder.app.run${slug}`;
}

function androidAppName(prompt: string): string {
  const cleaned = prompt.replace(/[^\w\s-]/g, "").trim();
  const words = cleaned.split(/\s+/).filter(Boolean).slice(0, 5).join(" ");
  return words.length > 0 ? truncate(words, 30) : "Black Builder App";
}

function extractJson(raw: string): unknown {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : raw;
  return JSON.parse(candidate.trim());
}

type WrapperLlmResponse = {
  upstream_issue: boolean;
  upstream_reason?: string;
  files: { path: string; content: string }[];
  notes: string;
};

function validateWrapperResponse(
  data: unknown,
  opts: { requirePathPrefix?: string } = {},
): { ok: true; response: WrapperLlmResponse } | { ok: false; error: string } {
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

  return { ok: true, response: { upstream_issue: false, files: d.files as { path: string; content: string }[], notes: d.notes } };
}

const WRAPPER_SYSTEM_PROMPT = `You are APP WRAPPER, the final stage of the Black Builder app-building swarm. Capacitor has already scaffolded a native Android shell whose WebView loads the live, already-verified web app directly by URL - you are not looking at or editing the web app's own source, only the native Android project wrapping it.

You are called when the native Android release build ("./gradlew bundleRelease") failed. Diagnose the REAL cause from the Gradle error output given - common causes are SDK/AGP version mismatches, AndroidManifest issues, or resource/manifest merger conflicts. Fix ONLY files under android/ - never touch anything outside it, and never remove or alter the release signingConfig block (it references secrets injected at build time; changing its structure will break signing).

If the real cause is something you cannot fix by editing the native project - for example the web app would need a native capability (camera, filesystem, push notifications, etc.) that was never wired up as a Capacitor plugin, or a build failure rooted in a decision upstream of this stage - set "upstream_issue": true and explain why, rather than guessing. This should be rare; prefer fixing over escalating.

"notes" is one sentence: what you changed, or why you're flagging an upstream issue.

Respond with nothing but a single JSON object, no markdown fences, no commentary:
{
  "upstream_issue": boolean,
  "upstream_reason": string | null,
  "files": [ { "path": string, "content": string } ],
  "notes": string
}`;

const GRADLE_SIGNING_PATCH_SCRIPT = `const fs = require("fs");
const path = "android/app/build.gradle";
let content = fs.readFileSync(path, "utf8");

const signingBlock = \`    signingConfigs {
        release {
            storeFile file("../../keystore.jks")
            storePassword System.getenv("ANDROID_UPLOAD_KEYSTORE_PASSWORD")
            keyAlias System.getenv("ANDROID_UPLOAD_KEY_ALIAS")
            keyPassword System.getenv("ANDROID_UPLOAD_KEY_PASSWORD")
        }
    }
\`;

content = content.replace(/android\\s*\\{/, (match) => \`\${match}\\n\${signingBlock}\`);
content = content.replace(/(buildTypes\\s*\\{[\\s\\S]*?release\\s*\\{)/, \`$1\\n            signingConfig signingConfigs.release\`);

fs.writeFileSync(path, content);
console.log("patched " + path);
`;

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

  const { data: run, error: runErr } = await supabase.from("runs").select("web_url, prompt").eq("id", run_id).single();
  if (runErr || !run) {
    return new Response(JSON.stringify({ error: `run ${run_id} not found: ${runErr?.message}` }), { status: 404 });
  }
  if (!run.web_url) {
    const msg = `runs.web_url is not set for run ${run_id} - PUBLISHER should have deployed and set it before APP WRAPPER runs.`;
    await callback(run_id, "failed", { summary: msg, logs: [{ level: "error", message: msg }] });
    return new Response(JSON.stringify({ error: msg }), { status: 500 });
  }

  await callback(run_id, "running");

  const missingEnv = [
    !e2bApiKey && "E2B_API_KEY",
    !androidKeystoreB64 && "ANDROID_UPLOAD_KEYSTORE_B64",
    !androidKeystorePassword && "ANDROID_UPLOAD_KEYSTORE_PASSWORD",
    !androidKeyAlias && "ANDROID_UPLOAD_KEY_ALIAS",
    !androidKeyPassword && "ANDROID_UPLOAD_KEY_PASSWORD",
  ].filter(Boolean);
  if (missingEnv.length > 0) {
    const msg = `Missing required secret(s): ${missingEnv.join(", ")}. Add them in Supabase project secrets (the Android keystore ones come from a one-time local "keytool -genkeypair" run, base64-encoded).`;
    await callback(run_id, "escalated", { summary: msg, logs: [{ level: "error", message: msg }] });
    return new Response(JSON.stringify({ run_id, status: "escalated", reason: msg }), { status: 200 });
  }

  const appId = androidAppId(run_id);
  const appName = androidAppName(run.prompt);

  let sandbox: Sandbox | undefined;
  try {
    sandbox = await Sandbox.create({ apiKey: e2bApiKey, template: SANDBOX_TEMPLATE, timeoutMs: SANDBOX_TIMEOUT_MS });

    async function applyFiles(files: { path: string; content: string }[]): Promise<void> {
      for (const file of files) {
        await runCmd(sandbox!, `mkdir -p $(dirname ${JSON.stringify(`/work/${file.path}`)})`);
        await sandbox!.files.write(`/work/${file.path}`, file.content);
      }
    }

    async function callWrapperLlm(userContent: string): Promise<WrapperLlmResponse> {
      const llmResponse = await fetch(`${supabaseUrl}/functions/v1/llm-proxy`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${serviceRoleKey}` },
        body: JSON.stringify({
          role: "wrapper",
          run_id,
          system: WRAPPER_SYSTEM_PROMPT,
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
      const validation = validateWrapperResponse(parsed, { requirePathPrefix: "android/" });
      if (!validation.ok) throw new Error(`APP WRAPPER's response failed validation: ${validation.error}`);
      return validation.response;
    }

    // Scaffold: a minimal Capacitor project whose only job is to host a
    // WebView pointed at runs.web_url. No web source is cloned or bundled.
    await runCmd(sandbox, `mkdir -p /work/www && cd /work && echo '<!doctype html><title>Black Builder</title>' > www/index.html`);
    await sandbox.files.write(
      "/work/package.json",
      JSON.stringify(
        {
          name: `app-wrapper-${run_id.replace(/-/g, "").slice(0, 12)}`,
          version: "1.0.0",
          private: true,
          dependencies: { "@capacitor/core": "^6.1.0", "@capacitor/android": "^6.1.0" },
          devDependencies: { "@capacitor/cli": "^6.1.0" },
        },
        null,
        2,
      ),
    );
    await sandbox.files.write(
      "/work/capacitor.config.json",
      JSON.stringify(
        { appId, appName, webDir: "www", server: { url: run.web_url, androidScheme: "https" } },
        null,
        2,
      ),
    );
    await runCmd(sandbox, `cd /work && npm install --no-audit --no-fund 2>&1`);
    await runCmd(sandbox, `cd /work && npx cap add android 2>&1`);
    await runCmd(sandbox, `cd /work && npx cap sync android 2>&1`);

    // Inject the release signingConfig deterministically - a known,
    // consistently-generated file shape, not a job for an LLM call.
    await sandbox.files.write("/work/patch-gradle.js", GRADLE_SIGNING_PATCH_SCRIPT);
    await runCmd(sandbox, `cd /work && node patch-gradle.js`);

    // Decode the upload keystore into the sandbox (never written to any
    // repo - this sandbox is ephemeral and nothing here gets pushed to git).
    await sandbox.files.write("/work/keystore.jks.b64", androidKeystoreB64);
    await runCmd(sandbox, `cd /work && base64 -d keystore.jks.b64 > keystore.jks && rm keystore.jks.b64`);
    await runCmd(sandbox, `chmod +x /work/android/gradlew`);

    const buildEnvs = {
      ANDROID_UPLOAD_KEYSTORE_PASSWORD: androidKeystorePassword,
      ANDROID_UPLOAD_KEY_ALIAS: androidKeyAlias,
      ANDROID_UPLOAD_KEY_PASSWORD: androidKeyPassword,
    };

    let success = false;
    const fixRounds: string[] = [];
    for (let round = 1; round <= MAX_ROUNDS; round++) {
      const buildResult = await tryCmd(sandbox, `cd /work/android && ./gradlew bundleRelease --no-daemon 2>&1`, { envs: buildEnvs });
      if (buildResult.ok) {
        success = true;
        break;
      }
      if (round === MAX_ROUNDS) break;

      const resp = await callWrapperLlm(
        `The Android release build failed (round ${round}/${MAX_ROUNDS}). App: appId=${appId}, appName="${appName}", web_url=${run.web_url}\n\nGradle output:\n${truncate(buildResult.stderr || buildResult.stdout, 6000)}`,
      );
      if (resp.upstream_issue) {
        throw new Error(`__UPSTREAM_ISSUE__:${resp.upstream_reason}`);
      }
      await applyFiles(resp.files);
      fixRounds.push(`Round ${round}: fixed native build failure - ${resp.notes}`);
    }

    if (!success) {
      const msg = `APP WRAPPER did not reach a signed release build after ${MAX_ROUNDS} rounds. Last state: ${fixRounds.at(-1) ?? "no fixes applied"}.`;
      await callback(run_id, "failed", { summary: msg, logs: fixRounds.map((r) => ({ level: "warn" as const, message: r })) });
      return new Response(JSON.stringify({ error: msg }), { status: 500 });
    }

    const aabPath = "/work/android/app/build/outputs/bundle/release/app-release.aab";
    const aabBytes = await sandbox.files.read(aabPath, { format: "bytes" });
    const storagePath = `${run_id}/app-release.aab`;
    const { error: uploadErr } = await supabase.storage
      .from("artifacts")
      .upload(storagePath, new Blob([aabBytes]), { contentType: "application/octet-stream", upsert: true });
    if (uploadErr) throw new Error(`Failed to store AAB artifact: ${uploadErr.message}`);

    const { error: artifactErr } = await supabase.from("artifacts").insert({ run_id, kind: "aab", storage_path: storagePath });
    if (artifactErr) throw new Error(`Failed to record AAB artifact row: ${artifactErr.message}`);

    const { error: aabPathErr } = await supabase.from("runs").update({ aab_path: storagePath }).eq("id", run_id);
    if (aabPathErr) throw new Error(`Failed to set runs.aab_path: ${aabPathErr.message}`);

    const summary = `APP WRAPPER passed after ${fixRounds.length} fix round(s): signed release AAB built for "${appName}" (${appId}), wrapping ${run.web_url}. Build-only verification - not launched on an emulator/device (see the honest scope note in this function's header comment).`;
    await callback(run_id, "passed", { summary, logs: fixRounds.map((r) => ({ level: "info" as const, message: r })) });
    return new Response(JSON.stringify({ run_id, status: "passed", aab_path: storagePath, fix_rounds: fixRounds.length }), { status: 200 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.startsWith("__BUDGET_EXCEEDED__:")) {
      const budgetMsg = `Run budget exceeded before APP WRAPPER could finish: ${msg.slice("__BUDGET_EXCEEDED__:".length)}`;
      await callback(run_id, "failed", { summary: budgetMsg, logs: [{ level: "error", message: budgetMsg }] });
      return new Response(JSON.stringify({ error: budgetMsg }), { status: 502 });
    }
    if (msg.startsWith("__UPSTREAM_ISSUE__:")) {
      const reason = `APP WRAPPER traced the native build failure to something it can't fix by editing the Android project: ${msg.slice("__UPSTREAM_ISSUE__:".length)}`;
      await callback(run_id, "escalated", { summary: reason, logs: [{ level: "warn", message: reason }] });
      return new Response(JSON.stringify({ run_id, status: "escalated", reason }), { status: 200 });
    }
    await callback(run_id, "failed", { summary: msg, logs: [{ level: "error", message: msg }] });
    return new Response(JSON.stringify({ error: msg }), { status: 500 });
  } finally {
    if (sandbox) {
      await sandbox.kill().catch((err) => console.error(`Failed to kill sandbox for run ${run_id}: ${err}`));
    }
  }
});
