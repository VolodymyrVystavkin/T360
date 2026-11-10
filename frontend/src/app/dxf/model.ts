import { newId } from '../core/id';
export type Point = [number, number];
export interface Entity {
  id: string;
  type: 'line' | 'circle' | 'arc' | 'polyline';
  layer: string;
  points: Point[];
  radius: number;
  start_angle: number;
  end_angle: number;
  closed: boolean;
  source_handle?: string;
  source_type?: string | null;
}
export const ANNOTATION_LAYER = 'ASME Y14.5';
export interface AnnotationStyle {
  text_height: number;
  arrow_size: number;
  offset: number;
  color: string;
  show_units: boolean;
}
interface AnnotationBase {
  id: string;
  refs: string[];
  layer: typeof ANNOTATION_LAYER;
  measured_value: number;
  units: string | null;
  precision: number;
  style: AnnotationStyle;
  placement: { position: Point; manual: boolean; collision: boolean };
  mode: 'automatic' | 'manual';
  tolerance: { plus: number; minus: number } | null;
  text_override: string | null;
  revision: number;
  updated_at: string;
  status: 'valid' | 'orphan' | 'invalid';
  source_signature?: string;
}
export type Annotation = AnnotationBase &
  (
    | { type: 'horizontal' | 'vertical' | 'aligned' }
    | { type: 'radius' | 'diameter' }
    | { type: 'angular' }
  );
export interface Sketch {
  drawing_id: string;
  revision: number;
  schema_version: 1;
  units: string | null;
  entities: Entity[];
  warnings: string[];
  annotations: Annotation[];
  layers: string[];
  hidden_layers: string[];
}
export const defaultStyle = (): AnnotationStyle => ({
  text_height: 3,
  arrow_size: 2,
  offset: 12,
  color: '#f2cc7a',
  show_units: false,
});
export function normalizeSketch(input: Partial<Sketch> & Pick<Sketch, 'entities'>): Sketch {
  return {
    ...input,
    drawing_id: input.drawing_id || newId(),
    revision: input.revision || 1,
    schema_version: 1,
    units: input.units || null,
    warnings: input.warnings || [],
    annotations: input.annotations || [],
    hidden_layers: input.hidden_layers || [],
    layers: [
      ...new Set([
        'Geometry',
        ANNOTATION_LAYER,
        ...(input.layers || []),
        ...input.entities.map((e) => e.layer),
      ]),
    ],
  };
}
export function emptySketch(): Sketch {
  return normalizeSketch({ units: 'mm', entities: [] });
}
export const newEntity = (type: Entity['type'], points: Point[], radius = 1): Entity => ({
  id: newId(),
  type,
  points,
  radius,
  layer: 'Geometry',
  start_angle: 0,
  end_angle: 90,
  closed: false,
});
