# BLACK BUILDER — Frontend Handoff for Claude Code

This document is the bridge between the Lovable-built frontend demo and the backend/agent system you will build in Claude Code.

## 1. What exists now

A runnable TanStack Start + React 19 + Tailwind 4 frontend demo at `src/routes/index.tsx`. It renders:

- A three-panel workspace:
  1. **Chat / Edit** — conversation history + prompt input.
  2. **Swarm Activity** — scrollable list of agents with expandable logs.
  3. **Preview** — a fake "KibbleCheck" web app preview with desktop/mobile/inspect toggles.
- Live SVG connector wires from each agent card to the preview element it is currently modifying.
- Color coordination: every agent has a unique color used for borders, icons, wires, and the preview target element.
- Mobile tab navigation; wires only render on `lg+`.

All state is local and mocked. The job of the backend is to replace this mocked state with real persisted runs.

## 2. Tech stack

- **Framework:** TanStack Start v1 (full-stack React, file-based routing)
- **Build tool:** Vite 7
- **Runtime target:** Edge / Cloudflare Workers
- **React:** 19
- **Styling:** Tailwind CSS v4 via `src/styles.css`
- **UI primitives:** shadcn/ui components in `src/components/ui/`
- **AI/chat primitives:** custom components in `src/components/ai-elements/`
- **Icons:** lucide-react
- **Backend (to be added by you):** user's own Supabase (Postgres + Auth + Storage) or any self-hosted Postgres

## 3. Frontend file map

```text
src/
  routes/
    __root.tsx           # root layout, fonts, global providers
    index.tsx            # main BLACK BUILDER workspace demo (huge single file)
  components/
    ai-elements/         # chat UI building blocks
      conversation.tsx
      message.tsx
      prompt-input.tsx
      shimmer.tsx
    ui/                  # shadcn/ui primitives
      button.tsx
      (others as installed)
  lib/
    agents.ts            # canonical agent definitions, colors, and roles
    utils.ts             # cn() helper
  styles.css             # design tokens + agent color tokens
  assets/
    black-builder-logo.jpg.asset.json  # brand mark asset pointer
```

## 4. Agent definitions (`src/lib/agents.ts`)

The single source of truth for the seven agents:

| ID | Name | Role | Color token | Demo status |
|---|---|---|---|---|
| `planner` | PLANNER | cowork-style brain agent with high-reasoning model | `--agent-planner` | done |
| `scavenger` | SCAVENGER | coder; finds repos that contain the functions needed | `--agent-scavenger` | done |
| `builder` | BUILDER | coder; strips found repos down to needed components | `--agent-builder` | done |
| `stitcher` | STITCHER | coder; assembles one repo from extracted components | `--agent-stitcher` | done |
| `fixer` | FIXER | coder; audits, fixes, tests, repairs the stitched repo | `--agent-fixer` | active |
| `publisher` | PUBLISHER | coder; commits, pushes, opens PR, deploys web preview | `--agent-publisher` | queued |
| `app-wrapper` | APP WRAPPER | coder; packages the published web app into a mobile app | `--agent-app-wrapper` | queued |

Each agent object includes:

```ts
export type Agent = {
  id: string;
  name: string;        // display name
  role: string;        // human-readable responsibility
  icon: AgentIcon;     // lucide-react icon component
  status: AgentStatus; // "done" | "active" | "queued"
  task: string;        // one-line current task
  file: string;        // file/folder the agent is working on
  source: string;      // source/repo context string
  logs: string[];      // expandable terminal-style log lines
  color: string;       // Tailwind text class, e.g. "text-agent-builder"
  border: string;      // Tailwind border class, e.g. "border-agent-builder"
  ring: string;        // Tailwind ring class, e.g. "ring-agent-builder"
};
```

The Tailwind classes are auto-generated from CSS custom properties registered in `src/styles.css`:

```css
--agent-planner: oklch(0.78 0.13 79);
--agent-scavenger: oklch(0.72 0.14 202);
--agent-builder: oklch(0.72 0.17 148);
--agent-stitcher: oklch(0.72 0.16 310);
--agent-fixer: oklch(0.74 0.18 35);
--agent-publisher: oklch(0.72 0.16 255);
--agent-app-wrapper: oklch(0.72 0.18 340);
```

If you add an eighth agent, register a new `--agent-*` variable in `src/styles.css`, add it to `@theme inline` as `--color-agent-*`, and append a new object to `agents`.

## 5. Design tokens

Key custom tokens beyond the standard shadcn palette:

