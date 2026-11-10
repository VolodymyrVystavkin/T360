# T360 interface redesign — 2026-11-10

Inspected the root guidance, architecture/plan/ADR/README, Angular component structure, Material controls, global/component styling, hash navigation, native editor/annotations, browser persistence and tolerance UI. `AGENTS.md` is empty. Reused the existing engineering component boundaries and APIs.

Implemented semantic tokens, consistent Material/system typography, shared icons/states/controls, an original light application shell/navigation, real Dashboard/Settings pages and disabled future workspaces. Restyled CAD tools/layers/properties/canvas/status and both tolerance workflows. Added responsive panel controls and display-only preferences. No backend, tolerance formula, unit-conversion, model-schema or interchange changes were made.

The proposed secondary text token narrowly failed AA on the proposed app background; a slightly darker token and stronger input outlines address that. Screenshot inspection caught and corrected missing-font fallback in Material controls and canvas height overflowing the workspace. Console/viewport checks cover desktop/laptop/tablet and collapsible panels. Existing editing workflows remain reversible through undo/redo; no new permission/confirmation flow is introduced.

See `docs/ui-design-system.md` for component responsibilities, design choices, engineering boundaries and limits. Final verification:

- Angular/Vitest: **47 tests passed**, including new display/navigation/geometry-preservation regressions.
- Python regression suite: **86 tests passed**; no backend files changed.
- Angular production build: passed within the existing bundle/style budgets, without warnings.
- Headless Chrome: desktop 1440×1080, laptop 1024×900 and tablet 768×1024; screenshot inspection and viewport checks found no page-wide horizontal overflow. Collapsing both inspectors expanded the desktop canvas from 795 px to 1295 px.
- Browser interaction flow: actual fixture file selection, numeric radius edit/undo/redo, layer visibility, DXF export, editor-to-analysis transfer, signed coefficient inputs, statistical opt-in, CAD calculation/report export and manual calculation. The browser test bridge used the existing FastAPI TestClient/endpoints and bounded DXF worker. All five exercised API routes returned HTTP 200.
- CAD acceptance output remained nominal +0.20 mm, worst-case [−0.05,+0.45] mm; manual default remained nominal 0.50, worst-case half-width 0.35. Exported DXF reopened with zero ezdxf audit errors and three DIMENSION entities. Exported JSON retained three source terms and drawing revision 1.
- No browser JavaScript exceptions or console error entries during the final flow.
- `git diff --check`: passed.

Screenshots and synthetic browser-download artifacts were captured under `/tmp/t360-ui-checks`. The final status area is directly below the canvas, with interchange warnings displayed below it rather than hidden inside a collapsed inspector. Independent CAD viewer/assistive-technology audits and container/deployment checks were not part of this redesign.
