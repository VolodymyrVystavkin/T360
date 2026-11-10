import io
import math
import ezdxf
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.dxf.models import Annotation, Sketch, Tolerance, measured
from app.dxf.service import read_dxf, write_dxf

client = TestClient(app)


def fixture():
    return Sketch.model_validate({'units': 'mm', 'entities': [
        {'id': 'circle', 'type': 'circle', 'points': [[0, 0]], 'radius': 10},
        {'id': 'horizontal', 'type': 'line', 'points': [[0, 0], [100, 0]]},
        {'id': 'vertical', 'type': 'line', 'points': [[0, 0], [0, 50]]},
        {'id': 'aligned', 'type': 'line', 'points': [[0, 0], [30, 40]]},
        {'id': 'rectangle', 'type': 'polyline', 'points': [[0, 0], [100, 0], [100, 60], [0, 60]], 'closed': True},
        {'id': 'arc', 'type': 'arc', 'points': [[200, 0]], 'radius': 15, 'start_angle': 20, 'end_angle': 150},
    ]})


def annotation(kind, refs, value, position=(20, 20)):
    return Annotation(id='dim-'+kind+'-'.join(refs), type=kind, refs=refs, measured_value=value,
                      units='deg' if kind == 'angular' else 'mm', placement={'position': position})


@pytest.mark.parametrize('kind,refs,value', [
    ('diameter', ['circle'], 20), ('radius', ['circle'], 10), ('radius', ['arc'], 15),
    ('horizontal', ['horizontal'], 100), ('vertical', ['vertical'], 50), ('aligned', ['aligned'], 50),
    ('horizontal', ['rectangle'], 100), ('vertical', ['rectangle'], 60),
    ('angular', ['horizontal', 'vertical'], 90),
])
def test_geometry_measurement(kind, refs, value):
    sketch = fixture()
    a = annotation(kind, refs, value)
    assert measured(a, [next(e for e in sketch.entities if e.id == i) for i in refs]) == pytest.approx(value)


def annotated_fixture():
    sketch = fixture()
    sketch.annotations = [annotation(*args) for args in [
        ('diameter', ['circle'], 20), ('radius', ['arc'], 15),
        ('horizontal', ['horizontal'], 100), ('vertical', ['vertical'], 50),
        ('aligned', ['aligned'], 50), ('angular', ['horizontal', 'vertical'], 90),
        ('horizontal', ['rectangle'], 100), ('vertical', ['rectangle'], 60),
    ]]
    return sketch


def test_real_dimensions_and_native_associativity_round_trip():
    sketch = annotated_fixture()
    sketch.annotations[0].tolerance = Tolerance(plus=0.1, minus=0.2)
    sketch.annotations[0].text_override = 'Explicit override'
    sketch = Sketch.model_validate(sketch.model_dump())
    response = client.post('/api/v1/drawings/export-dxf', json=sketch.model_dump())
    assert response.status_code == 200, response.text
    doc = ezdxf.read(io.StringIO(response.text))
    assert 'ASME Y14.5' in doc.layers
    dimensions = list(doc.modelspace().query('DIMENSION'))
    assert {d.dxf.dimtype & 15 for d in dimensions} == {0, 1, 2, 3, 4}
    for dimension, source in zip(dimensions, sketch.annotations):
        assert dimension.dxf.layer == 'ASME Y14.5'
        assert dimension.dxf.geometry in doc.blocks
        assert len(doc.blocks[dimension.dxf.geometry]) > 0
        assert dimension.get_measurement() == pytest.approx(source.measured_value)
    assert len(doc.audit().errors) == 0
    imported = client.post('/api/v1/drawings/import-dxf', content=response.content)
    assert imported.status_code == 200, imported.text
    restored = imported.json()
    assert len(restored['annotations']) == len(sketch.annotations)
    assert restored['annotations'][0]['id'] == sketch.annotations[0].id
    assert restored['annotations'][0]['refs'] == ['circle']
    assert restored['annotations'][0]['tolerance'] == {'plus': 0.1, 'minus': 0.2}
    assert restored['annotations'][0]['text_override'] == 'Explicit override'
    assert len(restored['entities']) == len(sketch.entities)


def test_dimension_layer_is_present_once_and_visibility_round_trips():
    sketch = fixture().model_dump()
    sketch['layers'] = ['ASME Y14.5', 'ASME Y14.5']
    sketch['hidden_layers'] = ['ASME Y14.5']
    restored = read_dxf(write_dxf(Sketch.model_validate(sketch).model_dump()))
    assert restored['layers'].count('ASME Y14.5') == 1
    assert 'Geometry' in restored['layers']
    assert restored['hidden_layers'] == ['ASME Y14.5']


@pytest.mark.parametrize('change', ['value', 'units', 'refs', 'negative_tolerance', 'precision', 'nan'])
def test_reject_inconsistent_annotations(change):
    sketch = annotated_fixture().model_dump()
    a = sketch['annotations'][0]
    if change == 'value': a['measured_value'] = 99
    elif change == 'units': a['units'] = 'in'
    elif change == 'refs': a['refs'] = ['missing']
    elif change == 'negative_tolerance': a['tolerance'] = {'plus': -1, 'minus': 0}
    elif change == 'precision': a['precision'] = 99
    else: a['placement']['position'] = [float('nan'), 0]
    if change == 'nan':
        with pytest.raises(ValueError): Sketch.model_validate(sketch)
    else:
        assert client.post('/api/v1/drawings/export-dxf', json=sketch).status_code == 422


def test_flagged_deleted_references_block_export():
    sketch = annotated_fixture().model_dump()
    sketch['annotations'][0]['status'] = 'orphan'
    sketch['entities'] = [e for e in sketch['entities'] if e['id'] != 'circle']
    assert client.post('/api/v1/drawings/export-dxf', json=sketch).status_code == 422


