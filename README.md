# Easy start 
Run `docker compose up` to build, create, and start the backend and frontend containers defined in the Docker Compose configuration. Docker Compose automatically creates a shared network for communication between services. Use `docker compose up -d` to run the containers in the background or `docker compose up --build` to rebuild the images before starting. To stop and remove the containers, run `docker compose down`.

Open your web browser and navigate to `http://127.0.0.1:8080` to access the application.


# T360

A full-stack engineering workspace built with **Angular 21 + Angular Material** and **Python FastAPI**. Define a signed dimensional stack, compare worst-case and RSS bounds, and run reproducible Monte Carlo simulations. Results include a histogram, simulated yield, central 95% sample interval, engineering guidance, and JSON export.

The guidance is deterministic and based on calculation results; this version does not integrate an LLM, require API keys, or store server projects. Manual analysis uses browser memory; CAD working drawings and drafts persist locally in this browser.

## Run locally

Prerequisites: Node.js 22.12+ (22 LTS recommended), npm 10+, Python 3.13, and Git. Docker Compose is optional. Angular's supported Node versions are documented at https://angular.dev/reference/versions.

From the repository root:

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r backend/requirements-dev.txt
python -m uvicorn app.main:app --app-dir backend --reload --host 127.0.0.1 --port 8000
```

In a second terminal:

```bash
cd frontend
npm ci
npm start
```

Open **http://localhost:4200**. The Angular development proxy forwards `/api` to `127.0.0.1:8000`. Interactive API documentation: **http://localhost:8000/docs**. Health endpoint: `/api/health`.

## Docker

With Docker Engine and Compose v2.24.4+ installed:

```bash
docker compose config --quiet
docker compose up --build -d --wait
# App: http://localhost:8080 ; API docs: http://localhost:8000/docs
docker compose logs -f
docker compose down
```

The frontend uses a multi-stage Node/nginx image and forwards `/api` to the backend over the Compose network. Both runtime images use unprivileged users. Host ports bind only to localhost. No database is required.

## Verify

```bash
.venv/bin/python -m pytest -q
cd frontend
npm ci
npm test
npm run build
cd ..
docker compose build
# With Compose running, verify the UI server and proxied API:
python3 tests/smoke.py http://localhost:8080
```

The Angular production output is `frontend/dist/frontend/browser`. Backend tests cover formulas, signed coefficients, zero variation, repeatability, distribution statistics, histogram conservation, yield, API responses, and input rejection. Frontend tests cover rendering, HTTP payloads, results, error recovery, and invalid specifications.

## Repository

```text
frontend/                 Angular 21 standalone application, Material UI, unit tests
backend/app/              FastAPI API, validated schemas, calculation service
backend/requirements*.txt  Backend runtime and development dependencies
tests/backend/            Python unit and API tests
tests/compose.ci.yaml      Container CI override without host port bindings
docs/                     Model assumptions and API reference
compose.yaml              Local two-service deployment
.github/workflows/blank.yml  Self-hosted Ubuntu CI
```

## Self-hosted Ubuntu CI

The workflow runs on `[self-hosted, linux, x64]` for pushes and pull requests to `main`, and manual dispatches. Register your Ubuntu x64 runner with those labels. It needs Git, network access to GitHub/npm/PyPI/container registries, and a working Docker Engine + Compose v2.24.4+ that the runner account can use. Node 22 and Python 3.13 are provisioned by setup actions. Configure Docker on the host once; the workflow does not install system software or run `sudo`.

CI installs dependencies, runs both test suites, builds the Angular production app and both images, then starts an isolated Compose project and checks the frontend and proxied health endpoint. The smoke-test project removes its containers on exit and has no host port bindings. Use a dedicated runner for trusted repository code; do not enable untrusted fork PR execution on a persistent self-hosted runner.

## API example

```bash
curl -s http://localhost:8000/api/tolerance/analyze \
  -H 'Content-Type: application/json' \
  -d '{"components":[{"name":"Housing","nominal":10,"tolerance":0.2,"coefficient":1},{"name":"Shaft","nominal":8,"tolerance":0.1,"coefficient":-1}],"lower_spec":1.7,"upper_spec":2.3,"samples":10000,"seed":42}'
