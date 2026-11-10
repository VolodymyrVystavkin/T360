# CAD-to-tolerance integration — 2026-11-10

## Inspection and scope

Reviewed root architecture, project plan, ADR and README, native Angular geometry/annotation/editor code, hash workspace navigation, localStorage save/restore, FastAPI DXF worker/models and the existing calculation tests. `AGENTS.md` is empty. The repository had no Pint dependency or server drawing store. The existing symmetric engine uses independent uniform Monte Carlo and reports RSS as a tolerance index; the proposed Gaussian 3σ interpretation in the architecture document is not its implemented statistical model.

## Changes and assumptions

Added local persistent drawing/draft state and a feature table on the existing analysis page. The authoritative input is the native edited snapshot. Added typed extraction/calculation endpoints, source signatures and revision validation, explicit engineering review/relationship approval, Pint length conversion, stable source highlighting and conservative refresh rules. Expanded bounded ezdxf import to straight 2D POLYLINE and supported transformed INSERT geometry. Moved the original engine into a reusable module and extended its bounds to asymmetric inputs without changing symmetric defaults.

Geometry is never assumed to be a manufacturing dimension/tolerance. Overrides retain measured values and require review. Angular dimensions are displayed but rejected in length stacks. Statistical output is opt-in for CAD drafts and uses the existing uniform assumptions. No GD&T or distribution/correlation inference occurs. Browser-local storage is a single-current-drawing workflow, not a multiuser revision repository. See ADR-002 and the workflow guide.

## Verification

The new real ASCII DXF fixture is explicitly synthetic and contains the acceptance Housing/Shaft/Spacer dimensions, other geometry and transformed block content. HTTP import-to-calculation verifies +0.20 mm nominal, [−0.05,+0.45] mm worst-case and the independent-uniform RSS index/Monte Carlo standard deviation. Additional fixtures independently check sign-aware asymmetric bounds and statistical mean/variance. Frontend tests cover unsaved transfer, local persistence, refresh preservation/reset rules, stale/deleted references, source highlighting and engineering approval gates.

The sandboxed FastAPI TestClient stalled in its thread/event-loop bridge; backend tests run successfully outside that sandbox. Dependency deprecation warnings originate in Starlette/ezdxf/pyparsing. No manual real-browser canvas check, external CAD viewer check, container rebuild or deployment was performed for this change.

Final results: full backend suite **81 passed**; final CAD integration subset **32 passed**; frontend **33 passed** across four suites; Angular production build passed; `git diff --check` passed. Automated source-navigation tests validate selection and visibility state, not real-browser canvas pixels.


## Follow-up: automatic relationship

At the user's request, replaced typed relationship entry and routine approval checkboxes with a generated signed formula. Calculate selects all valid specified features if the selection is empty. Missing bounds are never generated; changed sources/text overrides still need review, and statistical assumptions remain explicit. Added frontend coverage for automatic selection, missing tolerance messages and generated signs, plus backend acceptance-fixture coverage without routine manual approval and regression checks for override/stale-source rejection. See ADR-003.

Follow-up verification: **83 backend tests passed**, **35 frontend tests passed**, production build passed, and `git diff --check` passed.

## Follow-up: Geometry layer only

Restricted extraction and calculation sources to the exact `Geometry` layer at the user's request. Linked dimensions must reference only that layer; mixed-layer references are excluded. Cached non-Geometry rows are hidden and excluded from automatic/manual selections. Other editor layers are retained. Added regression tests for layer changes, mixed references and cached selections.
