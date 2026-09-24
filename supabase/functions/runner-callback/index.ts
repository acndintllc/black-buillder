import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(supabaseUrl, supabaseKey);

type LogLevel = "info" | "warn" | "error";
type LogLine = string | { level: LogLevel; message: string };

interface CallbackRequest {
  run_id: string;
  agent: string;
  status: "running" | "passed" | "failed" | "escalated";
  task?: string;
  file?: string;
  source?: string;
  logs?: LogLine[];
  summary?: string;
  branch?: string;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const body: CallbackRequest = await req.json();

    if (!body.run_id || !body.agent || !body.status) {
      return new Response(
        JSON.stringify({
          error: "run_id, agent, and status are required",
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Update run_stage for this agent
    const { error: stageError } = await supabase
      .from("run_stages")
      .update({
        status: body.status,
        started_at: body.status === "running" ? new Date().toISOString() : undefined,
        ended_at:
          body.status === "passed" || body.status === "failed" || body.status === "escalated"
            ? new Date().toISOString()
            : undefined,
        summary: body.summary,
        // Only coder stages (BUILDER onward) pass this - omitted, it's left
        // as-is rather than cleared, per the shared "branch" convention in
        // docs/agent-contracts.md.
        branch: body.branch,
      })
      .eq("run_id", body.run_id)
      .eq("agent", body.agent);

    if (stageError) {
      throw stageError;
    }

    // Add logs if provided. Each line is either a plain string (level
    // defaults to "info") or {level, message} so agents can report warn/error
    // per the shared-conventions log-level contract in docs/agent-contracts.md.
    if (body.logs && body.logs.length > 0) {
      const { data: stage } = await supabase
        .from("run_stages")
        .select("id")
        .eq("run_id", body.run_id)
        .eq("agent", body.agent)
        .single();

      if (stage) {
        const logsData = body.logs.map((log) =>
          typeof log === "string"
            ? { run_id: body.run_id, stage_id: stage.id, level: "info", message: log }
            : { run_id: body.run_id, stage_id: stage.id, level: log.level, message: log.message }
        );

        await supabase.from("run_logs").insert(logsData);
      }
    }

    // Update run.current_stage if agent just finished, and actually advance
    // the pipeline by invoking the next stage - this callback is "the
    // pipeline runner" per docs/agent-contracts.md's shared conventions,
    // the only thing allowed to sequence current_stage/status/finished_at.
    if (body.status === "passed" || body.status === "failed") {
      const agents = [
        "planner",
        "scavenger",
        "builder",
        "stitcher",
        "fixer",
        "publisher",
        "wrapper",
      ];
      const currentIdx = agents.indexOf(body.agent);
      const nextAgent = agents[currentIdx + 1] || null;
      const isFailed = body.status === "failed";
      const isLastStage = !isFailed && nextAgent === null;

      await supabase
        .from("runs")
        .update({
          current_stage: nextAgent,
          status: isFailed ? "failed" : isLastStage ? "passed" : "running",
          finished_at: isFailed || isLastStage ? new Date().toISOString() : undefined,
        })
        .eq("id", body.run_id);

      // Fire-and-forget invoke of the next stage, same pattern as
      // start-run -> planner. Each stage reports its own progress back
      // through this same callback endpoint.
      if (!isFailed && nextAgent) {
        fetch(`${supabaseUrl}/functions/v1/${nextAgent}`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${supabaseKey}`,
          },
          body: JSON.stringify({ run_id: body.run_id }),
        }).catch((err) => {
          console.error(`Failed to invoke ${nextAgent} for run ${body.run_id}: ${err}`);
        });
      }
    } else if (body.status === "running" || body.status === "escalated") {
      // First callback of the run (or an escalation on the very first
      // stage) - flip runs.status off "pending" so the UI reflects that the
      // pipeline has actually started. No-op once it's already running.
      await supabase
        .from("runs")
        .update({ status: "running" })
        .eq("id", body.run_id)
        .eq("status", "pending");
    }

    return new Response(
      JSON.stringify({
        run_id: body.run_id,
        agent: body.agent,
        status: body.status,
        message: "Callback received",
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
});