def test_non_native_linear_radial_and_angular_dimensions_import():
    doc = ezdxf.new('R2010', setup=True)
    doc.units = 4
    m = doc.modelspace()
    m.add_circle((200, 0), 10)
    m.add_line((0, 0), (100, 0))
    m.add_line((0, 0), (0, 50))
    m.add_line((0, 0), (30, 40))
    for dim in [m.add_linear_dim(base=(50, -12), p1=(0, 0), p2=(100, 0), override={'dimlfac': 1}),
                m.add_linear_dim(base=(-12, 25), p1=(0, 0), p2=(0, 50), angle=90, override={'dimlfac': 1}),
                m.add_aligned_dim(p1=(0, 0), p2=(30, 40), distance=12, override={'dimlfac': 1}),
                m.add_radius_dim(center=(200, 0), radius=10, angle=45, override={'dimlfac': 1}),
                m.add_diameter_dim(center=(200, 0), radius=10, angle=45, override={'dimlfac': 1}),
                m.add_angular_dim_2l(base=(20, 20), line1=((0, 0), (100, 0)), line2=((0, 0), (0, 50)), override={'dimlfac': 1})]:
        dim.render()
    stream = io.StringIO(); doc.write(stream)
    result = read_dxf(stream.getvalue())
    assert len(result['annotations']) == 6, result['warnings']
    assert {a['type'] for a in result['annotations']} == {'horizontal', 'vertical', 'aligned', 'radius', 'diameter', 'angular'}


def test_unsupported_and_ambiguous_dimensions_reported():
    doc = ezdxf.new('R2010', setup=True)
    m = doc.modelspace()
    m.add_line((0, 0), (10, 0)); m.add_line((0, 0), (10, 0))
    m.add_linear_dim(base=(5, -10), p1=(0, 0), p2=(10, 0)).render()
    output = io.StringIO(); doc.write(output)
    result = read_dxf(output.getvalue())
    assert not result['annotations']
    assert any('DIMENSION' in w and 'ambiguous' in w for w in result['warnings'])


def test_parallel_lines_do_not_create_a_fake_angle():
    sketch = fixture()
    sketch.entities[2].points = [(0, 1), (100, 1)]
    with pytest.raises(ValueError):
        measured(annotation('angular', ['horizontal', 'vertical'], 0), sketch.entities[1:3])


def test_scaled_foreign_dimension_is_reported():
    doc = ezdxf.new('R2010', setup=True)
    m = doc.modelspace()
    m.add_line((0, 0), (10, 0))
    m.add_linear_dim(base=(5, -10), p1=(0, 0), p2=(10, 0), override={'dimlfac': 100}).render()
    output = io.StringIO(); doc.write(output)
    result = read_dxf(output.getvalue())
    assert result['annotations'] == []
    assert any('DIMENSION' in w for w in result['warnings'])


@pytest.mark.parametrize('angle', [-135, -45, 45, 90, 135, 179])
def test_angular_export_keeps_minor_directed_angle_when_label_is_moved(angle):
    sketch = fixture()
    sketch.entities[2].points = [(0, 0), (50*math.cos(math.radians(angle)), 50*math.sin(math.radians(angle)))]
    a = annotation('angular', ['horizontal', 'vertical'], abs(angle), (-100, -100))
    a.placement.manual = True
    sketch.annotations = [a]
    result = write_dxf(Sketch.model_validate(sketch.model_dump()).model_dump())
    doc = ezdxf.read(io.StringIO(result))
    dimension = list(doc.modelspace().query('DIMENSION'))[0]
    assert dimension.get_measurement() == pytest.approx(abs(angle))


def test_radial_dimension_text_at_center_does_not_crash_export():
    sketch = fixture()
    sketch.annotations = [annotation('radius', ['circle'], 10, (0, 0))]
    doc = ezdxf.read(io.StringIO(write_dxf(sketch.model_dump())))
    assert list(doc.modelspace().query('DIMENSION'))[0].get_measurement() == pytest.approx(10)


def test_reserved_annotation_layer_geometry_is_moved_with_report():
    doc = ezdxf.new()
    doc.layers.new('ASME Y14.5')
    doc.modelspace().add_circle((0, 0), 10, dxfattribs={'layer': 'ASME Y14.5'})
    stream = io.StringIO(); doc.write(stream)
    result = read_dxf(stream.getvalue())
    assert result['entities'][0]['layer'] == 'Geometry'
    assert any('reserved annotation layer' in w for w in result['warnings'])


def test_non_xy_dimension_is_reported():
    sketch = annotated_fixture().model_dump()
    doc = ezdxf.read(io.StringIO(write_dxf(sketch)))
    dimension = list(doc.modelspace().query('DIMENSION'))[0]
    dimension.dxf.extrusion = (0, 1, 0)
    stream = io.StringIO(); doc.write(stream)
    result = read_dxf(stream.getvalue())
    assert len(result['annotations']) == len(sketch['annotations'])-1
    assert any('DIMENSION' in w for w in result['warnings'])


def test_dimension_definition_must_match_native_metadata():
    sketch = annotated_fixture().model_dump()
    doc = ezdxf.read(io.StringIO(write_dxf(sketch)))
    dimension = list(doc.modelspace().query('DIMENSION'))[0]
    dimension.dxf.defpoint4 = dimension.dxf.defpoint4 + (100, 0, 0)
    output = io.StringIO(); doc.write(output)
    result = read_dxf(output.getvalue())
    assert len(result['annotations']) == len(sketch['annotations'])-1
    assert any('DIMENSION' in w for w in result['warnings'])
