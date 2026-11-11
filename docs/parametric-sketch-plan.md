# Parametric sketch implementation inventory and delivery gates

Audited 2026-11-11 against the supplied professional 2D sketch-editor request.
The attachment ends at section 10 with “- Do”; later solver requirements and any
subsequent sections were not supplied. This document records the visible scope.
`AGENTS.md` exists but is empty. Read architecture, project plan, ADRs and README
before implementation. This is an additive CAD track authorized by the current
request, not a declaration that the eight-week assignment is complete.

## Inventory

| Capability | Evidence and current behavior | Status / reuse |
|---|---|---|
| Application routes | `frontend/src/app/app.ts`: hash navigation, DXF, tolerance, dashboard, settings | Implemented; retain routes and shared draft service |
| Rendering | `dxf/editor.ts`, `dimension-renderer.ts`: Konva geometry and annotation layers | Implemented; retain renderer |
| Coordinates | `world`, `screen`, `zoomBy`, wheel/drag handlers: model XY with screen Y inversion | Implemented; measurements use native coordinates |
| Basic tools | `click`: two-click lines, center/radius circles, four-vertex closed polyline rectangles, measurement | Now includes multi-vertex polyline and seven arc creation methods; see `polyline-arc-tools.md` |
| Selection | `click`, `inspectEntity`, `selectionIds`: single/Shift selection and explorer | Partial: no box/crossing, clipboard or select-all; existing delete removes only primary selection |
| Editing | Numeric coordinates, radius, angles, layer in `property` | Partial: no move/rotate/scale/mirror/trim/extend/offset/split/join/fillet/chamfer commands |
| Native model | `dxf/model.ts`, `backend/app/dxf/models.py`: stable entity IDs, drawing ID, revision, units, four geometry kinds, annotations/layers | Partial: flat entity type union with additive entity revisions and typed polyline segment records; no constraint collection, sketch ID, solver/geometry validation report or construction flag |
| Layers | Explicit layers and hidden layers, separate reserved annotation layer | Implemented subset; hidden geometry excluded from new snap search |
| Snapping before this phase | `world`: unconditional nearest-integer rounding | Grid-only; no geometric capture or pixel tolerance |
| Precision interaction after this phase | `snapping.ts`, editor overlay and controls | Endpoint/midpoint/center/quadrant/nearest/grid, 8 px default tolerance, fixed documented priority, indicators, previews and orthogonal lines implemented |
| Annotation dimensions | `annotations.ts`, `dimensions.py`, `models.py`, annotation tests | Linked reference dimensions and explicit tolerances implemented; text overrides never drive geometry |
| Constraints / solver | No current sketch constraint models, residual equations, rank diagnostics or solve endpoint; no SciPy runtime dependency | Missing; do not label sketches constrained |
| DXF | `dxf/service.py`, `api.py`, backend DXF tests | ezdxf LINE/CIRCLE/ARC/straight LWPOLYLINE/2D POLYLINE; supported INSERT transforms flattened, selected DIMENSION types; warnings for omitted content |
| DXF IDs | T360 XDATA stores supported entity/annotation IDs | Implemented supported subset; external tools can remove metadata; drawing/sketch revision identity is not fully round-tripped |
| Undo/redo | JSON sketch checkpoints, 100 snapshots | Implemented for existing commands; future constraints must be included atomically |
| Persistence | `CadDraftService`, editor save/restore | Browser snapshots and revision capture implemented; server project storage/concurrency missing |
| Geometry validation | Pydantic bounds, radii and point counts; `cad_analysis.valid_polyline` checks profile geometry during extraction | Partial: not a universal pre-commit validator; zero-length lines/degenerate rectangles remain architectural risks |
| Tolerance analysis | `cad_analysis.py`, `tolerance.py`, `CadFeatures`, draft tests | Reusable deterministic engine, Pint conversion, stale-source checks, asymmetric worst case, seeded independent uniform MC and documented RSS index |
| Tests | `tests/backend`, frontend specs | Numeric/API/import/export/reference dimension/draft coverage; new snapping and editor integration tests; real-browser pointer/visual checks still needed |
| 3D / AI | Disabled navigation; architecture proposals only | Missing, outside this 2D increment; preserve separate future boundaries |

## Architecture risks and decisions

