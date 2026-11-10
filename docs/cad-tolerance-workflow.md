# CAD geometry to tolerance analysis

Import or edit a drawing in **2D DXF editor**, then click **Analyze Tolerances**. The current native geometry and synchronized annotations are sent to the API, including unsaved edits. The existing **Tolerance analysis** page gains **Imported CAD Features** above its existing manual stack. These are separate input workflows using the same Python engine.

Select the appropriate measurement rows, give them component names, enter missing upper/lower tolerance magnitudes and set signed coefficients. The program builds the relationship automatically from those rows: `+1` adds a measurement and `−1` subtracts it. No typed formula or routine specification/relationship approval checkbox is required. Clicking **Calculate tolerances** submits the displayed signed combination. If nothing is selected, it selects all valid, nonremoved length features with both tolerance bounds supplied; unselected features with missing tolerances are excluded. **Select all features with tolerances** makes that selection visible before calculation. This is a sum of measurements, not automatic inference of assembly contacts, gaps or coefficient signs from CAD geometry. Multiple dimensions of the same geometry may represent different measurements; choose the intended rows to avoid counting alternatives together.

A deliberately selected row with missing/invalid bounds blocks calculation and is named in the error. Changed source measurements and drawing text overrides still require the conditional review checkbox; stale drawing revisions still require refresh.
Click **Calculate tolerances** for worst-case bounds. To also run Monte Carlo and RSS, explicitly accept independent uniform deviations within the entered bounds. RSS is a tolerance index, centered on the uniform mean for asymmetric tolerances, not a Gaussian confidence interval. No distribution or correlation is inferred. The existing seeded NumPy engine is reused. Export includes input feature mapping, tolerances, coefficients, source references, drawing ID/revision, assumptions and full results.

Only entities whose layer is exactly **Geometry** contribute tolerance features. Other layers remain editable in the DXF Editor but are excluded from analysis. Linked dimensions on the annotation layer are included only when every referenced entity belongs to Geometry. Moving a figure to another layer removes its analysis source on refresh and blocks calculations using its old reference. Previously cached non-Geometry rows are hidden and excluded from selection/calculation.

## Supported measurements

| Native / DXF source | Measurements |
|---|---|
| LINE | Endpoint distance |
| CIRCLE | Radius and diameter, offered as separate measurement choices |
| ARC | Radius; zero-sweep arcs are flagged as ambiguous |
| LWPOLYLINE and 2D POLYLINE | Straight path length; closed perimeter and axis-aligned bounding width/height |
| INSERT | Recursively flattened supported XY geometry with ezdxf transforms, inherited layers and stable insert/child handle paths |
| DIMENSION | Linked horizontal, vertical, aligned, radius, diameter and two-line angular annotations |

Polyline analysis checks degeneracy and crossings with a bounded pairwise check (up to 500 vertices). Larger or invalid polylines are flagged and excluded from stacks. Bounding width/height are measurements, not a recognition of a rectangle or an assembly constraint. Angular dimensions remain visible but cannot enter the signed 1D length stack.

Blocks are flattened into editable native geometry. Arrays, nesting beyond eight levels, non-XY geometry, nonuniformly transformed circles/arcs that become ellipses, bulges, widths and block dimension associativity are unsupported and reported. The bounded DXF worker limits expanded entities and processing time. Unsupported source content is not preserved on export; retain the original DXF.

## Dimensions and tolerances

Geometry measurements start with **missing** tolerances. Neither a circle nor an auto-generated dimension supplies a manufacturing specification. Supported annotations carry their explicit asymmetric tolerances and source IDs. External DXF dimension reference/style validation continues to use the annotation importer; ambiguous definitions are reported and excluded. The `ASME Y14.5` layer is an application convention, not proof of standards compliance.

Displayed text overrides are preserved separately from independently recomputed nominal values. Any override requires review, even if its text appears numerically consistent. Override text is never parsed into an authoritative nominal or tolerance. Invalid/missing annotation references are flagged or reported. No GD&T, datums, surface finish, correlations or manufacturing specifications are inferred.

