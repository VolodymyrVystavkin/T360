import { Entity, Point } from './model';

export const arcMethods = [
  '3-Point',
  'Start, Center, End',
  'Start, Center, Angle',
  'Start, Center, Length',
  'Start, End, Angle',
  'Start, End, Direction',
  'Start, End, Radius',
] as const;
export type ArcMethod = (typeof arcMethods)[number];
export type ArcGeometry = Pick<Entity, 'points' | 'radius' | 'start_angle' | 'end_angle'>;
const EPS = 1e-8;
const norm = (a: number) => ((a % 360) + 360) % 360;
const angle = (c: Point, p: Point) => (Math.atan2(p[1] - c[1], p[0] - c[0]) * 180) / Math.PI;
const distance = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1]);
export function validPoint(p: Point): boolean {
  return p.every((v) => Number.isFinite(v) && Math.abs(v) <= 1e9);
}
export function validVertices(points: Point[], closed: boolean): boolean {
  if (points.length < (closed ? 3 : 2) || points.length > 10000 || !points.every(validPoint))
    return false;
  if (points.slice(1).some((p, i) => distance(p, points[i]) <= EPS)) return false;
  if (
    closed &&
    (distance(points[0], points[points.length - 1]) <= EPS ||
      new Set(points.map((p) => JSON.stringify(p))).size < 3)
  )
    return false;
  return true;
}

/** Native arcs and DXF use counterclockwise angles. Negative sweeps swap ends. */
function canonical(center: Point, radius: number, start: number, sweep: number): ArcGeometry {
  if (
    !validPoint(center) ||
    !Number.isFinite(radius) ||
    radius <= EPS ||
    radius > 1e9 ||
    !Number.isFinite(sweep) ||
    Math.abs(sweep) <= 1e-7 ||
    Math.abs(sweep) >= 360 - 1e-7
  )
    throw Error('Arc must have a positive radius and a sweep between 0 and 360 degrees.');
  return {
    points: [center],
    radius,
    start_angle: norm(sweep < 0 ? start + sweep : start),
    end_angle: norm(sweep < 0 ? start : start + sweep),
  };
}

/** Input order follows the selected method. Length means chord length, in drawing units.
 * Positive scalar angles turn CCW; negative turn CW. Radius mode uses a positive
 * radius, minor arc, and an explicit clockwise choice to select the side.
 */
