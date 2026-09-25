# Mission Statement

**Empowerment. Ownership. Freedom.**

That's ASCEND's mission across everything it builds — publishing, web design, AI tools, gig-driver transparency. BLACK BUILDER is that mission applied to software itself.

## The problem

Building working software still requires either money (hiring developers) or time most people don't have (learning to code). That gate keeps a huge number of good ideas — a local business's ordering app, a community group's sign-up tool, a side project someone's wanted to build for years — from ever existing. Not because the idea was bad, but because the only path to "working software" ran through a skill or a budget most people don't have.

## What BLACK BUILDER does about it

You describe what you want in plain language. A seven-agent swarm — PLANNER, SCAVENGER, BUILDER, STITCHER, FIXER, PUBLISHER, APP WRAPPER — turns that description into a real, working, deployed app: a spec, real code (built fresh or responsibly adapted from permissively-licensed open source), an install-and-test pass that actually runs, a live web preview, and optionally a signed Android package. Ownership isn't a slogan here — it's in the Terms of Service: you own your prompts, and you get a real license to what gets built.

## How we build it

Every agent in the swarm follows one rule: **escalate rather than guess.** When a stage hits something it can't safely resolve — an ambiguous requirement, a license conflict, a missing credential — it stops and says so, instead of shipping something broken or making a decision that wasn't ours to make. That rule is enforced in code, not just policy — see the `escalated` vs. `failed` distinction that runs through every agent's contract in [`docs/agent-contracts.md`](agent-contracts.md).

Freedom means the platform doesn't lock you in either: the code SCAVENGER pulls in is checked against a permissive-license allow-list and its attribution preserved, the output is your own repository on your own account, and what you build is yours to take anywhere.

## Who this is for

Anyone with an idea and no other path to a working app: small business owners, community organizers, students, people testing a concept before committing real money to it. BLACK BUILDER's job is to remove the gate — not to replace judgment about what to build, but to remove the cost of finding out whether an idea works.
