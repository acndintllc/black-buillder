import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/disclaimers")({
  head: () => ({
    meta: [
      { title: "Disclaimers — BLACK BUILDER" },
      {
        name: "description",
        content:
          "What BLACK BUILDER does and does not promise about the code, apps, and advice its agent swarm produces.",
      },
      { property: "og:title", content: "Disclaimers — BLACK BUILDER" },
      {
        property: "og:description",
        content: "What BLACK BUILDER does and does not promise about its outputs.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DisclaimersPage,
});

function DisclaimersPage() {
  return (
    <main className="min-h-dvh bg-background px-4 py-12 text-foreground">
      <div className="mx-auto max-w-2xl">
        <Link
          to="/"
          className="mb-8 inline-block font-mono text-xs uppercase tracking-widest text-muted-foreground hover:text-primary"
        >
          ← Back to BLACK BUILDER
        </Link>

        <h1 className="font-sans text-3xl font-bold tracking-tight text-primary">Disclaimers</h1>
        <p className="mt-2 text-sm text-muted-foreground">Effective: September 25, 2026</p>

        <section className="mt-8 space-y-6 text-sm leading-relaxed text-foreground/90">
          <p>
            This page explains, in plain terms, what BLACK BUILDER does and does not promise about
            what the agent swarm produces. It supplements, and does not replace, the disclaimers and
            limitation of liability in our{" "}
            <Link to="/terms" className="underline hover:text-primary">
              Terms of Service
            </Link>
            .
          </p>

          <div>
            <h2 className="mb-2 font-sans text-lg font-semibold text-foreground">
              1. Generated code is not guaranteed
            </h2>
            <p>
              Every function, repository, and app BLACK BUILDER produces is the output of an AI
              agent swarm, not a human engineer. FIXER runs a real install/build/test pass before
              anything ships, but that pass is smoke-level verification — it confirms each piece
              works, not that it is bug-free, secure, performant, or fit for a specific purpose.
              Review generated code before relying on it, and before deploying it anywhere that
              handles real users, real money, or sensitive data.
            </p>
          </div>

          <div>
            <h2 className="mb-2 font-sans text-lg font-semibold text-foreground">
              2. Not professional advice
            </h2>
            <p>
              Nothing BLACK BUILDER generates — code, comments, PR descriptions, or agent-authored
              text — is legal, financial, medical, security, or other professional advice. If your
              app touches a regulated activity, get advice from a qualified professional before you
              rely on it.
            </p>
          </div>

          <div>
            <h2 className="mb-2 font-sans text-lg font-semibold text-foreground">
              3. Third-party and open-source components
            </h2>
            <p>
              SCAVENGER may source existing open-source code to satisfy part of your request. It
              only accepts permissive licenses (MIT, Apache-2.0, BSD-2/3-Clause, ISC, 0BSD,
              Unlicense, CC0-1.0) and records the license and pinned commit for every source it
              uses, but you are responsible for reviewing what was incorporated and complying with
              its license terms — including attribution — in anything you distribute.
            </p>
          </div>

          <div>
            <h2 className="mb-2 font-sans text-lg font-semibold text-foreground">
              4. AI agents fail and escalate — that is by design
            </h2>
            <p>
              A stage that cannot safely finish reports "escalated" rather than guessing or shipping
              something broken. That is a feature, not a bug, but it means a run is not guaranteed
              to complete without a decision from you. Watch the Swarm Activity panel for
              escalations and respond to them.
            </p>
          </div>

          <div>
            <h2 className="mb-2 font-sans text-lg font-semibold text-foreground">
              5. Deployment and hosting are your responsibility
            </h2>
            <p>
              PUBLISHER deploys a live web preview and can open a PR against your output
              repository; APP WRAPPER can produce a signed Android package. Once you take an
              output and deploy, distribute, or publish it yourself — including to app stores or
              production infrastructure — you are responsible for that deployment: its
              availability, its security posture, and its compliance with any platform's own
              policies (including app store review guidelines).
            </p>
          </div>

          <div>
            <h2 className="mb-2 font-sans text-lg font-semibold text-foreground">
              6. No uptime guarantee
            </h2>
            <p>
              We work to keep BLACK BUILDER available, but we do not guarantee uninterrupted access
              to the platform or to any web preview it deploys on your behalf.
            </p>
          </div>

          <div>
            <h2 className="mb-2 font-sans text-lg font-semibold text-foreground">7. Contact</h2>
            <p>
              Questions about these disclaimers? Reach out via the support channel in your
              workspace.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
