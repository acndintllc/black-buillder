import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(supabaseUrl, supabaseKey);

interface StartRunRequest {
  prompt: string;
  input_repo_url?: string;
}

Deno.serve(async (req: Request) => {
  // Only accept POST
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    // Get user ID from JWT (verified by Supabase)
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Extract user ID from JWT (Supabase already verified it)
    const jwt = authHeader.replace("Bearer ", "");
    const payload = JSON.parse(atob(jwt.split(".")[1]));
    const userId = payload.sub;

    if (!userId) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const body: StartRunRequest = await req.json();

    if (!body.prompt) {
      return new Response(
        JSON.stringify({ error: "prompt is required" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Create run record
    const { data: run, error: runError } = await supabase
      .from("runs")
      .insert({
        user_id: userId,
        prompt: body.prompt,
        input_repo_url: body.input_repo_url || null,
        status: "pending",
        current_stage: "planner",
      })
      .select()
      .single();

    if (runError) {
      throw runError;
    }

    // Initialize run_stages for all 7 agents
    const agents = [
      "planner",
      "scavenger",
      "builder",
      "stitcher",
      "fixer",
      "publisher",
      "wrapper",
    ];
    const stagesData = agents.map((agent) => ({
      run_id: run.id,
      agent: agent,
      status: "pending",
      attempt: 1,
    }));

    const { error: stagesError } = await supabase
      .from("run_stages")
      .insert(stagesData);

    if (stagesError) {
      throw stagesError;
    }

    // Log run start
    await supabase.from("run_logs").insert({
      run_id: run.id,
      level: "info",
      message: `Run started with prompt: ${body.prompt.substring(0, 100)}...`,
    });

    // Kick off PLANNER — fire-and-forget so the caller isn't stuck waiting
    // on a potentially long LLM call. PLANNER reports its own progress back
    // via runner-callback, same as every other stage.
    fetch(`${supabaseUrl}/functions/v1/planner`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${supabaseKey}`,
      },
      body: JSON.stringify({ run_id: run.id }),
    }).catch((err) => {
      console.error(`Failed to invoke planner for run ${run.id}: ${err}`);
    });

    return new Response(
      JSON.stringify({
        run_id: run.id,
        status: "pending",
        message: "Run created successfully",
      }),
      {
        status: 201,
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
