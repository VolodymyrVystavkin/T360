# Engineering drawing annotations

This feature implements a documented drafting subset inspired by common ASME drawing conventions. `ASME Y14.5` is the exact name of its dedicated layer. It does **not** imply full or certified ASME Y14.5 compliance. No copyrighted standards text or tables are included.

## Use the tools

1. Open the DXF editor (`/#dxf`), load the mounting-plate example or import/draw supported geometry, and choose explicit drawing units.
2. Click **Auto Dimension · All** for the whole drawing. Circles get diameters, arcs get radii, lines get horizontal/vertical/aligned lengths, and closed polylines get overall bounding width/height. Isolated axis-aligned four-line rectangles receive two overall dimensions instead of four edge dimensions. A closed nonrectangular profile is not assumed to be a rectangle.
3. To dimension only selected geometry, use Select, Shift-click additional entities, then **Auto · Selected**. Repeated generation retains existing annotation IDs, explicit radius choices and manual adjustments; it does not duplicate dimensions of the same type/reference set. It adds only missing supported dimensions and skips degenerate projections.
4. Use **Dimension**, **Diameter**, or **Radius**, then click geometry for manual annotations. Dimension selects a suitable projection; select the resulting annotation and change its type for horizontal, vertical or aligned alternatives. Diameter and Radius explicitly permit both on one circle if desired. Arcs support radius only.
5. Use **Angular Dimension**, then click two lines. This measures the non-reflex angle between their directed start-to-end vectors (0–180 degrees). Parallel, antiparallel, coincident and zero-length lines are rejected; the initial subset does not dimension their 0/180-degree cases. Angular dimensions can use the intersection of extended lines.
6. Return to Select, click a dimension, and inspect its actual measured value, units, source IDs, creation mode, revision, placement and warnings. Drag its graphics/label, or edit label X/Y numerically. **Reset automatic placement** retries the initial placement algorithm. Dimension properties include precision, text height, arrow size, offset, color, units, optional plus/minus tolerance and an explicit text override. **Annotation Settings** supplies defaults for new annotations.
7. Toggle `ASME Y14.5` in Layers to hide/show dimensions independently of geometry. The reserved layer cannot be used to draw geometry. Delete an annotation to remove just the annotation. Delete referenced geometry to leave a visibly flagged orphan; resolve/undo or delete that annotation before DXF export.
8. **Save** and **Restore** retain one native sketch in this browser, including annotations, layers, visibility, tolerances, overrides and manual positions. Undo/redo operates on joint geometry/annotation snapshots. Older browser saves receive the mandatory layers without duplication.

## Measurements, formatting and layout

Nominal values come from model-space geometry: diameter = 2 × radius; line lengths use coordinate projections or Euclidean distance; profile dimensions use axis-aligned bounds; angles use direction-vector cross/dot products. Zoom and pan never change nominal values. Geometry edits recalculate related annotations with stable IDs. Automatic positions may move; manually adjusted positions remain fixed where possible.

Coordinates and measured dimensions are independent of label formatting. Precision is 0–8 decimal places. Text height, arrow size and offset are positive model-unit values; canvas text and arrows clamp to readable pixel ranges when zoomed. Optional tolerance plus/minus magnitudes must be nonnegative and are user-supplied; they do not change nominal geometry or create constraints. Text overrides are visibly marked and show the authoritative measured value in brackets. No override silently substitutes a measured value.

**Reassign drawing units** deliberately preserves coordinate values and may change physical size. It does not perform unit conversion. Annotation unit labels update explicitly with that operation; angular units remain degrees. Unspecified units block DXF export.

Placement tries eight increasing offsets outside entity bounds, preferring below/right for overall dimensions and outward leaders for round geometry. Conservative bounding boxes detect unresolved label overlaps with geometry or other labels, including manual placement. This is approximate: leader/extension-line overlap, actual glyph extents under pixel clamping, dense drawings and sophisticated drafting layout need human review. Reposition annotations manually as needed.

## Native state and DXF

Geometry and annotations are separate collections. The additive schema-version-1 fields are `annotations`, `layers`, and `hidden_layers`. Each annotation has an ID, type, reference IDs, `ASME Y14.5` layer, measured value and units, precision/style, placement/manual/collision data, automatic/manual creation mode, optional tolerance and text override, validity status, source signature, revision and update timestamp. The TypeScript discriminated type and Python validated schemas allow future explicitly entered symbols without adding drawing geometry.

The existing raw-file import and JSON-to-DXF export endpoints remain unchanged. Python independently checks geometry/reference compatibility, actual nominal values, units, finite limits, styles and explicit tolerances before exporting. Flagged annotations cannot be exported as valid dimensions. The bounded worker retains its limits; supported annotations are limited to 2,000 per sketch.

Export writes standard `DIMENSION` entities on `ASME Y14.5`: linear type 0, aligned type 1, two-line angular type 2, diameter type 3 and radius type 4. ezdxf renders required anonymous geometry blocks. These are proper dimensions, not text-only or additional native geometry. Nominal values remain geometry-derived even when explicit tolerance/override text is present.

T360 XDATA carries native geometry IDs and annotation metadata. A supported T360 DXF export/import preserves IDs, linkage, style, placement, precision, tolerance and overrides. Import treats metadata as untrusted and checks consistency. External CAD tools may remove XDATA, so native associativity is not guaranteed through arbitrary third-party editing.

Without T360 metadata, import recovers supported 2D dimensions only when their definition points unambiguously match supported geometry (line endpoints or round-entity center/radius; two matching lines for angles). Arbitrary external overall-profile definitions, unmatched/ambiguous references, projected oblique dimensions, alternate units, non-unit measurement scales, unsupported angular units, rounding and advanced styles are reported as unsupported. Appearance is normalized to the supported subset rather than promising exact style fidelity. Source geometry on the reserved annotation layer is moved to Geometry with a warning.

## Limits and verification

Datum feature symbols, feature-control frames, GD&T, surface texture, hole/thread callouts, automatic tolerance assignment, advanced angular types, dimension constraints and full standards checking are not implemented. Future types must use explicit design inputs, not geometric guesses. Browser persistence is not server project/revision storage.

Automated tests cover analytic geometry fixtures, automatic layer migration/deduplication, duplicate prevention, synchronization, orphan detection, placement flags, manual properties, tolerances, unit reassignment, selection tools, visibility, save/restore, undo/redo, backend consistency rejection and actual DIMENSION round trips. Exported files are reopened and audited with ezdxf, and their DIMENSION measurements are compared to independent expected numeric values. Browser visual checks and an independent CAD viewer have not been run in this environment.
