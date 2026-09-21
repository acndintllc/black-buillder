# BLACK BUILDER — Frontend Complete / Backend Handoff Plan

## Current state
Frontend demo is done: three-panel workspace, six color-coordinated agents, live connector wires, dark gold theme, responsive. Built in TanStack Start + React 19 + Tailwind 4 + shadcn/ui. All state is local demo data.

## Decision 1: No backend build in this project
Do nothing further on the backend here. Hand the full backend build off to Claude Code.

## Decision 2: Seven-agent architecture
Keep seven agents. APP WRAPPER is a dedicated packaging step, not folded into the original six, because turning a web app into a store-ready mobile app requires different tooling and constraints than writing the app itself.

1. PLANNER — cowork-style brain agent; uses a high-reasoning model and its own brain repo.
2. SCAVENGER — coder
3. BUILDER — coder
4. STITCHER — coder
5. FIXER — coder
6. PUBLISHER — coder
7. APP WRAPPER — coder; runs after PUBLISHER to package the output as a mobile app. Skipped if the project is already written in a mobile-native/play-store-ready language from the start.

## Decision 3: Agent brain repos vs. the target app repo
There are two kinds of repos:

- **Agent brain repos** — one per agent/function. These hold the agent's own implementation, prompts, tools, and knowledge. PLANNER's brain repo uses a high-reasoning model; the coder agents use coding models/tools.
- **Target app repo** — the single repo the agents collaborate on to build or complete an app.

Workflow on the target app repo:
- SCAVENGER and BUILDER work independently (branches or isolated copies) within the target repo.
- STITCHER merges their work into one coherent repo.
- FIXER runs tests/lint/typecheck on that single repo and repairs it.
- PUBLISHER commits, pushes branch, opens PR, and deploys a preview for that repo.
- APP WRAPPER packages the repo into a mobile app.

## Frontend handoff to Claude Code
1. Component inventory and props.
2. Design tokens / agent color map (now including APP WRAPPER).
3. Demo state shape → real data shape mapping.
4. Suggested server functions and public API endpoints shaped around repo-per-function brain repos and a single target app repo per project.
5. This architecture decision record.

## Next steps for Claude Code
1. Scaffold the backend project (user's own Supabase or self-hosted).
2. Port or recreate the frontend with seven agents.
3. Implement each agent's brain repo with the right model/tooling.
4. Implement the target-app-repo workflow: parallel SCAVENGER/BUILDER work, STITCHER merge, FIXER repair, PUBLISHER deploy, APP WRAPPER package.
5. Wire the workspace to real runs with live status updates.

## Open decisions for the user / Claude Code
- Which high-reasoning model for PLANNER?
- Which coding-agent engine for the six coders? (Claude Code CLI / OpenHands / custom)
- Mobile target for APP WRAPPER (React Native, Flutter, native iOS/Android, PWA wrapper)?
- Hosting/preview target for web and mobile outputs.
- Auth providers beyond email + Google.
