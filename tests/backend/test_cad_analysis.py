"""Real DXF -> native edited snapshot -> validated features -> existing engine."""
import copy
import io
import math
from pathlib import Path
import ezdxf
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.dxf.models import Sketch
from app.dxf.service import read_dxf
from app.cad_analysis import extract

client = TestClient(app)
FIXTURE = Path(__file__).parents[1] / 'fixtures/cad-clearance.dxf'


@pytest.fixture
def sketch():
    result = read_dxf(FIXTURE.read_text())
    result.update(drawing_id='acceptance-drawing', revision=7)
    return Sketch.model_validate(result).model_dump(mode='json')


def imported(sketch):
    response = client.post('/api/v1/analysis/import-drawing', json=sketch)
    assert response.status_code == 200, response.text
    return response.json()


def calculation(sketch, statistics=False):
    features = imported(sketch)['features']
    terms = []
    for name, coefficient in [('housing',1),('shaft',-1),('spacer',-1)]:
        f = next(f for f in features if f['id'] == f'annotation:dim-{name}')
        terms.append(dict(feature_id=f['id'], signature=f['signature'], name=name,
                          plus=f['plus'], minus=f['minus'], coefficient=coefficient, reviewed=True))
    return dict(sketch=sketch, revision=7, terms=terms, units='mm', relationship='Clearance = Housing - Shaft - Spacer',
                relationship_confirmed=True, statistics=statistics, lower_spec=0, upper_spec=.5, samples=100000, seed=42)


def test_geometry_measurements_units_sources_and_no_invented_tolerances(sketch):
    data = imported(sketch)
    f = {f['id']: f for f in data['features']}
    assert f['housing:length']['nominal'] == 20
    assert f['housing:length']['annotation_ids'] == ['dim-housing']
    assert f['circle:diameter']['nominal'] == 20
    assert f['arc:radius']['nominal'] == 3
    assert f['profile:perimeter']['nominal'] == 14
    assert f['profile:width']['nominal'] == 4
    assert f['profile:height']['nominal'] == 3
    for feature in f.values():
        assert feature['units'] == 'mm'
        assert feature['drawing_id'] == 'acceptance-drawing'
        assert feature['revision'] == 7
        assert feature['source_handle']
        if feature['source'] == 'geometry':
            assert feature['plus'] is None and feature['minus'] is None
    assert f['annotation:dim-housing']['plus'] == .12
    assert f['annotation:dim-housing']['entity_ids'] == ['housing']
    assert any('TEXT' in warning for warning in data['warnings'])


def test_real_dxf_http_import_through_acceptance_calculation():
    response = client.post('/api/v1/drawings/import-dxf', content=FIXTURE.read_bytes())
    assert response.status_code == 200
    s = Sketch.model_validate(response.json()).model_dump(mode='json')
    s['revision'] = 7
    request = calculation(s, statistics=True)
    response = client.post('/api/v1/analysis/calculate', json=request)
    assert response.status_code == 200, response.text
    output = response.json()
    r = output['result']
    assert r['nominal'] == pytest.approx(.2)
    assert r['worst_case']['lower'] == pytest.approx(-.05)
    assert r['worst_case']['upper'] == pytest.approx(.45)
    assert r['rss']['half_width'] == pytest.approx(math.sqrt(.12**2+.05**2+.08**2))
    assert r['monte_carlo']['samples'] == 100000
    assert r['monte_carlo']['standard_deviation'] == pytest.approx(math.sqrt((.12**2+.05**2+.08**2)/3), abs=.001)
    assert output['revision'] == 7 and output['drawing_id'] == s['drawing_id']
    assert all(t['tolerance_source'] == 'drawing' for t in output['sources'])
    assert client.post('/api/v1/analysis/calculate', json=request).json() == output


def test_worst_case_without_statistical_assumptions(sketch):
    result = client.post('/api/v1/analysis/calculate', json=calculation(sketch)).json()['result']
    assert result['rss'] is None and result['monte_carlo'] is None


