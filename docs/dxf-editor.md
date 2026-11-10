# DXF editor MVP

Implemented from ARCHITECTURE.md section 6 using Angular, Konva, FastAPI and ezdxf. The tolerance workspace remains available. Open `http://localhost:4200/#dxf` during development, or `http://localhost:8080/#dxf` with Docker Compose.

## Run

Use the root README setup. Install the updated backend requirements (`.venv/bin/pip install -r backend/requirements.txt`) and frontend lockfile (`cd frontend && npm ci`). Run the API and frontend, or run `docker compose up --build` from the repository root.

Choose **Load example** for a synthetic mounting plate, or import an ASCII DXF up to 5 MB. Select a tool and click two points. Circle clicks specify center and radius; rectangle clicks specify opposite corners. Measurements use model coordinates. Select existing geometry to edit its point coordinates, layer, radius, or arc angles. Scroll zooms about the pointer; the pan tool moves the view. Snap rounds to one drawing unit.

Undo/redo retains up to 100 sketch snapshots in memory. Save/Restore keeps one native sketch in browser localStorage, distinct from DXF exports. This is not server project persistence or an append-only revision store. Unit assignment does not rescale geometry. Missing or unsupported DXF units require a user choice before export.

## Interchange support

| Entity | Import/export | Editing |
|---|---|---|
| LINE | XY plane endpoints | Numeric endpoints |
| CIRCLE | XY center and radius | Numeric center/radius |
| ARC | XY center, radius, CCW angles | Numeric properties |
| LWPOLYLINE | Straight vertices, closed flag | Numeric vertices |
| Bulged or variable-width polylines | Omitted with report | Unsupported |
| TEXT, MTEXT, DIMENSION, INSERT, other entities | Omitted with report | Unsupported |

Unsupported geometry, non-XY entities, annotations and appearance are not preserved. Original files remain with the user. Export contains the supported native sketch only, not a lossless original-document round trip. Layers and supported units are regenerated; per-entity styles are not preserved. Arc display is sampled, while export retains analytic center/radius/angles.

## API

- `POST /api/v1/drawings/import-dxf`: raw ASCII DXF request body, normalized sketch response, warnings, nullable units.
- `POST /api/v1/drawings/export-dxf`: native JSON sketch, DXF download response. Units and geometry validated with Pydantic.

Import streams are limited to 5 MB, 10,000 supported entities, and a 15-second worker deadline. DXF processing runs in a separate process with CPU/address-space limits on Linux. This is bounded parsing, not a complete hostile-upload sandbox. Add authentication, rate limits, deployment isolation and concurrency quotas before shared public use.

## Hosting and remaining scope

The application requires its Python API. The existing Docker/nginx deployment serves UI and proxies `/api`; a static frontend deployment alone cannot provide DXF or tolerance services. Sites Workers hosting cannot run this FastAPI/ezdxf backend, so no incomplete static Site was published. Public hosting still requires a container/server target and HTTPS reverse proxy. Compose currently binds localhost deliberately.

Rotation, trim, general polyline drawing, constraints, topology validation, durable project/revision persistence, 3D CAD, agents and CFD remain later work. Browser visual/interaction QA has not been performed in this environment.
