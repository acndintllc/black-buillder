# Build the BLACK BUILDER Demo

## Goal
Recreate the uploaded three-panel prototype as the home screen, branded as **BLACK BUILDER** and based on the Frankenswarm six-agent plan. This phase will be a polished interactive demo, not the live agent engine.

## What I’ll build
- A dense desktop workspace with:
  - **Chat / Edit** panel for sample prompts, build messages, editing context, and a working composer.
  - **Six-agent activity** panel showing Planner, Scavenger, Builder, Stitcher, Fixer, and Publisher with status, tasks, source lineage, and expandable logs.
  - **Live preview** panel showing the sample KibbleCheck dog-food scanner, inspection details, scores, ingredients, and recommendations.
- BLACK BUILDER identity using the supplied black-and-gold pyramid-eye logo, adapted carefully for the compact header.
- Product language from the PDFs: Frankenswarm, repo-first lineage, manifest/spec checks, build progress, and publishing readiness.
- Working demo interactions: send a message, toggle views/logs, select an agent, switch preview sizes, inspect preview elements, and simulate build/ship progress.
- Responsive behavior that preserves the three-panel desktop experience and reorganizes it into usable tabs on smaller screens.

## Visual direction
- Near-black technical workspace with restrained gold branding, crisp borders, compact typography, and clear status colors.
- Preserve the information-rich feel of the reference instead of turning it into a marketing page.
- Use subtle scan, pulse, progress, and panel-transition motion with reduced-motion support.

## Technical details
- Replace the placeholder home screen and add page-specific metadata.
- Define semantic colors and layout tokens in the shared stylesheet.
- Use the uploaded logo through the project asset flow.
- Use AI Elements foundations for the chat transcript and composer, styled to match BLACK BUILDER.
- Keep all agent activity and build results as local demo state; no keys, external services, database, or real deployment will be connected in this phase.
- Validate the finished screen at desktop and mobile sizes, including interaction states and text fit.