def test_asymmetric_signed_bounds_and_converted_units(sketch):
    request = calculation(sketch)
    request['terms'][0].update(plus=.2, minus=.1)
    request['terms'][1].update(plus=.04, minus=.02)
    request['terms'][2].update(plus=.08, minus=.03)
    request.update(units='in', lower_spec=-1, upper_spec=1)
    r = client.post('/api/v1/analysis/calculate', json=request).json()['result']
    assert r['nominal'] == pytest.approx(.2/25.4)
    assert r['worst_case']['lower'] == pytest.approx((.2-.1-.04-.08)/25.4)
    assert r['worst_case']['upper'] == pytest.approx((.2+.2+.02+.03)/25.4)


@pytest.mark.parametrize('unit', [None, 'mm', 'cm', 'm', 'in', 'ft'])
def test_units_preserved(sketch, unit):
    sketch['units'] = unit
    sketch['annotations'] = []
    assert imported(sketch)['units'] == unit


@pytest.mark.parametrize('mutation,code', [
    (lambda r: r.update(units='deg'), 'incompatible_units'),
    (lambda r: r.update(units='second'), 'incompatible_units'),
    (lambda r: r.update(revision=6), 'stale_revision'),
    (lambda r: r.update(relationship_confirmed=False), 'relationship_required'),
    (lambda r: r['terms'][0].update(reviewed=False), 'review_required'),
    (lambda r: r['terms'][0].update(signature='older'), 'stale_reference'),
    (lambda r: r['terms'][0].update(feature_id='deleted'), 'stale_reference'),
    (lambda r: r['terms'].append(copy.deepcopy(r['terms'][0])), 'duplicate_features'),
])
def test_reject_invalid_engineering_mapping(sketch, mutation, code):
    request = calculation(sketch)
    mutation(request)
    response = client.post('/api/v1/analysis/calculate', json=request)
    assert response.status_code == 422
    assert response.json()['detail']['code'] == code


def test_unknown_units_block_calculation(sketch):
    request = calculation(sketch)
    request['sketch']['units'] = None
    request['sketch']['annotations'] = []
    assert client.post('/api/v1/analysis/calculate', json=request).json()['detail']['code'] == 'units_required'


def test_missing_tolerance_not_accepted(sketch):
    request = calculation(sketch)
    request['terms'][0]['plus'] = None
    assert client.post('/api/v1/analysis/calculate', json=request).status_code == 422


def test_unsaved_edit_recomputes_measurements_and_invalidates_signatures(sketch):
    old = imported(sketch)
    sketch['annotations'] = []
    sketch['entities'][0]['points'][1][0] = 22
    sketch['revision'] = 8
    new = imported(sketch)
    old_line = next(f for f in old['features'] if f['id'] == 'housing:length')
    new_line = next(f for f in new['features'] if f['id'] == 'housing:length')
    assert new_line['nominal'] == 22
    assert new_line['signature'] != old_line['signature']
    assert new_line['revision'] == 8
    assert new_line['entity_ids'] == old_line['entity_ids']
    assert imported(sketch)['features'] == new['features']


def test_dimension_override_preserved_and_never_used_as_nominal(sketch):
    sketch['annotations'][0]['text_override'] = '999.99 REF'
    feature = next(f for f in imported(sketch)['features'] if f['id'] == 'annotation:dim-housing')
    assert feature['nominal'] == 20
    assert feature['displayed_value'] == '999.99 REF'
    assert 'Review text override' in feature['status']


def test_all_supported_annotation_types():
    from app.dxf.models import Entity, Annotation
    entities = [Entity(id='x',type='line',layer='Geometry',points=[(0,0),(3,4)]),
                Entity(id='y',type='line',layer='Geometry',points=[(0,0),(0,4)]),
                Entity(id='c',type='circle',layer='Geometry',points=[(10,0)],radius=2)]
    annotations = [Annotation(id=t,type=t,refs=['x'],measured_value=v,units='mm') for t,v in [('horizontal',3),('vertical',4),('aligned',5)]]
    annotations += [Annotation(id=t,type=t,refs=['c'],measured_value=v,units='mm') for t,v in [('radius',2),('diameter',4)]]
    angle = math.degrees(math.atan2(12,16))
    annotations.append(Annotation(id='angular',type='angular',refs=['x','y'],measured_value=angle,units='deg'))
    sketch = Sketch(units='mm',entities=entities,annotations=annotations)
    features = extract(sketch).features
    assert {f.measurement for f in features if f.annotation_id} == {'horizontal','vertical','aligned','radius','diameter','angular'}