```

All dimensions must use the same unit. See [calculation assumptions](docs/tolerance-analysis.md) and [architecture and API](docs/architecture.md). CORS defaults to `http://localhost:4200`; override `CORS_ORIGINS` with comma-separated origins if running a separate frontend host.

## Dependency notes

The frontend lockfile is committed for reproducible `npm ci` installs. Vitest is pinned to its patched 4.1.12 release. The verified dependency audit reports no high or critical findings and 16 moderate findings in the Angular CLI development dependency tree. Avoid `npm audit fix --force`, which proposes changing the requested Angular major. Recheck advisories when updating dependencies. If npm 10 crashes while resolving a dependency update, `npx npm@11 install --prefix frontend` can refresh the lockfile; normal clean installs still use `npm ci`.

## Verification performed

Verified a clean frontend `npm ci`, 4 Angular/Vitest tests, 12 Python tests, the Angular production build, both container builds, both Compose configurations, and the HTTP smoke test through nginx. Container verification used this environment’s Docker-compatible Podman runtime. The workflow itself must still be run on your GitHub self-hosted Ubuntu runner. Browser visual and interaction checks were not performed.

## 2D DXF editor

Open **http://localhost:4200/#dxf** (development) or **http://localhost:8080/#dxf** (Docker) for the new Angular/Konva editor. Import/export supported DXF geometry, draw lines/circles/rectangles, edit numeric properties, measure, manage layers, undo/redo, and save a sketch in your browser. The tolerance workspace remains available from the navigation.

Install the updated backend requirements and run `npm ci` in `frontend`, or rebuild with `docker compose up --build`. See [DXF support, API and deployment limits](docs/dxf-editor.md). Public hosting has not been configured; the complete app needs both the UI and Python API.

## Automatic engineering annotations

In the DXF editor, click **Auto Dimension · All**, or select geometry (Shift-click for multiple entities) and use **Auto · Selected**. Manual **Dimension**, **Diameter**, **Radius**, and **Angular Dimension** tools are also available. Select a dimension to edit placement, style, precision, explicit tolerance or a visibly marked text override. Geometry edits update measurements; undo/redo and browser save/restore retain annotations.

The dedicated **ASME Y14.5** layer can be toggled independently. Its name is not a compliance claim. Export writes real DXF dimensions; unsupported import definitions/styles are reported. See [annotation instructions and limitations](docs/annotations.md) and [ADR-001](ADR.md). Rebuild containers with `docker compose up --build -d` to apply the updated frontend and backend.

## Analyze tolerances from CAD

In the DXF Editor, click **Analyze Tolerances** to transfer the current drawing, including unsaved edits, into **Imported CAD Features** on the existing Tolerance Analysis page. Choose measurement rows, enter missing tolerances and assign signed coefficients. The program generates the relationship automatically; calculating with no selection uses all valid features with specified tolerances. Changed sources and text overrides still require review. Worst-case runs independently; Monte Carlo and the RSS tolerance index require explicit independent uniform assumptions. Source buttons reopen and highlight the geometry or original annotation.

Working drawings and CAD drafts persist in this browser. Revisions and source signatures detect stale inputs; refresh updates measurements and requires review of changed sources. Units must be explicitly assigned, with Pint conversion for result units. Geometry never supplies invented tolerances. See [supported geometry/dimensions, workflow and limitations](docs/cad-tolerance-workflow.md) and [ADR-002](ADR.md). Install updated backend requirements (including Pint) or rebuild containers before using the bridge. Try the deliberately synthetic [acceptance DXF](tests/fixtures/cad-clearance.dxf): its three explicit component dimensions produce +0.20 mm nominal clearance and [−0.05, +0.45] mm worst-case bounds after defining Housing − Shaft − Spacer.

## T360 interface

The app now uses a shared indigo/teal design system with a navigation rail, a dark CAD canvas, collapsible tools/layers and property inspectors, visual analysis results and explicit engineering status messages. Open `#dashboard` for your current browser workspace or `#settings` to change display density and reduced motion. 3D and AI navigation remain disabled until implemented. See the [design system, components and validation notes](docs/ui-design-system.md). Engineering services, drawing formats and calculation contracts remain unchanged.
