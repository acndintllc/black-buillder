// llm-proxy — single entry point every swarm agent calls instead of hitting
// a provider's API directly. Lets us swap which model powers each agent
// role by editing one secret value, with no code change or redeploy.
//
// Auth: internal service-to-service only. Callers must send the project's
// own service role key as a Bearer token — never exposed to the frontend.
// The Supabase platform's own JWT verification is disabled for this
// function (see verify_jwt: false at deploy time) since callers are backend
// agent processes, not end users with a Supabase Auth session.
//
// Role -> "provider:model" mapping is read from an env var per role, with a
// hardcoded fallback if the env var isn't set. To swap a role's model,
// change the LLM_ROLE_* secret in the Supabase dashboard — no redeploy.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

type Provider = "anthropic" | "openai" | "xai" | "dashscope";
type Role = "planner" | "coder" | "coder_high" | "coder_max" | "low_cost";

// "coder_high" is for the two terminal correctness gates (FIXER, APP WRAPPER
// — see docs/agent-contracts.md): nothing downstream double-checks their
// output, so they get a stronger model than the other coder-role agents.
// "coder_max" is PUBLISHER only: the last of the three stages the org has
// called make-or-break for the whole app, deliberately set above coder_high.
const ROLE_DEFAULTS: Record<Role, string> = {
  planner: "anthropic:claude-opus-5-5",
  coder: "dashscope:qwen3.8-max",
  coder_high: "openai:gpt-6-astra",
  coder_max: "anthropic:claude-opus-5-5",
  low_cost: "dashscope:qwen3.5-flash",
};

const ROLE_ENV_VAR: Record<Role, string> = {
  planner: "LLM_ROLE_PLANNER",
  coder: "LLM_ROLE_CODER",
  coder_high: "LLM_ROLE_CODER_HIGH",
  coder_max: "LLM_ROLE_CODER_MAX",
  low_cost: "LLM_ROLE_LOW_COST",
};

// Anthropic-only: output_config.effort sent on the request for roles that
// need it. Opus 5.5 defaults to "medium" if omitted — both roles below need
// "max" set explicitly. Not env-overridable (kept simple; revisit if a role
// needs per-deploy tuning).
const ROLE_EFFORT: Partial<Record<Role, string>> = {
  planner: "max",
  coder_max: "max",
};

// $ per million tokens, [input, output]. Claude entries verified against
// Anthropic's own current pricing table (see claude-api skill) during this
// session — no longer placeholders. OpenAI/Grok figures were confirmed
// against each provider's own current pricing during research; DashScope
// figures (qwen3.5-flash, qwen3.8-max) verified against Alibaba's own
// pricing docs and DashScope API reference during this session.
const PRICING_USD_PER_MILLION: Record<string, [number, number]> = {
  "claude-fable-5-1": [10, 50],
  "claude-opus-5-5": [4, 20],
  "claude-sonnet-5": [2, 10],
  "claude-haiku-4-5": [1, 5],
  "gpt-6-astra": [10, 50],
  "gpt-6-sol": [2, 10],
  "gpt-6-luna": [0.1, 0.5],
  "grok-4.7": [2, 6], // doubles to [4, 12] above 200K context, not modeled here
  "grok-build-0.1": [0.2, 1.5],
  "qwen3-coder-plus": [0.65, 3.25],
  "qwen3-max": [2, 6], // older generation; kept for reference, superseded by qwen3.8-max below
  "qwen3.8-max": [2, 6],
  "qwen3.5-flash": [0.1, 0.4],
};

function resolveRoleTarget(role: Role): { provider: Provider; model: string; effort?: string } {
  const raw = Deno.env.get(ROLE_ENV_VAR[role]) || ROLE_DEFAULTS[role];
  const [provider, ...modelParts] = raw.split(":");
  const model = modelParts.join(":");
  if (!provider || !model) {
    throw new Error(`Malformed model target for role "${role}": "${raw}". Expected "provider:model".`);
  }
  return { provider: provider as Provider, model, effort: ROLE_EFFORT[role] };
}

function computeCostUsd(model: string, inputTokens: number, outputTokens: number): number | null {
  const rate = PRICING_USD_PER_MILLION[model];
  if (!rate) return null;
  const [inRate, outRate] = rate;
  return (inputTokens / 1_000_000) * inRate + (outputTokens / 1_000_000) * outRate;
}

type ChatMessage = { role: "user" | "assistant"; content: string };

type ProxyRequest = {
  role: Role;
  run_id?: string;
  system?: string;
  messages: ChatMessage[];
  max_tokens?: number;
  model_override?: string; // "provider:model" — bypasses role mapping, for harness spikes/testing
};

type CallResult = {
  content: string;
  input_tokens: number;
  output_tokens: number;
};

async function callAnthropic(model: string, system: string | undefined, messages: ChatMessage[], maxTokens: number, effort?: string): Promise<CallResult> {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      system,
      messages,
      ...(effort ? { output_config: { effort } } : {}),
    }),
  });

  if (!res.ok) {
    throw new Error(`Anthropic API error ${res.status}: ${await res.text()}`);
  }

  const data = await res.json();
  const content = (data.content ?? []).map((block: { text?: string }) => block.text ?? "").join("");
  return {
    content,
    input_tokens: data.usage?.input_tokens ?? 0,
    output_tokens: data.usage?.output_tokens ?? 0,
  };
}

