import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Local type definition until the Supabase schema is created and types are regenerated.
// Mirrors the agent_type enum and lets the server functions type-check before codegen.
type AgentType =
  | "planner"
  | "scavenger"
  | "builder"
  | "stitcher"
  | "fixer"
  | "publisher"
  | "wrapper";

// Fixed pipeline order — must match src/lib/agents.ts.
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
    const sb = context.supabase as any;
    const { data, error } = await sb
      .from("runs")
      .select("id, prompt, status, current_stage, web_url, created_at, finished_at")
      .order("created_at", { ascending: false })
      .limit(30);

    if (error) throw new Error(error.message);
    return data;
  });

export const createRun = createServerFn({ method: "POST" })
  .validator(z.object({ prompt: z.string().trim().min(1).max(4000) }))
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;
    const { data: run, error } = await sb
      .from("runs")
      .insert({ user_id: context.userId, prompt: data.prompt })
      .select("id, prompt, status, current_stage, web_url, created_at, finished_at")
      .single();

    if (error) throw new Error(error.message);

    const { error: stagesError } = await sb
      .from("run_stages")
      .insert(PIPELINE_STAGES.map((agent) => ({ run_id: run.id, agent })));

    if (stagesError) throw new Error(stagesError.message);

    return run;
  });

export const getRun = createServerFn({ method: "GET" })
  .validator(z.object({ runId: z.string().uuid() }))
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;
    const { data: run, error } = await sb
      .from("runs")
      .select(
        "id, prompt, status, current_stage, web_url, aab_path, cost_usd, created_at, finished_at",
      )
      .eq("id", data.runId)
      .single();

    if (error) throw new Error(error.message);

    const { data: stages, error: stagesError } = await sb
      .from("run_stages")
      .select("id, agent, status, attempt, branch, summary, started_at, ended_at")
      .eq("run_id", data.runId);

    if (stagesError) throw new Error(stagesError.message);

    const { data: logs, error: logsError } = await sb
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
