# Agent Contracts — Black Builder Swarm

This document defines the **brain repo contract** for each of the seven agents in the Black Builder pipeline (PLANNER, SCAVENGER, BUILDER, STITCHER, FIXER, PUBLISHER, APP WRAPPER). It is harness-agnostic: it specifies what each agent must consume, produce, and be judged on against the shared Postgres schema (`runs`, `run_stages`, `run_logs`, `artifacts`, `sources`) — not the prompts or tools that implement it. The coding-agent engine is decided (Claude Agent SDK / Claude Code, one throwaway sandbox per job — see `roadmap.md`); this document stays engine-agnostic anyway since the contract itself (inputs/outputs/success criteria) shouldn't change if the engine ever does. Any future agent implementation must satisfy this contract to be considered done.

## Shared conventions (apply to all seven agents)

- **Start:** on invocation, an agent sets its own `run_stages` row (matched by `run_id` + `agent`) to `status="running"`, increments `attempt` (1 on first run, +1 per retry of that same stage), and sets `started_at`.
- **Logging:** all progress is written to `run_logs` with `stage_id` set to the agent's own `run_stages.id`, `run_id`, `level` (`info` for progress, `warn` for recoverable issues, `error` immediately before a `failed`/`escalated` transition), and `message`.
- **End:** on completion the agent sets `status` (`passed`/`failed`/`escalated`), `ended_at`, and a one-paragraph `summary` — the summary must be enough for a human or the next agent to understand what happened without reading full logs.
- **`branch`:** each stage records the git branch it worked on/produced in its own `run_stages.branch`, even where by convention it's the same run-scoped branch handed forward by the prior coder stage.
- **Escalation vs. failure:** `failed` = this stage tried and could not succeed on its own after exhausting its retry budget (a harness-level constant, not specified here); retrying re-runs the same stage. `escalated` = the stage has concluded the problem is outside what it can fix by retrying — it needs a human or a re-run of an earlier stage (most often PLANNER) with new input. `runs.status` has no `escalated` value; an escalated stage leaves `runs.status="running"` (paused) until a human resolves it — the UI must surface escalation from `run_stages.status`, not `runs.status`.
- **Run-level fields owned outside these contracts:** `runs.current_stage`, `runs.status`, and `runs.finished_at` are sequenced by the pipeline runner that invokes the seven stages in order, not written by the agents themselves. `runs.cost_usd` accrues automatically via `llm-proxy`'s `increment_run_cost` RPC whenever an agent calls the proxy with `run_id` set — agents never write it directly, but every proxy call must include `run_id` for budget enforcement (`runs.budget_usd`) to work. `runs.web_url` and `runs.aab_path` are each owned by exactly one agent (PUBLISHER and APP WRAPPER respectively) as noted below.
- **LLM routing role** (`llm-proxy`'s `role`: one per agent — `planner` | `scavenger` | `builder` | `stitcher` | `fixer` | `publisher` | `wrapper`) is listed per agent as a required input; it is routing/cost metadata, not a prompt or tool choice. Note: the role literal is `wrapper`, matching the database's `agent_type` enum (`run_stages.agent` uses `wrapper`, not `app_wrapper`) — kept consistent across the schema and `llm-proxy` on purpose. Each role has its own default model AND its own default `effort` in `llm-proxy` (both independently env-overridable per role, `LLM_ROLE_*` / `LLM_ROLE_*_EFFORT`) — a private/self-hosted deployment can retune any single agent without touching any other, or the code. Hosted/consumer use never exposes this; the defaults below are what those users get. Current defaults: `planner`, `fixer`, `publisher`, and `wrapper` all route to `claude-fable-5-1` — same per-token price as the prior GPT-6-Astra pick ($10/$50) but ahead of it on the Coding Agent Index (70 vs 67), and ahead of the prior `claude-opus-5-5` pick too, at 2.5x Opus 5.5's price. `planner`, `fixer`, and `publisher` additionally default to `effort: max` (Fable 5.1's own default is `high`). FIXER is the last stage that actually judges code correctness — nothing downstream re-checks it, so a missed bug ships silently, which is why it's bumped alongside PLANNER and PUBLISHER. `wrapper` (APP WRAPPER) stays at the `high` default: a miss there has mobile-only blast radius, not the whole app. `scavenger` defaults to the cheapest Qwen tier (search/matching, not heavy reasoning). `builder`/`stitcher` default to Qwen3.8-Max, checked directly against Opus 5.5 and competitive on SWE-bench Pro (real-repo resolution, the closer analog to their actual job).

