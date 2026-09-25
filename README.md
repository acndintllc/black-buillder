# Black Builder

Give it a prompt. It hands the prompt to a seven-agent swarm that specs the app, finds and adapts real open-source components for it, assembles and repairs them into one working project, opens a PR, deploys a live web preview, and packages a signed Android app — with no human step in between unless something genuinely needs a human decision.

**Live app:** https://blackappcompleter.lovable.app

## The pipeline

Seven agents, each a Supabase Edge Function, run in sequence per `run`:

| # | Agent | Job |
|---|-------|-----|
| 1 | **PLANNER** | Turns the raw prompt into a locked spec — a list of `function_key`s, each with a description and an acceptance signal. |
| 2 | **SCAVENGER** | Searches GitHub for existing code that satisfies each `function_key`, checks license compatibility, pins a commit SHA. |
| 3 | **BUILDER** | Extracts/writes each function's code into a fresh output repo under `functions/<function_key>/`. |
| 4 | **STITCHER** | Merges the independent functions into one coherent, installable project (root `package.json`, entry point). |
| 5 | **FIXER** | The correctness gate: installs, builds, scans for stubs, authors and runs smoke tests, fixing failures in a bounded loop. |
| 6 | **PUBLISHER** | Opens a PR against the output repo and deploys a live web preview (direct Vercel Deployment API upload, no drift). |
| 7 | **APP WRAPPER** | Wraps the live deployed URL in a thin native Android shell (Capacitor) and produces a signed AAB. |

Every stage shares one contract (inputs, outputs, success criteria, failure vs. escalation) — the full spec for each is in [`docs/agent-contracts.md`](docs/agent-contracts.md), which is the source of truth for what "done" means per agent. A stage reports `failed` (retryable) or `escalated` (needs a human/PLANNER decision) rather than ever silently shipping something broken.

**Status: all seven agents have real, deployed code.** A live end-to-end run still needs a few secrets provisioned — see [Setup](#setup) below.

## Architecture

- **Frontend:** TanStack Start + React 19 + Tailwind 4, built and kept in sync via [Lovable](https://lovable.dev) — three-panel workspace (chat, live agent/swarm activity, preview).
- **Backend:** Supabase — Postgres (`runs`, `run_stages`, `run_logs`, `artifacts`, `sources`) + Storage (build artifacts, reports, signed AABs) + Edge Functions (the seven agents, plus `start-run`/`runner-callback`/`cancel-run`/`llm-proxy`).
- **Coding-agent runtime:** a bare [E2B](https://e2b.dev) sandbox per job, driven directly (not E2B's turnkey Claude Code template) so every LLM call goes through `llm-proxy` and stays under `runs.budget_usd`/`runs.cost_usd` enforcement.
- **Model routing:** `llm-proxy` gives each agent its own independently-tunable model + effort (`LLM_ROLE_*` / `LLM_ROLE_*_EFFORT`) — PLANNER/FIXER/PUBLISHER/APP WRAPPER on `claude-fable-5-1`, SCAVENGER on `qwen3.5-flash`, BUILDER/STITCHER on `qwen3.8-max`.
- **Deploy target:** Vercel (direct Deployment API, one Project per run).
- **Mobile target:** Capacitor, Play App Signing (upload-keystore only — Google holds the real distribution key).

## Docs map

**For engineers:**
- [`docs/agent-contracts.md`](docs/agent-contracts.md) — the contract for each agent: inputs, outputs, success/failure criteria, and current implementation status. Read this first if you're changing what an agent does.
- [`HANDOFF.md`](HANDOFF.md) — the frontend↔backend bridge doc: what the Lovable-built demo provides, the locked architecture decisions, and their rationale.
- [`roadmap.md`](roadmap.md) — the full build log: what's done, in progress, and blocked, in the order it happened.

**For users and everyone else:**
- [`docs/USER_GUIDE.md`](docs/USER_GUIDE.md) — how to use BLACK BUILDER, in plain language, with what each agent does and what "escalated" means for you.
- [`docs/MISSION.md`](docs/MISSION.md) — why this exists.
- [`docs/PLATFORM_PROMISE.md`](docs/PLATFORM_PROMISE.md) — what the platform commits to, and where that's enforced in code, not just stated.
- Site footer links: [Privacy Policy](/privacy), [Terms of Service](/terms), [Disclaimers](/disclaimers), [Participation Guidelines](/guidelines).

## Setup

The frontend is a normal Vite app:

```sh
git clone <this-repository-url>
cd black-buillder
npm i
npm run dev
```

The backend lives in `supabase/functions/` and deploys as Supabase Edge Functions. To exercise a real end-to-end run, these Supabase project secrets need to be set:

| Secret | Used by | Status |
|---|---|---|
| `GITHUB_TOKEN` | SCAVENGER (read-only repo search) | required |
| `GITHUB_WRITE_TOKEN` | BUILDER/STITCHER/FIXER/PUBLISHER (repo create/push/PR) | required |
| `E2B_API_KEY` | BUILDER/STITCHER/FIXER/APP WRAPPER (sandboxes) | required |
| `VERCEL_API_TOKEN` | PUBLISHER (web deploy) | required |
| `VERCEL_TEAM_ID`, `VERCEL_WILDCARD_DOMAIN` | PUBLISHER (team scoping, branded preview URLs) | optional |
| `ANDROID_UPLOAD_KEYSTORE_B64`, `ANDROID_UPLOAD_KEYSTORE_PASSWORD`, `ANDROID_UPLOAD_KEY_ALIAS`, `ANDROID_UPLOAD_KEY_PASSWORD` | APP WRAPPER (Play App Signing) | required |

APP WRAPPER also needs its custom E2B sandbox template (Android SDK/JDK/Node — source in `supabase/functions/wrapper/sandbox-template/`) built and pushed to E2B's registry via `e2b template build`. See `roadmap.md`'s Open blockers for exact current status of each.

## Build with Lovable

Continue developing the frontend in the [Lovable editor](https://lovable.dev/projects/a0963c8d-8c63-42ed-8fa4-52f41ab1379f) — changes made there sync straight to this repository, and pushes to `main` sync back into Lovable.
