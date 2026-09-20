# BLACK BUILDER — Real App Build Plan

## Goal
Move from the local demo to a full-stack Supabase app: accounts, projects, persisted runs, and a swappable AI swarm engine.

## Phase 1: Foundation
1. Verify clean build after the TypeScript fix.
2. Confirm backend location. Lovable Cloud is already enabled on this project and cannot be swapped for an external Supabase project. Choose: (A) create a new Lovable project with Cloud disabled and connect your Supabase, then rebuild; (B) keep this project and route app data to your own Supabase via secrets while Lovable Cloud handles auth/hosting.
3. Enable Supabase Auth (email/password + Google) or use your own Supabase auth if going with option A.
4. Create the database schema: profiles, projects, runs, run_agents, outputs. Every table gets RLS policies and GRANTs.
5. Add sign-up / sign-in pages and a protected app layout under `/_authenticated`.

## Phase 2: Projects & Dashboard
6. Build a projects list dashboard (`/_authenticated/projects`) with a create-new-project flow.
7. Build the project workspace that reuses the existing three-panel UI for a selected project.
8. Replace local demo state with server functions that read and write project/run data.

## Phase 3: Real Swarm Runs
9. Design a swappable `SwarmEngine` interface so the AI provider can be changed later.
10. Implement a first real runner using a Supabase-backed queue and an AI model, mapped to the six agents.
11. Persist run status, agent logs, and preview output per run.
12. Add a run button that starts a swarm run and updates status in real time.

## Phase 4: GitHub & Product Pages
13. Connect GitHub sync and/or the GitHub connector for repo discovery.
14. Fetch the brain open-source repo once you share the URL.
15. Add pricing, docs, and publish.

## Open questions
- Backend location: option A (new project + your own Supabase) or option B (dual-backend with this project)?
- Brain repo URL.
- Which AI engine to use for the first real runs (Lovable AI Gateway is the easiest, OpenAI/Gemini if you have a key).
