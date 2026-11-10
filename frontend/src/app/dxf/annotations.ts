import {
  Annotation,
  AnnotationStyle,
  ANNOTATION_LAYER,
  Entity,
  Point,
  Sketch,
  defaultStyle,
} from './model';
export type Bounds = [number, number, number, number];
const EPS = 1e-8;
export function bounds(entities: Entity[]): Bounds {
  const box: Bounds = [Infinity, Infinity, -Infinity, -Infinity];
  for (const e of entities) {
    const points: Point[] =
      e.type === 'circle' || e.type === 'arc'
        ? [
            [e.points[0][0] - e.radius, e.points[0][1] - e.radius],
            [e.points[0][0] + e.radius, e.points[0][1] + e.radius],
          ]
        : e.points;
    for (const p of points) {
      box[0] = Math.min(box[0], p[0]);
      box[1] = Math.min(box[1], p[1]);
      box[2] = Math.max(box[2], p[0]);
      box[3] = Math.max(box[3], p[1]);
    }
  }
  return box;
}
export function linearPoints(a: Annotation, entities: Entity[]): [Point, Point] {
  if (entities.length === 1 && entities[0].type === 'line')
    return [entities[0].points[0], entities[0].points[1]];
  const b = bounds(entities);
  return a.type === 'vertical'
    ? [
        [b[2], b[1]],
        [b[2], b[3]],
      ]
    : [
        [b[0], b[1]],
        [b[2], b[1]],
      ];
}
export function angleGeometry(
  entities: Entity[],
): { center: Point; first: number; sweep: number } | null {
  if (entities.length !== 2 || entities.some((e) => e.type !== 'line')) return null;
  const [a, b] = entities.map((e) => e.points);
  const u: Point = [a[1][0] - a[0][0], a[1][1] - a[0][1]],
    v: Point = [b[1][0] - b[0][0], b[1][1] - b[0][1]];
  const lengths = Math.hypot(...u) * Math.hypot(...v);
  if (lengths < EPS) return null;
  const cross = u[0] * v[1] - u[1] * v[0];
  if (Math.abs(cross) / lengths < EPS) return null;
  const t = ((b[0][0] - a[0][0]) * v[1] - (b[0][1] - a[0][1]) * v[0]) / cross;
  const center: Point = [a[0][0] + t * u[0], a[0][1] + t * u[1]];
  let first = Math.atan2(u[1], u[0]),
    sweep = Math.atan2(cross, u[0] * v[0] + u[1] * v[1]);
  if (sweep < 0) {
    first += sweep;
    sweep = -sweep;
  }
  return { center, first, sweep };
}
export function measurement(a: Annotation, entities: Entity[]): number | null {
  if (!entities.length) return null;
  if (a.type === 'radius' || a.type === 'diameter') {
    if (
      entities.length !== 1 ||
      !['circle', 'arc'].includes(entities[0].type) ||
      (a.type === 'diameter' && entities[0].type !== 'circle')
    )
      return null;
    return entities[0].radius * (a.type === 'diameter' ? 2 : 1);
  }
  if (a.type === 'angular') {
    const angle = angleGeometry(entities);
    return angle ? (angle.sweep * 180) / Math.PI : null;
  }
  if (entities.some((e) => !['line', 'polyline'].includes(e.type))) return null;
  const [p, q] = linearPoints(a, entities);
  return a.type === 'horizontal'
    ? Math.abs(q[0] - p[0])
    : a.type === 'vertical'
      ? Math.abs(q[1] - p[1])
      : Math.hypot(q[0] - p[0], q[1] - p[1]);
}
function signature(entities: Entity[]): string {
  const text = JSON.stringify(
    entities.map((e) => [e.type, e.points, e.radius, e.start_angle, e.end_angle, e.closed]),
  );
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
  return (hash >>> 0).toString(16);
}
export function syncAnnotations(sketch: Sketch) {
  const byId = new Map(sketch.entities.map((e) => [e.id, e]));
  for (const a of sketch.annotations) {
    const entities = a.refs.map((id) => byId.get(id)).filter((e): e is Entity => !!e);
    const value = entities.length === a.refs.length ? measurement(a, entities) : null;
    const status =
      entities.length !== a.refs.length
        ? 'orphan'
        : value === null || !Number.isFinite(value) || value <= EPS
          ? 'invalid'
          : 'valid';
    const units = a.type === 'angular' ? 'deg' : sketch.units;
    const sourceSignature = signature(entities);
    if (
      a.source_signature !== sourceSignature ||
      a.status !== status ||
      (status === 'valid' && a.measured_value !== value) ||
      a.units !== units
    ) {
      a.source_signature = sourceSignature;
      a.status = status;
      if (status === 'valid') a.measured_value = value!;
      a.units = units;
      a.revision++;
      a.updated_at = new Date().toISOString();
      if (status === 'valid' && !a.placement.manual) placeAnnotation(a, sketch);
    }
  }
}
export function annotationText(a: Annotation): string {
  if (a.status !== 'valid') return `[${a.status.toUpperCase()}]`;
  const prefix = a.type === 'diameter' ? '⌀' : a.type === 'radius' ? 'R' : '';
  const unit = a.type === 'angular' ? '°' : a.style.show_units ? ` ${a.units || '?'}` : '';
  const nominal = `${prefix}${a.measured_value.toFixed(a.precision)}${unit}`;
  const tolerance = a.tolerance
    ? ` +${a.tolerance.plus.toFixed(a.precision)}/−${a.tolerance.minus.toFixed(a.precision)}`
    : '';
  return a.text_override !== null
    ? `⚠ ${a.text_override} [${nominal}${tolerance}]`
    : nominal + tolerance;
}
export function candidatePosition(a: Annotation, entities: Entity[], offset: number): Point {
  const b = bounds(entities);
  if (a.type === 'horizontal') return [(b[0] + b[2]) / 2, b[1] - offset];
  if (a.type === 'vertical') return [b[2] + offset, (b[1] + b[3]) / 2];
  if (a.type === 'aligned') {
    const [p, q] = linearPoints(a, entities),
      d = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1;
    return [
      (p[0] + q[0]) / 2 - ((q[1] - p[1]) * offset) / d,
      (p[1] + q[1]) / 2 + ((q[0] - p[0]) * offset) / d,
    ];
  }
  if (a.type === 'angular') {
    const g = angleGeometry(entities);
    if (g)
      return [
        g.center[0] + Math.cos(g.first + g.sweep / 2) * offset * 2,
        g.center[1] + Math.sin(g.first + g.sweep / 2) * offset * 2,
      ];
  }
  if (a.type === 'radius' && entities[0].type === 'arc') {
    const e = entities[0],
      sweep = (e.end_angle - e.start_angle + 360) % 360 || 360,
      theta = ((e.start_angle + sweep / 2) * Math.PI) / 180;
    return [
      e.points[0][0] + (e.radius + offset) * Math.cos(theta),
      e.points[0][1] + (e.radius + offset) * Math.sin(theta),
    ];
  }
  return [b[2] + offset, b[3] + offset];
}
function overlaps(a: Bounds, b: Bounds) {
  return a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];
}
export function textBounds(a: Annotation): Bounds {
  const [x, y] = a.placement.position,
    h = a.style.text_height,
    w = Math.max(4, annotationText(a).length) * h * 0.65;
  return [x - w / 2, y - h, x + w / 2, y + h];
}
export function placeAnnotation(a: Annotation, sketch: Sketch) {
  const entities = sketch.entities.filter((e) => a.refs.includes(e.id));
  if (!entities.length) return;
  const geometry = sketch.entities.map((e) => bounds([e]));
  const occupied = sketch.annotations.filter((b) => b.id !== a.id).map(textBounds);
  let collided = true;
  for (let i = 0; i < 8; i++) {
    a.placement.position = candidatePosition(a, entities, a.style.offset * (1 + i * 0.75));
    const box = textBounds(a);
    collided = [...geometry, ...occupied].some((b) => overlaps(box, b));
    if (!collided) break;
  }
  a.placement.collision = collided;
}
export function checkAnnotationCollisions(sketch: Sketch) {
  const geometry = sketch.entities.map((e) => bounds([e]));
  const boxes = sketch.annotations.map(textBounds);
  sketch.annotations.forEach((a, i) => {
    a.placement.collision =
      geometry.some((b) => overlaps(boxes[i], b)) ||
      boxes.some((b, j) => i !== j && overlaps(boxes[i], b));
  });
}
export function makeAnnotation(
  type: Annotation['type'],
  refs: string[],
  sketch: Sketch,
  mode: Annotation['mode'] = 'automatic',
  style: AnnotationStyle = defaultStyle(),
): Annotation | null {
  const a: Annotation = {
    id: crypto.randomUUID(),
    type,
    refs: [...refs],
    layer: ANNOTATION_LAYER,
    measured_value: 0,
    units: type === 'angular' ? 'deg' : sketch.units,
    precision: 2,
    style: { ...style },
    placement: { position: [0, 0], manual: false, collision: false },
    mode,
    tolerance: null,
    text_override: null,
    revision: 1,
    updated_at: new Date().toISOString(),
    status: 'valid',
  };
  const entities = refs
    .map((id) => sketch.entities.find((e) => e.id === id))
    .filter((e): e is Entity => !!e);
  const value = entities.length === refs.length ? measurement(a, entities) : null;
  if (value === null || !Number.isFinite(value) || value <= EPS) return null;
  a.source_signature = signature(entities);
  a.measured_value = value;
  placeAnnotation(a, sketch);
  return a;
}
// Detect only isolated, axis-aligned four-line loops, not arbitrary quadrilaterals.
export function rectangleGroups(entities: Entity[]): Entity[][] {
  const lines = entities.filter((e) => e.type === 'line'),
    used = new Set<string>(),
    groups: Entity[][] = [];
  const same = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1]) < EPS;
  for (const start of lines) {
    if (used.has(start.id)) continue;
    const chain = [start];
    let end = start.points[1];
    while (chain.length < 4) {
      const next = lines.filter(
        (e) => !chain.includes(e) && (same(e.points[0], end) || same(e.points[1], end)),
      );
      if (next.length !== 1) break;
      chain.push(next[0]);
      end = same(next[0].points[0], end) ? next[0].points[1] : next[0].points[0];
    }
    const b = bounds(chain);
    if (
      chain.length === 4 &&
      same(end, start.points[0]) &&
      b[2] - b[0] > EPS &&
      b[3] - b[1] > EPS &&
      chain.every((e) => {
        const [p, q] = e.points;
        return Math.abs(p[0] - q[0]) < EPS !== Math.abs(p[1] - q[1]) < EPS;
      })
    ) {
      groups.push(chain);
      chain.forEach((e) => used.add(e.id));
    }
  }
  return groups;
}
export function autoDimension(
  sketch: Sketch,
  ids?: string[],
  style = defaultStyle(),
  precision = 2,
): number {
  syncAnnotations(sketch);
  const entities = ids ? sketch.entities.filter((e) => ids.includes(e.id)) : sketch.entities;
  const groups = rectangleGroups(entities),
    grouped = new Set(groups.flat().map((e) => e.id));
  const requests: { type: Annotation['type']; refs: string[] }[] = [];
  for (const group of groups)
    for (const type of ['horizontal', 'vertical'] as const)
      requests.push({ type, refs: group.map((e) => e.id) });
  for (const e of entities) {
    if (grouped.has(e.id)) continue;
    if (e.type === 'circle') {
      if (
        !sketch.annotations.some(
          (a) =>
            a.refs.length === 1 && a.refs[0] === e.id && ['diameter', 'radius'].includes(a.type),
        )
      )
        requests.push({ type: 'diameter', refs: [e.id] });
    } else if (e.type === 'arc') requests.push({ type: 'radius', refs: [e.id] });
    else if (e.type === 'line') {
      const [p, q] = e.points;
      requests.push({
        type:
          Math.abs(q[1] - p[1]) < EPS
            ? 'horizontal'
            : Math.abs(q[0] - p[0]) < EPS
              ? 'vertical'
              : 'aligned',
        refs: [e.id],
      });
    } else if (e.closed)
      for (const type of ['horizontal', 'vertical'] as const) requests.push({ type, refs: [e.id] });
  }
  let count = 0;
  for (const r of requests) {
    if (sketch.annotations.length >= 2000) break;
    if (
      sketch.annotations.some(
        (a) => a.type === r.type && [...a.refs].sort().join('|') === [...r.refs].sort().join('|'),
      )
    )
      continue;
    const a = makeAnnotation(r.type, r.refs, sketch, 'automatic', style);
    if (a) {
      a.precision = precision;
      placeAnnotation(a, sketch);
      sketch.annotations.push(a);
      count++;
    }
  }
  return count;
}
