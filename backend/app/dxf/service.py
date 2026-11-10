"""Bounded DXF interchange worker. Native sketch geometry stays separate."""
import io
import json
import sys
import uuid
from collections import Counter
import ezdxf

UNIT_CODES = {'mm': 4, 'cm': 5, 'm': 6, 'in': 1, 'ft': 2}


def read_dxf(text):
    doc = ezdxf.read(io.StringIO(text))
    entities, skipped = [], Counter()
    modelspace = doc.modelspace()
    for source in modelspace:
        if len(entities) >= 10000:
            raise ValueError('Maximum 10,000 editable entities exceeded')
        kind = source.dxftype()
        item = {'id': str(uuid.uuid4()), 'layer': source.dxf.layer, 'source_handle': source.dxf.handle}
        if (source.dxf.get('elevation', 0) if source.dxf.is_supported('elevation') else 0) not in (0, None) or tuple(source.dxf.get('extrusion', (0, 0, 1)) if source.dxf.is_supported('extrusion') else (0, 0, 1)) != (0, 0, 1):
            skipped[f'{kind} non-XY plane'] += 1
            continue
        if kind == 'LINE':
            if source.dxf.start.z or source.dxf.end.z:
                skipped['LINE non-XY plane'] += 1
                continue
            item.update(type='line', points=[list(source.dxf.start)[:2], list(source.dxf.end)[:2]])
        elif kind in ('CIRCLE', 'ARC'):
            if source.dxf.center.z:
                skipped[f'{kind} non-XY plane'] += 1
                continue
            item.update(type=kind.lower(), points=[list(source.dxf.center)[:2]], radius=source.dxf.radius)
            if kind == 'ARC':
                item.update(start_angle=source.dxf.start_angle, end_angle=source.dxf.end_angle)
        elif kind == 'LWPOLYLINE':
            if any(p[2] or p[3] or p[4] for p in source.get_points()):
                skipped['LWPOLYLINE bulges/widths'] += 1
                continue
            item.update(type='polyline', points=[list(p) for p in source.get_points('xy')], closed=source.closed)
        else:
            skipped[kind] += 1
            continue
        entities.append(item)
    warnings = [f'{count} × {kind} omitted from editable sketch and export.' for kind, count in skipped.items()]
    if not entities:
        warnings.insert(0, 'This DXF contains no drawing entities in model space.' if len(modelspace) == 0 else 'This DXF contains no supported editable geometry. Review the omitted entity types below.')
    warnings.append('DXF styles, annotations, blocks and paper space are not preserved. Keep your original file.')
    return {'schema_version': 1, 'units': next((u for u, code in UNIT_CODES.items() if code == doc.units), None),
            'entities': entities, 'warnings': warnings}


def write_dxf(sketch):
    doc = ezdxf.new('R2010')
    doc.units = UNIT_CODES[sketch['units']]
    model = doc.modelspace()
    for entity in sketch['entities']:
        layer = entity['layer']
        if layer not in doc.layers:
            doc.layers.new(layer)
        attrs = {'layer': layer}
        points = entity['points']
        kind = entity['type']
        if kind == 'line': model.add_line(points[0], points[1], dxfattribs=attrs)
        elif kind == 'circle': model.add_circle(points[0], entity['radius'], dxfattribs=attrs)
        elif kind == 'arc': model.add_arc(points[0], entity['radius'], entity['start_angle'], entity['end_angle'], dxfattribs=attrs)
        elif kind == 'polyline': model.add_lwpolyline(points, close=entity['closed'], dxfattribs=attrs)
    output = io.StringIO()
    doc.write(output)
    return output.getvalue()


if __name__ == '__main__':
    try:
        # Linux worker bounds supplement the parent wall-clock timeout.
        if sys.platform == 'linux':
            import resource
            resource.setrlimit(resource.RLIMIT_CPU, (10, 10))
            resource.setrlimit(resource.RLIMIT_AS, (2 * 1024**3, 2 * 1024**3))
        request = json.load(sys.stdin)
        result = read_dxf(request['text']) if request['operation'] == 'import' else write_dxf(request['sketch'])
        json.dump({'result': result}, sys.stdout)
    except Exception:
        json.dump({'error': 'DXF processing failed. Check that the file is a valid supported 2D DXF.'}, sys.stdout)