```css
--success: oklch(0.72 0.16 153);
--warning: oklch(0.82 0.16 83);
--danger: oklch(0.66 0.2 28);
--panel: oklch(0.13 0.008 75);
```

- Fonts: `DM Sans` (sans), `IBM Plex Mono` (mono)
- Primary brand color: gold (`--primary`)
- Background: near-black (`--background: oklch(0.11 0.008 75)`)
- Preview card uses inverted colors (`bg-foreground text-background`)

## 6. Demo state shape → real data shape

### Current local state (`src/routes/index.tsx`)

```ts
const [messages, setMessages] = useState<Message[]>(initialMessages);
const [selectedAgent, setSelectedAgent] = useState(4); // index into agents[]
const [view, setView] = useState<"desktop" | "mobile">("desktop");
const [inspect, setInspect] = useState(false);
const [building, setBuilding] = useState(false);
const [mobilePanel, setMobilePanel] = useState<"chat" | "agents" | "preview">("preview");
```

### Recommended real data model

```ts
// profiles — extends Supabase Auth users
profile {
  id: uuid (auth.users.id)
  display_name: text
  avatar_url: text
  created_at: timestamp
}

// projects — one per app being built
project {
  id: uuid
  user_id: uuid -> profiles.id
  name: text
  description: text
  target_repo_url: text        // repo being completed / built
  status: text                  // active | archived
  created_at: timestamp
  updated_at: timestamp
}

// runs — one swarm execution per project
run {
  id: uuid
  project_id: uuid -> project.id
  prompt: text                  // user prompt that started the run
  status: text                  // queued | running | success | failed
  started_at: timestamp
  finished_at: timestamp
  web_preview_url: text
  mobile_package_url: text
}

// run_agents — per-agent state within a run
run_agent {
  id: uuid
  run_id: uuid -> run.id
  agent_id: text                // planner | scavenger | builder | stitcher | fixer | publisher | app-wrapper
  status: text                  // queued | running | done | failed
  task: text
  file: text
  source: text
  logs: text[]                  // Postgres array of text, or JSONB
  started_at: timestamp
  finished_at: timestamp
}

// outputs — artifacts produced by agents (optional normalized table)
output {
  id: uuid
  run_id: uuid -> run.id
  agent_id: text
  type: text                    // file | log | preview | pr
  name: text
  content: text                // code, log text, or URL
  url: text
  created_at: timestamp
}
```

### State mapping

| Local state | Real source |
|---|---|
| `messages` | Query `run.prompt` + assistant replies; append via chat mutation. |
| `agents` | Query `run_agent` rows for the current `run_id`. Map `agent_id` to `agents.ts` for colors/icons. |
| `selectedAgent` | Client-only UI state; default to the first `running` agent or `fixer`. |
| `view` / `inspect` / `mobilePanel` | Pure client UI state. |
| `building` | Derived from `run.status === "running"` or any `run_agent.status === "running"`. |

## 7. Recommended server functions / API shape

Using TanStack Start `createServerFn` (not Supabase Edge Functions):

```ts
// src/lib/projects.functions.ts
export const listProjects = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => { /* return projects for context.userId */ });

export const createProject = createServerFn({ method: "POST" })
  .inputValidator(z.object({ name: z.string(), targetRepoUrl: z.string().url() }))
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => { /* insert project */ });

// src/lib/runs.functions.ts
export const startRun = createServerFn({ method: "POST" })
  .inputValidator(z.object({ projectId: z.string().uuid(), prompt: z.string() }))
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => { /* enqueue run, return runId */ });

export const getRun = createServerFn({ method: "GET" })
  .inputValidator(z.object({ runId: z.string().uuid() }))
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => { /* return run + run_agents */ });
```

For real-time status, either:
- Poll `getRun` on an interval from the component.
- Use Supabase Realtime to broadcast `run_agent` updates.

## 8. The build pipeline to implement

```text
PLANNER
  ↓ defines task + needed functions
SCAVENGER
  ↓ searches GitHub for repos containing those functions
BUILDER
  ↓ clones each repo, strips to needed components
STITCHER
  ↓ merges all components into one coherent app repo
FIXER
  ↓ audits, fixes, tests, repairs the single repo
PUBLISHER
  ↓ commits, pushes branch, opens PR, deploys web preview
APP WRAPPER
  ↓ packages the web app as a mobile app (Capacitor / React Native / Flutter)
```

