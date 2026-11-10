import { autoDimension, makeAnnotation, syncAnnotations, annotationText } from './annotations';
import { ANNOTATION_LAYER, emptySketch, newEntity, normalizeSketch, Sketch } from './model';

describe('Engineering annotation model', () => {
  let sketch: Sketch;
  beforeEach(() => (sketch = emptySketch()));
  it('creates mandatory layers once and migrates legacy drawings', () => {
    const restored = normalizeSketch(
      normalizeSketch({ entities: [], layers: [ANNOTATION_LAYER, ANNOTATION_LAYER] }),
    );
    expect(restored.layers.filter((l) => l === ANNOTATION_LAYER)).toHaveLength(1);
    expect(restored.layers).toContain('Geometry');
    expect(restored.annotations).toEqual([]);
  });
  it('derives circle diameter and optional radius and preserves explicit choices', () => {
    const c = newEntity('circle', [[0, 0]], 10);
    sketch.entities = [c];
    autoDimension(sketch);
    expect(sketch.annotations[0].measured_value).toBe(20);
    expect(annotationText(sketch.annotations[0])).toBe('⌀20.00');
    const radius = makeAnnotation('radius', [c.id], sketch, 'manual')!;
    expect(radius.measured_value).toBe(10);
    expect(annotationText(radius)).toBe('R10.00');
    sketch.annotations = [radius];
    autoDimension(sketch);
    expect(sketch.annotations).toHaveLength(1);
  });
  it.each([
    [[0, 0], [100, 0], 'horizontal', 100],
    [[0, 0], [0, 50], 'vertical', 50],
    [[0, 0], [30, 40], 'aligned', 50],
  ] as const)('measures line %j to %j', (p, q, type, value) => {
    sketch.entities = [newEntity('line', [[...p], [...q]])];
    autoDimension(sketch);
    expect(sketch.annotations[0].type).toBe(type);
    expect(sketch.annotations[0].measured_value).toBe(value);
  });
  it('generates two overall dimensions for rectangles and nonrectangular closed profiles', () => {
    const p = newEntity('polyline', [
      [0, 0],
      [100, 0],
      [100, 60],
      [0, 60],
    ]);
    p.closed = true;
    sketch.entities = [p];
    autoDimension(sketch);
    expect(sketch.annotations.map((a) => a.measured_value)).toEqual([100, 60]);
    autoDimension(sketch);
    expect(sketch.annotations).toHaveLength(2);
    p.points = [
      [0, 0],
      [100, 0],
      [50, 60],
    ];
    syncAnnotations(sketch);
    expect(sketch.annotations.map((a) => a.measured_value)).toEqual([100, 60]);
  });
  it('recognizes four-line rectangles without edge duplicates', () => {
    sketch.entities = [
      newEntity('line', [
        [0, 0],
        [100, 0],
      ]),
      newEntity('line', [
        [100, 0],
        [100, 60],
      ]),
      newEntity('line', [
        [100, 60],
        [0, 60],
      ]),
      newEntity('line', [
        [0, 60],
        [0, 0],
      ]),
    ];
    autoDimension(sketch);
    expect(sketch.annotations.map((a) => a.measured_value)).toEqual([100, 60]);
  });
  it('measures perpendicular lines and rejects parallel, coincident and zero-length lines', () => {
    const a = newEntity('line', [
        [0, 0],
        [10, 0],
      ]),
      b = newEntity('line', [
        [0, 0],
        [0, 10],
      ]);
    sketch.entities = [a, b];
    expect(makeAnnotation('angular', [a.id, b.id], sketch)?.measured_value).toBe(90);
    b.points = [
      [0, 1],
      [10, 1],
    ];
    expect(makeAnnotation('angular', [a.id, b.id], sketch)).toBeNull();
    b.points = a.points;
    expect(makeAnnotation('angular', [a.id, b.id], sketch)).toBeNull();
    b.points = [
      [0, 0],
      [0, 0],
    ];
    expect(makeAnnotation('angular', [a.id, b.id], sketch)).toBeNull();
  });
  it('syncs values and units with stable IDs and preserves manual placement', () => {
    sketch.entities = [newEntity('arc', [[0, 0]], 15)];
    autoDimension(sketch);
    const a = sketch.annotations[0],
      id = a.id;
    a.placement = { position: [123, 456], manual: true, collision: false };
    sketch.entities[0].radius = 20;
    sketch.units = 'in';
    syncAnnotations(sketch);
    expect(a.id).toBe(id);
    expect(a.measured_value).toBe(20);
    expect(a.units).toBe('in');
    expect(a.placement.position).toEqual([123, 456]);
    sketch.entities = [];
    syncAnnotations(sketch);
    expect(a.status).toBe('orphan');
    expect(annotationText(a)).toBe('[ORPHAN]');
  });
  it('keeps explicit tolerances and overrides separate from nominal geometry', () => {
    sketch.entities = [newEntity('circle', [[0, 0]], 10)];
    autoDimension(sketch);
    const a = sketch.annotations[0];
    a.tolerance = { plus: 0.1, minus: 0.2 };
    a.text_override = 'Custom';
    expect(annotationText(a)).toContain('⚠ Custom [⌀20.00 +0.10/−0.20]');
    expect(a.measured_value).toBe(20);
    expect(sketch.entities[0].radius).toBe(10);
  });
  it('reports placement collisions when there is no clear candidate', () => {
    sketch.entities = [newEntity('circle', [[0, 0]], 10), newEntity('circle', [[0, 0]], 10000)];
    autoDimension(sketch, [sketch.entities[0].id]);
    expect(sketch.annotations[0].placement.collision).toBe(true);
  });
});
