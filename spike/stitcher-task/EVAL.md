# Phase 1 Spike — Scoring Rubric

Compares two candidate coding-agent harnesses (**OpenHands** vs **Claude Agent
SDK / Claude Code**) on the identical STITCHER task defined in `README.md`, run against
identical, independent copies of this fixture. Score each harness's output against the
four success criteria from `README.md`. All four must PASS for the run to count as an
overall pass — this is not a partial-credit average.

## How to score

For each harness, run `npm install && npm run build` from the root of that harness's copy
of the output repo, inspect `src/App.tsx` and the final `package.json`, and record one of
**PASS / FAIL / NEEDS REVISION** per criterion, with a one-line note citing the concrete
evidence (error text, file/line, dependency name).

| # | Criterion | OpenHands | Claude Agent SDK / Claude Code |
|---|-----------|-----------|-------------------------------|
| a | Build succeeds — `npm install && npm run build` exits 0, zero errors | ☐ PASS ☐ FAIL — notes: | ☐ PASS ☐ FAIL — notes: |
| b | Both components render in `App.tsx` | ☐ PASS ☐ FAIL — notes: | ☐ PASS ☐ FAIL — notes: |
| c | Callback wiring works — `onScan` data actually flows into `ResultCard`'s `result` prop (not just both components mounted, unwired) | ☐ PASS ☐ FAIL — notes: | ☐ PASS ☐ FAIL — notes: |
| d | No leftover duplicate/conflicting dependency versions in final `package.json` | ☐ PASS ☐ FAIL — notes: | ☐ PASS ☐ FAIL — notes: |
| | **Overall (all 4 must PASS)** | ☐ PASS ☐ FAIL | ☐ PASS ☐ FAIL |

## Neutral run log

Record objectively, without editorializing — this section feeds the winner decision below,
it doesn't argue for one.

| Metric | OpenHands | Claude Agent SDK / Claude Code |
|---|---|---|
| Wall-clock time (task start → final build attempt) | | |
| Number of build attempts before success (or "did not succeed") | | |
| Manual intervention required? (Y/N — if Y, describe exactly what a human had to do) | | |
| Unauthorized additions beyond the spec (extra deps, files, features not requested) | | |
| Final chosen version — `lucide-react` | | |
| Final chosen version — `clsx` | | |

## Verdict

- **Winner:** _(fill in only after both rows above are fully scored — do not decide from
  partial data)_
- **Rationale:** _(one or two sentences, citing the specific criteria/metrics above — not
  a general impression)_
- **Caveats / anything that makes this comparison less than apples-to-apples:** _(e.g. one
  harness needed a retry due to an environment issue unrelated to task competence)_
