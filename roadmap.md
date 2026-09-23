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
- Added `/privacy` and `/terms` pages with SEO meta and login-page footer links.
- Decided coding-agent engine for the six coder agents: Claude Agent SDK / Claude Code, run per-job in a throwaway sandbox (E2B or Daytona). Decided on desk research (setup cost, ops burden, fit for seven distinct agent roles) rather than a formal head-to-head spike against OpenHands — running that spike would have required standing up OpenHands' own backend/Docker-sandboxed control-plane just to confirm what the research already pointed to, which wasn't worth the infrastructure cost for this decision. `spike/stitcher-task/` remains available if OpenHands (or another engine) is worth re-evaluating later against real production data.
- Decided hosting/preview target for web outputs: Vercel. Both Vercel and Netlify are cost-equivalent here (free tier covers this), so the deciding factor was fit — Vercel's wildcard-subdomain/multi-tenant routing is more mature for this app's exact need (one auto-provisioned preview URL per generated app, on every run). Netlify's equivalent is newer and less proven for this pattern. Exact provisioning mechanism (API/DNS/cert automation) is still open — see `docs/agent-contracts.md`.
- Deployed `black-buillder` itself to Vercel (Production) via GitHub import, `NITRO_PRESET=vercel` env var overriding the Lovable config's Cloudflare default without touching the Lovable-managed `vite.config.ts`.
- Decided PLANNER's model: Claude Opus 5.5 (`claude-opus-5-5`) at `effort: max`. Fable 5.1 was ruled out over its separate credit billing.
- Decided mobile target for APP WRAPPER: Capacitor, wrapping PUBLISHER's exact shipped web app. Signing-credential storage/provisioning remains a separate open question.
- Decided GitHub access model: a GitHub App (not OAuth App/PAT) with Contents R&W, Pull Requests R&W, org-level Administration (Write, for repo creation), and auto-included Metadata (Read). Code Search API is capped at 10 req/min regardless of auth — a constraint for SCAVENGER's search-retry budget.
- Decided per-agent model tiering: added a `coder_high` role to `llm-proxy` (defaults to `openai:gpt-6-astra`, deployed) for FIXER and APP WRAPPER specifically — they're the pipeline's two terminal correctness gates with no downstream re-check, so they get a stronger model than the other four coder-role agents (SCAVENGER stays `low_cost`; BUILDER/STITCHER/PUBLISHER stay `coder`).

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
- Auth providers beyond email + Google.
- Signing-credential storage/provisioning for APP WRAPPER's Capacitor builds.
- Vercel wildcard-subdomain provisioning mechanism for PUBLISHER's per-run web previews.
