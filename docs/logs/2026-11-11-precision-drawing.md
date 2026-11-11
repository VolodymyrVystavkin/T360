# Precision drawing increment — 2026-11-11

Request: audit the existing T360 editor and incrementally develop a professional
parametric 2D sketch workflow while preserving existing features. Supplied text
ends mid-sentence in solver section 10. No external reference implementations,
proprietary assets or additional dependencies were used.

Read the root project documents (`AGENTS.md` is empty). Inspected Angular hash
navigation, native models, coordinate transforms, Konva rendering, snapshot
history, layers/annotations, browser persistence, DXF schemas/worker and tolerance
extraction/calculation. Recorded reusable components, gaps, risks and staged
acceptance criteria in `docs/parametric-sketch-plan.md`.

Implemented exact endpoint/midpoint/center/quadrant/nearest/grid capture with
screen-pixel tolerance, deterministic priority, hidden-layer exclusion and
optional orthogonal lines. Added a non-listening Konva feedback layer with snap
labels and line/rectangle/circle previews. Preserved native formats and APIs.
Updated ADR-005, architecture, project plan and README with explicit scope limits.

Verification:

- `cd frontend && npm test`: 61 tests passed across 8 files. New numeric tests
  cover zoom-invariant capture, priority, closed-polyline closing edges,
  projection, wrapped arcs, invalid transforms and fractional orthogonal points.
  Editor tests cover hidden layers, disabling snaps, snapped coordinates,
  orthogonal commit, stable IDs through undo/redo and Escape cancellation.
- `cd frontend && npm run build`: production build passed.
- `.venv/bin/python -m pytest -q`: initial sandbox run stalled after three tests;
  focused sandbox run also timed out at 30 seconds. Interrupted the initial run.
  Retried the full suite outside the sandbox with a 90-second process limit:
  **86 passed**, 62 existing dependency deprecation warnings, 2.53 seconds.
- An initial `npm test -- --run` invocation was rejected by Angular CLI; corrected
  to the repository's `npm test` command.

Assumptions/limits: snap priority is fixed and documented; grid display and
one-unit grid capture are independent. Orthogonal lines reject off-axis captures.
Snaps introduce no constraints. Search is linear in entity count and has not been
benchmarked on maximum-size drawings. No real-browser visual/pointer tests or
external CAD-viewer checks were performed. The constraint solver and remaining
geometry/editing tools are explicitly pending in the delivery plan.
