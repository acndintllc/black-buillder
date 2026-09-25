# Building and pushing the APP WRAPPER E2B template

`supabase/functions/wrapper/index.ts` calls `Sandbox.create({ template: "black-builder-app-wrapper", ... })` — a custom E2B template with the Android/JDK/Node toolchain Capacitor's release build needs, since E2B's default template doesn't have one. Until this template exists in your E2B account's registry, every APP WRAPPER run fails at `Sandbox.create`.

This couldn't be built/pushed from the Claude Code session that wrote it — its network policy blocks `api.e2b.dev`. Run this from any machine that can reach it.

## Prerequisites

- Node.js (for the E2B CLI).
- Docker installed and running locally — `e2b template build` builds the image from `e2b.Dockerfile` before pushing it, the same as any Docker-based CLI build.
- An E2B account with API access (the same one `E2B_API_KEY` in Supabase's project secrets belongs to).

Exact CLI flag names below are to the best of this session's knowledge — this session had no live access to verify against current E2B CLI docs, so run `e2b --help` / `e2b template build --help` first if anything doesn't match your installed version.

## Steps

```sh
# 1. Install the E2B CLI
npm install -g @e2b/cli

# 2. Authenticate (opens a browser to your E2B dashboard)
e2b auth login

# 3. Build and push the template - run from this directory
cd supabase/functions/wrapper/sandbox-template
e2b template build -c "black-builder-app-wrapper" -p .
```

Step 3 reads `e2b.toml` (already set to `template_name = "black-builder-app-wrapper"`) and `e2b.Dockerfile` in this same directory: a JDK 17 + Node 20 base, then the Android SDK cmdline-tools, `platform-tools`, `platforms;android-34`, and `build-tools;34.0.0` layered on top. Expect this to take several minutes — the Android SDK components are a real download, not cached anywhere yet.

## Verify

```sh
e2b template list
```

Confirm `black-builder-app-wrapper` appears. Then confirm the code's expectation matches:

```sh
grep SANDBOX_TEMPLATE ../index.ts
# -> const SANDBOX_TEMPLATE = "black-builder-app-wrapper";
```

If your E2B CLI assigns a different template ID than the name passed to `-c`, update `SANDBOX_TEMPLATE` in `supabase/functions/wrapper/index.ts` to that exact ID and redeploy the `wrapper` Edge Function.

## After this

This is a one-time setup step, not something to repeat per run — `Sandbox.create` references the template by name/ID on every APP WRAPPER invocation from then on. If the Dockerfile ever changes (a newer Android/AGP target, for instance), re-run step 3 to push a new version.

Also confirm the `cmdline-tools` download URL in `e2b.Dockerfile` still resolves — Google rotates it periodically (see the Dockerfile's own comment) and this session couldn't verify it live either.
