# User Reward System — Watch Meter

**Status: reconstructed from a prior design conversation, not yet re-confirmed or built.** The CEO recalled the core mechanic (a watch meter accumulating toward 24 hours, unlocking 7 ad-free days) but the session that originally designed it isn't available here. This document writes that mechanic down precisely, adapted to how Black Builder actually works, and flags every place a real decision is still needed — treat those as open questions to confirm, not settled behavior.

## The mechanic, as recalled

- Users accumulate **watch time** on the platform.
- At **24 accumulated hours**, they earn **7 ad-free days**.

## Adapting "watch time" to Black Builder

Black Builder isn't a video/content platform, so "watch time" needs a definition that fits what people actually do here. The natural fit: **time spent actively engaged with a run** — watching the Swarm Activity panel while agents work, reviewing a completed run's PR/preview/output. This is a real, already-built UI surface (the three-panel workspace's Swarm Activity panel), not a new concept to invent from scratch.

**Assumption, needs confirming:** "active" should require an engagement signal (the tab in foreground, a recent interaction, or a run actually in progress) rather than counting idle background tabs — otherwise the meter is trivial to game by leaving a tab open. Exact heartbeat/idle-timeout mechanics are an implementation detail once this is confirmed as the right definition.

## Program shape

| Question | Reconstructed answer | Confidence |
|---|---|---|
| Who's eligible? | Free-tier / ad-supported users only — paid tiers presumably don't see ads to begin with. | Assumption — confirm free/paid tier structure exists as described. |
| What resets the meter? | Meter resets to 0 after each 24-hour threshold is reached and the 7 ad-free days are granted. | Assumption. |
| Does watch time expire? | Not specified in the recalled design. A rolling window (e.g. only the last 30 days count) vs. an all-time cumulative total materially changes how achievable this is — needs a decision. | Open question. |
| Do ad-free days stack? | Not specified — if a user re-earns 7 more days while still in an active ad-free period, do they extend the current window or wait? | Open question. |
| Any cap on total ad-free time earnable? | Not specified. | Open question. |

## Why this connects to billing

This reward only makes sense if Black Builder has (or plans) an ad-supported free tier — which lines up with the "advertiser services" cost center mentioned when discussing billing (see the cost model in the same request). The reward system and the billing/monetization model are the same decision from two sides: one is what free users pay in attention, the other is what it costs to run and what a paid alternative should cost. **Recommend finalizing the free-tier/ad model before building this** — the reward mechanic is meaningless without it actually existing.

## What's needed before this gets built

1. Confirm the free/ad-supported tier is actually the plan (see the cost model discussion — billing is still undecided as of this document).
2. Answer the open questions in the table above.
3. Decide where watch time gets tracked (a new `watch_sessions` table or similar, keyed to the user, with start/end timestamps and an activity heartbeat) and where the ad-free entitlement gets checked (wherever ads would actually be shown/withheld — not yet built).
4. Decide what "ads" even means in this product's UI — where they'd appear, since the current three-panel workspace has no ad placement designed yet.

This document is a starting point for that conversation, not a spec ready to hand to an engineer.
