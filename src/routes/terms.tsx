import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Terms of Service — BLACK BUILDER" },
      {
        name: "description",
        content:
          "BLACK BUILDER terms of service: rules, rights, and responsibilities for using the seven-agent app builder.",
      },
      { property: "og:title", content: "Terms of Service — BLACK BUILDER" },
      {
        property: "og:description",
        content: "Terms and conditions for using BLACK BUILDER.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TermsPage,
});

function TermsPage() {
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
          Terms of Service
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">Effective: September 23, 2026</p>

        <section className="mt-8 space-y-6 text-sm leading-relaxed text-foreground/90">
          <p>
            These Terms of Service (“Terms”) govern your access to and use of BLACK BUILDER and the
            seven-agent app-building swarm (the “Service”). By using the Service, you agree to these
            Terms.
          </p>

          <div>
            <h2 className="mb-2 font-sans text-lg font-semibold text-foreground">
              1. Acceptance and eligibility
            </h2>
            <p>
              You must be at least 18 years old or have the legal capacity to enter into contracts
              in your jurisdiction. If you use the Service on behalf of an organization, you agree to
              these Terms on behalf of that organization.
            </p>
          </div>

          <div>
            <h2 className="mb-2 font-sans text-lg font-semibold text-foreground">
              2. Description of the service
            </h2>
            <p>
              BLACK BUILDER lets you describe an app in natural language and routes the request
              through a swarm of specialist agents that plan, source, build, stitch, fix, publish,
              and package software. Outputs may include code repositories, web previews, and mobile
              packages.
            </p>
          </div>

          <div>
            <h2 className="mb-2 font-sans text-lg font-semibold text-foreground">
              3. Accounts and security
            </h2>
            <p>
              You are responsible for maintaining the confidentiality of your account credentials and
              for all activity that occurs under your account. Notify us immediately of any
              unauthorized use.
            </p>
          </div>

          <div>
            <h2 className="mb-2 font-sans text-lg font-semibold text-foreground">
              4. Acceptable use
            </h2>
            <p>You agree not to use the Service to:</p>
            <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
              <li>Generate, distribute, or deploy malware, exploits, or harmful code.</li>
              <li>Infringe intellectual property rights or violate applicable laws.</li>
              <li>Reverse engineer, scrape, or abuse the platform’s infrastructure.</li>
              <li>Generate content that is illegal, defamatory, or discriminatory.</li>
            </ul>
          </div>

          <div>
            <h2 className="mb-2 font-sans text-lg font-semibold text-foreground">
              5. Intellectual property
            </h2>
            <p>
              You retain ownership of your prompts and any original content you provide. You grant
              us a limited license to process that content solely to operate the Service. Generated
              outputs are provided to you under the license terms displayed at the time of delivery;
              where no specific license is stated, you receive a perpetual, worldwide, royalty-free
              license to use the outputs you generate.
            </p>
          </div>

          <div>
            <h2 className="mb-2 font-sans text-lg font-semibold text-foreground">
              6. Disclaimers and limitation of liability
            </h2>
            <p>
              The Service and all outputs are provided “as is” without warranties of any kind. We are
              not liable for indirect, incidental, or consequential damages arising from your use
              of the Service, including any code or app you deploy.
            </p>
          </div>

          <div>
            <h2 className="mb-2 font-sans text-lg font-semibold text-foreground">
              7. Termination
            </h2>
            <p>
              We may suspend or terminate your access if you violate these Terms or if necessary to
              protect the Service. You may delete your account at any time.
            </p>
          </div>

          <div>
            <h2 className="mb-2 font-sans text-lg font-semibold text-foreground">
              8. Governing law
            </h2>
            <p>
              These Terms are governed by the laws of the State of Delaware, United States,
              without regard to conflict-of-law principles.
            </p>
          </div>

          <div>
            <h2 className="mb-2 font-sans text-lg font-semibold text-foreground">
              9. Changes to these terms
            </h2>
            <p>
              We may update these Terms from time to time. We will post the updated version with a
              new effective date. Continued use of the Service after changes means you accept the
              revised Terms.
            </p>
          </div>

          <div>
            <h2 className="mb-2 font-sans text-lg font-semibold text-foreground">10. Contact</h2>
            <p>
              For questions about these Terms, contact us through the support channel in your
              workspace.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
