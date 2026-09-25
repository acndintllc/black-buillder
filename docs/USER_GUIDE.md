# BLACK BUILDER — User Guide

This is the plain-language guide to using BLACK BUILDER. If you're writing or modifying the agents themselves, see [`docs/agent-contracts.md`](agent-contracts.md) instead — that's the engineering contract. This page is for using the product.

## What it is

You describe an app. A swarm of seven AI agents plans it, builds it, tests it, and ships it — a real code repository, a live web preview, and (optionally) a signed Android app — without you writing code yourself.

## How to use it

1. **Describe what you want**, in your own words, in the chat panel. Be as specific as you can about what the app needs to do — the more concrete your description, the better PLANNER's spec will be.
2. **Watch the Swarm Activity panel.** Each of the seven agents lights up as it works, with its own color and a live log of what it's doing.
3. **Respond to escalations.** If an agent can't safely continue on its own — an ambiguous requirement, a licensing conflict, a missing decision only you can make — it stops and asks rather than guessing. That's not a failure; it's the system working as intended. Answer what it's asking and the run continues.
4. **Review the result.** When the run finishes, you get a pull request against a real repository, a live preview link, and — if you asked for a mobile app — a signed AAB. Review the code before you rely on it or deploy it further; see [Disclaimers](/disclaimers).

## What each agent does

| Agent | In plain terms |
|---|---|
| **PLANNER** | Reads your request and turns it into a precise, locked spec — the exact list of things the app needs to do, and what's explicitly out of scope. If your request is ambiguous or asks for something we won't build, PLANNER stops and asks rather than guessing what you meant. |
| **SCAVENGER** | Searches for existing, permissively-licensed open-source code that already does part of what you asked for, so BUILDER isn't starting from zero. It only accepts licenses that are safe to build on (never anything that would restrict what you can do with your own app), and it's willing to build from scratch if nothing suitable exists. |
| **BUILDER** | Writes or adapts the actual code for each piece of your spec, creating the repository your app will live in. |
| **STITCHER** | Takes everything BUILDER produced and assembles it into one coherent, installable project — figuring out dependencies and tying the pieces together. |
| **FIXER** | The quality gate. Actually installs, builds, and tests the project for real, fixing what's broken until it passes — or telling you honestly if something's wrong that traces back to an earlier decision. |
| **PUBLISHER** | Opens the pull request against your repository and deploys a live, working preview of your app so you can see and use it immediately. |
| **APP WRAPPER** | If you want a mobile app, wraps your live web app in a native Android shell and produces a signed package ready for distribution. |

**Web and mobile always match, automatically.** The mobile app APP WRAPPER produces isn't a separate build — it's the exact same live web app, just running inside a native Android shell. There's nothing to sync and nothing that can drift: open it on your phone, open it in a browser, switch between them whenever you want, and you're always looking at the same thing.

## Understanding run status

- **Passed** — that stage finished successfully; the pipeline moves on.
- **Escalated** — that stage needs a decision from you before it can continue. This is the system being honest about a real limit, not a bug.
- **Failed** — that stage hit a problem it's still retrying to resolve on its own.

## Getting help

Questions, feedback, or something not working as expected? Reach out through the support channel in your workspace.
