# BLACK BUILDER — Real App Build Plan

## Goal
Move from the local demo to a full-stack app: accounts, projects, persisted runs, and a swappable AI swarm engine.

## Phase 1: Foundation
1. Verify clean build after the TypeScript fix.
2. Enable Lovable Cloud auth (email/password + Google).
3. Create the database schema: profiles, projects, runs, run_agents, outputs. Every table gets RLS policies and GRANTs.
4. Add sign-up / sign-in pages and a protected app layout under `/_authenticated`.

## Phase 2: Projects & Dashboard
5. Build a projects list dashboard (`/_authenticated/projects`) with a create-new-project flow.
6. Build the project workspace that reuses the existing three-panel UI for a selected project.
7. Replace local demo state with server functions that read and write project/run data.

## Phase 3: Real Swarm Runs
8. Design a swappable `SwarmEngine` interface so the AI provider can be changed later.
9. Implement a first real runner using Lovable AI Gateway (no API key needed), mapped to the six agents.
10. Persist run status, agent logs, and preview output per run.
11. Add a run button that starts a swarm run and updates status in real time.

## Phase 4: GitHub & Product Pages
12. Connect GitHub sync and/or the GitHub connector for repo discovery.
13. Fetch the brain open-source repo once you share the URL.
14. Add pricing, docs, and publish.

## Open questions before Phase 3
- Brain repo URL.
- Confirm using Lovable AI Gateway as the temporary AI engine, or do you have a specific API key to plug in now?
