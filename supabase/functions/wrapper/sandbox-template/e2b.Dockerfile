# Custom E2B sandbox template for APP WRAPPER (agent_type "wrapper").
# E2B's default/base template (used as-is by BUILDER/STITCHER/FIXER) has no
# Android toolchain. Capacitor's `npx cap sync android` / `./gradlew bundleRelease`
# need JDK 17, the Android SDK (platform-tools + a target platform + matching
# build-tools), and Node for the Capacitor CLI itself. Gradle is NOT installed
# separately - every Capacitor-generated android/ project ships its own Gradle
# wrapper (./gradlew), which downloads the exact Gradle version it needs on
# first run.
#
# Build with (requires E2B CLI auth - this session's network policy blocks
# api.e2b.dev, so this has been written but not built/pushed from here):
#   e2b template build -c "black-builder-app-wrapper" \
#     -p supabase/functions/wrapper/sandbox-template
#
# NOTE: the cmdline-tools download URL below pins a specific version Google
# publishes at https://developer.android.com/studio#command-line-tools-only.
# Google rotates these periodically - verify the URL still resolves at build
# time and bump it if not (this couldn't be verified live from this sandbox).

FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y --no-install-recommends \
        openjdk-17-jdk-headless \
        curl \
        unzip \
        git \
        ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Node.js 20.x - Capacitor CLI requirement
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*

ENV ANDROID_SDK_ROOT=/opt/android-sdk
ENV ANDROID_HOME=$ANDROID_SDK_ROOT
ENV PATH=$PATH:$ANDROID_SDK_ROOT/cmdline-tools/latest/bin:$ANDROID_SDK_ROOT/platform-tools

RUN mkdir -p $ANDROID_SDK_ROOT/cmdline-tools \
    && curl -fsSL -o /tmp/cmdline-tools.zip \
        https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip \
    && unzip -q /tmp/cmdline-tools.zip -d $ANDROID_SDK_ROOT/cmdline-tools \
    && mv $ANDROID_SDK_ROOT/cmdline-tools/cmdline-tools $ANDROID_SDK_ROOT/cmdline-tools/latest \
    && rm /tmp/cmdline-tools.zip

# android-34 / build-tools 34.0.0 matches Capacitor 6's current target at time
# of writing - bump alongside whatever Capacitor version APP WRAPPER pins.
RUN yes | sdkmanager --licenses > /dev/null 2>&1 || true \
    && sdkmanager --install \
        "platform-tools" \
        "platforms;android-34" \
        "build-tools;34.0.0" > /dev/null

WORKDIR /work