// OpenAI, xAI (Grok), and DashScope (Qwen, international endpoint) all speak
// the OpenAI-compatible chat completions shape, so one caller covers all three.
async function callOpenAiCompatible(
  baseUrl: string,
  apiKeyEnvVar: string,
  model: string,
  system: string | undefined,
  messages: ChatMessage[],
  maxTokens: number,
): Promise<CallResult> {
  const apiKey = Deno.env.get(apiKeyEnvVar);
  if (!apiKey) throw new Error(`${apiKeyEnvVar} is not set`);

  const allMessages = system ? [{ role: "system", content: system }, ...messages] : messages;

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      messages: allMessages,
    }),
  });

  if (!res.ok) {
    throw new Error(`${baseUrl} error ${res.status}: ${await res.text()}`);
  }

  const data = await res.json();
  return {
    content: data.choices?.[0]?.message?.content ?? "",
    input_tokens: data.usage?.prompt_tokens ?? 0,
    output_tokens: data.usage?.completion_tokens ?? 0,
  };
}

const PROVIDER_BASE_URL: Record<Exclude<Provider, "anthropic">, string> = {
  openai: "https://api.openai.com/v1",
  xai: "https://api.x.ai/v1",
  // International Model Studio endpoint — see code comment history / setup
  // notes if a request fails with an auth/region error, this likely needs
  // to switch to https://dashscope.aliyuncs.com/compatible-mode/v1 (China).
  dashscope: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
};

const PROVIDER_API_KEY_ENV: Record<Exclude<Provider, "anthropic">, string> = {
  openai: "OPENAI_API_KEY",
  xai: "XAI_API_KEY",
  dashscope: "DASHSCOPE_API_KEY",
};

async function callProvider(
  provider: Provider,
  model: string,
  system: string | undefined,
  messages: ChatMessage[],
  maxTokens: number,
  effort?: string,
): Promise<CallResult> {
  if (provider === "anthropic") {
    return callAnthropic(model, system, messages, maxTokens, effort);
  }
  // effort is an Anthropic-specific output_config field; OpenAI-compatible
  // endpoints (OpenAI, xAI, DashScope) don't take it, so it's dropped here.
  return callOpenAiCompatible(PROVIDER_BASE_URL[provider], PROVIDER_API_KEY_ENV[provider], model, system, messages, maxTokens);
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const authHeader = req.headers.get("authorization") ?? "";
  const providedToken = authHeader.replace(/^Bearer\s+/i, "");
  if (!serviceRoleKey || providedToken !== serviceRoleKey) {
    return jsonResponse({ error: "Unauthorized: internal service calls only" }, 401);
  }

  let body: ProxyRequest;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  if (!body.role || !["planner", "coder", "coder_high", "coder_max", "low_cost"].includes(body.role)) {
    return jsonResponse({ error: 'body.role must be one of "planner" | "coder" | "coder_high" | "coder_max" | "low_cost"' }, 400);
  }
  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return jsonResponse({ error: "body.messages must be a non-empty array" }, 400);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  // Budget enforcement: only applies when the caller passes a run_id AND
  // that run has a budget_usd set. No run_id or a null budget = unlimited.
  if (body.run_id) {
    const { data: run, error } = await supabase
      .from("runs")
      .select("cost_usd, budget_usd")
      .eq("id", body.run_id)
      .single();

    if (error) {
      return jsonResponse({ error: `run_id lookup failed: ${error.message}` }, 400);
    }
    if (run.budget_usd !== null && (run.cost_usd ?? 0) >= run.budget_usd) {
      return jsonResponse(
        { error: "Run budget exceeded", cost_usd: run.cost_usd, budget_usd: run.budget_usd },
        402,
      );
    }
  }

  let provider: Provider;
  let model: string;
  let effort: string | undefined;
  try {
    if (body.model_override) {
      const [p, ...rest] = body.model_override.split(":");
      provider = p as Provider;
      model = rest.join(":");
    } else {
      ({ provider, model, effort } = resolveRoleTarget(body.role));
    }
  } catch (err) {
    return jsonResponse({ error: err instanceof Error ? err.message : String(err) }, 400);
  }

  let result: CallResult;
  try {
    result = await callProvider(provider, model, body.system, body.messages, body.max_tokens ?? 4096, effort);
  } catch (err) {
    return jsonResponse({ error: err instanceof Error ? err.message : String(err) }, 502);
  }

  const costUsd = computeCostUsd(model, result.input_tokens, result.output_tokens);

  if (body.run_id && costUsd !== null) {
    const { error: rpcError } = await supabase.rpc("increment_run_cost", {
      p_run_id: body.run_id,
      p_amount: costUsd,
    });
    if (rpcError) {
      console.error(`Failed to record cost for run ${body.run_id}: ${rpcError.message}`);
    }
  }

  return jsonResponse({
    content: result.content,
    provider,
    model,
    usage: { input_tokens: result.input_tokens, output_tokens: result.output_tokens },
    cost_usd: costUsd,
  });
});
