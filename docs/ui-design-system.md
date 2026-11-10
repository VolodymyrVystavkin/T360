# T360 interface design system

The redesign uses an original engineering interface: indigo actions, teal geometry, white surfaces, quiet borders and a dark CAD canvas. Adobe Express was a high-level usability reference only. No Adobe assets, branding, exact layouts or additional UI dependencies are used.

## Shared presentation

`frontend/src/design-tokens.scss` defines semantic CSS variables for brand/actions, surfaces, text, controls, CAD colors, feedback, radii, spacing, fonts and motion. `styles.scss` applies these to Angular Material and shared panels, buttons, section headings and badges. Editor control primitives live in a scoped global stylesheet; component styles retain their own layouts.

| Role | Tokens / behavior |
|---|---|
| Primary action | Indigo `#635BFF`, hover `#5148E5`, subtle `#EEECFF` |
| Engineering accent | Teal `#00B8A9`; darker semantic text color for readable text |
| Surfaces | App `#F6F7FB`, cards/sidebar white, borders `#E3E7EF` |
| Text | Primary `#202436`; secondary `#667083` |
| CAD | Canvas `#18232D`, grid `#263744`, geometry `#64D8CF`, selection `#A78BFA`, annotations `#F4C16E` |
| Feedback | Error `#D94B57`, warning `#D99828`, success `#16866F`; darker text on subtle feedback surfaces |
| Typography | Inter when locally available, with system sans-serif fallbacks; native monospace for values, IDs, coordinates and reports |
| Spacing | `--panel-space`, adjusted through Settings without modifying drawing state |
| Motion | 160 ms interface transitions; system or explicit reduced-motion preference removes animation |

The proposed secondary `#697386` narrowly misses AA normal-text contrast on the app background (4.46:1), so this implementation uses a slightly darker secondary token. Native input outlines use a separate stronger control-border token. Bright teal is used for graphics and accents, not small normal text on white. No remote font request is required; Material uses the same complete fallback stack as the rest of the app.

## Reusable components

- `WorkbenchHeader`: product identity, current workspace context, honest browser storage context, functional File/Workspace disclosures, Help, keyboard-operable analysis tabs.
- `WorkspaceNav`: main navigation rail. Dashboard, CAD editor, tolerance analysis and Settings open real pages. 3D and AI are explicitly disabled as unimplemented.
- `UiIcon`: local code-native SVG icons with adjacent text or accessible button labels; no icon font/CDN.
- `UiState`: reusable empty, loading and error presentation, including a compact inspector variant.
- `UiPreferences`: persists only display density and reduced motion under `t360-ui-preferences`. Reset affects display preferences only.
- Existing Angular Material buttons, numeric fields and unit selectors remain in the analysis forms. Existing native data tables, dropdowns, badges and editor status bar share tokens.

No new destructive operations or confirmation flows were introduced. Existing reversible editing/undo behavior remains in place. Notifications are persistent inline states/status messages rather than disappearing engineering warnings.

## Workspaces

- `#dashboard` displays the actual current browser drawing and analysis draft, with shortcuts to the existing workspaces. It does not claim to be a server project database.
- `#dxf` retains the existing editor. Tools and layers occupy a collapsible left sidebar, with an entity explorer and file actions. The right inspector shows exact values, IDs, dimensions and tolerances. The center retains Konva model-space rendering, with fit/zoom controls, active tool cursor, hover/selection feedback and snap status. The bottom status area shows cursor, units, zoom, active tool, selection count and local-save status.
- `#tolerance` contains the existing CAD/manual analysis tabs. Both share panel styling, typography, numeric fields and result presentation. CAD rows distinguish source dimensions from derived measurements; missing tolerances are highlighted in text and styling. Source/units/revision errors remain visible. Result cards, common-scale intervals, optional RSS/Monte Carlo and source-trace export remain connected to the original services. Existing engineering insights report the dominant contribution; no new sensitivity solver is claimed.
- `#settings` provides working display density and reduced-motion preferences. These never reassign units or alter geometry.

On tablet/laptop widths the CAD side panels collapse to protect canvas space; the visible panel controls reopen them. Tables scroll within their cards. On narrow tablets, an explicitly opened inspector stacks with the canvas rather than overlapping it. Desktop remains the primary editing target.

## Engineering boundaries

Backend files, API contracts, tolerance formulas, Pint conversions, model types, geometry IDs, source references and serialization schemas are unchanged by this redesign. New zoom controls affect only view zoom/offset and preserve the center model coordinate. Exact coordinate input values are not rounded. Display-only length/diameter summaries do not write geometry or specifications.

`ui/canvas-theme.ts` reads CSS presentation tokens for Konva. Native annotation styles remain serialized unchanged: legacy default amber is mapped to the new annotation color only while rendering; custom annotation colors still display as entered. Grid/selection/hover colors and label font choices never become engineering input.

## Verification and limits

Run the existing `npm test` and `npm run build` in `frontend`, and `.venv/bin/python -m pytest -q` from the repository root. Added tests exercise implemented/disabled navigation, display-setting persistence, settings interactions, panel/explorer state, numeric save state, view-only zoom and unchanged native geometry. Existing tests continue to verify source transfer, formula behavior, units, annotations and DXF interchange.

Local headless Chrome screenshots are used for desktop, laptop and tablet inspection, with the deliberately synthetic acceptance fixture. Browser API calls can be bridged to the existing FastAPI TestClient for deterministic verification, including the DXF worker and existing engine; this is a local test harness, not a deployment. Native File bytes omitted by Chrome's interception protocol are supplied from that same known fixture in the harness. Independent CAD viewer validation and a full assistive-technology audit remain outside this visual redesign. Existing server-hosting, browser-local persistence and supported-entity limitations still apply.