def test_blocks_polyline_and_stable_dxf_handles(sketch):
    first = read_dxf(FIXTURE.read_text())
    second = read_dxf(FIXTURE.read_text())
    assert [e['id'] for e in first['entities']] == [e['id'] for e in second['entities']]
    virtual = next(e for e in sketch['entities'] if '/' in e['id'])
    assert math.dist(*virtual['points']) == pytest.approx(4)
    assert virtual['points'][0] == [80,0]
    assert len([e for e in sketch['entities'] if e['type'] == 'polyline']) == 2


@pytest.mark.parametrize('points', [[(0,0),(0,0)], [(0,0),(3,3),(0,3),(3,0)]])
def test_invalid_polyline_flagged(points):
    s = Sketch(units='mm', entities=[dict(id='p',type='polyline',layer='Geometry',points=points,closed=True)])
    assert all(f.status.startswith('Invalid') for f in extract(s).features)


def test_nonfinite_and_invalid_radii_rejected(sketch):
    sketch['entities'][0]['points'][0][0] = 'NaN'
    assert client.post('/api/v1/analysis/import-drawing', json=sketch).status_code == 422
    sketch['entities'][0]['points'][0][0] = 0
    sketch['entities'][0]['radius'] = -1
    assert client.post('/api/v1/analysis/import-drawing', json=sketch).status_code == 422


def test_edited_snapshot_rejects_previous_feature_signature(sketch):
    request = calculation(sketch)
    request['sketch']['entities'][0]['points'][1][0] = 21
    request['sketch']['annotations'][0]['measured_value'] = 21
    response = client.post('/api/v1/analysis/calculate', json=request)
    assert response.status_code == 422
    assert response.json()['detail']['code'] == 'stale_reference'


def test_nonuniform_blocks_report_unsupported_curves():
    doc = ezdxf.new()
    block = doc.blocks.new('CIRCLE')
    block.add_circle((0,0), 2)
    doc.modelspace().add_blockref('CIRCLE', (10,20), dxfattribs={'xscale':2, 'yscale':1})
    output = io.StringIO(); doc.write(output)
    result = read_dxf(output.getvalue())
    assert not result['entities']
    assert any('ELLIPSE' in w for w in result['warnings'])


def test_angular_feature_cannot_enter_linear_stack(sketch):
    request = calculation(sketch)
    request['sketch']['entities'] += [
        dict(id='angular-x',type='line',layer='Geometry',points=[(0,0),(5,0)]),
        dict(id='angular-y',type='line',layer='Geometry',points=[(0,0),(0,5)])]
    request['sketch']['annotations'].append(dict(id='angle',type='angular',refs=['angular-x','angular-y'],measured_value=90,units='deg'))
    feature = next(f for f in imported(request['sketch'])['features'] if f['id'] == 'annotation:angle')
    request['terms'][0].update(feature_id=feature['id'], signature=feature['signature'])
    response = client.post('/api/v1/analysis/calculate', json=request)
    assert response.status_code == 422
    assert response.json()['detail']['code'] == 'unsupported_relationship'


def test_asymmetric_uniform_mean_variance_and_seed():
    from app.tolerance import AnalysisRequest, analyze
    request = AnalysisRequest(components=[dict(name='A',nominal=5,tolerance=0,plus=.6,minus=.2,coefficient=-2),
                                          dict(name='B',nominal=12,tolerance=0,plus=.1,minus=.3,coefficient=1)],
                              lower_spec=-5,upper_spec=5,samples=100000,seed=42)
    result = analyze(request)
    assert result.nominal == 2
    assert result.worst_case.lower == pytest.approx(.5)
    assert result.worst_case.upper == pytest.approx(2.5)
    assert result.rss.lower + result.rss.half_width == pytest.approx(1.5)
    assert result.monte_carlo.mean == pytest.approx(1.5, abs=.005)
    assert result.monte_carlo.standard_deviation == pytest.approx(math.sqrt((.8**2+.2**2)/3), abs=.005)
    assert result == analyze(request)


