import Konva from 'konva';
import { cadTheme } from '../ui/canvas-theme';
import { Annotation, Entity, Point } from './model';
import { annotationText, angleGeometry, linearPoints } from './annotations';

export function dimensionGroup(
  a: Annotation,
  entities: Entity[],
  screen: (p: Point) => Point,
  zoom: number,
  selected: boolean,
  move: (delta: Point) => void,
  begin: () => void,
  theme = cadTheme(),
): Konva.Group {
  const group = new Konva.Group({ draggable: true, annotationId: a.id });
  const color =
    a.status !== 'valid' || a.text_override !== null
      ? theme.warning
      : selected
        ? theme.selected
        : a.style.color.toLowerCase() === '#f2cc7a'
          ? theme.dimension
          : a.style.color;
  const options = {
    stroke: color,
    strokeWidth: selected ? 2 : 1,
    hitStrokeWidth: 10,
    annotationId: a.id,
  };
  const arrow = Math.min(24, Math.max(5, a.style.arrow_size * zoom));
  const line = (points: Point[], arrows = false, both = false) =>
    group.add(
      arrows
        ? new Konva.Arrow({
            ...options,
            points: points.flatMap(screen),
            pointerLength: arrow,
            pointerWidth: arrow * 0.7,
            pointerAtBeginning: both,
            fill: color,
          })
        : new Konva.Line({ ...options, points: points.flatMap(screen) }),
    );
  const pos = a.placement.position;
  if (a.status === 'valid') {
    if (['horizontal', 'vertical', 'aligned'].includes(a.type)) {
      const [p, q] = linearPoints(a, entities);
      let x: Point, y: Point;
      if (a.type === 'horizontal') {
        x = [p[0], pos[1]];
        y = [q[0], pos[1]];
      } else if (a.type === 'vertical') {
        x = [pos[0], p[1]];
        y = [pos[0], q[1]];
      } else {
        const d = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1,
          n: Point = [-(q[1] - p[1]) / d, (q[0] - p[0]) / d],
          offset = (pos[0] - p[0]) * n[0] + (pos[1] - p[1]) * n[1];
        x = [p[0] + n[0] * offset, p[1] + n[1] * offset];
        y = [q[0] + n[0] * offset, q[1] + n[1] * offset];
      }
      line([p, x]);
      line([q, y]);
      line([x, y], true, true);
    } else if (a.type === 'radius' || a.type === 'diameter') {
      const e = entities[0],
        center = e.points[0];
      let angle = Math.atan2(pos[1] - center[1], pos[0] - center[0]);
      if (e.type === 'arc')
        angle =
          ((e.start_angle + ((e.end_angle - e.start_angle + 360) % 360 || 360) / 2) * Math.PI) /
          180;
      const edge: Point = [
        center[0] + e.radius * Math.cos(angle),
        center[1] + e.radius * Math.sin(angle),
      ];
      if (a.type === 'diameter') {
        const opposite: Point = [2 * center[0] - edge[0], 2 * center[1] - edge[1]];
        line([opposite, edge], true, true);
        line([edge, pos]);
      } else {
        line([center, edge]);
        line([pos, edge], true);
      }
    } else {
      const angle = angleGeometry(entities);
      if (angle) {
        const radius = Math.max(
          a.style.offset,
          Math.hypot(pos[0] - angle.center[0], pos[1] - angle.center[1]),
        );
        const points: Point[] = Array.from({ length: 49 }, (_, i) => {
          const t = angle.first + (angle.sweep * i) / 48;
          return [angle.center[0] + radius * Math.cos(t), angle.center[1] + radius * Math.sin(t)];
        });
        line([angle.center, points[0]]);
        line([angle.center, points[48]]);
        line(points, true, true);
      }
    }
  }
  const [x, y] = screen(pos),
    fontSize = Math.max(11, Math.min(60, a.style.text_height * zoom));
  const text = new Konva.Text({
    text: annotationText(a),
    fontSize,
    fontFamily: 'Consolas, monospace',
    fill: color,
    padding: 4,
    annotationId: a.id,
  });
  text.position({ x: x - text.width() / 2, y: y - text.height() / 2 });
  group.add(
    new Konva.Rect({
      x: text.x(),
      y: text.y(),
      width: text.width(),
      height: text.height(),
      fill: theme.background,
      opacity: 0.95,
      stroke: selected ? color : undefined,
      annotationId: a.id,
    }),
  );
  group.add(text);
  group.on('dragstart', (ev) => {
    ev.cancelBubble = true;
    begin();
  });
  group.on('dragend', (ev) => {
    ev.cancelBubble = true;
    move([group.x() / zoom, -group.y() / zoom]);
  });
  return group;
}
