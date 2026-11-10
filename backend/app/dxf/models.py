"""Native sketch validation; annotations are measurements, never constraints."""
import math
from typing import Literal
from pydantic import BaseModel, ConfigDict, Field, model_validator

Coordinate = float
ANNOTATION_LAYER = 'ASME Y14.5'
UNITS = Literal['mm', 'cm', 'm', 'in', 'ft']
Point = tuple[float, float]

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
        if self.layer == ANNOTATION_LAYER:
            raise ValueError('ASME Y14.5 is reserved for annotations; use a geometry layer')
        expected = {'line': 2, 'circle': 1, 'arc': 1}
        if self.type in expected and len(self.points) != expected[self.type]:
            raise ValueError('Wrong point count')
        if self.type == 'polyline' and len(self.points) < 2:
            raise ValueError('Polyline needs two points')
        if any(abs(value) > 1e9 for point in self.points for value in point):
            raise ValueError('Coordinates out of bounds')
        return self


class StrictModel(BaseModel):
    model_config = ConfigDict(extra='forbid', allow_inf_nan=False)


class AnnotationStyle(StrictModel):
    text_height: float = Field(default=3, gt=0, le=1e6)
    arrow_size: float = Field(default=2, gt=0, le=1e6)
    offset: float = Field(default=12, gt=0, le=1e6)
    color: str = Field(default='#f2cc7a', pattern=r'^#[0-9a-fA-F]{6}$')
    show_units: bool = False


class Placement(StrictModel):
    position: tuple[float, float] = (0, 0)
    manual: bool = False
    collision: bool = False

    @model_validator(mode='after')
    def finite_position(self):
        if any(abs(v) > 1e9 for v in self.position):
            raise ValueError('Annotation position out of bounds')
        return self


class Tolerance(StrictModel):
    plus: float = Field(ge=0, le=1e9)
    minus: float = Field(ge=0, le=1e9)


class Annotation(StrictModel):
    id: str = Field(min_length=1, max_length=100)
    type: Literal['horizontal', 'vertical', 'aligned', 'radius', 'diameter', 'angular']
    refs: list[str] = Field(min_length=1, max_length=4)
    layer: Literal['ASME Y14.5'] = ANNOTATION_LAYER
    measured_value: float = Field(ge=0, le=1e12)
    units: Literal['mm', 'cm', 'm', 'in', 'ft', 'deg'] | None = None
    precision: int = Field(default=2, ge=0, le=8, strict=True)
    style: AnnotationStyle = Field(default_factory=AnnotationStyle)
    placement: Placement = Field(default_factory=Placement)
    mode: Literal['automatic', 'manual'] = 'automatic'
    tolerance: Tolerance | None = None
    text_override: str | None = Field(default=None, max_length=200)
    revision: int = Field(default=1, ge=1, strict=True)
    updated_at: str = Field(default='', max_length=50)
    status: Literal['valid', 'orphan', 'invalid'] = 'valid'
    source_signature: str = Field(default='', max_length=100)


def bounds(entities):
    points = []
    for e in entities:
        if e.type in ('circle', 'arc'):
            x, y = e.points[0]
            points.extend([(x-e.radius, y-e.radius), (x+e.radius, y+e.radius)])
        else:
            points.extend(e.points)
    return min(p[0] for p in points), min(p[1] for p in points), max(p[0] for p in points), max(p[1] for p in points)


def linear_points(annotation, entities):
    if len(entities) == 1 and entities[0].type == 'line':
        return entities[0].points
    x1, y1, x2, y2 = bounds(entities)
    return [(x2, y1), (x2, y2)] if annotation.type == 'vertical' else [(x1, y1), (x2, y1)]


def angle_geometry(entities):
    if len(entities) != 2 or any(e.type != 'line' for e in entities):
        raise ValueError('Angular dimension requires two lines')
    a, b = [e.points for e in entities]
    u = (a[1][0]-a[0][0], a[1][1]-a[0][1])
    v = (b[1][0]-b[0][0], b[1][1]-b[0][1])
    lengths = math.hypot(*u)*math.hypot(*v)
    cross = u[0]*v[1]-u[1]*v[0]
    if lengths < 1e-8 or abs(cross)/lengths < 1e-8:
        raise ValueError('Parallel, coincident or degenerate lines have no supported angular dimension')
    t = ((b[0][0]-a[0][0])*v[1]-(b[0][1]-a[0][1])*v[0])/cross
    center = (a[0][0]+t*u[0], a[0][1]+t*u[1])
    return center, math.degrees(math.atan2(cross, u[0]*v[0]+u[1]*v[1]))


def measured(annotation, entities):
    if len({e.id for e in entities}) != len(annotation.refs):
        raise ValueError('Missing or duplicate dimension references')
    if annotation.type in ('radius', 'diameter'):
        if len(entities) != 1 or entities[0].type not in ('circle', 'arc') or (annotation.type == 'diameter' and entities[0].type != 'circle'):
            raise ValueError('Radial dimension references incompatible geometry')
        return entities[0].radius * (2 if annotation.type == 'diameter' else 1)
    if annotation.type == 'angular':
        return abs(angle_geometry(entities)[1])
    if any(e.type not in ('line', 'polyline') for e in entities):
        raise ValueError('Linear dimension references incompatible geometry')
    p, q = linear_points(annotation, entities)
    return abs(q[0]-p[0]) if annotation.type == 'horizontal' else abs(q[1]-p[1]) if annotation.type == 'vertical' else math.dist(p, q)


class Sketch(StrictModel):
    schema_version: Literal[1] = 1
    units: UNITS | None = None
    entities: list[Entity] = Field(max_length=10000)
    annotations: list[Annotation] = Field(default_factory=list, max_length=2000)
    layers: list[str] = Field(default_factory=list, max_length=1000)
    hidden_layers: list[str] = Field(default_factory=list, max_length=1000)
    warnings: list[str] = Field(default_factory=list, max_length=1000)

    @model_validator(mode='after')
    def consistency(self):
        ids = [e.id for e in self.entities] + [a.id for a in self.annotations]
        if len(set(ids)) != len(ids):
            raise ValueError('Entity and annotation IDs must be unique')
        self.layers = list(dict.fromkeys(['Geometry', ANNOTATION_LAYER, *self.layers, *(e.layer for e in self.entities)]))
        if any(not name or len(name) > 100 or any(c in name for c in '<>/\\":;?*|=\n\r') for name in self.layers + self.hidden_layers):
            raise ValueError('Invalid layer name')
        by_id = {e.id: e for e in self.entities}
        for a in self.annotations:
            if a.status != 'valid':
                continue  # Flagged native state can be saved; DXF export rejects it explicitly.
            value = measured(a, [by_id[i] for i in a.refs if i in by_id])
            if value <= 1e-8 or not math.isclose(value, a.measured_value, rel_tol=1e-9, abs_tol=1e-8):
                raise ValueError('Annotation measured value does not match referenced geometry')
            if a.units != ('deg' if a.type == 'angular' else self.units):
                raise ValueError('Annotation units do not match drawing units')
        return self
