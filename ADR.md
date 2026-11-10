# Architecture Decision Records

## ADR-001 — Geometry-linked drawing annotations

**Date:** 2026-11-10
**Status:** Implemented for the explicitly requested annotation feature; no standards certification implied.

### Context

The existing Angular/Konva editor stores editable geometry independently of ezdxf interchange. Its layers were inferred from entities and its browser saves contain schema-version-1 sketches. Automatic annotations must not create geometry or act as constraints, and old sketches must remain readable.

### Decision

Extend the native sketch additively with `annotations`, explicit `layers`, and `hidden_layers`. Initialize and deduplicate `Geometry` and `ASME Y14.5` on new/imported/restored sketches. Reserve the latter for annotations and disclose that its name is not certification. Legacy sketches migrate with empty annotations and default layers; schema version remains 1 because these are additive fields with defaults.

Keep deterministic TypeScript measurement and placement in `frontend/src/app/dxf/annotations.ts`, data types in `model.ts`, and Konva presentation in `dimension-renderer.ts`. Annotations reference stable geometry IDs. Their measured values, units, validity and source signatures update in one direction from geometry. Annotation edits never write geometry. Joint geometry/annotation snapshots support undo/redo and browser persistence. Geometry deletion flags orphan dimensions, and DXF export rejects orphan or invalid annotations.

Use Python/Pydantic validation and independent Python calculations in `backend/app/dxf/models.py` to check reference types, units and measured values before export. Keep the existing import/export endpoints and bounded worker; no new service or infrastructure is needed.

Use standard DXF DIMENSION types 0 (linear), 1 (aligned), 2 (two-line angular), 3 (diameter) and 4 (radius), with ezdxf-generated anonymous graphical blocks. ezdxf's aligned helper renders a rotated linear block; after rendering, write the aligned subtype while retaining its definition points and block. Tests check actual DIMENSION measurements and reopen/audit the DXF. T360 XDATA stores native IDs and annotation metadata for lossless supported T360 round trips. Treat XDATA as untrusted input and validate it against geometry. External dimensions are restored only when their definitions unambiguously match supported model-space geometry and their effective style uses supported units/scales. Report other cases.

### Consequences and limits

Manual text overrides remain distinct from nominal values, are visibly marked, and retain the measured value in both canvas and exported dimension text. Tolerances are explicit user input. No GD&T, datum, surface finish, or tolerance can be inferred from shape.

Placement tries eight deterministic offsets outside geometry and reports conservative label-box collisions. It is not a complete drafting layout solver; leader/extension-line overlaps still require review. Manual label positions survive geometry updates; automatic positions may be recalculated. Canvas text/arrow sizes clamp to readable pixel ranges while model measurements remain unchanged.

Units are explicitly reassigned without coordinate conversion; UI wording discloses the resulting possible physical-size change. Browser storage remains a single local sketch, not server revision persistence. Dimensions in arbitrary styles, paper space, blocks, unmatched external definitions and 3D planes remain unsupported with warnings. External CAD tools may strip XDATA, losing T360 associativity. Browser visual and independent CAD viewer checks are not verified by the automated tests.

Future annotation variants can extend the typed annotation collection and renderer/export dispatch with explicit datum, feature-control-frame and surface-texture schemas, without changing geometry types or automatically assigning design requirements.

## ADR-002 — Browser-persisted CAD analysis drafts and validated source mapping

**Date:** 2026-11-10
**Status:** Implemented for the requested DXF-to-analysis workflow.

### Context and decision

Both existing workspaces run without a project database. Reuse browser persistence through an application-scoped Angular service rather than introducing a server draft repository. Persist the current native drawing (including unsaved edits), revision, feature mapping, user specifications, approvals and result. Backend extraction/calculation endpoints remain stateless and accept the current snapshot. Existing hash navigation remains in place and browser back/forward updates the workspace.

Add normalized measurement records referencing existing entities/annotations, keeping geometry separate from engineering meaning. Require explicit tolerance bounds, per-feature review and approval of a descriptive signed 1D relationship. Selected rows and coefficients are the executable relationship. Preserve source geometry signatures and drawing revisions; recalculate measurements on refresh, retain user tolerances only for unchanged feature meaning, and clear approvals on changed sources. Never infer specifications from geometry or dimension text overrides.

Move the existing pure calculation engine to `app/tolerance.py` for reuse by both API routes. Extend it with sign-aware asymmetric bounds and an opt-out of statistical calculations. Preserve legacy symmetric behavior. Use Pint at the CAD integration boundary. The CAD workflow requires explicit independent uniform assumptions for Monte Carlo/RSS; RSS retains the documented tolerance-index meaning, with no Gaussian confidence claim.

### Consequences

No draft database, server GET/PATCH draft routes, multiuser concurrency or revision archive is claimed. LocalStorage has capacity/privacy and single-browser limits; users can export source traces and retain original CAD. A backend can validate a submitted snapshot but cannot discover newer external revisions. Unsupported/ambiguous DXF sources are reported; block geometry is flattened, not preserved as editable block semantics. Angular dimensions are reviewable but excluded from 1D length analysis. See the [workflow guide](docs/cad-tolerance-workflow.md) for supported entities, dimensions, units and verification.


## ADR-003 — Automatically generate the signed relationship

**Date:** 2026-11-10
**Status:** Implemented at the user's explicit request; supersedes ADR-002's routine manual formula and approval interaction.

The CAD UI builds a descriptive relationship from selected measurements and signed coefficients, and the server independently generates the same relationship from validated terms in `automatic_relationship` mode. Clicking Calculate submits that combination without a typed formula or routine approval checkboxes. When no rows are selected, the UI selects all valid nonremoved length rows with both tolerance bounds; it never supplies missing tolerances. All coefficients retain their displayed values (new rows default to +1); assembly topology and subtraction signs are not inferred from geometry. The UI explains these semantics and offers an explicit select-all-specified action.

Source revisions/signatures, finite bounds, supported units and geometry remain validated. Changed sources and dimension text overrides still require conditional review. Statistical assumptions remain explicitly opt-in. Existing manual API clients retain the original approval requirements by omitting `automatic_relationship` or setting it false.

## ADR-004 — Original token-based T360 presentation system

**Date:** 2026-11-10
**Status:** Implemented for the explicitly requested UI redesign.

Use semantic CSS variables, the existing Angular Material library, local SVG icons and standalone shell/state components. Preserve the existing engineering components/services instead of replacing the editor or calculation workflows. A light indigo application shell surrounds a dark technical canvas. Adobe Express is a high-level quality reference; no branding, proprietary assets or exact interface layouts are copied.

Keep display preferences in their own browser storage key. Only implemented routes are enabled; Dashboard and Settings are real local pages, while future 3D/AI workspaces are visibly disabled. CSS presentation tokens reach Konva through a read-only adapter. Geometry models, serialized annotation styles, units, IDs, backend routes and calculation formulas remain untouched. Explicit engineering warning and statistical-assumption behavior is preserved. Contrast-aware secondary text/control tokens refine the proposed palette, and reduced motion follows both system and user preferences. See the [design guide](docs/ui-design-system.md).
