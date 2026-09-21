# BLACK BUILDER — Frontend Complete / Backend Handoff Plan

## Current state
Frontend demo is done: three-panel workspace, six color-coordinated agents, live connector wires, dark gold theme, responsive. Built in TanStack Start + React 19 + Tailwind 4 + shadcn/ui. All state is local demo data.

## Decision 1: No backend build in this project
Do nothing further on the backend here. Hand the full backend build off to Claude Code.

## Decision 2: Seven-agent architecture
Keep seven agents. APP WRAPPER is a dedicated packaging step, not folded into the original six, because turning a web app into a store-ready mobile app requires different tooling and constraints than writing the app itself.

1. PLANNER — cowork-style brain agent; uses a high-reasoning model and its own brain repo.
2. SCAVENGER — coder; finds existing repos that contain the functions/components needed.
3. BUILDER — coder; strips those repos down to only the components the app needs.
4. STITCHER — coder; assembles one coherent repo from the extracted components.
5. FIXER — coder; audits, fixes, tests, and repairs the single stitched repo until it passes.
6. PUBLISHER — coder; commits, pushes, opens PR, and deploys the web app preview.
7. APP WRAPPER — coder; packages the published web app into a mobile app. Skipped if the project is already written in a mobile-native/play-store-ready language from the start.

## Decision 3: Agent brain repos vs. the build pipeline
There are two kinds of repos:

- **Agent brain repos** — one per agent/function. These hold the agent's own implementation, prompts, tools, and knowledge. PLANNER's brain repo uses a high-reasoning model; the coder agents use coding models/tools.
- **Build repos** — the source repos SCAVENGER discovers, the component copies BUILDER creates, the single repo STITCHER assembles, and the final repo FIXER/PUBLISHER/App Wrapper operate on.

Full build pipeline:

```text
PLANNER    → defines the task and what functions/components are needed
SCAVENGER  → searches GitHub for repos that contain those functions
BUILDER    → clones each found repo and strips it down to the needed components
STITCHER   → merges all extracted components into one coherent app repo
FIXER      → audits, fixes, tests, and repairs the stitched repo
PUBLISHER  → commits, pushes branch, opens PR, deploys web preview
APP WRAPPER→ packages the web app as a mobile app
```

## Frontend handoff to Claude Code
1. Component inventory and props.
2. Design tokens / agent color map (now including APP WRAPPER).
3. Demo state shape → real data shape mapping.
4. Suggested server functions and public API endpoints shaped around the scavenger→builder→stitcher pipeline.
5. This architecture decision record.

## Next steps for Claude Code
1. Scaffold the backend project (user's own Supabase or self-hosted).
2. Port or recreate the frontend with seven agents.
3. Implement each agent's brain repo with the right model/tooling.
4. Implement the scavenger→builder→stitcher→fixer→publisher→wrapper pipeline.
5. Wire the workspace to real runs with live status updates.

## Open decisions for the user / Claude Code
- Which high-reasoning model for PLANNER?
- Which coding-agent engine for the six coders? (Claude Code CLI / OpenHands / custom)
- Mobile target for APP WRAPPER (React Native, Flutter, native iOS/Android, PWA wrapper)?
- Hosting/preview target for web and mobile outputs.
- Auth providers beyond email + Google.