---

## 1. PLANNER

**Inputs:** `runs.prompt` (raw user request); `runs.input_repo_url` if set (an existing repo the user wants completed/modified rather than built from scratch); its own `run_stages` row. LLM role: `planner`.

**Outputs:** an `artifacts` row, `kind="spec"`, whose `storage_path` holds the locked spec: an enumerated list of needed functions/components, each with a unique `function_key`, a description, and an acceptance signal, plus explicit out-of-scope notes. `summary` states the function count and one line per function.

**Success criteria:** spec artifact exists and parses; every function_key is unique; every explicit requirement in the prompt maps to at least one function_key (no dropped requirement); no function_key is invented beyond what the prompt supports.

**Failure/escalation:** `failed` — prompt yields no viable non-empty spec after the retry budget (empty/contradictory input); retry re-interprets the same prompt. `escalated` — the prompt requires a decision only a human can make (ambiguous scope, conflicting constraints, disallowed request) — stop and ask, per org doctrine; never guess.

**Handoff:** SCAVENGER needs only the spec artifact's `storage_path` and its function_key list to begin.

## 2. SCAVENGER

**Inputs:** PLANNER's spec artifact (function_keys + descriptions); `runs.input_repo_url` if present. LLM role: `scavenger`.

**Outputs:** at least one `sources` row per function_key, recording every candidate considered: `source_type` (`base`/`registry`/`npm`/`repo`/`scratch`), `ref`, `commit_sha` (required when `source_type="repo"`), `license_spdx`, `decision` (`accepted`/`rejected`), `reason`. If `runs.input_repo_url` is set, it is recorded as a `source_type="base"`, `decision="accepted"` row. When no suitable match exists, SCAVENGER records `source_type="scratch"`, `decision="accepted"` so BUILDER knows to hand-build it. `summary` totals accepted/rejected/scratch and flags license concerns.

**Success criteria:** exactly one `decision="accepted"` row per function_key from the spec; every accepted `repo` source has a non-null `commit_sha` (pinned, reproducible); every accepted source has a `license_spdx` compatible with project policy.

**Failure/escalation:** `failed` — a function_key exhausts its search budget with zero viable candidates and no scratch fallback authorized; retry with broadened search terms. `escalated` — only license-incompatible candidates exist, or GitHub search access itself is blocked (auth/rate limit) — do not silently accept a bad license.

**Handoff:** BUILDER needs, per accepted source: `source_type`, `ref`, `commit_sha`, and the `function_key` it satisfies.

