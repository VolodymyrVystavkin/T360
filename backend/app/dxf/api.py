import json
import subprocess
import sys
from pathlib import Path
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import Response

router = APIRouter(prefix='/api/v1/drawings')
MAX_BYTES = 5 * 1024 * 1024
from .models import Sketch


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


@router.post('/import-dxf', response_model=Sketch)
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
        result = Sketch.model_validate(result)
    except ValueError as exc:
        raise HTTPException(422, 'Imported geometry exceeds supported limits.') from exc
    return result


@router.post('/export-dxf')
def export_dxf(sketch: Sketch):
    if not sketch.units:
        raise HTTPException(422, 'Assign drawing units before export.')
    if any(a.status != 'valid' for a in sketch.annotations):
        raise HTTPException(422, 'Resolve or delete invalid and orphan annotations before export.')
    result = worker({'operation': 'export', 'sketch': sketch.model_dump()})
    return Response(result, media_type='application/dxf', headers={'Content-Disposition': 'attachment; filename="drawing.dxf"'})
