import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(supabaseUrl, supabaseKey);

interface CancelRunRequest {
  run_id: string;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const jwt = authHeader.replace("Bearer ", "");
    const payload = JSON.parse(atob(jwt.split(".")[1]));
    const userId = payload.sub;

    const body: CancelRunRequest = await req.json();

    if (!body.run_id) {
      return new Response(
        JSON.stringify({ error: "run_id is required" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Verify run belongs to user
    const { data: run, error: runError } = await supabase
      .from("runs")
      .select("id, user_id")
      .eq("id", body.run_id)
      .single();

    if (runError || !run || run.user_id !== userId) {
      return new Response(
        JSON.stringify({ error: "Run not found or unauthorized" }),
        {
          status: 403,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Mark run as failed
    const { error: updateError } = await supabase
      .from("runs")
      .update({ status: "failed", finished_at: new Date().toISOString() })
      .eq("id", body.run_id);

    if (updateError) {
      throw updateError;
    }

    // Mark all pending stages as failed
    const { error: stagesError } = await supabase
      .from("run_stages")
      .update({ status: "failed", ended_at: new Date().toISOString() })
      .eq("run_id", body.run_id)
      .eq("status", "pending");

    if (stagesError) {
      throw stagesError;
    }

    // Log cancellation
    await supabase.from("run_logs").insert({
      run_id: body.run_id,
      level: "warn",
      message: "Run cancelled by user",
    });

    return new Response(
      JSON.stringify({
        run_id: body.run_id,
        status: "failed",
        message: "Run cancelled successfully",
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
