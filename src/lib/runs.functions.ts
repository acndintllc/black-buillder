import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";

type AgentType = Database["public"]["Enums"]["agent_type"];

// Fixed pipeline order — must match src/lib/agents.ts. Used only to sort
// run_stages for display; start-run (not this file) is what actually creates
// them now.
const PIPELINE_STAGES: AgentType[] = [
  "planner",
  "scavenger",
  "builder",
  "stitcher",
  "fixer",
  "publisher",
  "wrapper",
];

export const listRuns = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("runs")
      .select("id, prompt, status, current_stage, web_url, created_at, finished_at")
      .order("created_at", { ascending: false })
      .limit(30);

    if (error) throw new Error(error.message);
    return data;
  });

// Delegates to the start-run Edge Function rather than inserting runs/run_stages
// directly - start-run is also what fires PLANNER off (fire-and-forget) right
// after creating the rows. A direct insert here would create a run that never
// actually starts, since nothing else kicks the pipeline off.
export const createRun = createServerFn({ method: "POST" })
  .validator(z.object({ prompt: z.string().trim().min(1).max(4000) }))
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const SUPABASE_URL = process.env["SUPABASE_URL"];
    if (!SUPABASE_URL) throw new Error("Missing Supabase environment variable: SUPABASE_URL.");

    const authHeader = getRequest()?.headers.get("authorization");
    if (!authHeader) throw new Error("Unauthorized: no authorization header available to start the run.");

    const res = await fetch(`${SUPABASE_URL}/functions/v1/start-run`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: authHeader },
      body: JSON.stringify({ prompt: data.prompt }),
    });

    if (!res.ok) {
      throw new Error(`Failed to start run: ${res.status} ${await res.text()}`);
    }

    const { run_id } = await res.json();

    const { data: run, error } = await context.supabase
      .from("runs")
      .select("id, prompt, status, current_stage, web_url, created_at, finished_at")
      .eq("id", run_id)
      .single();

    if (error) throw new Error(error.message);
    return run;
  });

// Delegates to the cancel-run Edge Function - same ownership check, same
// "mark run + pending stages failed" behavior, no need to duplicate it here.
export const cancelRun = createServerFn({ method: "POST" })
  .validator(z.object({ runId: z.string().uuid() }))
  .middleware([requireSupabaseAuth])
  .handler(async ({ data }) => {
    const SUPABASE_URL = process.env["SUPABASE_URL"];
    if (!SUPABASE_URL) throw new Error("Missing Supabase environment variable: SUPABASE_URL.");

    const authHeader = getRequest()?.headers.get("authorization");
    if (!authHeader) throw new Error("Unauthorized: no authorization header available to cancel the run.");

    const res = await fetch(`${SUPABASE_URL}/functions/v1/cancel-run`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: authHeader },
      body: JSON.stringify({ run_id: data.runId }),
    });

    if (!res.ok) {
      throw new Error(`Failed to cancel run: ${res.status} ${await res.text()}`);
    }

    return res.json() as Promise<{ run_id: string; status: string; message: string }>;
  });

export const getRun = createServerFn({ method: "GET" })
  .validator(z.object({ runId: z.string().uuid() }))
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const { data: run, error } = await context.supabase
      .from("runs")
      .select(
        "id, prompt, status, current_stage, web_url, aab_path, cost_usd, created_at, finished_at",
      )
      .eq("id", data.runId)
      .single();

    if (error) throw new Error(error.message);

    const { data: stages, error: stagesError } = await context.supabase
      .from("run_stages")
      .select("id, agent, status, attempt, branch, summary, started_at, ended_at")
      .eq("run_id", data.runId);

    if (stagesError) throw new Error(stagesError.message);

    const { data: logs, error: logsError } = await context.supabase
      .from("run_logs")
      .select("id, stage_id, ts, level, message")
      .eq("run_id", data.runId)
      .order("ts", { ascending: true })
      .limit(200);

    if (logsError) throw new Error(logsError.message);

    const order = new Map(PIPELINE_STAGES.map((agent, index) => [agent, index]));
    const sortedStages = [...(stages ?? [])].sort(
      (a, b) => (order.get(a.agent) ?? 0) - (order.get(b.agent) ?? 0),
    );

    return { run, stages: sortedStages, logs: logs ?? [] };
  });
