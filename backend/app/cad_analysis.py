"""Validate browser-persisted CAD drafts against their authoritative native snapshot."""
import hashlib
import json
import math
from typing import Literal

import pint
from fastapi import APIRouter, HTTPException
from pydantic import Field
from app.dxf.models import Sketch, StrictModel, measured
from app.tolerance import AnalysisRequest, AnalysisResult, Component, analyze

router = APIRouter(prefix='/api/v1/analysis')
ureg = pint.UnitRegistry()


class Feature(StrictModel):
    id: str
    entity_ids: list[str]
    source_handle: str | None = None
    drawing_id: str
    revision: int
    layer: str
    entity_type: str
    name: str
    measurement: str
    nominal: float
    units: str | None
    plus: float | None = None
    minus: float | None = None
    annotation_id: str | None = None
    annotation_ids: list[str] = Field(default_factory=list)
    displayed_value: str | None = None
    source: Literal['geometry', 'dimension']
    signature: str
    status: str
    geometry: list[dict]


class Extraction(StrictModel):
    drawing_id: str
    revision: int
    units: str | None
    features: list[Feature]
    warnings: list[str]


def signature(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True).encode()).hexdigest()


def valid_polyline(entity):
    points = list(entity.points)
    if entity.closed and points[0] == points[-1]:
        points.pop()
    if len(points) < (3 if entity.closed else 2) or len(points) > 500:
        return False
    segments = list(zip(points, points[1:]))
    if entity.closed:
        segments.append((points[-1], points[0]))
    if any(math.dist(a, b) <= 1e-8 for a, b in segments):
        return False
    def cross(a, b, c):
        return (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0])
    def on(a, b, c):
        return abs(cross(a, b, c)) <= 1e-8 and all(min(a[k], b[k])-1e-8 <= c[k] <= max(a[k], b[k])+1e-8 for k in (0, 1))
    for i, (a, b) in enumerate(segments):
        for j in range(i+2, len(segments)):
            if entity.closed and i == 0 and j == len(segments)-1:
                continue
            c, d = segments[j]
            if (cross(a, b, c)*cross(a, b, d) < 0 and cross(c, d, a)*cross(c, d, b) < 0) or any((on(a,b,c), on(a,b,d), on(c,d,a), on(c,d,b))):
                return False
    if entity.closed:
        return abs(sum(a[0]*b[1]-b[0]*a[1] for a,b in segments)) > 1e-8
    return True


def extract(sketch: Sketch) -> Extraction:
    features = []
    warnings = list(sketch.warnings)
    by_id = {e.id: e for e in sketch.entities}
    geometry_ids = {e.id for e in sketch.entities if e.layer == 'Geometry'}
    excluded = len(sketch.entities) - len(geometry_ids)
    if excluded:
        warnings.append(f'{excluded} entities outside the Geometry layer excluded from tolerance analysis.')

    def add(key, entities, measurement, value, annotation=None):
        geometry = [e.model_dump() for e in entities]
        status = 'Missing tolerance'
        if annotation:
            status = 'Explicit drawing tolerance' if annotation.tolerance else 'Missing tolerance'
            if annotation.text_override:
                status = 'Review text override; measured value retained'
            if annotation.status != 'valid':
                status = 'Invalid annotation references'
        if not math.isfinite(value) or value <= 1e-8:
            status = 'Invalid geometry'
        features.append(Feature(id=key, entity_ids=[e.id for e in entities],
            source_handle=entities[0].source_handle if entities else None,
            drawing_id=sketch.drawing_id, revision=sketch.revision,
            layer=annotation.layer if annotation else entities[0].layer,
            entity_type='DIMENSION' if annotation else (entities[0].source_type or entities[0].type.upper()),
            name=f'{measurement} · {annotation.id if annotation else entities[0].id}',
            measurement=measurement, nominal=value, units='deg' if measurement == 'angular' else sketch.units,
            plus=annotation.tolerance.plus if annotation and annotation.tolerance else None,
            minus=annotation.tolerance.minus if annotation and annotation.tolerance else None,
            annotation_id=annotation.id if annotation else None,
            annotation_ids=[a.id for a in sketch.annotations if set(a.refs) <= geometry_ids and any(e.id in a.refs for e in entities)],
            displayed_value=annotation.text_override if annotation else None,
            source='dimension' if annotation else 'geometry', geometry=geometry,
            signature=signature([geometry, annotation.model_dump() if annotation else None, sketch.units, measurement]),
            status=status))

    for e in sketch.entities:
        if e.id not in geometry_ids:
            continue
        if e.type == 'line':
            add(f'{e.id}:length', [e], 'length', math.dist(*e.points))
        elif e.type in ('circle', 'arc'):
            add(f'{e.id}:radius', [e], 'radius', e.radius)
            if e.type == 'circle':
                add(f'{e.id}:diameter', [e], 'diameter', 2*e.radius)
            else:
                sweep = (e.end_angle-e.start_angle) % 360
                if sweep <= 1e-8:
                    warnings.append(f'{e.id}: zero-sweep arc is ambiguous; radius requires review.')
                    features[-1].status = 'Invalid geometry: zero-sweep arc'
        else:
            pairs = list(zip(e.points, e.points[1:]))
            if e.closed:
                pairs.append((e.points[-1], e.points[0]))
            add(f'{e.id}:perimeter', [e], 'perimeter' if e.closed else 'path length', sum(math.dist(a, b) for a, b in pairs))
            if e.closed:
                for axis, name in ((0, 'width'), (1, 'height')):
                    add(f'{e.id}:{name}', [e], name, max(p[axis] for p in e.points)-min(p[axis] for p in e.points))
            if not valid_polyline(e):
                for f in features:
                    if f.entity_ids == [e.id]:
                        f.status = 'Invalid polyline geometry'
    for a in sketch.annotations:
        if any(ref in by_id and ref not in geometry_ids for ref in a.refs):
            warnings.append(f'{a.id}: dimension references geometry outside the Geometry layer; excluded.')
            continue
        entities = [by_id[i] for i in a.refs if i in by_id]
        try:
            value = measured(a, entities)
        except ValueError:
            warnings.append(f'{a.id}: invalid or missing annotation references; excluded.')
            continue
        add(f'annotation:{a.id}', entities, a.type, value, a)
        if any(e.type == 'polyline' and not valid_polyline(e) for e in entities):
            features[-1].status = 'Invalid polyline geometry'
    return Extraction(drawing_id=sketch.drawing_id, revision=sketch.revision, units=sketch.units,
                      features=features, warnings=warnings)