**Implementation notes (SCAVENGER is built):** requires a `GITHUB_TOKEN` secret (Supabase project secrets, not a repo secret) with at least public-repo read access for Code Search + repo/branch metadata; without it SCAVENGER escalates immediately rather than guessing. License policy (the "allow-list" this contract's success criteria refers to) defaults to permissive OSS only - `MIT`, `Apache-2.0`, `BSD-2-Clause`, `BSD-3-Clause`, `ISC`, `0BSD`, `Unlicense`, `CC0-1.0` - copyleft and unlicensed candidates are rejected, not silently accepted; this fills the "license allow-list/policy" item under Open dependencies below. `runs.input_repo_url`'s base-repo row uses the sentinel `function_key = "__existing_repo__"` (not a real spec function_key) since `sources.function_key` is `NOT NULL`.

## 3. BUILDER

**Inputs:** SCAVENGER's accepted `sources` rows; PLANNER's spec (to bound extraction scope per function_key). LLM role: `builder`.

**Outputs:** extracted, buildable code per function_key committed to `run_stages.branch`; an `artifacts` row `kind="notices"` compiling third-party attribution from every accepted source actually used (`license_spdx`, `ref`, `commit_sha`). `summary` lists components extracted and any that required reduction/rewrite to isolate.

**Success criteria:** one extracted unit per accepted source's function_key, containing only code needed for that function (no unrelated repo dumps); every extracted unit's license notice is preserved in the notices artifact; the branch resolves to real, buildable commits.

**Failure/escalation:** `failed` — a source can't be cloned/extracted cleanly after retries (repo gone, function not actually present at the pinned ref); retry the same source. `escalated` — the source is fundamentally wrong for its function_key (BUILDER cannot substitute one itself) — needs SCAVENGER re-run.

**Handoff:** STITCHER needs `run_stages.branch`, the notices artifact, and a per-function_key map of extracted file paths.

**Implementation status: built.** Resolved the sandbox-engine question: E2B (not Daytona), but *not* E2B's turnkey "claude" sandbox template — that only talks to Anthropic's API, and BUILDER/STITCHER are deliberately on Qwen3.8-Max via `llm-proxy` for cost/benchmark reasons. Instead BUILDER drives a bare E2B sandbox itself for git/filesystem work, and calls `llm-proxy` (role `builder`) once per function_key to decide what to write, given either the candidate source repo's file listing/contents or nothing (scratch). Creates the output repo on first use (`runs.output_repo_url`, private, under the account owning a new `GITHUB_WRITE_TOKEN` secret — SCAVENGER's `GITHUB_TOKEN` stays read-only, least-privilege, and is reused here only for cloning *source* repos). If `runs.input_repo_url` is set, seeds the fresh output repo from it rather than an empty `auto_init`. Writes each function's files under `functions/<function_key>/` (validated: the LLM cannot write outside that prefix), commits and pushes to `run/<run_id>`, records the notices artifact (`kind="notices"`) which also carries the per-function_key extracted-file-path map STITCHER needs (one artifact, not a separate table). Sets `run_stages.branch` via `runner-callback`'s new `branch` field on the callback payload (previously never wired up for any stage). Requires three secrets: `E2B_API_KEY`, `GITHUB_TOKEN` (read), `GITHUB_WRITE_TOKEN` — missing any of them escalates cleanly rather than guessing. Deviates from the locked "GitHub App" access model (HANDOFF.md #6) by using a plain write-scoped PAT for now — same pragmatic substitution already made for SCAVENGER's read token; flagged, not hidden, revisit if/when the full App is stood up.

## 4. STITCHER

**Inputs:** BUILDER's branch, extracted-component map, and notices artifact; the full spec function_key list (completeness check). LLM role: `stitcher`.

**Outputs:** a single merged app repo on `run_stages.branch`; an `artifacts` row `kind="manifest"` — file tree cross-referenced to which function_key/source produced each part, plus resolved dependency versions. `summary` states files merged, conflicts resolved, and any function_key it could not merge.

**Success criteria:** dependency install succeeds with no unresolved imports; every accepted function_key appears exactly once in the merged tree (no duplicates, no omissions); per-component scaffolding (multiple package manifests/lockfiles, etc.) is collapsed into one coherent project.

**Failure/escalation:** `failed` — merge conflicts or dependency-version incompatibilities unresolved after the retry budget; retry with an alternate merge strategy. `escalated` — two accepted components are architecturally incompatible (e.g. conflicting frameworks) such that no automated merge is possible — needs PLANNER/human to change the spec, not a STITCHER workaround.

**Handoff:** FIXER needs the merged `run_stages.branch` and the manifest artifact defining intended scope/structure.

**Implementation status: built.** Clones BUILDER's output repo at the same `run/<run_id>` branch (no new branch — matches the shared "same run-scoped branch handed forward" convention). Since BUILDER already wrote every function into one repo, STITCHER's job narrows to: discover which npm packages are actually imported (deterministic `grep` across `functions/`, not LLM-guessed), then one `llm-proxy` call (role `stitcher`) to produce a root `package.json` + minimal entry point tying the functions together — the LLM is not allowed to write inside `functions/*/` at all (validated). Then it does something no earlier agent could: actually run `npm install` in the sandbox and check whether it really works. On failure, feeds the real npm error back to the LLM for one fix-up retry before giving up. Records the manifest artifact (entry point, resolved dependencies, and a deterministic path→function_key map built from BUILDER's own notices artifact, not re-derived by the LLM).

## 5. FIXER

**Inputs:** STITCHER's merged branch and manifest artifact. LLM role: `fixer` (terminal correctness gate — see shared conventions above; nothing downstream re-checks its output, the last chance to catch a bug before it ships).

**Outputs:** repaired commits on the same branch; an `artifacts` row `kind="tests"` (build/lint/test run output, whether pre-existing or FIXER-authored). `summary` lists issues found, issues fixed, tests passing, and any known issue explicitly deferred with a stated reason.

**Success criteria:** project installs and builds/compiles cleanly; an automated test pass covering every spec function_key reports zero failures; no stub/TODO stands in for a required function_key; the diff from STITCHER's output introduces no feature outside the locked spec (no scope creep).

**Failure/escalation:** `failed` — build/tests still fail after the retry budget; retry with a different fix strategy each attempt. `escalated` — the failure traces to a bad component choice upstream (SCAVENGER/BUILDER/STITCHER) that FIXER cannot repair in place — escalate for an earlier-stage re-run rather than looping indefinitely.

**Handoff:** PUBLISHER needs the green branch plus the tests artifact as proof it's ready to ship.

**Implementation status: built.** Same bare-E2B-sandbox pattern as BUILDER/STITCHER, deliberately *not* switched to E2B's turnkey `claude` template even though FIXER's model (`llm-proxy` role `fixer`) is Anthropic (`claude-fable-5-1` @ `effort: max`) — that template bypasses `llm-proxy`, so budget enforcement and cost tracking would silently stop applying to FIXER specifically, for no real benefit over the already-proven pattern. Runs a bounded staged loop (max 6 rounds) per invocation: `npm install` → build/typecheck if the project defines one (`npm run build` or `npx tsc --noEmit`, skipped if neither applies) → a deterministic grep for `TODO`/`FIXME`/`XXX` inside `functions/` → author-once-then-run FIXER-authored smoke tests. Each failing stage gets ONE targeted `llm-proxy` fix call (with the real error/output as context) before the loop retries from the top; the LLM can flag `upstream_issue: true` at any stage to escalate rather than looping on something it can't actually repair (e.g. a fundamentally broken upstream component). Test authoring is stack-agnostic on purpose — since BUILDER/STITCHER's output stack isn't fixed, the LLM itself picks the test approach (plain `node:test`, `vitest`, etc.), returns the exact `test_command` to run, and can add `dev_dependencies` to `package.json`; files are restricted to `__fixer_tests__/` the same way BUILDER/STITCHER restrict their own writes. Records the tests artifact (`kind="tests"`: install/build/todo-scan/test results plus a human-readable log of every fix round).

**Known, honest scope limit:** the "automated test pass" is FIXER-authored smoke-level coverage (does each function_key's entry point load and pass a basic check derived from its acceptance_signal) — not deep behavioral verification against the full acceptance_signal semantics. Full semantic test authoring against arbitrary natural-language acceptance criteria is a much harder, open-ended problem; this is a deliberate, documented scope choice, not an oversight.

## 6. PUBLISHER

**Inputs:** FIXER's passing branch and tests artifact; PLANNER's spec (app name/description for the PR). LLM role: `publisher` — PUBLISHER, FIXER, and APP WRAPPER are the three stages the org has called make-or-break for the whole app, and PUBLISHER routes to the same model+effort as PLANNER (`claude-fable-5-1` @ `effort: max`): deploy/PR work routinely requires reading and fixing build/deploy config, not just templated text, and a bad publish ships broken to every user.

**Outputs:** pushes the branch and opens a PR; deploys a web preview under the project's wildcard-subdomain scheme on Vercel; sets `runs.web_url` (PUBLISHER is its sole writer) once live; an `artifacts` row `kind="report"` (PR URL, deployment URL, build log excerpt). `summary` states the PR and preview URLs.

**Success criteria:** PR is open against the target repo/branch; `runs.web_url` returns 2xx and renders the built app (not blank/error); the live deployment matches the exact commit FIXER left passing (no drift).

**Failure/escalation:** `failed` — push/PR/deploy calls fail after retries (auth, quota, transient platform error); retry. `escalated` — the deploy platform rejects the build for a reason PUBLISHER can't fix without changing scope (platform limits, missing paid tier, missing secret) — needs a human/PLANNER decision, never a silent downgrade.

**Handoff:** APP WRAPPER needs `runs.web_url` (the verified live preview) and the PR/branch reference.

*GitHub App scopes are decided (Contents R&W, Pull Requests R&W, org Administration Write, Metadata Read — HANDOFF.md #6). Open dependency: the Vercel wildcard-subdomain provisioning mechanism itself is still undecided (HANDOFF.md #4).*

**Implementation status: PR-opening half built; deploy half deliberately not built.** No sandbox needed - pure GitHub-API calls, same shape as SCAVENGER, since FIXER's sandbox already pushed the final commits before PUBLISHER runs. Looks up the output repo's default branch, opens a PR from `run/<run_id>` against it (idempotent - a re-run finds and reuses an existing PR instead of erroring on GitHub's 422), with a body built deterministically from the spec's function list/out-of-scope notes and FIXER's tests summary (no LLM call needed for this half - templating from data already in hand). Records the report artifact (PR URL/number, tests summary, an explicit `deploy_status: "not_implemented"` note).

Because `runs.web_url` - a contractually required PUBLISHER output - is deliberately not set (the Vercel wildcard-subdomain provisioning mechanism is still undecided; building the deploy half now would mean inventing that decision unilaterally), this stage always **escalates** rather than reporting `passed`, even when the PR opens successfully. That's the honest read of the shared conventions' own definition of escalation: the run needs a human decision (provisioning approach, or a manual deploy) before it's actually done. A 403 from GitHub on PR creation gets a specific escalation message naming the likely cause: `GITHUB_WRITE_TOKEN` was scoped to Contents/Administration only, not Pull Requests - confirmed missing that permission when the token was set up for BUILDER, since PUBLISHER's PR-opening job wasn't anticipated yet at that point.

## 7. APP WRAPPER

**Inputs:** `runs.web_url` from PUBLISHER; PLANNER's spec (app name/icon/bundle metadata). LLM role: `wrapper` (terminal correctness gate — see shared conventions above; native build/signing failures require real debugging with no re-check downstream).

**Outputs:** runs Capacitor `add`/`sync`/`build` against the published web app; sets `runs.aab_path` (its sole writer) and an `artifacts` row `kind="aab"` pointing to the signed binary (AAB minimum; APK/IPA if in scope). `summary` states platforms built, signing status, and any build warnings.

**Success criteria:** a signed AAB is produced from the exact `web_url` PUBLISHER shipped; it installs and launches on a target emulator/device without crashing on first load; app metadata matches the spec.

**Failure/escalation:** `failed` — Capacitor/Gradle/signing build fails after retries; retry the build. `escalated` — required signing credentials/certificates aren't available, or the web app relies on something Capacitor can't bridge — needs a human decision, never an unsigned/broken package shipped as done.

**Handoff:** none — APP WRAPPER is the terminal stage. The run is complete once it reaches `status="passed"`; the pipeline runner then sets `runs.status="passed"` and `runs.finished_at`.

*Mobile target is decided (Capacitor — HANDOFF.md #3). Open dependency: signing-credential storage/provisioning is still undecided.*

**Implementation status: still blocked, not built.** BUILDER proved E2B sandboxes work for git/filesystem/shell work generally, but APP WRAPPER specifically needs a real Android SDK/JDK/Gradle toolchain preinstalled - E2B's default "base" template doesn't have one. E2B supports custom templates (build one with the toolchain baked in), so this is solvable, but that's a real setup step nobody's done yet. Signing-credential storage/provisioning (below) is the second, independent blocker - even with a working Android sandbox, there's nowhere to keep keystores/certificates yet.

---

## Open dependencies (aggregated)

- ~~GitHub App permission scopes / repo access model for SCAVENGER, BUILDER, and PUBLISHER~~ **Decided:** GitHub App with Contents R&W, Pull Requests R&W, org-level Administration (Write), Metadata (Read, auto-included) — HANDOFF.md #6.
- Vercel wildcard-subdomain provisioning mechanism for PUBLISHER's web previews (HANDOFF.md #4).
- Signing-credential storage/provisioning for APP WRAPPER (mobile target itself is decided as Capacitor — HANDOFF.md #3).
- ~~License allow-list/policy SCAVENGER enforces via `license_spdx`~~ **Decided (default):** permissive-OSS-only allow-list (MIT/Apache-2.0/BSD-2/BSD-3/ISC/0BSD/Unlicense/CC0-1.0), implemented in SCAVENGER — see #2 above. Revisit if the org wants a different policy.
- Per-stage retry-budget constants (max `attempt` before `failed`) — a harness-level configuration, not a schema field.
- ~~Sandbox coding-agent runtime for BUILDER/STITCHER/FIXER is decided-but-not-built~~ **Resolved, confirmed working, and now built for all three.** E2B, driven directly (bare sandbox + `llm-proxy` calls for the actual coding decisions), *not* E2B's turnkey Claude Code template - that's Anthropic-only and would have silently overridden BUILDER/STITCHER's deliberate Qwen3.8-Max pick (kept the same execution pattern for FIXER too even though FIXER's own model is Anthropic, so budget/cost tracking through `llm-proxy` stays uniform across all three coder agents). `npm:e2b` confirmed importable under Supabase's Deno edge runtime; BUILDER, STITCHER, and FIXER are all built and deployed on this pattern (see #3-#5 above). Only APP WRAPPER remains sandbox-blocked - PUBLISHER's PR-opening half needed no sandbox at all (see #6 above).
- APP WRAPPER's sandbox needs are a separate, still-open question: a custom E2B template with an Android SDK/JDK/Gradle toolchain (solvable, not done) plus signing-credential provisioning (undecided) - see #7 above.
- **New finding while building PUBLISHER's PR-opening half: `GITHUB_WRITE_TOKEN` lacks the "Pull requests" permission.** It was scoped to Contents R&W + Administration R&W + Metadata (read) when set up for BUILDER, before PUBLISHER's PR-creation need was anticipated. PUBLISHER's code handles this gracefully (a specific escalation message naming the exact fix) rather than failing opaquely, but the token itself needs "Pull requests: Read and write" added before a real PR can actually be opened.
- `GITHUB_WRITE_TOKEN` Supabase secret for BUILDER/STITCHER/FIXER's output-repo creation/push - a second, write-scoped token alongside SCAVENGER's read-only `GITHUB_TOKEN`, substituting for the still-not-stood-up GitHub App (HANDOFF.md #6) the same pragmatic way `GITHUB_TOKEN` already does. Confirmed set.
