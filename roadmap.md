# BLACK BUILDER Roadmap

## Done
- Three-panel demo UI with chat, agents, preview.
- Color-coordinated agents and live connector wires.
- TypeScript build-error fix.
- Lovable Cloud (Supabase) backend enabled.
- Decided on 7-agent architecture: PLANNER = cowork-style brain agent with high-reasoning model; SCAVENGER/BUILDER/STITCHER/FIXER/PUBLISHER/APP-WRAPPER = coders.
- Decided repo-per-function architecture (each agent/function owns its own repo).
- Confirmed APP-WRAPPER stays as a distinct agent rather than folding mobile output into the original six.
- Clarified build pipeline: SCAVENGER finds repos → BUILDER strips components → STITCHER assembles one repo → FIXER repairs → PUBLISHER deploys → APP-WRAPPER packages mobile.
- Prepared `HANDOFF.md` and centralized agent definitions in `src/lib/agents.ts`.

## In progress
- Frontend handoff complete; backend build is intentionally outside this Lovable project and will be continued in Claude Code.

## Up next (Claude Code)
- Create a new project with user's own Supabase (Lovable Cloud disabled) or self-hosted backend.
- Port or recreate the frontend with seven agents.
- Implement each agent's brain repo with the right model/tooling.
- Implement the scavenger→builder→stitcher→fixer→publisher→app-wrapper pipeline.
- Wire the workspace to real persisted runs.
- Add pricing/docs and publish.

## Open blockers
- Which high-reasoning model for PLANNER?
- Which coding-agent engine for the six coder agents? (Claude Code CLI / OpenHands / custom)
- Mobile target for APP-WRAPPER (Capacitor / React Native / Flutter / native iOS/Android / PWA)?
- Hosting/preview target for web and mobile outputs.
- Auth providers beyond email + Google.
- GitHub token scopes and repo access model.
