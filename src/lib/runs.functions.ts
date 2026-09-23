import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Local type definitions until the Supabase schema is created and types are regenerated.
// These mirror the tables and enums in the database.
export type AgentType =
  | "planner"
  | "scavenger"
  | "builder"
  | "stitcher"
  | "fixer"
  | "publisher"
  | "wrapper";

export type RunStatus =
  | "pending"
  | "running"
  | "passed"
  | "failed"
  | "escalated";

export type RunSummary = {
  id: string;
  prompt: string;
  status: RunStatus;
  current_stage: AgentType | null;
  web_url: string | null;
  created_at: string;
  finished_at: string | null;
};

export type RunStage = {
  id: string;
  agent: AgentType;
  status: RunStatus;
  attempt: number;
  branch: string | null;
  summary: string | null;
  started_at: string | null;
  ended_at: string | null;
};

export type RunLog = {
  id: string;
  stage_id: string;
  ts: string;
  level: string;
  message: string;
};

export type RunDetail = {
  run: RunSummary & {
    aab_path: string | null;
    cost_usd: number | null;
  };
  stages: RunStage[];
  logs: RunLog[];
};

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
  .handler(async ({ context }): Promise<RunSummary[]> => {
    const sb = context.supabase as any;
    const { data, error } = await sb
      .from("runs")
      .select("id, prompt, status, current_stage, web_url, created_at, finished_at")
      .order("created_at", { ascending: false })
      .limit(30);

    if (error) throw new Error(error.message);
    return (data ?? []) as RunSummary[];
  });

export const createRun = createServerFn({ method: "POST" })
  .validator(z.object({ prompt: z.string().trim().min(1).max(4000) }))
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }): Promise<RunSummary> => {
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

    return run as RunSummary;
  });

export const getRun = createServerFn({ method: "GET" })
  .validator(z.object({ runId: z.string().uuid() }))
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }): Promise<RunDetail> => {
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
    const sortedStages = [...((stages ?? []) as RunStage[])].sort(
      (a, b) => (order.get(a.agent) ?? 0) - (order.get(b.agent) ?? 0),
    );

    return {
      run: run as RunDetail["run"],
      stages: sortedStages,
      logs: ((logs ?? []) as RunLog[]).sort(
        (a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime(),
      ),
    };
  });
