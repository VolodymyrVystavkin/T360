# Polyline / Arc increment — 2026-11-11

Request: implement connected, closed, orthogonal and numeric polylines plus Arc
creation methods in the existing editor. The supplied request stops at empty
item 8 in the arc list and supplies no screenshot. Implemented the seven named
methods; no additional method was invented.

Inspection: read root AGENTS (empty), architecture, project plan, ADRs and README;
reviewed toolbar, canvas/transforms/snapping, models, properties, layers,
annotations, history, browser persistence and FastAPI/ezdxf schemas/worker/tests.
Arc creation was a disabled UI control, while native/rendered/imported arcs were
already supported. Reused those boundaries and the precision feedback layer.

Changes:

- Separate transient polyline/arc drafts and single-entity history commits.
- Polyline completion/closure, Backspace, cancellation, right-click actions and
  exact absolute/relative/polar coordinates; orthogonal segment tracking.
- Existing numeric vertex movement plus midpoint insertion, open-end extension
  and vertex removal with validation, stable IDs and revision updates.
- Split Arc control, remembered method, seven geometry constructions, numeric
  parameters, explicit direction/chord conventions and shared preview/commit math.
- Additive canonical line-segment records and entity revisions. Python validates
  segment references; DXF retains IDs/revisions via existing XDATA, regenerates
  segments and normalizes explicitly repeated closing vertices. Native invalid
  polylines remain inspectable, while export rejects degenerate segments.
- Updated tool guide, inventory, architecture, ADR-006 and project plan.

Validation:

- `cd frontend && npm test`: **80 passed**, 10 files. Includes analytic quarter
  circles through all seven methods, signed/major/tangent arcs, invalid cases,
  translated coordinates, editor keyboard/context actions, previews, persistence,
  segment editing and undo/redo.
- `cd frontend && npm run build`: passed without budget warnings. New control
  styles use the existing scoped editor-controls stylesheet.
- `timeout 90 .venv/bin/python -m pytest -q` outside the sandbox: **89 passed**, 78
  dependency deprecation warnings, 3.41 seconds. Outside-sandbox execution is used
  because FastAPI TestClient stalled in the sandbox during the preceding phase.
- `git diff --check`: passed.

The first preview unit test exposed jsdom's missing canvas context; mock only
Konva's canvas-fingerprinting probe to inspect real shape coordinates without
claiming raster rendering. A persistence check exposed an unregistered active
layer on direct tool setup; commit now registers the entity's layer explicitly.
Both checks pass. Existing invalid-polyline extraction tests remain intact; strict
degenerate-segment rejection occurs at export rather than blocking inspection.

Limits: no real-browser visual/pointer or external CAD-viewer validation. In-progress
drafts are not persisted. Length denotes chord length; radius mode chooses minor
arcs. Self-intersection/manufacturing profile validation remains a separate engine
concern. No solver, implicit constraints, new kernel or tolerance formulas added.
