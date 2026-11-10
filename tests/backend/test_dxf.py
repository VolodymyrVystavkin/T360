import io
import ezdxf
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def dxf_text(units=4):
    doc = ezdxf.new()
    doc.units = units
    space = doc.modelspace()
    space.add_line((0, 0), (100, 25))
    space.add_circle((50, 30), 10)
    space.add_arc((5, 5), 3, 30, 160)
    space.add_lwpolyline([(0, 0), (4, 0), (4, 4)], close=True)
    space.add_text('Unsupported annotation')
    output = io.StringIO()
    doc.write(output)
    return output.getvalue()


def test_import_export_geometry_and_warning():
    response = client.post('/api/v1/drawings/import-dxf', content=dxf_text())
    assert response.status_code == 200
    sketch = response.json()
    assert sketch['units'] == 'mm'
    assert len(sketch['entities']) == 4
    assert any('TEXT' in warning for warning in sketch['warnings'])
    exported = client.post('/api/v1/drawings/export-dxf', json=sketch)
    assert exported.status_code == 200
    model = ezdxf.read(io.StringIO(exported.text)).modelspace()
    assert model.query('LINE')[0].dxf.end == (100, 25, 0)
    assert model.query('CIRCLE')[0].dxf.radius == 10
    assert model.query('ARC')[0].dxf.end_angle == 160
    assert model.query('LWPOLYLINE')[0].closed


def test_unspecified_units_require_choice():
    sketch = client.post('/api/v1/drawings/import-dxf', content=dxf_text(0)).json()
    assert sketch['units'] is None
    assert client.post('/api/v1/drawings/export-dxf', json=sketch).status_code == 422


def test_bad_files_and_geometry():
    assert client.post('/api/v1/drawings/import-dxf', content='not dxf').status_code == 422
    assert client.post('/api/v1/drawings/import-dxf', content=b'x' * (5*1024*1024+1)).status_code == 413
    sketch = {'units': 'mm', 'entities': [{'id': 'a', 'type': 'circle', 'points': [[0, 0]], 'radius': -1}]}
    assert client.post('/api/v1/drawings/export-dxf', json=sketch).status_code == 422


def test_bulges_are_reported_not_flattened():
    doc = ezdxf.new()
    doc.modelspace().add_lwpolyline([(0, 0, 0, 0, 1), (10, 0, 0, 0, 0)])
    output = io.StringIO(); doc.write(output)
    result = client.post('/api/v1/drawings/import-dxf', content=output.getvalue()).json()
    assert result['entities'] == []
    assert any('bulges' in warning for warning in result['warnings'])


def test_empty_dxf_reports_no_drawing_entities():
    doc = ezdxf.new('R2010')
    doc.units = 6
    output = io.StringIO()
    doc.write(output)
    response = client.post('/api/v1/drawings/import-dxf', content=output.getvalue())
    assert response.status_code == 200
    result = response.json()
    assert result['entities'] == []
    assert result['units'] == 'm'
    assert 'no drawing entities' in result['warnings'][0]