Important distinction:
- **Agent brain repos** — the code/prompts/tools that make each agent smart. One per agent.
- **Build repos** — the repositories the agents operate on during a run. SCAVENGER finds them, BUILDER extracts from them, STITCHER merges into one, FIXER/PUBLISHER/APP WRAPPER finalize it.

## 9. UI requirements for the real app

- The chat panel must accept prompts and route them to the active run.
- The agent panel must reflect live `run_agent` status and logs.
- The preview panel must render the actual web preview URL (iframe) once PUBLISHER produces one.
- For mobile, APP WRAPPER produces a separate mobile preview / download link.
- Connector wires should map `selectedAgent` to the preview element associated with that agent's current output.

## 10. Open decisions

Resolve these with the user before deep implementation:

1. ~~Which high-reasoning model powers PLANNER?~~ **Decided:** Claude Fable 5.1 (`claude-fable-5-1`) at `effort: max`, routed via `llm-proxy`'s `planner` role. Opus 5.5 was the original pick, but the "Fable requires separate credit billing" concern that ruled it out turned out to be based on claude.ai's consumer-plan gating, not API billing — on the API, Fable 5.1 is just a model at its own per-token rate ($10/$50 vs Opus 5.5's $4/$20), gated only by a 30-day data-retention requirement this account already meets by default. Given confirmed cost headroom (see `roadmap.md`) and Fable 5.1's benchmark lead, switched PLANNER, FIXER, PUBLISHER, and APP WRAPPER to it.
2. ~~Which coding-agent engine runs the six coder agents?~~ **Decided:** Claude Agent SDK / Claude Code, one throwaway sandbox (E2B or Daytona) per job. See `roadmap.md` for rationale — decided on desk research rather than a formal spike against OpenHands, since standing up OpenHands' own backend just to confirm the research would have cost real infrastructure for no material benefit to the decision.
3. ~~Mobile target for APP WRAPPER~~ **Decided:** Capacitor, wrapping the exact web app PUBLISHER ships (see `docs/agent-contracts.md`). Signing-credential storage/provisioning is a separate, still-open question — Capacitor answers *how* the app is packaged, not *where* keystores/certificates live.
4. ~~Hosting/preview target for web and mobile outputs (Vercel, Netlify, self-hosted, app stores)~~ **Decided:** Vercel, for PUBLISHER's per-run wildcard-subdomain web previews. Cost is a wash (both have usable free tiers), but Vercel's wildcard-subdomain/multi-tenant routing is the more mature, better-documented path for this app's exact need — one auto-provisioned URL per generated app, repeatedly, at build time. Netlify shipped an equivalent capability more recently and it's less proven for this pattern. The exact provisioning mechanism (API calls, DNS/cert automation) is still open — see `docs/agent-contracts.md`.
5. Auth providers beyond email + Google
6. ~~GitHub integration: fine-grained token scopes, repo cloning, PR creation~~ **Decided:** a GitHub App (not an OAuth App or personal access token), scoped to Contents (Read & Write), Pull Requests (Read & Write), and organization-level Administration (Write, needed for SCAVENGER/BUILDER/PUBLISHER to create repos). Metadata (Read) is auto-included and covers SCAVENGER's public code search. Note for SCAVENGER's search-budget design: GitHub's Code Search API is hard-capped at 10 requests/minute regardless of auth method.
7. ~~Should any coder agents run at a higher model/effort tier than the rest?~~ **Decided:** yes — FIXER and APP WRAPPER route through a new `coder_high` `llm-proxy` role (defaults to `openai:gpt-6-astra`, already deployed) instead of the standard `coder` role. Both are terminal correctness gates with no downstream re-check, so they warrant a stronger model than SCAVENGER/BUILDER/STITCHER/PUBLISHER. See `docs/agent-contracts.md`.
8. ~~Should private/self-hosted buyers get any control over which model runs each agent?~~ **Decided:** yes — `llm-proxy` now has one `LLM_ROLE_*` role per agent (7 total, not 5 shared tiers) plus a matching `LLM_ROLE_*_EFFORT` env var per role, so any single agent's model and effort can be retuned independently with no code change. Hosted/consumer use never exposes this — those users get the defaults in `docs/agent-contracts.md`. Reasoning: a private buyer paying a one-time premium price should get real control, not just the shared default.

## 11. Build & verify

```bash
# install
bun install

# typecheck
bunx tsc --noEmit

# dev server (already running in the Lovable sandbox on port 8080)
bun run dev
```

The demo is intentionally self-contained. You can run it without any backend to understand the intended UX, then gradually replace local state with real data.