export function createArc(
  method: ArcMethod,
  points: Point[],
  scalar = 90,
  clockwise = false,
): ArcGeometry {
  const needed =
    method === '3-Point' || method === 'Start, Center, End' || method === 'Start, End, Direction'
      ? 3
      : 2;
  if (points.length !== needed || !points.every(validPoint) || !Number.isFinite(scalar))
    throw Error('Supply finite coordinates and a valid arc parameter.');
  const [a, b, c] = points;
  if (distance(a, b) <= EPS) throw Error('Choose distinct points.');
  if (method === '3-Point') {
    // Local coordinates avoid subtracting squared absolute coordinates.
    const u: Point = [b[0] - a[0], b[1] - a[1]],
      v: Point = [c[0] - a[0], c[1] - a[1]];
    const cross = u[0] * v[1] - u[1] * v[0];
    if (Math.abs(cross) <= 1e-10 * Math.hypot(...u) * Math.hypot(...v))
      throw Error('Three arc points must be distinct and non-collinear.');
    const uu = u[0] ** 2 + u[1] ** 2,
      vv = v[0] ** 2 + v[1] ** 2;
    const center: Point = [
      a[0] + (uu * v[1] - vv * u[1]) / (2 * cross),
      a[1] + (u[0] * vv - v[0] * uu) / (2 * cross),
    ];
    const start = angle(center, a),
      end = angle(center, c),
      mid = angle(center, b);
    const sweep = norm(end - start);
    return canonical(
      center,
      distance(center, a),
      start,
      norm(mid - start) < sweep ? sweep : sweep - 360,
    );
  }
  if (method.startsWith('Start, Center,')) {
    const radius = distance(a, b),
      start = angle(b, a);
    let sweep: number;
    if (method === 'Start, Center, End') {
      if (distance(b, c) <= EPS) throw Error('End direction cannot equal the center.');
      sweep = norm(angle(b, c) - start);
      if (clockwise) sweep -= 360;
    } else if (method === 'Start, Center, Angle') sweep = scalar;
    else {
      if (scalar <= EPS || scalar > 2 * radius)
        throw Error('Chord length must be greater than zero and no greater than the diameter.');
      sweep = ((2 * Math.asin(scalar / (2 * radius)) * 180) / Math.PI) * (clockwise ? -1 : 1);
    }
    return canonical(b, radius, start, sweep);
  }
  const dx = b[0] - a[0],
    dy = b[1] - a[1],
    chord = Math.hypot(dx, dy);
  const mid: Point = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  if (method === 'Start, End, Direction') {
    // The third point specifies the tangent direction leaving the start.
    const tx = c[0] - a[0],
      ty = c[1] - a[1],
      tl = Math.hypot(tx, ty);
    const denominator = 2 * (-ty * dx + tx * dy);
    if (tl <= EPS || Math.abs(denominator) <= 1e-10 * tl * chord)
      throw Error('Start tangent must not be parallel to the chord.');
    const factor = (chord * chord) / denominator;
    const center: Point = [a[0] - ty * factor, a[1] + tx * factor];
    const start = angle(center, a),
      sweep = norm(angle(center, b) - start);
    return canonical(center, distance(center, a), start, factor > 0 ? sweep : sweep - 360);
  }
  let sweep = scalar;
  if (method === 'Start, End, Radius') {
    if (scalar < chord / 2 || scalar <= EPS || scalar > 1e9)
      throw Error('Radius must be at least half the chord length.');
    sweep = ((2 * Math.asin(chord / (2 * scalar)) * 180) / Math.PI) * (clockwise ? -1 : 1);
  }
  if (Math.abs(sweep) <= 1e-7 || Math.abs(sweep) >= 360 - 1e-7)
    throw Error('Enter a signed angle between -360 and 360 degrees, excluding zero.');
  const height = chord / (2 * Math.tan((sweep * Math.PI) / 360));
  const center: Point = [mid[0] - (dy / chord) * height, mid[1] + (dx / chord) * height];
  return canonical(center, distance(center, a), angle(center, a), sweep);
}

export function arcPreview(arc: ArcGeometry): Point[] {
  const sweep = norm(arc.end_angle - arc.start_angle);
  return Array.from({ length: 97 }, (_, i) => {
    const theta = ((arc.start_angle + (sweep * i) / 96) * Math.PI) / 180;
    return [
      arc.points[0][0] + arc.radius * Math.cos(theta),
      arc.points[0][1] + arc.radius * Math.sin(theta),
    ];
  });
}

/** Exact input bypasses snapping/tracking: x,y; @dx,dy; @distance<angle. */
export function parseCoordinate(text: string, origin?: Point): Point {
  const raw = text.trim(),
    relative = raw.startsWith('@'),
    value = relative ? raw.slice(1) : raw;
  if (relative && !origin)
    throw Error('Place the first point before entering relative coordinates.');
  const parts = value.split(value.includes('<') ? '<' : ',');
  if (parts.length !== 2 || parts.some((p) => !p.trim() || !Number.isFinite(Number(p))))
    throw Error('Use x,y, @dx,dy or @distance<angle (degrees).');
  let [x, y] = parts.map(Number);
  if (value.includes('<')) {
    if (!relative || x <= 0) throw Error('Distance/angle input uses @positive-distance<angle.');
    const theta = (y * Math.PI) / 180;
    y = x * Math.sin(theta);
    x *= Math.cos(theta);
  }
  const result: Point = [x + (relative ? origin![0] : 0), y + (relative ? origin![1] : 0)];
  if (!validPoint(result)) throw Error('Coordinates must be finite and within ±1e9.');
  return result;
}