class Term(StrictModel):
    feature_id: str = Field(max_length=200)
    signature: str = Field(max_length=100)
    name: str = Field(min_length=1, max_length=100)
    plus: float = Field(ge=0, le=1e6)
    minus: float = Field(ge=0, le=1e6)
    coefficient: float = Field(ge=-1000, le=1000)
    reviewed: bool = False


class Calculation(StrictModel):
    sketch: Sketch
    revision: int = Field(ge=1)
    terms: list[Term] = Field(min_length=1, max_length=100)
    units: str = Field(max_length=20)
    relationship: str = Field(default='', max_length=20000)
    automatic_relationship: bool = False
    relationship_confirmed: bool = False
    statistics: bool = False
    lower_spec: float
    upper_spec: float
    samples: int = Field(default=10000, ge=100, le=200000, strict=True)
    seed: int = Field(default=42, ge=0, le=4294967295, strict=True)


@router.post('/import-drawing', response_model=Extraction)
def import_drawing(sketch: Sketch):
    return extract(sketch)


def reject(code, message):
    raise HTTPException(422, detail={'code': code, 'message': message})


class SourceTerm(StrictModel):
    feature_id: str
    entity_ids: list[str]
    annotation_id: str | None
    signature: str
    plus: float
    minus: float
    tolerance_source: Literal['drawing', 'user']
    coefficient: float
    source_handle: str | None


class CalculationResult(StrictModel):
    drawing_id: str
    revision: int
    units: str
    relationship: str
    sources: list[SourceTerm]
    result: AnalysisResult


@router.post('/calculate', response_model=CalculationResult)
def calculate(request: Calculation):
    if not request.sketch.units:
        reject('units_required', 'Explicitly assign drawing units in the editor; coordinates are never pixels.')
    if request.revision != request.sketch.revision:
        reject('stale_revision', 'Refresh the draft from the current drawing revision.')
    if not request.automatic_relationship and (not request.relationship_confirmed or not request.relationship.strip()):
        reject('relationship_required', 'Define and approve the signed 1D engineering relationship.')
    if len({t.feature_id for t in request.terms}) != len(request.terms):
        reject('duplicate_features', 'A feature may occur only once in the stack.')
    if not any(t.coefficient for t in request.terms):
        reject('empty_relationship', 'At least one coefficient must be nonzero.')
    if request.units not in ('mm', 'cm', 'm', 'in', 'ft'):
        reject('incompatible_units', 'Select mm, cm, m, in or ft for the stack.')
    try:
        factor = (1 * ureg(request.sketch.units)).to(request.units).magnitude
        if not ureg(request.units).is_compatible_with(ureg.meter):
            raise ValueError()
    except (pint.PintError, ValueError, AttributeError):
        reject('incompatible_units', 'Stack units must be supported engineering length units.')
    features = {f.id: f for f in extract(request.sketch).features}
    components = []
    sources = []
    for t in request.terms:
        f = features.get(t.feature_id)
        if not f or t.signature != f.signature:
            reject('stale_reference', 'Geometry or dimension changed. Refresh and review the feature.')
        if f.units == 'deg' or f.status.startswith('Invalid'):
            reject('unsupported_relationship', 'Only valid length measurements support this signed 1D stack.')
        if not t.reviewed and (not request.automatic_relationship or f.displayed_value):
            reject('review_required', 'Confirm each selected feature and its engineering specification.')
        try:
            components.append(Component(name=t.name, nominal=f.nominal*factor, tolerance=0,
                                        plus=t.plus*factor, minus=t.minus*factor, coefficient=t.coefficient))
        except ValueError:
            reject('component_limits', 'Converted component exceeds calculation limits.')
        sources.append({'feature_id': f.id, 'entity_ids': f.entity_ids, 'annotation_id': f.annotation_id,
                        'signature': f.signature, 'plus': t.plus, 'minus': t.minus,
                        'tolerance_source': 'drawing' if (t.plus, t.minus) == (f.plus, f.minus) else 'user',
                        'coefficient': t.coefficient, 'source_handle': f.source_handle})
    try:
        result = analyze(AnalysisRequest(components=components, statistics=request.statistics,
            lower_spec=request.lower_spec, upper_spec=request.upper_spec, samples=request.samples, seed=request.seed))
    except ValueError:
        reject('invalid_specs', 'Check specifications and simulation limits.')
    relationship = ('Stack = ' + ' + '.join(f'({t.coefficient:g} × {t.name})' for t in request.terms)
                    if request.automatic_relationship else request.relationship)
    return {'drawing_id': request.sketch.drawing_id, 'revision': request.revision,
            'units': request.units, 'relationship': relationship, 'sources': sources,
            'result': result.model_dump()}
