import math

import pytest
from fastapi.testclient import TestClient
from app.main import AnalysisRequest, analyze, app

client = TestClient(app)
PAYLOAD = {'components': [
    {'name': 'Housing', 'nominal': 10, 'tolerance': .2},
    {'name': 'Shaft', 'nominal': 8, 'tolerance': .1, 'coefficient': -1}],
    'lower_spec': 1.5, 'upper_spec': 2.5, 'seed': 7, 'samples': 10000}


def test_analytical_stack():
    result = analyze(AnalysisRequest(**PAYLOAD))
    assert result.nominal == 2
    assert result.worst_case.lower == pytest.approx(1.7)
    assert result.worst_case.upper == pytest.approx(2.3)
    assert result.rss.half_width == pytest.approx(math.sqrt(.05))


def test_seeded_uniform_simulation():
    result = analyze(AnalysisRequest(**PAYLOAD))
    assert result == analyze(AnalysisRequest(**PAYLOAD))
    mc = result.monte_carlo
    assert mc.mean == pytest.approx(2, abs=.005)
    assert mc.standard_deviation == pytest.approx(math.sqrt(.05 / 3), abs=.003)
    assert 1.7 <= mc.minimum <= mc.maximum <= 2.3
    assert mc.yield_percent == 100
    assert sum(mc.counts) == 10000
    assert len(mc.bin_edges) == len(mc.counts) + 1


def test_zero_tolerance_and_zero_coefficient():
    req = AnalysisRequest(components=[{'name': 'Fixed', 'nominal': 2, 'tolerance': 0},
        {'name': 'Ignored', 'nominal': 100, 'tolerance': 100, 'coefficient': 0}], lower_spec=0, upper_spec=1)
    result = analyze(req)
    assert result.worst_case.half_width == 0
    assert result.monte_carlo.mean == 2
    assert result.monte_carlo.yield_percent == 0


def test_api():
    assert client.get('/api/health').json() == {'status': 'ok'}
    response = client.post('/api/tolerance/analyze', json=PAYLOAD)
    assert response.status_code == 200
    assert response.json()['nominal'] == 2


@pytest.mark.parametrize('update', [
    {'components': []}, {'samples': 200001}, {'samples': 10.5}, {'seed': -1},
    {'lower_spec': 3, 'upper_spec': 2}, {'unexpected': True},
    {'components': [{'name': 'Bad', 'nominal': 1, 'tolerance': -1}]},
    {'components': [{'name': 'Bad', 'nominal': 'NaN', 'tolerance': 1}]},
])
def test_invalid_requests(update):
    assert client.post('/api/tolerance/analyze', json={**PAYLOAD, **update}).status_code == 422
