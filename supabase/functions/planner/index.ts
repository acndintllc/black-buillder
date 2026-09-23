// PLANNER — reads a run's prompt, produces the locked spec every other
// agent builds against. See docs/agent-contracts.md #1 for the full
// contract (inputs/outputs/success criteria).
//
// Auth: internal service-to-service only, same pattern as llm-proxy —
// callers send the project's own service role key as a Bearer token.
// Invoked by start-run right after a run's rows are created; verify_jwt
// is disabled at deploy time since the caller is start-run, not an
// end-user session.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, serviceRoleKey);

const AGENT = "planner";

type LogLine = string | { level: "info" | "warn" | "error"; message: string };

async function callback(
  run_id: string,
  status: "running" | "passed" | "failed" | "escalated",
  opts: { summary?: string; logs?: LogLine[] } = {},
): Promise<void> {
  const res = await fetch(`${supabaseUrl}/functions/v1/runner-callback`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${serviceRoleKey}`,
    },
    body: JSON.stringify({ run_id, agent: AGENT, status, ...opts }),
  });
  if (!res.ok) {
    console.error(`runner-callback failed for run ${run_id}: ${res.status} ${await res.text()}`);
  }
}

// The spec shape PLANNER must produce. `escalate` lets the model signal
// "this needs a human decision" (ambiguous scope, conflicting constraints,
// disallowed request) instead of forcing a guess — see the contract's
// escalation clause.
type PlannerSpec = {
  escalate: boolean;
  escalation_reason?: string;
  functions: { function_key: string; description: string; acceptance_signal: string }[];
  out_of_scope: string[];
};

const SYSTEM_PROMPT = `You are PLANNER, the first stage of an automated app-building swarm called Black Builder.

Your one job: read the user's request and produce a locked, compartmentalized spec that six downstream agents (SCAVENGER, BUILDER, STITCHER, FIXER, PUBLISHER, APP WRAPPER) will build against without ever re-reading the user's original words. If you leave something out or invent something extra, it either never gets built or gets built without authorization — both are failures.

Rules:
- Every explicit requirement in the prompt must map to at least one function_key. Do not drop anything the user asked for.
- Do not invent a function_key for anything the user did not ask for, no matter how "obviously" useful it seems. If it's not in the prompt, it's not in the spec.
- Each function_key must be unique, short, snake_case, and describe one coherent, independently buildable piece (e.g. "barcode_scanner", "user_auth", "result_history"). Do not split one real feature into many tiny keys, and do not merge unrelated features into one key.
- "acceptance_signal" is the concrete, checkable behavior that proves this function works — not a restatement of the description. Someone should be able to test it without asking you what you meant.
- "out_of_scope" lists things a reasonable reader might assume are included but are not — be explicit so nothing gets silently added later.
- If the prompt is empty, contradictory, or requires a decision only a human can make (ambiguous scope, conflicting constraints, a disallowed request), set "escalate": true and explain why in "escalation_reason" instead of guessing. Do not produce a partial spec in this case — leave "functions" and "out_of_scope" empty.

Respond with nothing but a single JSON object matching this exact shape, no markdown fences, no commentary before or after:
{
  "escalate": boolean,
  "escalation_reason": string | null,
  "functions": [
    { "function_key": string, "description": string, "acceptance_signal": string }
  ],
  "out_of_scope": [string]
}`;

function extractJson(raw: string): unknown {
  // Models sometimes wrap JSON in a fenced code block despite instructions
  // not to — strip that before parsing rather than failing on it.
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : raw;
  return JSON.parse(candidate.trim());
}

function validateSpec(data: unknown): { ok: true; spec: PlannerSpec } | { ok: false; error: string } {
  if (typeof data !== "object" || data === null) return { ok: false, error: "response is not a JSON object" };
  const d = data as Record<string, unknown>;

  if (typeof d.escalate !== "boolean") return { ok: false, error: '"escalate" must be a boolean' };
  if (d.escalate) {
    if (typeof d.escalation_reason !== "string" || !d.escalation_reason.trim()) {
      return { ok: false, error: '"escalation_reason" is required and must be non-empty when escalate is true' };
    }
    return { ok: true, spec: { escalate: true, escalation_reason: d.escalation_reason, functions: [], out_of_scope: [] } };
  }

  if (!Array.isArray(d.functions) || d.functions.length === 0) {
    return { ok: false, error: '"functions" must be a non-empty array when escalate is false' };
  }
  const seen = new Set<string>();
  for (const [i, fn] of d.functions.entries()) {
    if (typeof fn !== "object" || fn === null) return { ok: false, error: `functions[${i}] is not an object` };
    const f = fn as Record<string, unknown>;
    if (typeof f.function_key !== "string" || !f.function_key.trim()) {
      return { ok: false, error: `functions[${i}].function_key is missing or empty` };
    }
    if (typeof f.description !== "string" || !f.description.trim()) {
      return { ok: false, error: `functions[${i}].description is missing or empty` };
    }
    if (typeof f.acceptance_signal !== "string" || !f.acceptance_signal.trim()) {
      return { ok: false, error: `functions[${i}].acceptance_signal is missing or empty` };
    }
    if (seen.has(f.function_key)) {
      return { ok: false, error: `duplicate function_key "${f.function_key}"` };
    }
    seen.add(f.function_key);
  }
  if (!Array.isArray(d.out_of_scope) || d.out_of_scope.some((s) => typeof s !== "string")) {
    return { ok: false, error: '"out_of_scope" must be an array of strings' };
  }

  return {
    ok: true,
    spec: {
      escalate: false,
      functions: d.functions as PlannerSpec["functions"],
      out_of_scope: d.out_of_scope as string[],
    },
  };
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

  const { data: run, error: runErr } = await supabase
    .from("runs")
    .select("prompt, input_repo_url")
    .eq("id", run_id)
    .single();

  if (runErr || !run) {
    return new Response(JSON.stringify({ error: `run ${run_id} not found: ${runErr?.message}` }), { status: 404 });
  }

  await callback(run_id, "running");

  const userContent = run.input_repo_url
    ? `Request: ${run.prompt}\n\nThe user wants this applied to an existing repo: ${run.input_repo_url}. Treat the spec as completing/modifying that repo, not building from scratch.`
    : `Request: ${run.prompt}`;

  let llmResponse: Response;
  try {
    llmResponse = await fetch(`${supabaseUrl}/functions/v1/llm-proxy`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${serviceRoleKey}`,
      },
      body: JSON.stringify({
        role: "planner",
        run_id,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userContent }],
        max_tokens: 8192,
      }),
    });
  } catch (err) {
    const msg = `llm-proxy request failed: ${err instanceof Error ? err.message : String(err)}`;
    await callback(run_id, "failed", { summary: msg, logs: [{ level: "error", message: msg }] });
    return new Response(JSON.stringify({ error: msg }), { status: 502 });
  }

  if (!llmResponse.ok) {
    const bodyText = await llmResponse.text();
    const msg =
      llmResponse.status === 402
        ? `Run budget exceeded before PLANNER could complete: ${bodyText}`
        : `llm-proxy returned ${llmResponse.status}: ${bodyText}`;
    await callback(run_id, "failed", { summary: msg, logs: [{ level: "error", message: msg }] });
    return new Response(JSON.stringify({ error: msg }), { status: 502 });
  }

  const llmResult = await llmResponse.json();
  const rawContent: string = llmResult.content ?? "";

  let parsed: unknown;
  try {
    parsed = extractJson(rawContent);
  } catch (err) {
    const msg = `PLANNER's response was not valid JSON: ${err instanceof Error ? err.message : String(err)}`;
    await callback(run_id, "failed", {
      summary: msg,
      logs: [
        { level: "error", message: msg },
        { level: "info", message: `Raw response (first 2000 chars): ${rawContent.slice(0, 2000)}` },
      ],
    });
    return new Response(JSON.stringify({ error: msg }), { status: 502 });
  }

  const validation = validateSpec(parsed);
  if (!validation.ok) {
    const msg = `PLANNER's spec failed validation: ${validation.error}`;
    await callback(run_id, "failed", { summary: msg, logs: [{ level: "error", message: msg }] });
    return new Response(JSON.stringify({ error: msg }), { status: 502 });
  }

  const spec = validation.spec;

  if (spec.escalate) {
    await callback(run_id, "escalated", {
      summary: spec.escalation_reason,
      logs: [{ level: "warn", message: `PLANNER escalated: ${spec.escalation_reason}` }],
    });
    return new Response(JSON.stringify({ run_id, status: "escalated", reason: spec.escalation_reason }), { status: 200 });
  }

  // Store the spec artifact. Bucket "artifacts" is private; every reader
  // (SCAVENGER onward) is a trusted server-side agent with the service
  // role key, same trust boundary as the DB tables themselves.
  const storagePath = `${run_id}/spec.json`;
  const { error: uploadErr } = await supabase.storage
    .from("artifacts")
    .upload(storagePath, JSON.stringify({ functions: spec.functions, out_of_scope: spec.out_of_scope }, null, 2), {
      contentType: "application/json",
      upsert: true,
    });

  if (uploadErr) {
    const msg = `Failed to store spec artifact: ${uploadErr.message}`;
    await callback(run_id, "failed", { summary: msg, logs: [{ level: "error", message: msg }] });
    return new Response(JSON.stringify({ error: msg }), { status: 500 });
  }

  const { error: artifactErr } = await supabase.from("artifacts").insert({
    run_id,
    kind: "spec",
    storage_path: storagePath,
  });

  if (artifactErr) {
    const msg = `Failed to record spec artifact row: ${artifactErr.message}`;
    await callback(run_id, "failed", { summary: msg, logs: [{ level: "error", message: msg }] });
    return new Response(JSON.stringify({ error: msg }), { status: 500 });
  }

  const summary = `Spec locked: ${spec.functions.length} function${spec.functions.length === 1 ? "" : "s"} — ${spec.functions
    .map((f) => f.function_key)
    .join(", ")}.`;
  const perFunctionLogs: LogLine[] = spec.functions.map((f) => ({
    level: "info",
    message: `${f.function_key}: ${f.description}`,
  }));

  await callback(run_id, "passed", { summary, logs: perFunctionLogs });

  return new Response(JSON.stringify({ run_id, status: "passed", function_count: spec.functions.length }), { status: 200 });
});
