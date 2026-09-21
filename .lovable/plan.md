# BLACK BUILDER — Frontend Complete / Backend Handoff Plan

## Current state
Frontend demo is done: three-panel workspace, six color-coordinated agents, live connector wires, dark gold theme, responsive. Built in TanStack Start + React 19 + Tailwind 4 + shadcn/ui. All state is local demo data.

## Decision 1: No backend build in this project
Do nothing further on the backend here. Hand the full backend build off to Claude Code.

## Decision 2: Seven-agent architecture
Keep seven agents. APP WRAPPER is a dedicated packaging step, not folded into the original six, because turning a web app into a store-ready mobile app requires different tooling and constraints than writing the app itself.

1. PLANNER — cowork-style brain agent; uses a high-reasoning model and its own brain/repo context.
2. SCAVENGER — coder
3. BUILDER — coder
4. STITCHER — coder
5. FIXER — coder
6. PUBLISHER — coder
7. APP WRAPPER — coder; runs after PUBLISHER to package the output as a mobile app. Skipped if the project is already written in a mobile-native/play-store-ready language from the start.

## Decision 3: Repo per function
Each agent/function maintains its own repo, not one repo per project. The PLANNER's repo is the brain/context repo; the coder agents each have their own function-specific repo.

## Frontend handoff to Claude Code
1. Component inventory and props.
2. Design tokens / agent color map (now including APP WRAPPER).
3. Demo state shape → real data shape mapping.
4. Suggested server functions and public API endpoints shaped around repo-per-function.
5. This architecture decision record.

## Next steps for Claude Code
1. Scaffold the backend project (user's own Supabase or self-hosted).
2. Port or recreate the frontend with seven agents.
3. Implement the PLANNER brain agent with its own repo and a high-reasoning model.
4. Implement coder agents (SCAVENGER, BUILDER, STITCHER, FIXER, PUBLISHER, APP WRAPPER) each with their own repos.
5. Wire the workspace to real runs with live status updates.

## Open decisions for the user / Claude Code
- Which high-reasoning model for PLANNER?
- Which coding-agent engine for the six coders? (Claude Code CLI / OpenHands / custom)
- Mobile target for APP WRAPPER (React Native, Flutter, native iOS/Android, PWA wrapper)?
- Hosting/preview target for web and mobile outputs.
- Auth providers beyond email + Google.