## Persistence, units and revisions

`CadDraftService` is application-wide and persists the working sketch and analysis draft in browser localStorage, alongside the existing explicit Save/Restore slot. Workspace navigation captures unsaved changes; page unload also attempts to capture them. Analysis selections, names, tolerance edits, relationship and results survive navigation/reload. Storage failure is shown in the UI. This remains a **single-browser, single-current-drawing** workflow; it is not a server database, multiuser project store, revision archive or cross-tab synchronization system.

Drawings have stable IDs and monotonically advanced snapshot revisions when captured content changes. Geometry, annotations and source handles remain in the native snapshot. Undo/redo restores geometry but the next capture advances from the latest revision. A different drawing cannot reuse the previous drawing's mapping; the displayed relationship always follows the current selected rows. Reimporting a DXF creates a new drawing identity; use the current editor drawing to refresh its analysis.

Opening an older browser save of the same drawing still creates a new captured revision. **Refresh from current drawing** re-extracts measurements, deduplicates by stable feature ID, retains unchanged user fields and flags deleted sources. Changed geometry clears feature review and requires confirmation for affected rows before calculation. User tolerance values survive a nominal change only when identity, measurement type, source units and explicit drawing specification remain valid. Unit/type/reference/specification changes reset them to the newly extracted values or missing. Removed rows remain analysis-only; restoring them never changes geometry.

The source buttons reopen the current drawing, reveal relevant layers and select its original geometry/annotation. Missing sources or a different current drawing produce an error instead of highlighting unrelated geometry. A source edited in the current drawing shows its current geometry; the stale draft must be refreshed before calculation.

Supported length units are mm, cm, m, in and ft. Pint validates conversion to selected result units. Unspecified units block calculations until assigned explicitly in the editor. Editor assignment retains coordinate numbers and may change physical size; it is not pixel conversion. Mixed angular/length stacks and incompatible units are rejected. Converted values must still meet the engine's numeric limits.

## API and verification

- `POST /api/v1/analysis/import-drawing`: validated native `Sketch` -> typed measured features and warnings.
- `POST /api/v1/analysis/calculate`: current native snapshot + draft revision + validated feature mappings + automatic signed relationship -> typed result and source trace.

Draft get/update operations use the existing browser persistence mechanism; no server draft endpoints or database were added. FastAPI remains stateless. Every calculation re-extracts the current request snapshot and checks source signatures, revision, units, valid geometry, explicit tolerance bounds and mapping validation. The automatic mode derives its relationship on the server from validated term names and coefficients, rather than trusting the submitted descriptive formula. The legacy manual API mode retains its explicit approval requirements. The server cannot discover a newer drawing on another device or verify an engineer's physical assembly intent. Structured engineering errors use HTTP 422 with `detail.code` and `detail.message`; Pydantic schema errors use the existing validation detail array.

`tests/fixtures/cad-clearance.dxf` is an actual ASCII DXF containing **synthetic acceptance dimensions**: Housing +20.00 ±0.12 mm, Shaft −10.00 ±0.05 mm, Spacer −9.80 ±0.08 mm, plus independent circle, arc, profile and block geometry. It is deliberately constructed for this test, not dimensions extracted from an unrelated production drawing. End-to-end tests import the file through the HTTP API and verify nominal +0.20 mm, worst-case [−0.05, +0.45] mm and RSS index √(0.12²+0.05²+0.08²) ≈0.15395 mm under the documented independent uniform model (standard deviation RSS/√3).

Run `.venv/bin/python -m pytest -q`, `cd frontend && npm test` and `npm run build`. Automated tests cover API validation, fixture measurements, units, bounds, stable IDs/revisions, overrides, missing specifications, transforms, refresh and navigation/highlighting state. Real-browser canvas interaction and independent CAD viewer validation remain manual checks.
