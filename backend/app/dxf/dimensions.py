"""Standard DXF DIMENSION interchange with optional T360 associativity metadata."""
import json
import math
import uuid
from datetime import datetime, timezone
from ezdxf.colors import rgb2int
try:
    from .models import Annotation, Entity, Sketch, Tolerance, ANNOTATION_LAYER, measured, linear_points, angle_geometry
except ImportError:  # Separate bounded worker entry point.
    from models import Annotation, Entity, Sketch, Tolerance, ANNOTATION_LAYER, measured, linear_points, angle_geometry

APPID = 'T360_ANNOTATIONS_V1'


def put_metadata(doc, entity, data):
    if APPID not in doc.appids:
        doc.appids.new(APPID)
    text = json.dumps(data, ensure_ascii=True, separators=(',', ':'))
    entity.set_xdata(APPID, [(1000, text[i:i+240]) for i in range(0, len(text), 240)])


def get_metadata(entity):
    if not entity.has_xdata(APPID):
        return None
    tags = entity.get_xdata(APPID)
    text = ''.join(t.value for t in tags if t.code == 1000)
    if len(text) > 16000:
        raise ValueError('Dimension metadata too large')
    return json.loads(text)


def write_dimensions(doc, sketch):
    model = doc.modelspace()
    by_id = {e['id']: Entity.model_validate(e) for e in sketch['entities']}
    for raw in sketch.get('annotations', []):
        a = Annotation.model_validate(raw)
        entities = [by_id[i] for i in a.refs]
        value = measured(a, entities)
        if a.status != 'valid' or not math.isclose(value, a.measured_value, rel_tol=1e-9, abs_tol=1e-8):
            raise ValueError('Invalid dimension')
        style = {'dimtxt': a.style.text_height, 'dimasz': a.style.arrow_size,
                 'dimdec': a.precision, 'dimadec': a.precision, 'dimtad': 0, 'dimzin': 0,
                 'dimaunit': 0, 'dimlfac': 1, 'dimscale': 1}
        if a.tolerance:
            style.update(dimtol=1, dimtp=a.tolerance.plus, dimtm=a.tolerance.minus, dimtdec=a.precision)
        if a.style.show_units and a.type != 'angular':
            style['dimpost'] = f'<> {a.units}'
        # Keep explicit overrides literal when rendered as DXF/MTEXT content.
        literal = (a.text_override or '').replace('\\', '\\\\').replace('{', '\\{').replace('}', '\\}').replace('\n', ' ')
        text = '<>' if a.text_override is None else f'OVERRIDE: {literal} [<>]'
        attrs = {'layer': ANNOTATION_LAYER}
        pos = a.placement.position
        if a.type in ('horizontal', 'vertical'):
            p, q = linear_points(a, entities)
            dim = model.add_linear_dim(base=pos, p1=p, p2=q, location=pos, angle=90 if a.type == 'vertical' else 0, text=text, override=style, dxfattribs=attrs)
        elif a.type == 'aligned':
            p, q = linear_points(a, entities)
            length = math.dist(p, q)
            distance = (-(q[1]-p[1])*(pos[0]-p[0])+(q[0]-p[0])*(pos[1]-p[1]))/length
            dim = model.add_aligned_dim(p1=p, p2=q, distance=distance, text=text, override=style, dxfattribs=attrs)
            dim.set_location(pos, leader=False, relative=False)
        elif a.type in ('radius', 'diameter'):
            e = entities[0]
            angle = math.degrees(math.atan2(pos[1]-e.points[0][1], pos[0]-e.points[0][0]))
            if e.type == 'arc':
                angle = e.start_angle + ((e.end_angle-e.start_angle) % 360 or 360)/2
            method = model.add_radius_dim if a.type == 'radius' else model.add_diameter_dim
            dim = method(center=e.points[0], radius=e.radius, angle=angle, text=text, override=style, dxfattribs=attrs)
            dim.user_location_override(pos)
        else:
            center, signed = angle_geometry(entities)
            first, second = entities if signed > 0 else entities[::-1]
            p, q = first.points
            bisector = math.atan2(q[1]-p[1], q[0]-p[0]) + math.radians(abs(signed))/2
            radius = max(math.dist(pos, center), a.style.offset)
            base = (center[0]+radius*math.cos(bisector), center[1]+radius*math.sin(bisector))
            dim = model.add_angular_dim_2l(base=base, line1=tuple(first.points), line2=tuple(second.points), location=pos, text=text, override=style, dxfattribs=attrs)
        dim.render()
        if a.type == 'aligned':
            # ezdxf's aligned helper renders a rotated linear DIMENSION; retain the
            # rendered block while writing the standard aligned entity subtype.
            dim.dimension.dxf.dimtype = (dim.dimension.dxf.dimtype & ~15) | 1
        color = rgb2int(tuple(int(a.style.color[i:i+2], 16) for i in (1, 3, 5)))
        dim.dimension.dxf.true_color = color
        for e in doc.blocks[dim.dimension.dxf.geometry]:
            e.dxf.true_color = color
        put_metadata(doc, dim.dimension, a.model_dump())


def same(p, q):
    return math.dist(tuple(p)[:2], tuple(q)[:2]) < 1e-6


