# Platform Responsibility & Promise

This is what BLACK BUILDER commits to, and how those commitments are actually enforced — not just stated. Where a commitment is backed by something specific in the code or the agent contracts, it's cited, so this stays a promise you can verify rather than a marketing page.

## 1. We escalate instead of guessing

No agent in the swarm is allowed to paper over a problem it can't safely solve. Every stage reports `passed`, `failed` (retryable), or `escalated` (needs a human decision) — never a false `passed`. This is enforced per-agent in [`docs/agent-contracts.md`](agent-contracts.md): PLANNER escalates on ambiguous or disallowed requests rather than inventing scope; SCAVENGER escalates when only license-incompatible code exists rather than accepting a bad license silently; PUBLISHER escalated on every run until its deploy half was actually built, rather than claiming a run was done when a required output (`runs.web_url`) wasn't real yet.

## 2. We tell you what we didn't check

Where an agent's verification has a real limit, that limit is documented, not hidden. FIXER's test pass is smoke-level coverage, not full behavioral verification against every acceptance criterion — stated plainly in its contract, not discovered the hard way later. APP WRAPPER verifies a signed AAB builds, not that it launches crash-free on a device, because the sandbox it runs in has no way to check that — and says so.

## 3. We don't let costs run away from you

Every LLM call in the pipeline is routed through `llm-proxy`, which enforces `runs.budget_usd` against `runs.cost_usd` on every call. A run cannot silently blow past what you authorized — it hits the budget ceiling and stops.

## 4. We respect the licenses of code we bring in

SCAVENGER only accepts permissively-licensed sources (MIT, Apache-2.0, BSD-2/3-Clause, ISC, 0BSD, Unlicense, CC0-1.0) and records the exact license and pinned commit for every candidate it considers — accepted or rejected — not just the ones it uses. That record ships with your output so attribution obligations are traceable, not lost.

## 5. We show our work

The Swarm Activity panel isn't cosmetic — it reflects each agent's real `run_stages` status and `run_logs` as the run actually happens, not a simulated progress bar. What you see is what's occurring.

## 6. We hold ourselves to the same standard internally

When something falls short of what a document claims, we say so and fix it rather than quietly letting the gap sit. That's not aspirational — it's the actual practice behind this platform's own build history: every agent's documentation is updated the moment its real behavior changes, and known gaps (a scope limit, a blocked dependency, an unverified assumption) are written down next to the feature they affect, not left for someone to discover later.

## What this doesn't promise

This page is not a warranty. It describes how the platform is built to behave, not a guarantee that every run will go perfectly — infrastructure fails, models make mistakes, and edge cases exist. See the Disclaimers page (`/disclaimers`) and the Terms of Service for what we do and don't warrant.
