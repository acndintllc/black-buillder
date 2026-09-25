# Black Builder — mobile shell

This is Black Builder's own workspace wrapped as a native Android app — not a per-run generated app, and not part of the seven-agent pipeline. It exists because the CEO asked for Black Builder itself to work on mobile, web, and workstation with state synced per user.

## Why this satisfies that requirement, and why there's nothing else to build

**Web and workstation already work today.** Black Builder is a responsive web app — the same `https://blackappcompleter.lovable.app` works in any browser on any device, phone or desktop, right now. "Workstation" support isn't a gap.

**Sync per user is already true today, for the same reason APP WRAPPER's per-run mobile output is always in sync with its web version** (see `docs/agent-contracts.md` #7's locked design principle): all real state — your account, your runs, your workspace — lives in Supabase (Postgres + Auth), not in any client. Whichever client you're on (a browser, or this app) is just a window onto the same backend. There's no separate mobile data store to keep in sync, so there's nothing that can drift.

**The one real gap was a native mobile app**, which this directory adds — using the exact same recipe as APP WRAPPER: a Capacitor shell whose `capacitor.config.json` points `server.url` straight at the live production URL. Same reasoning as before: this pins the app to the actual live site rather than a locally bundled copy, so it can never show something out of date, and it needs no separate frontend build or deployment step of its own.

## Building it

```sh
cd mobile
npm install
npx cap add android
npx cap sync android
cd android && ./gradlew assembleDebug   # or bundleRelease + signing for a real release build
```

**Actually run from this repo, not just described.** `npm install` and `npx cap add android` both succeeded for real — the `android/` directory in this folder is the genuine output, not a stub, and is checked into the repo so nobody has to regenerate it from scratch. `./gradlew` also runs for real: it downloads Gradle itself successfully (`services.gradle.org` redirects to a reachable GitHub Releases URL), starts a build, and then fails at dependency resolution with an exact, confirmed error:

```
Could not resolve com.android.tools.build:gradle:8.2.1.
  > Could not get resource 'https://dl.google.com/dl/android/maven2/...'.
     > Received status code 403 from server: Forbidden
```

This isn't a guess or an assumption carried over from elsewhere in the repo — it was tested directly. `dl.google.com` (and its `maven.google.com` alias, which redirects back to the same host) is blocked at this session's network-egress level ("organization policy"), and the Android Gradle Plugin and AndroidX artifacts are only published there — Maven Central doesn't mirror them. Gradle itself, and everything on `registry.npmjs.org`, work fine; specifically Google's own Maven repository does not. Run `./gradlew assembleDebug` again from anywhere with normal internet access and it should proceed past this point with no changes needed.

## Release builds and app store distribution

For an actual Play Store release, you'll need:
- A real signing keystore for **this app specifically** — do not reuse the Play App Signing upload-keystore secrets meant for per-run generated apps (`ANDROID_UPLOAD_KEYSTORE_*` in Supabase secrets). Those are scoped to APP WRAPPER's dynamically-generated apps, not Black Builder itself.
- A separate Play Console listing for "Black Builder" as its own app.

## iOS

Not scaffolded here. `@capacitor/ios` would follow the identical pattern (`npx cap add ios`), but needs a macOS/Xcode toolchain this repo has no existing pattern for yet. Add it the same way once there's a build environment for it — nothing about this approach is Android-specific in principle.
