-- BLACK BUILDER initial schema
-- Apply this migration to your own Supabase project before connecting the app.

-- Enums

CREATE TYPE public.run_status AS ENUM (
  'pending',
  'running',
  'passed',
  'failed',
  'escalated'
);

CREATE TYPE public.agent_type AS ENUM (
  'planner',
  'scavenger',
  'builder',
  'stitcher',
  'fixer',
  'publisher',
  'wrapper'
);

-- Profiles (extends Supabase Auth users)

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text,
  avatar_url text,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their own profile"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Users can insert their own profile"
  ON public.profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update their own profile"
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Projects (one per app being built)

CREATE TABLE public.projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  target_repo_url text,
  status text DEFAULT 'active' NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.projects TO authenticated;
GRANT ALL ON public.projects TO service_role;

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own projects"
  ON public.projects
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Runs (one swarm execution per project)

CREATE TABLE public.runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  prompt text NOT NULL,
  status public.run_status DEFAULT 'pending' NOT NULL,
  current_stage public.agent_type,
  web_url text,
  aab_path text,
  cost_usd numeric(12,4),
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.runs TO authenticated;
GRANT ALL ON public.runs TO service_role;

ALTER TABLE public.runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own runs"
  ON public.runs
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Run stages (per-agent state within a run)

CREATE TABLE public.run_stages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.runs(id) ON DELETE CASCADE,
  agent public.agent_type NOT NULL,
  status public.run_status DEFAULT 'pending' NOT NULL,
  attempt integer DEFAULT 0 NOT NULL,
  branch text,
  summary text,
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE (run_id, agent)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.run_stages TO authenticated;
GRANT ALL ON public.run_stages TO service_role;

ALTER TABLE public.run_stages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage run stages for their own runs"
  ON public.run_stages
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.runs WHERE public.runs.id = run_stages.run_id AND public.runs.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.runs WHERE public.runs.id = run_stages.run_id AND public.runs.user_id = auth.uid()
    )
  );

-- Run logs (agent log lines)

CREATE TABLE public.run_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.runs(id) ON DELETE CASCADE,
  stage_id uuid REFERENCES public.run_stages(id) ON DELETE CASCADE,
  ts timestamptz DEFAULT now() NOT NULL,
  level text DEFAULT 'info' NOT NULL,
  message text NOT NULL
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.run_logs TO authenticated;
GRANT ALL ON public.run_logs TO service_role;

ALTER TABLE public.run_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage run logs for their own runs"
  ON public.run_logs
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.runs WHERE public.runs.id = run_logs.run_id AND public.runs.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.runs WHERE public.runs.id = run_logs.run_id AND public.runs.user_id = auth.uid()
    )
  );

-- Outputs (artifacts produced by agents)

CREATE TABLE public.outputs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.runs(id) ON DELETE CASCADE,
  agent public.agent_type,
  type text NOT NULL,
  name text NOT NULL,
  content text,
  url text,
  created_at timestamptz DEFAULT now() NOT NULL
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.outputs TO authenticated;
GRANT ALL ON public.outputs TO service_role;

ALTER TABLE public.outputs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage outputs for their own runs"
  ON public.outputs
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.runs WHERE public.runs.id = outputs.run_id AND public.runs.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.runs WHERE public.runs.id = outputs.run_id AND public.runs.user_id = auth.uid()
    )
  );

-- Updated-at helper function and triggers

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER projects_updated_at
  BEFORE UPDATE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER runs_updated_at
  BEFORE UPDATE ON public.runs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER run_stages_updated_at
  BEFORE UPDATE ON public.run_stages
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
