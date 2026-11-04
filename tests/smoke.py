"""Run against the frontend origin to verify static content and API proxying."""
import json
import sys
import urllib.request

origin = sys.argv[1] if len(sys.argv) > 1 else 'http://frontend:8080'
with urllib.request.urlopen(origin, timeout=10) as response:
    assert b'Engineering AI' in response.read()
with urllib.request.urlopen(origin + '/api/health', timeout=10) as response:
    assert json.load(response) == {'status': 'ok'}
payload = {'components': [
    {'name': 'Housing', 'nominal': 10, 'tolerance': 0.2},
    {'name': 'Shaft', 'nominal': 8, 'tolerance': 0.1, 'coefficient': -1}],
    'lower_spec': 1.5, 'upper_spec': 2.5, 'samples': 1000, 'seed': 42}
request = urllib.request.Request(origin + '/api/tolerance/analyze', data=json.dumps(payload).encode(),
                                 headers={'Content-Type': 'application/json'})
with urllib.request.urlopen(request, timeout=30) as response:
    result = json.load(response)
assert result['nominal'] == 2
assert result['monte_carlo']['yield_percent'] == 100
assert sum(result['monte_carlo']['counts']) == 1000
print('Frontend, health endpoint, and proxied tolerance analysis passed.')
