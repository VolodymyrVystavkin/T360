import { afterEach, describe, expect, it, vi } from 'vitest';
import { newId } from './id';
import { emptySketch, newEntity, normalizeSketch } from '../dxf/model';
import { makeAnnotation } from '../dxf/annotations';

const browserCrypto = globalThis.crypto;
const uuidV4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
function httpCrypto() {
  vi.stubGlobal('crypto', { getRandomValues: browserCrypto.getRandomValues.bind(browserCrypto) });
}

describe('Drawing IDs on secure and HTTP origins', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('uses the native UUID API when available', () => {
    const randomUUID = vi.fn(() => '6cd7552a-1ec6-4fa0-9b55-f89867960e93');
    vi.stubGlobal('crypto', { randomUUID });
    expect(newId()).toBe('6cd7552a-1ec6-4fa0-9b55-f89867960e93');
    expect(randomUUID).toHaveBeenCalledOnce();
  });

  it('generates distinct UUID v4 values when randomUUID is unavailable', () => {
    httpCrypto();
    const ids = Array.from({ length: 1000 }, () => newId());
    expect(ids.every((id) => uuidV4.test(id))).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('creates drawings, geometry and linked dimensions on HTTP without replacing existing IDs', () => {
    httpCrypto();
    const sketch = emptySketch();
    const circle = newEntity('circle', [[0, 0]], 10);
    sketch.entities.push(circle);
    const annotation = makeAnnotation('diameter', [circle.id], sketch, 'manual');
    expect(sketch.drawing_id).toMatch(uuidV4);
    expect(circle.id).toMatch(uuidV4);
    expect(annotation?.id).toMatch(uuidV4);
    expect(annotation?.refs).toEqual([circle.id]);
    expect(annotation?.measured_value).toBe(20);
    expect(normalizeSketch(sketch).drawing_id).toBe(sketch.drawing_id);
    expect(normalizeSketch(sketch).entities[0].id).toBe(circle.id);
  });

  it('sets version and variant bits even when random bytes have all bits set', () => {
    vi.stubGlobal('crypto', { getRandomValues: (bytes: Uint8Array) => bytes.fill(255) });
    expect(newId()).toBe('ffffffff-ffff-4fff-bfff-ffffffffffff');
  });
});
