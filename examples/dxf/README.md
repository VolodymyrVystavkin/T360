# Reference flange example

Upload **reference-flange.dxf** using **DXF Editor → Import DXF**, then use **Fit**
if needed. This file recreates the visible front-view layout in the supplied
image using editable circles, arcs, lines and linked dimensions.

| Feature | Example geometry | Source / assumption |
|---|---|---|
| Outer diameter | 99.50 ±0.50 mm | Midpoint of visible 99–100 limits |
| Shoulder diameter | 57.10 ±0.50 mm | Midpoint of visible 56.6–57.6 limits |
| Bolt pitch circle | 86.00 mm | Visible Ø86 callout; no tolerance invented |
| Eight bolt holes | Ø8.00 ±0.10 mm | Midpoint of visible Ø7.9–8.1 limits |
| Hole spacing | 45° equally spaced | Visible 8 × 45° callout |
| Center bore and inner rings | Ø20, Ø32, Ø36, Ø39 mm | **Illustrative assumptions**, not readable dimensions |
| Drawing units | Millimeters | **Assumed**, since no unit note appears in the crop |

Outer/shoulder/hole geometry is on `Geometry`. Illustrative inner circles are on
`Reference - assumed`, so the current tolerance-analysis importer excludes them.
Dashed pitch and center lines use editable ARC/LINE segments on `Construction`.
A full analytic pitch circle on hidden `Pitch reference` supplies the Ø86
dimension reference without drawing an extra solid circle. Toggle layers to inspect.

One bolt-hole diameter annotation represents the eight identical holes. Select any
other hole and use **Diameter** or **Auto Dimension** to add its own annotation.
The example copies neither the cropped GD&T frame nor unspecified datum semantics.
It is a reconstructed example, not a manufacturing-authoritative drawing.

The explicit limit-derived dimensions can be inspected in **Analyze Tolerances**.
That page requires an engineering relationship and coefficients; these concentric
features and bolt holes do not automatically constitute a valid 1D stack-up.

Regenerate from the repository root:

```bash
PYTHONPATH=backend .venv/bin/python examples/dxf/generate_reference_flange.py
```

The generator reopens/audits the DXF and validates it through the same parser and
Pydantic sketch schema used by T360 import, checking all eight hole centers/radii,
units, stable entity IDs and linked dimensions.