def test_worst_case_only_skips_rss_and_random_generator(monkeypatch):
    import app.tolerance as engine
    def unexpected(*args, **kwargs):
        raise AssertionError('Statistical work must not run without assumptions')
    monkeypatch.setattr(engine.math, 'hypot', unexpected)
    monkeypatch.setattr(engine.np.random, 'default_rng', unexpected)
    result = engine.analyze(engine.AnalysisRequest(components=[dict(name='Length',nominal=2,tolerance=.1)], statistics=False))
    assert result.worst_case.lower == pytest.approx(1.9)
    assert result.rss is None and result.monte_carlo is None


def test_automatic_relationship_uses_terms_without_manual_approval(sketch):
    request = calculation(sketch)
    request.update(automatic_relationship=True, relationship='', relationship_confirmed=False)
    for term in request['terms']:
        term['reviewed'] = False
    response = client.post('/api/v1/analysis/calculate', json=request)
    assert response.status_code == 200, response.text
    data = response.json()
    assert data['relationship'] == 'Stack = (1 × housing) + (-1 × shaft) + (-1 × spacer)'
    assert data['result']['nominal'] == pytest.approx(.2)
    assert data['result']['worst_case']['lower'] == pytest.approx(-.05)
    assert data['result']['worst_case']['upper'] == pytest.approx(.45)


def test_automatic_relationship_still_checks_override_and_source_signature(sketch):
    sketch['annotations'][0]['text_override'] = '999 REF'
    request = calculation(sketch)
    request.update(automatic_relationship=True, relationship='', relationship_confirmed=False)
    request['terms'][0]['reviewed'] = False
    response = client.post('/api/v1/analysis/calculate', json=request)
    assert response.status_code == 422
    assert response.json()['detail']['code'] == 'review_required'
    request['terms'][0].update(reviewed=True, signature='stale')
    response = client.post('/api/v1/analysis/calculate', json=request)
    assert response.status_code == 422
    assert response.json()['detail']['code'] == 'stale_reference'


def test_only_geometry_layer_and_its_dimensions_are_extracted(sketch):
    sketch['entities'][0]['layer'] = 'Construction'
    sketch['entities'][1]['layer'] = 'geometry'  # Layer name is exact, not case-folded.
    data = imported(sketch)
    ids = {f['id'] for f in data['features']}
    assert 'housing:length' not in ids
    assert 'shaft:length' not in ids
    assert 'annotation:dim-housing' not in ids
    assert 'annotation:dim-shaft' not in ids
    assert 'spacer:length' in ids
    assert 'annotation:dim-spacer' in ids
    assert all(e['layer'] == 'Geometry' for f in data['features'] for e in f['geometry'])
    assert any('outside the Geometry layer' in w for w in data['warnings'])


def test_moving_source_off_geometry_layer_blocks_old_stack(sketch):
    request = calculation(sketch)
    request['sketch']['entities'][0]['layer'] = 'Construction'
    response = client.post('/api/v1/analysis/calculate', json=request)
    assert response.status_code == 422
    assert response.json()['detail']['code'] == 'stale_reference'


def test_dimension_with_mixed_layer_references_is_excluded(sketch):
    sketch['entities'] += [
        dict(id='gx',type='line',layer='Geometry',points=[(0,0),(5,0)]),
        dict(id='cy',type='line',layer='Construction',points=[(0,0),(0,5)])]
    sketch['annotations'].append(dict(id='mixed',type='angular',refs=['gx','cy'],measured_value=90,units='deg'))
    data = imported(sketch)
    assert not any(f['annotation_id'] == 'mixed' for f in data['features'])
    assert 'mixed' not in next(f for f in data['features'] if f['id'] == 'gx:length')['annotation_ids']
