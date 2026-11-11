import { Entity, Point } from './model';

export type SnapKind = 'endpoint' | 'midpoint' | 'center' | 'quadrant' | 'nearest' | 'grid';
export interface SnapCandidate {
  point: Point;
  kind: SnapKind;
  entityId?: string;
}
export const snapPriority: SnapKind[] = [
  'endpoint',
  'midpoint',
  'center',
  'quadrant',
  'nearest',
  'grid',
];
const distance = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const degrees = (angle: number) => ((angle % 360) + 360) % 360;
function onArc(entity: Entity, angle: number): boolean {
  const sweep = degrees(entity.end_angle - entity.start_angle);
  return sweep === 0 || degrees(angle - entity.start_angle) <= sweep + 1e-10;
}
function radial(entity: Entity, angle: number): Point {
  const radians = (angle * Math.PI) / 180;
  return [
    entity.points[0][0] + entity.radius * Math.cos(radians),
    entity.points[0][1] + entity.radius * Math.sin(radians),
  ];
}

/** Exact model-space candidates; pixel tolerance is converted once at the boundary.
 * Priority precedes proximity, with input order breaking exact ties deterministically.
 */
export function findSnap(
  pointer: Point,
  entities: Entity[],
  zoom: number,
  tolerancePixels = 8,
  priority: readonly SnapKind[] = snapPriority,
  gridSpacing = 1,
): SnapCandidate | null {
  if (
    !(zoom > 0) ||
    !Number.isFinite(zoom) ||
    !(tolerancePixels >= 0) ||
    !Number.isFinite(tolerancePixels) ||
    !pointer.every(Number.isFinite)
  )
    return null;
  const tolerance = tolerancePixels / zoom;
  let best: SnapCandidate | null = null,
    bestRank = Infinity,
    bestDistance = Infinity;
  const offer = (point: Point, kind: SnapKind, entityId?: string) => {
    const rank = priority.indexOf(kind),
      delta = distance(pointer, point);
    if (rank < 0 || delta > tolerance || !point.every(Number.isFinite)) return;
    if (rank < bestRank || (rank === bestRank && delta < bestDistance)) {
      best = { point, kind, entityId };
      bestRank = rank;
      bestDistance = delta;
    }
  };
  for (const entity of entities) {
    const add = (p: Point, kind: SnapKind) => offer(p, kind, entity.id);
    if (entity.type === 'circle' || entity.type === 'arc') {
      add(entity.points[0], 'center');
      if (entity.type === 'arc') {
        add(radial(entity, entity.start_angle), 'endpoint');
        add(radial(entity, entity.end_angle), 'endpoint');
      }
      for (const angle of [0, 90, 180, 270])
        if (entity.type === 'circle' || onArc(entity, angle))
          add(radial(entity, angle), 'quadrant');
      const center = entity.points[0];
      if (distance(pointer, center) > 0) {
        const angle = (Math.atan2(pointer[1] - center[1], pointer[0] - center[0]) * 180) / Math.PI;
        if (entity.type === 'circle' || onArc(entity, angle)) add(radial(entity, angle), 'nearest');
      }
    } else {
      for (const p of entity.points) add(p, 'endpoint');
      const count = entity.points.length - (entity.closed ? 0 : 1);
      for (let i = 0; i < count; i++) {
        const a = entity.points[i],
          b = entity.points[(i + 1) % entity.points.length];
        add([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], 'midpoint');
        const dx = b[0] - a[0],
          dy = b[1] - a[1],
          lengthSquared = dx * dx + dy * dy;
        if (!lengthSquared) continue;
        const t = Math.max(
          0,
          Math.min(1, ((pointer[0] - a[0]) * dx + (pointer[1] - a[1]) * dy) / lengthSquared),
        );
        add([a[0] + t * dx, a[1] + t * dy], 'nearest');
      }
    }
  }
  if (gridSpacing > 0 && Number.isFinite(gridSpacing))
    offer(pointer.map((v) => Math.round(v / gridSpacing) * gridSpacing) as Point, 'grid');
  return best;
}

export function orthogonalPoint(start: Point, end: Point): Point {
  return Math.abs(end[0] - start[0]) >= Math.abs(end[1] - start[1])
    ? [end[0], start[1]]
    : [start[0], end[1]];
}
