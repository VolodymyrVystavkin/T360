"""Bounded DXF interchange worker. Native sketch geometry stays separate."""
import io
import json
import sys
import uuid
from collections import Counter
import ezdxf
try:
    from .dimensions import put_metadata, get_metadata, write_dimensions, read_dimensions
    from .models import ANNOTATION_LAYER
except ImportError:
    from dimensions import put_metadata, get_metadata, write_dimensions, read_dimensions
    from models import ANNOTATION_LAYER

UNIT_CODES = {'mm': 4, 'cm': 5, 'm': 6, 'in': 1, 'ft': 2}


def read_dxf(text):
    doc = ezdxf.read(io.StringIO(text))
    entities, skipped, dimensions = [], Counter(), []
    reserved_layer_geometry = 0
    modelspace = doc.modelspace()
    def expanded(sources, prefix='', depth=0, inherited_layer='0'):
        for index, source in enumerate(sources):
            path = f'{prefix}/{source.dxf.handle or index}'
            if source.dxftype() == 'INSERT':
                if depth >= 8 or source.mcount > 1:
                    skipped['INSERT depth/array unsupported'] += 1
                    continue
                if source.dxf.insert.z or tuple(source.dxf.extrusion) != (0, 0, 1):
                    skipped['INSERT non-XY plane'] += 1
                    continue
                try:
                    children = source.virtual_entities(skipped_entity_callback=lambda entity, reason: skipped.update([f'INSERT {entity.dxftype()} {reason}']))
                    yield from expanded(children, path, depth+1, source.dxf.layer if source.dxf.layer != '0' else inherited_layer)
                except (ValueError, ezdxf.DXFError):
                    skipped['INSERT unsupported transform'] += 1
            else:
                if prefix and source.dxf.layer == '0':
                    source.dxf.layer = inherited_layer
                yield source, path, bool(prefix)

    processed = 0
    for source, source_path, in_block in expanded(modelspace):
        processed += 1
        if processed > 12000:
            raise ValueError('Maximum expanded entity count exceeded')
        if len(entities) >= 10000:
            raise ValueError('Maximum 10,000 editable entities exceeded')
        kind = source.dxftype()
        if kind == 'DIMENSION':
            if in_block:
                skipped['INSERT DIMENSION references unsupported'] += 1
                continue
            if len(dimensions) >= 2000:
                raise ValueError('Maximum 2,000 dimensions exceeded')
            dimensions.append(source)
            continue
        metadata = get_metadata(source)
        native_id = metadata.get('id') if isinstance(metadata, dict) else None
        item = {'id': native_id if native_id and not in_block else source_path.lstrip('/'), 'layer': source.dxf.layer, 'source_handle': source_path.lstrip('/'), 'source_type': kind}
        elevation = source.dxf.get('elevation', 0) if source.dxf.is_supported('elevation') else 0
        elevated = any(elevation) if hasattr(elevation, '__iter__') else elevation not in (0, None)
        if elevated or tuple(source.dxf.get('extrusion', (0, 0, 1)) if source.dxf.is_supported('extrusion') else (0, 0, 1)) != (0, 0, 1):
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
        elif kind == 'POLYLINE':
            if not source.is_2d_polyline or any(v.dxf.location.z or v.dxf.bulge or v.dxf.start_width or v.dxf.end_width for v in source.vertices):
                skipped['POLYLINE nonplanar/bulges/widths'] += 1
                continue
            item.update(type='polyline', points=[list(v.dxf.location)[:2] for v in source.vertices], closed=source.is_closed)
        elif kind == 'LWPOLYLINE':
            if any(p[2] or p[3] or p[4] for p in source.get_points()):
                skipped['LWPOLYLINE bulges/widths'] += 1
                continue
            item.update(type='polyline', points=[list(p) for p in source.get_points('xy')], closed=source.closed)
        else:
            skipped[kind] += 1
            continue
        if item['layer'] == ANNOTATION_LAYER:
            item['layer'] = 'Geometry'
            reserved_layer_geometry += 1
        entities.append(item)
    warnings = [f'{count} × {kind} omitted from editable sketch and export.' for kind, count in skipped.items()]
    if not entities:
        warnings.insert(0, 'This DXF contains no drawing entities in model space.' if len(modelspace) == 0 else 'This DXF contains no supported editable geometry. Review the omitted entity types below.')
    if reserved_layer_geometry:
        warnings.append(f'{reserved_layer_geometry} geometry entities moved from the reserved annotation layer to Geometry.')
    warnings.append('Unsupported DXF styles, text, complex blocks and paper space are not preserved. Keep your original file.')
    sketch = {'schema_version': 1, 'units': next((u for u, code in UNIT_CODES.items() if code == doc.units), None),
              'entities': entities, 'warnings': warnings, 'layers': list(dict.fromkeys(['Geometry', ANNOTATION_LAYER, *(layer.dxf.name for layer in doc.layers if not layer.dxf.name.startswith('*'))])),
              'hidden_layers': [layer.dxf.name for layer in doc.layers if layer.is_off()]}
    sketch['annotations'] = read_dimensions(doc, sketch, dimensions)
    return sketch


def write_dxf(sketch):
    doc = ezdxf.new('R2010', setup=True)
    doc.units = UNIT_CODES[sketch['units']]
    model = doc.modelspace()
    for name in dict.fromkeys(['Geometry', ANNOTATION_LAYER, *sketch.get('layers', [])]):
        if name not in doc.layers:
            doc.layers.new(name)
    for name in sketch.get('hidden_layers', []):
        if name in doc.layers:
            doc.layers.get(name).off()
    for entity in sketch['entities']:
        layer = entity['layer']
        if layer not in doc.layers:
            doc.layers.new(layer)
        attrs = {'layer': layer}
        points = entity['points']
        kind = entity['type']
        if kind == 'line': source = model.add_line(points[0], points[1], dxfattribs=attrs)
        elif kind == 'circle': source = model.add_circle(points[0], entity['radius'], dxfattribs=attrs)
        elif kind == 'arc': source = model.add_arc(points[0], entity['radius'], entity['start_angle'], entity['end_angle'], dxfattribs=attrs)
        elif kind == 'polyline': source = model.add_lwpolyline(points, close=entity['closed'], dxfattribs=attrs)
        put_metadata(doc, source, {'id': entity['id']})
    write_dimensions(doc, sketch)
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
