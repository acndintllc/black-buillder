import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/guidelines")({
  head: () => ({
    meta: [
      { title: "Participation Guidelines — BLACK BUILDER" },
      {
        name: "description",
        content: "How to use BLACK BUILDER well: what's welcome, what isn't, and how we enforce it.",
      },
      { property: "og:title", content: "Participation Guidelines — BLACK BUILDER" },
      {
        property: "og:description",
        content: "What's welcome on BLACK BUILDER, and what isn't.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: GuidelinesPage,
});

function GuidelinesPage() {
  return (
    <main className="min-h-dvh bg-background px-4 py-12 text-foreground">
      <div className="mx-auto max-w-2xl">
        <Link
          to="/"
          className="mb-8 inline-block font-mono text-xs uppercase tracking-widest text-muted-foreground hover:text-primary"
        >
          ← Back to BLACK BUILDER
        </Link>

        <h1 className="font-sans text-3xl font-bold tracking-tight text-primary">
          Participation Guidelines
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">Effective: September 25, 2026</p>

        <section className="mt-8 space-y-6 text-sm leading-relaxed text-foreground/90">
          <p>
            These guidelines cover how to use BLACK BUILDER well — everyone submitting prompts,
            reviewing agent output, or using what the swarm produces. They sit alongside, and don't
            replace, the Acceptable Use section of our{" "}
            <Link to="/terms" className="underline hover:text-primary">
              Terms of Service
            </Link>
            .
          </p>

          <div>
            <h2 className="mb-2 font-sans text-lg font-semibold text-foreground">
              1. Build in good faith
            </h2>
            <p>
              Describe what you actually want built. Prompts designed to trick the swarm into
              producing malware, exploits, scraper/spam infrastructure, or anything else PLANNER
              would have refused had you asked directly violate these guidelines even if phrased
              indirectly.
            </p>
          </div>

          <div>
            <h2 className="mb-2 font-sans text-lg font-semibold text-foreground">
              2. Don't attack the swarm or shared infrastructure
            </h2>
            <p>
              No prompt-injection attempts against PLANNER or any other agent, no trying to exceed
              or bypass a run's budget/rate limits, no attempts to access another user's runs,
              repositories, or artifacts, and no scraping or automated abuse of the platform's own
              infrastructure.
            </p>
          </div>

          <div>
            <h2 className="mb-2 font-sans text-lg font-semibold text-foreground">
              3. Respect what SCAVENGER brings in
            </h2>
            <p>
              When SCAVENGER incorporates existing open-source code, it's brought in under a
              specific permissive license, with attribution recorded. If you redistribute an app
              built this way, keep that attribution intact — don't strip license notices or
              misrepresent someone else's code as entirely your own.
            </p>
          </div>

          <div>
            <h2 className="mb-2 font-sans text-lg font-semibold text-foreground">
              4. Read escalations, don't route around them
            </h2>
            <p>
              When a stage escalates, it's telling you it hit something it genuinely can't resolve
              on its own — a license conflict, an ambiguous requirement, a missing credential.
              Repeatedly rephrasing a prompt to force past a legitimate escalation, instead of
              addressing what it's actually flagging, isn't a good-faith use of the platform.
            </p>
          </div>

          <div>
            <h2 className="mb-2 font-sans text-lg font-semibold text-foreground">
              5. Reporting a problem
            </h2>
            <p>
              If you see abuse, a security issue, or output that shouldn't have been generated,
              report it through the support channel in your workspace rather than posting it
              publicly first — that gives us a chance to fix it before it spreads.
            </p>
          </div>

          <div>
            <h2 className="mb-2 font-sans text-lg font-semibold text-foreground">6. Enforcement</h2>
            <p>
              Violations can result in a warning, a suspended run, or account suspension or
              termination, consistent with the Termination section of our Terms of Service. We'll
              generally warn first for a first-time, non-malicious violation — deliberate abuse
              (attacks on the swarm, malware requests, credential theft attempts) can result in
              immediate termination.
            </p>
          </div>

          <div>
            <h2 className="mb-2 font-sans text-lg font-semibold text-foreground">7. Contact</h2>
            <p>
              Questions about these guidelines? Reach out via the support channel in your
              workspace.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