Keep native coordinates authoritative. Snapping is an interaction choice, not a
geometric constraint. It must never alter existing geometry, measurements, IDs,
or manufacturing tolerances. Current snapping searches visible entities in O(N)
per pointer event; add a measured spatial-index optimization before introducing
quadratic pairwise intersection searches on large drawings.

Retain Konva, FastAPI, Pydantic and ezdxf. A non-listening Konva interaction layer
draws live feedback without rebuilding geometry or running annotation
synchronization on every pointer movement. No kernel dependency is needed for
these operations. The displayed adaptive grid and optional one-unit snap grid
remain separate settings, explicitly labeled.

The existing flat entity model is used by rendering, annotation measurements,
DXF conversion and tolerance extraction. Expanding its type enum alone would
make existing fall-through branches treat new entities as polylines. Introduce
a versioned, discriminated schema with exhaustive adapters and migrations before
accepting additional entity kinds. Do not add unused solver-status fields that
suggest calculations occurred.

Future solver application must be transactional: clone input, validate entity
and sub-element references, solve with bounded numerical work, evaluate scaled
residuals and rank, validate resulting geometry and linked annotations, then
commit a single undoable command. Failure must return diagnostics and preserve
the original sketch. Never remove constraints automatically. Editing a driving
dimension must invoke this path rather than editing annotation text.

## Incremental delivery gates

1. **Audit and precision drawing — implemented bounded increment.** This inventory,
   geometry snaps, pixel capture tolerance, visible candidate, line/rectangle/circle
   preview and optional orthogonal lines. Automated numeric and editor tests.
   Intersection/perpendicular/tangent snapping, polar tracking, configurable
   priority and individual snap-kind UI controls remain pending.
2. **Native schema and validation.** Versioned discriminated TypeScript/Pydantic
   entity types, sketch identity, construction geometry and explicit constraint
   references; migration and round-trip tests. Validate existing four kinds before
   enabling new ones. Construction must have explicit DXF inclusion policy and be
   excluded from manufacturing profiles by default.
3. **Constraint vertical slice.** Bounded deterministic numerical backend solver,
   horizontal/vertical/fixed/coincident and driving line length/circle diameter;
   reference dimensions remain separate. Tests for 20→30 diameter producing radius
   15, failed-solve rollback, degrees of freedom and inconsistent constraints.
   Select and justify solver/dependency versions at implementation time.
4. **Safe selection and editing.** Command transactions, complete multi-delete,
   box/crossing selection, clipboard and transforms; constraint conflict diagnostics
   with explicit controlled resolution, joint geometry/annotation/constraint undo.
5. **Drawing breadth.** Continuous line/polyline and coordinate/numeric input, arcs,
   ellipses/elliptical arcs, points, polygons, slots and splines, each with preview,
   validation, persistence and an explicit DXF support contract.
6. **Geometric operations and solver breadth.** Trim/extend/offset/split/join/break,
   fillet/chamfer, remaining geometric/dimensional constraints, intersection,
   perpendicular/tangent snaps and tracking. Independent geometry fixtures and
   bounded performance checks are required for each operation.
7. **Product verification.** Native/DXF migration fixtures, end-to-end browser
   interaction, revision/conflict handling, large-drawing performance and updated
   capability matrix. No claim of professional parity until these gates pass.

## Current interaction contract

Choose Line, Rectangle, Circle or Measure. Hover near visible geometry to see a
capture marker and its kind. Priority is endpoint → midpoint → center → quadrant
→ nearest → grid; proximity breaks ties within each kind. Adjust capture distance
in screen pixels. Disable grid snaps to retain arbitrary model coordinates, or
disable all snapping. Grid display is independent. Snaps do not create constraints.

Click the first point, move to preview, then click to commit. Orthogonal mode
applies only to lines, choosing the axis with greater cursor displacement; it takes
precedence over off-axis candidates and preserves fractional starting coordinates.
Escape cancels the pending geometry and returns to selection. Arc candidates
respect the counterclockwise sweep, including wraps through zero. A zero-sweep arc
currently follows the renderer's full-circle convention; the analysis extractor
separately flags that ambiguity. No new arc creation semantics are introduced.

Numeric input during placement and relative coordinates are now available for
Polyline/Arc point stages (see `polyline-arc-tools.md`); continuous Line creation
remains pending. Existing numeric property editing is preserved. No real-browser
visual verification or external CAD viewer comparison was performed in this phase.
