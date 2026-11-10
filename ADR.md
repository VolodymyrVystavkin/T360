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
