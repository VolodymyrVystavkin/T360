import json
import subprocess
import sys
from pathlib import Path
from typing import Literal
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import Response
from pydantic import BaseModel, ConfigDict, Field, model_validator

router = APIRouter(prefix='/api/v1/drawings')
MAX_BYTES = 5 * 1024 * 1024
Coordinate = float


class Entity(BaseModel):
    model_config = ConfigDict(extra='forbid', allow_inf_nan=False)
    id: str = Field(min_length=1, max_length=100)
    type: Literal['line', 'circle', 'arc', 'polyline']
    layer: str = Field(default='0', min_length=1, max_length=100, pattern=r'^[\w .-]+$')
    source_handle: str | None = None
    points: list[tuple[Coordinate, Coordinate]] = Field(min_length=1, max_length=10000)
    radius: float = Field(default=1, gt=0, le=1e9)
    start_angle: float = Field(default=0, ge=-360, le=360)
    end_angle: float = Field(default=90, ge=-360, le=360)
    closed: bool = False

    @model_validator(mode='after')
    def geometry(self):
        expected = {'line': 2, 'circle': 1, 'arc': 1}
        if self.type in expected and len(self.points) != expected[self.type]:
            raise ValueError('Wrong point count')
        if self.type == 'polyline' and len(self.points) < 2:
            raise ValueError('Polyline needs two points')
        if any(abs(value) > 1e9 for point in self.points for value in point):
            raise ValueError('Coordinates out of bounds')
        return self


class Sketch(BaseModel):
    model_config = ConfigDict(extra='forbid')
    schema_version: Literal[1] = 1
    units: Literal['mm', 'cm', 'm', 'in', 'ft']
    entities: list[Entity] = Field(max_length=10000)
    warnings: list[str] = Field(default_factory=list, max_length=1000)

    @model_validator(mode='after')
    def unique_ids(self):
        if len({e.id for e in self.entities}) != len(self.entities):
            raise ValueError('Entity IDs must be unique')
        return self


def worker(payload):
    try:
        process = subprocess.run([sys.executable, str(Path(__file__).with_name('service.py'))],
                                 input=json.dumps(payload), capture_output=True, text=True, timeout=15)
        response = json.loads(process.stdout)
        if 'error' in response:
            raise ValueError(response['error'])
        return response['result']
    except (ValueError, subprocess.SubprocessError, KeyError) as exc:
        raise HTTPException(422, 'DXF could not be processed within supported limits.') from exc


@router.post('/import-dxf')
async def import_dxf(request: Request):
    data = bytearray()
    async for chunk in request.stream():
        data.extend(chunk)
        if len(data) > MAX_BYTES:
            raise HTTPException(413, 'Maximum DXF upload size is 5 MB.')
    if not data or data.startswith(b'AutoCAD Binary DXF'):
        raise HTTPException(422, 'Upload an ASCII DXF file.')
    text = data.decode('utf-8-sig', errors='replace')
    from starlette.concurrency import run_in_threadpool
    result = await run_in_threadpool(worker, {'operation': 'import', 'text': text})
    # Validate imported geometry with the same rules used for export.
    try:
        Sketch.model_validate({**result, 'units': result['units'] or 'mm'})
    except ValueError as exc:
        raise HTTPException(422, 'Imported geometry exceeds supported limits.') from exc
    return result


@router.post('/export-dxf')
def export_dxf(sketch: Sketch):
    result = worker({'operation': 'export', 'sketch': sketch.model_dump()})
    return Response(result, media_type='application/dxf', headers={'Content-Disposition': 'attachment; filename="drawing.dxf"'})
