# BLACK BUILDER — Frontend Complete / Backend Handoff Plan

## Current state
Frontend demo is done: three-panel workspace, six color-coordinated agents, live connector wires, dark gold theme, responsive. Built in TanStack Start + React 19 + Tailwind 4 + shadcn/ui. All state is local demo data.

## Decision 1: Backend path
Use **Option A**: create a fresh Lovable project with Lovable Cloud disabled, connect your own Supabase, and rebuild BLACK BUILDER there. This avoids the Lovable Cloud lock-in you flagged and keeps your data in your Supabase account.

## Decision 2: Agents are coders, not chat LLMs
BLACK BUILDER is an app-completion system. The six agents operate on a real repo to finish features, not just generate prose:

```text
PLANNER  → reads repo context + task brief, plans the implementation
SCAVENGER→ searches the repo for relevant files, patterns, dependencies
BUILDER  → writes new code and modifies existing files
STITCHER → integrates changes, wires imports/config, connects UI
FIXER    → runs tests/lint/typecheck and repairs failures
PUBLISHER→ commits, pushes branch, opens PR, triggers preview deploy
```

## Decision 3: Target repo is per-project
There is no single global "brain repo". Each BLACK BUILDER project points at a GitHub repo to complete. The repo URL is supplied when creating a project.

## Decision 4: First coding-agent engine
Choose one of these in Claude Code:

1. **Claude Code CLI (headless)** — drive the same Claude Code agent from the backend to edit files, run commands, and make commits.
2. **OpenHands** — open-source coding-agent framework with sandboxed execution and GitHub integration.
3. **Custom runner** — code-specific model (Claude 4 Sonnet, o3, Gemini 2.5 Pro) + file-system sandbox + shell execution.

## Suggested Supabase schema
Tables: `profiles`, `projects`, `runs`, `run_agents`, `outputs`. Every table gets RLS policies and GRANTs. `projects.target_repo_url` stores the repo to complete.

## Handoff package for Claude Code
1. Frontend component inventory and props.
2. Design tokens / agent color map.
3. Demo state shape → real data shape mapping.
4. Suggested `createServerFn` routes and public API endpoints.
5. This architecture decision record.

## Next steps for Claude Code
1. Create the new Lovable project, disable Cloud, connect the user's Supabase.
2. Port or recreate the frontend and add Supabase Auth (email + Google).
3. Build project/run persistence and protected routes.
4. Implement the chosen coding-agent engine.
5. Wire the workspace to real runs with live status updates.

## Open decisions for the user / Claude Code
- Which coding-agent engine? (Claude Code CLI / OpenHands / custom)
- Hosting/preview target for completed apps. (Vercel / Netlify / other)
- Auth providers beyond email + Google.