def foreign_annotation(source, entities, units):
    """Recover only unambiguous, geometry-backed 2D dimension definitions."""
    d = source.dxf
    kind = d.dimtype & 15
    candidates = []
    if kind in (0, 1):
        angle = d.get('angle', 0) % 180
        annotation_type = 'aligned' if kind == 1 or (abs(angle) > 1e-6 and abs(angle-90) > 1e-6) else 'vertical' if abs(angle-90) < 1e-6 else 'horizontal'
        for e in entities:
            if e.type == 'line' and ((same(e.points[0], d.defpoint2) and same(e.points[1], d.defpoint3)) or (same(e.points[1], d.defpoint2) and same(e.points[0], d.defpoint3))):
                candidates.append([e.id])
        if annotation_type == 'aligned' and kind == 0:
            compatible = []
            for ids in candidates:
                line = next(e for e in entities if e.id == ids[0])
                p, q = line.points
                direction = math.atan2(q[1]-p[1], q[0]-p[0])
                if abs(math.sin(direction-math.radians(angle))) < 1e-6:
                    compatible.append(ids)
            candidates = compatible
    elif kind in (3, 4):
        annotation_type = 'diameter' if kind == 3 else 'radius'
        center = (d.defpoint+d.defpoint4)/2 if kind == 3 else d.defpoint
        radius = math.dist(d.defpoint, d.defpoint4)/(2 if kind == 3 else 1)
        candidates = [[e.id] for e in entities if e.type in (('circle',) if kind == 3 else ('circle', 'arc')) and same(center, e.points[0]) and math.isclose(e.radius, radius, rel_tol=1e-8, abs_tol=1e-6)]
    elif kind == 2:
        annotation_type = 'angular'
        first = [e for e in entities if e.type == 'line' and ((same(e.points[0], d.defpoint2) and same(e.points[1], d.defpoint3)) or (same(e.points[1], d.defpoint2) and same(e.points[0], d.defpoint3)))]
        second = [e for e in entities if e.type == 'line' and ((same(e.points[0], d.defpoint4) and same(e.points[1], d.defpoint)) or (same(e.points[1], d.defpoint4) and same(e.points[0], d.defpoint)))]
        candidates = [[a.id, b.id] for a in first for b in second if a.id != b.id]
    else:
        raise ValueError('Unsupported dimension subtype')
    if len(candidates) != 1:
        raise ValueError('Dimension references are missing or ambiguous')
    # Non-default units/scales cannot be treated as raw geometry measurements.
    override = source.override()
    defaults = {'dimlfac': 1, 'dimpost': '<>', 'dimdec': 2, 'dimtxt': 3, 'dimasz': 2, 'dimtol': 0, 'dimtp': 0, 'dimtm': 0, 'dimalt': 0, 'dimrnd': 0, 'dimaunit': 0}
    values = {key: override.get(key, default) for key, default in defaults.items()}
    if values['dimlfac'] != 1 or values['dimpost'] not in ('', '<>') or values['dimalt'] or values['dimrnd'] or (kind == 2 and values['dimaunit'] != 0):
        raise ValueError('Scaled or custom unit dimension style')
    a = Annotation(id=str(uuid.uuid4()), type=annotation_type, refs=candidates[0], measured_value=0,
                   units='deg' if annotation_type == 'angular' else units, mode='manual',
                   updated_at=datetime.now(timezone.utc).isoformat(),
                   placement={'position': list(d.get('text_midpoint', d.defpoint))[:2], 'manual': True},
                   precision=max(0, min(8, int(values.get('dimdec', 2)))))
    a.style.text_height = values['dimtxt'] or 3
    a.style.arrow_size = values['dimasz'] or 2
    a.measured_value = measured(a, [next(e for e in entities if e.id == i) for i in a.refs])
    if values.get('dimtol', 0):
        a.tolerance = Tolerance(plus=values['dimtp'], minus=values['dimtm'])
    if d.get('text', '<>') not in ('', '<>'):
        a.text_override = d.text
    return Annotation.model_validate(a.model_dump())


def read_dimensions(doc, sketch, sources):
    entities = [Entity.model_validate(e) for e in sketch['entities']]
    annotations = []
    for source in sources:
        try:
            if tuple(source.dxf.get('extrusion', (0, 0, 1))) != (0, 0, 1):
                raise ValueError('Non-XY dimension plane')
            for key, point in source.dxf.all_existing_dxf_attribs().items():
                if (key.startswith('defpoint') or key == 'text_midpoint') and abs(point.z) > 1e-8:
                    raise ValueError('Non-XY dimension points')
            data = get_metadata(source)
            annotation = Annotation.model_validate(data) if data else foreign_annotation(source, entities, sketch['units'])
            # Even T360 XDATA is untrusted; check its geometry and units before use.
            Sketch.model_validate({**sketch, 'annotations': [annotation.model_dump()]})
            if annotation.status != 'valid':
                raise ValueError('Stale dimension metadata')
            if not math.isclose(float(source.get_measurement()), annotation.measured_value, rel_tol=1e-8, abs_tol=1e-6):
                raise ValueError('DXF definition disagrees with referenced geometry')
            if source.override().get('dimlfac', 1) != 1:
                raise ValueError('Unsupported measurement scale')
            annotations.append(annotation.model_dump())
        except (ValueError, KeyError, AttributeError, TypeError, ZeroDivisionError):
            sketch['warnings'].append(f'DIMENSION {source.dxf.handle}: unsupported, inconsistent or ambiguous definition/style omitted.')
    return annotations
