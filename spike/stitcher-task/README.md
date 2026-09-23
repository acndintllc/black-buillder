# STITCHER Task Brief

You are the STITCHER agent in an automated app-building swarm. The BUILDER agent has
already extracted two isolated components from two different source repos. Each lives in
its own folder, with its own partial `package.json` listing only the dependencies its code
actually imports. Neither folder is a runnable app on its own.

- `source-a-scanner/ScannerView.tsx` — a barcode-scanner UI component.
- `source-b-result-card/ResultCard.tsx` — a result/receipt-display UI component.

## Your job

Merge the two component folders above into a single, working **Vite + React +
TypeScript** app, built in place at the root of this directory (`spike/stitcher-task/`).

Concretely:

1. Scaffold a standard Vite + React + TypeScript app at the root of this directory
   (`package.json`, `index.html`, `vite.config.ts`, `tsconfig.json`, `src/main.tsx`,
   `src/App.tsx`, etc.).
2. Bring `ScannerView.tsx` and `ResultCard.tsx` into that app's source tree (e.g.
   `src/components/`), adapting imports/paths as needed.
3. Resolve the dependency conflicts between the two source `package.json` fragments into
   **one** coherent root `package.json` — pick a single version for each package that
   satisfies (or reasonably supersedes) both components' needs, and update any import or
   API usage that a version change requires.
4. Wire the two components together in `App.tsx`: `ScannerView`'s `onScan` callback must
   feed its result directly into `ResultCard`'s `result` prop (e.g. via `useState` in
   `App.tsx`), so that clicking "Simulate Scan" causes the on-screen result card to update
   with the scanned item. Both components must render, and they must be connected — not
   just independently mounted side by side.
5. You may leave, move, or delete the `source-a-scanner/` and `source-b-result-card/`
   folders once their contents are incorporated, as long as the final build succeeds from
   the root of this directory. Their `package.json` fragments are references for what each
   component needs, not files that need to remain in the final tree.

Do not add features, screens, or dependencies beyond what is needed to satisfy the above.

## Success criteria

A run is graded pass/fail against exactly these four criteria — no others:

- **(a) Build succeeds.** Running `npm install && npm run build` from the root of this
  directory completes with exit code 0 and zero build errors.
- **(b) Both components render in `App.tsx`.** `App.tsx` imports and renders both
  `ScannerView` and `ResultCard` (directly or through a shallow wrapper it owns).
- **(c) The callback wiring actually works.** The data `ScannerView` passes to `onScan`
  must actually flow into the `result` prop `ResultCard` receives — e.g. via shared state
  in `App.tsx` — so that a scan visibly updates the rendered result card. Two components
  that render independently without being connected does **not** satisfy this criterion.
- **(d) No leftover duplicate/conflicting dependency versions.** The final root
  `package.json` lists exactly one version (or range) for each package — no duplicate
  entries, no two components silently depending on incompatible versions of the same
  library left unresolved.

These four criteria are the entire scope of this task. Do not optimize, restyle, test, or
extend beyond what is required to satisfy them.
