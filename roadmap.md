# BLACK BUILDER Roadmap

## Done
- Three-panel demo UI with chat, agents, preview.
- Color-coordinated agents and live connector wires.
- TypeScript build-error fix.
- Lovable Cloud (Supabase) backend enabled.

## In progress
- Decide backend location: Lovable Cloud cannot be swapped for an external Supabase project on this project. Options: (A) new project with Cloud disabled + own Supabase, rebuild app; (B) keep this project on Cloud but route app data to own Supabase via secrets.
- Design per-agent model/effort routing (e.g., planner/builder/fixer = extended reasoning, scavenger = fast/lite, stitcher/publisher = mid-tier).

## Up next
- Set up Supabase Auth (email/password + Google).
- Create database schema for profiles, projects, runs, outputs.
- Add protected routes and a projects dashboard.
- Wire the workspace to persisted project/run data.
- Build the first real swarm runner with swappable AI engine.
- Connect GitHub and fetch the brain repo.
- Add pricing/docs and publish.

## Open blockers
- Supabase backend choice: keep Lovable Cloud instance or connect own project.
- Brain open-source repo URL.
- Which AI engine to use for first real runs.
