import {
  AfterViewInit,
  ChangeDetectorRef,
  DestroyRef,
  Component,
  ElementRef,
  HostListener,
  OnDestroy,
  ViewChild,
  inject,
  output,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { UiIcon } from '../ui/icon';
import { UiState } from '../ui/state';
import { cadTheme } from '../ui/canvas-theme';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import Konva from 'konva';
import { CadDraftService } from '../cad-draft.service';

import {
  Annotation,
  ANNOTATION_LAYER,
  Entity,
  Point,
  Sketch,
  defaultStyle,
  emptySketch,
  newEntity as entity,
  normalizeSketch,
  polylineSegments,
} from './model';
import {
  autoDimension,
  makeAnnotation,
  syncAnnotations,
  annotationText,
  placeAnnotation,
  textBounds,
  checkAnnotationCollisions,
} from './annotations';
import { dimensionGroup } from './dimension-renderer';
import { findSnap, orthogonalPoint, SnapCandidate, snapPriority } from './snapping';
import {
  arcMethods,
  ArcMethod,
  createArc,
  arcPreview,
  parseCoordinate,
  validPoint,
  validVertices,
} from './drawing-tools';
export type { Entity } from './model';

@Component({
  selector: 'dxf-editor',
  imports: [FormsModule, UiIcon, UiState],
  templateUrl: './editor.html',
  styleUrl: './editor.scss',
})
export class DxfEditor implements AfterViewInit, OnDestroy {
  @ViewChild('canvas') canvas!: ElementRef<HTMLDivElement>;
  cad = inject(CadDraftService);
  private destroyRef = inject(DestroyRef);
  analyze = output<void>();
  private http = inject(HttpClient);
  private changeDetector = inject(ChangeDetectorRef);
  stage!: Konva.Stage;
  private drawing!: Konva.Layer;
  private interaction?: Konva.Layer;
  private observer?: ResizeObserver;
  sketch: Sketch = emptySketch();
  annotationLayer = ANNOTATION_LAYER;
  selectedAnnotation = '';
  angularFirst = '';
  selectionIds: string[] = [];
  settingsOpen = false;
  explorerLimit = 100;
  @HostListener('window:resize') adaptPanels() {
    if (window.innerWidth < 1200) this.rightPanelOpen = false;
    if (window.innerWidth < 900) this.leftPanelOpen = false;
  }
  leftPanelOpen = typeof window === 'undefined' || window.innerWidth >= 900;
  rightPanelOpen = typeof window === 'undefined' || window.innerWidth >= 1200;
  saveStatus = 'Unsaved changes';
  private savedSnapshot = '';
  private theme = cadTheme();
  get selectedCount() {
    return this.selectedAnnotation
      ? 1
      : this.sketch.entities.filter(
          (e) => this.selectionIds.includes(e.id) || e.id === this.selected,
        ).length;
  }
  get annotationIssues() {
    return this.sketch.annotations.filter((a) => a.status !== 'valid').length;
  }
  layerEntityCount(layer: string) {
    return (
      this.sketch.entities.filter((e) => e.layer === layer).length +
      this.sketch.annotations.filter((a) => a.layer === layer).length
    );
  }
  inspectEntity(id: string) {
    this.selected = id;
    this.selectionIds = [id];
    this.selectedAnnotation = '';
    this.rightPanelOpen = true;
    this.render();
  }
  get propertyMeasurements() {
    const e = this.current;
    if (!e) return [];
    if (e.type === 'line')
      return [
        {
          label: 'Length',
          value: Math.hypot(e.points[1][0] - e.points[0][0], e.points[1][1] - e.points[0][1]),
        },
      ];
    if (e.type === 'circle') return [{ label: 'Diameter', value: e.radius * 2 }];
    return [];
  }
  zoomBy(factor: number) {
    if (!this.stage) return;
    const x = this.stage.width() / 2,
      y = this.stage.height() / 2;
    const world: Point = [(x - this.offset[0]) / this.zoom, (this.offset[1] - y) / this.zoom];
    this.zoom = Math.max(0.02, Math.min(200, this.zoom * factor));
    this.offset = [x - world[0] * this.zoom, y + world[1] * this.zoom];
    this.render();
  }
  annotationStyle = defaultStyle();
  annotationPrecision = 2;
  annotationText = annotationText;
  tool = 'select';
  drawingPoints: Point[] = [];
  arcMethods = arcMethods;
  arcMethod: ArcMethod = (() => {
    try {
      const saved = localStorage.getItem('t360-arc-method');
      return arcMethods.find((m) => m === saved) || '3-Point';
    } catch {
      return '3-Point';
    }
  })();
  arcMenuOpen = false;
  arcScalar = 90;
  arcClockwise = false;
  coordinateInput = '';
  contextMenu: { x: number; y: number } | null = null;
  get scalarArc() {
    return !['3-Point', 'Start, Center, End', 'Start, End, Direction'].includes(this.arcMethod);
  }
  get arcScalarLabel() {
    return this.arcMethod.endsWith('Length')
      ? 'Chord length'
      : this.arcMethod.endsWith('Radius')
        ? 'Radius'
        : 'Signed sweep (degrees)';
  }
  get drawingPrompt() {
    if (this.tool === 'polyline')
      return 'Click vertices · Enter: finish · C: close · Backspace: undo vertex · Esc: cancel';
    if (this.tool !== 'arc') return '';
    const n = this.drawingPoints.length;
    if (!n) return 'Place the start point.';
    if (n === 1)
      return this.arcMethod === '3-Point'
        ? 'Place a point on the arc.'
        : this.arcMethod.startsWith('Start, Center,')
          ? 'Place the center.'
          : 'Place the end point.';
    return this.scalarArc
      ? `Enter ${this.arcScalarLabel.toLowerCase()}, then Create arc (or click canvas).`
      : this.arcMethod === 'Start, End, Direction'
        ? 'Place a point along the tangent leaving the start.'
        : this.arcMethod === '3-Point'
          ? 'Place the end point.'
          : 'Place the end direction; it is projected onto the circle.';
  }
  selected = '';
  name = 'Untitled drawing';
  message = 'Choose a tool. Click two points to draw or measure.';
  busy = false;
  snap = true;
  gridSnap = true;
  orthogonal = false;
  snapTolerance = 8;
  snapCandidate: SnapCandidate | null = null;
  grid = true;
  activeLayer = 'Geometry';
  newLayer = '';
  extraLayers: string[] = [];
  history: string[] = [];
  future: string[] = [];
  start: Point | null = null;
  cursor: Point = [0, 0];
  zoom = 4;
  offset: Point = [100, 400];
  get layers() {
    return [
      ...new Set([
        'Geometry',
        ANNOTATION_LAYER,
        ...this.sketch.layers,
        ...this.extraLayers,
        this.activeLayer,
        ...this.sketch.entities.map((e) => e.layer),
      ]),
    ];
  }
  get geometryLayers() {
    return this.layers.filter((l) => l !== ANNOTATION_LAYER);
  }
  get hidden() {
    return new Set(this.sketch.hidden_layers);
  }
  get dimensionTypes(): Annotation['type'][] {
    const a = this.currentAnnotation;
    if (!a) return [];
    return ['radius', 'diameter'].includes(a.type)
      ? this.sketch.entities.find((e) => e.id === a.refs[0])?.type === 'circle'
        ? ['radius', 'diameter']
        : ['radius']
      : a.type === 'angular'
        ? ['angular']
        : ['horizontal', 'vertical', 'aligned'];
  }
  get currentAnnotation() {
    return this.sketch.annotations.find((a) => a.id === this.selectedAnnotation);
  }
  get current() {
    return this.sketch.entities.find((e) => e.id === this.selected);
  }
  resumeDrawing() {
    const state = this.cad.drawing();
    if (state) {
      this.sketch = normalizeSketch(structuredClone(state.sketch));
      this.name = state.name;
      this.savedSnapshot = JSON.stringify({ name: this.name, sketch: this.sketch });
      this.saveStatus = this.cad.storageError() ? 'Storage unavailable' : 'Saved in this browser';
    }
    const highlight = this.cad.highlight();
    if (highlight) {
      this.rightPanelOpen = true;
      this.selectionIds = highlight.ids;
      this.selected = highlight.ids[0] || '';
      this.selectedAnnotation = highlight.annotation || '';
      const layers = [
        ...this.sketch.entities.filter((e) => highlight.ids.includes(e.id)).map((e) => e.layer),
        ANNOTATION_LAYER,
      ];
      this.sketch.hidden_layers = this.sketch.hidden_layers.filter((l) => !layers.includes(l));
      this.cad.highlight.set(null);
    }
  }
  ngAfterViewInit() {
    this.resumeDrawing();
    this.stage = new Konva.Stage({ container: this.canvas.nativeElement, width: 800, height: 600 });
    this.drawing = new Konva.Layer();
    this.stage.add(this.drawing);
    this.interaction = new Konva.Layer({ listening: false });
    this.stage.add(this.interaction);
    this.stage.on('click tap', (ev) => {
      this.click(ev);
      this.changeDetector.markForCheck();
    });
    this.stage.on('contextmenu', (ev) => {
      this.openPolylineMenu(ev.evt);
      this.changeDetector.markForCheck();
    });
    this.stage.on('mousemove', () => {
      this.cursor = this.world();
      this.renderInteraction();
      this.changeDetector.markForCheck();
    });
    this.stage.on('mouseleave', () => {
      this.snapCandidate = null;
      this.interaction?.destroyChildren();
      this.interaction?.batchDraw();
    });
    this.stage.on('wheel', (ev) => {
      ev.evt.preventDefault();
      const p = this.stage.getPointerPosition()!;
      const world = [(p.x - this.offset[0]) / this.zoom, (this.offset[1] - p.y) / this.zoom];
      this.zoom = Math.max(0.02, Math.min(200, this.zoom * (ev.evt.deltaY < 0 ? 1.15 : 1 / 1.15)));
      this.offset = [p.x - world[0] * this.zoom, p.y + world[1] * this.zoom];
      this.render();
    });
    this.stage.on('dragend', (ev) => {
      if (ev.target === this.stage) {
        this.offset = [this.offset[0] + this.stage.x(), this.offset[1] + this.stage.y()];
        this.stage.position({ x: 0, y: 0 });
        this.render();
      }
    });
    this.observer = new ResizeObserver(() => {
      this.stage.size({
        width: this.canvas.nativeElement.clientWidth,
        height: this.canvas.nativeElement.clientHeight,
      });
      this.render();
    });
    this.observer.observe(this.canvas.nativeElement);
    this.fit();
  }
  ngOnDestroy() {
    syncAnnotations(this.sketch);
    this.cad.capture(this.sketch, this.name);
    this.observer?.disconnect();
    this.stage?.destroy();
  }
  setTool(tool: string) {
    this.tool = tool;
    this.start = null;
    this.drawingPoints = [];
    this.contextMenu = null;
    this.arcMenuOpen = false;
    this.snapCandidate = null;
    this.angularFirst = '';
    this.stage?.draggable(tool === 'pan');
    this.message =
      tool === 'select'
        ? 'Select geometry to edit its properties.'
        : tool === 'pan'
          ? 'Drag the canvas to pan. Scroll to zoom.'
          : ['dimension', 'diameter', 'radius', 'angular'].includes(tool)
            ? 'Click geometry to annotate. Angular: click two lines.'
            : 'Click the first point, then the second point.';
    this.render();
  }
  world(): Point {
    const p = this.stage.getPointerPosition() || { x: 0, y: 0 };
    let value: Point = [(p.x - this.offset[0]) / this.zoom, (this.offset[1] - p.y) / this.zoom];
    const ortho = this.orthogonal && ['line', 'polyline'].includes(this.tool) && this.start;
    if (ortho) value = orthogonalPoint(ortho, value);
    this.snapCandidate = this.snap
      ? findSnap(
          value,
          this.sketch.entities.filter((e) => !this.hidden.has(e.layer)),
          this.zoom,
          this.snapTolerance,
          this.gridSnap ? snapPriority : snapPriority.filter((k) => k !== 'grid'),
        )
      : null;
    if (this.snapCandidate && ortho) {
      const projected = orthogonalPoint(ortho, this.snapCandidate.point);
      if (
        Math.hypot(
          projected[0] - this.snapCandidate.point[0],
          projected[1] - this.snapCandidate.point[1],
        ) > 1e-9
      )
        this.snapCandidate = null;
    }
    return this.snapCandidate?.point || value;
  }
  screen(p: Point): Point {
    return [p[0] * this.zoom + this.offset[0], this.offset[1] - p[1] * this.zoom];
  }
  click(ev: Konva.KonvaEventObject<MouseEvent>) {
    if (ev.evt?.button && ev.evt.button !== 0) return;
    if (this.busy || this.tool === 'pan') return;
    this.contextMenu = null;
    const geometryId = ev.target.attrs['entityId'] || '';
    if (['dimension', 'diameter', 'radius', 'angular'].includes(this.tool)) {
      this.dimensionClick(geometryId);
      return;
    }
    if (this.tool === 'select') {
      this.selectedAnnotation = ev.target.attrs['annotationId'] || '';
      this.selected = geometryId;
      if (geometryId && ev.evt?.shiftKey)
        this.selectionIds = this.selectionIds.includes(geometryId)
          ? this.selectionIds.filter((id) => id !== geometryId)
          : [...this.selectionIds, geometryId];
      else this.selectionIds = geometryId ? [geometryId] : [];
      this.render();
      return;
    }
    const point = this.world();
    this.cursor = point;
    if (this.tool === 'polyline' || this.tool === 'arc') {
      this.addDrawingPoint(point);
      return;
    }
    if (!this.start) {
      this.start = point;
      this.message = `First point: ${point.join(', ')}. Choose second point.`;
      this.render();
      return;
    }
    const first = this.start;
    this.start = null;
    const length = Math.hypot(point[0] - first[0], point[1] - first[1]);
    if (this.tool === 'measure') {
      this.message = `Distance: ${length.toFixed(4)} ${this.sketch.units || '(units unspecified)'} · ΔX ${(point[0] - first[0]).toFixed(3)} · ΔY ${(point[1] - first[1]).toFixed(3)}`;
      this.render();
      return;
    }
    if (length < 1e-9) {
      this.message = 'Choose two different points.';
      return;
    }
    this.checkpoint();
    let item: Entity;
    if (this.tool === 'circle') item = entity('circle', [first], length);
    else if (this.tool === 'rectangle') {
      item = entity('polyline', [first, [point[0], first[1]], point, [first[0], point[1]]]);
      item.closed = true;
    } else item = entity('line', [first, point]);
    item.layer = this.activeLayer === ANNOTATION_LAYER ? 'Geometry' : this.activeLayer;
    this.selectedAnnotation = '';
    this.selectionIds = [item.id];
    this.sketch.entities.push(item);
    this.selected = item.id;
    this.message = 'Geometry created.';
    this.render();
  }
  chooseArcMethod(method: ArcMethod) {
    this.arcMethod = method;
    try {
      localStorage.setItem('t360-arc-method', method);
    } catch {
      /* Preference remains usable in memory. */
    }
    this.setTool('arc');
  }
  openPolylineMenu(event: MouseEvent) {
    if (this.tool !== 'polyline') return;
    event.preventDefault();
    this.contextMenu = {
      x: Math.max(0, Math.min(event.clientX, window.innerWidth - 190)),
      y: Math.max(0, Math.min(event.clientY, window.innerHeight - 190)),
    };
  }
  refreshDrawingPreview() {
    this.renderInteraction();
  }
  addDrawingPoint(point: Point) {
    if (this.busy || !validPoint(point)) {
      this.message = 'Enter finite coordinates within ±1e9.';
      return;
    }
    if (this.tool === 'polyline') {
      const last = this.drawingPoints.at(-1);
      if (last && Math.hypot(point[0] - last[0], point[1] - last[1]) <= 1e-8) {
        this.message = 'Zero-length segments are not allowed.';
        return;
      }
      if (this.drawingPoints.length >= 10000) {
        this.message = 'Maximum 10,000 vertices.';
        return;
      }
      this.drawingPoints.push([...point]);
      this.start = point;
    } else if (this.tool === 'arc') {
      if (this.drawingPoints.length < 2) {
        if (
          this.drawingPoints.length &&
          Math.hypot(point[0] - this.drawingPoints[0][0], point[1] - this.drawingPoints[0][1]) <=
            1e-8
        ) {
          this.message = 'Choose distinct points.';
          return;
        }
        this.drawingPoints.push([...point]);
      } else {
        this.finishArc(this.scalarArc ? undefined : point);
        return;
      }
    }
    this.cursor = point;
    this.message = this.drawingPrompt;
    this.renderInteraction();
  }
  submitCoordinate() {
    if (this.tool === 'arc' && this.scalarArc && this.drawingPoints.length === 2) {
      this.message = `Enter ${this.arcScalarLabel.toLowerCase()} in the parameter field, then Create arc.`;
      return;
    }
    try {
      this.addDrawingPoint(parseCoordinate(this.coordinateInput, this.drawingPoints.at(-1)));
      this.coordinateInput = '';
    } catch (error) {
      this.message = (error as Error).message;
    }
  }
  finishPolyline(closed = false) {
    if (this.tool !== 'polyline' || this.busy) return;
    const points = this.drawingPoints.map((p) => [...p] as Point);
    if (
      closed &&
      points.length > 1 &&
      Math.hypot(points[0][0] - points.at(-1)![0], points[0][1] - points.at(-1)![1]) <= 1e-8
    )
      points.pop();
    if (!validVertices(points, closed)) {
      this.message = closed
        ? 'Closing needs at least three distinct vertices and nonzero segments.'
        : 'A polyline needs at least two vertices and nonzero segments.';
      return;
    }
    const item = entity('polyline', points);
    item.closed = closed;
    this.commitDrawing(item);
  }
  undoVertex() {
    this.drawingPoints.pop();
    this.start = this.tool === 'polyline' ? this.drawingPoints.at(-1) || null : null;
    this.contextMenu = null;
    this.message = this.drawingPrompt;
    this.renderInteraction();
  }
  finishArc(third?: Point) {
    if (this.tool !== 'arc' || this.drawingPoints.length !== 2 || this.busy) return;
    try {
      const geometry = createArc(
        this.arcMethod,
        third ? [...this.drawingPoints, third] : this.drawingPoints,
        this.arcScalar,
        this.arcClockwise,
      );
      this.commitDrawing({ ...entity('arc', geometry.points, geometry.radius), ...geometry });
    } catch (error) {
      this.message = (error as Error).message;
    }
  }
  private commitDrawing(item: Entity) {
    this.checkpoint();
    item.layer = this.activeLayer === ANNOTATION_LAYER ? 'Geometry' : this.activeLayer;
    item.revision = 1;
    this.sketch.layers = [...new Set([...this.sketch.layers, item.layer])];
    if (item.type === 'polyline') item.segments = polylineSegments(item.points, item.closed);
    this.sketch.entities.push(item);
    this.selected = item.id;
    this.selectionIds = [item.id];
    this.selectedAnnotation = '';
    this.drawingPoints = [];
    this.start = null;
    this.contextMenu = null;
    this.snapCandidate = null;
    this.message = `${item.type} created. ${this.drawingPrompt}`;
    this.render();
  }
  editPolylineVertex(index: number, action: 'add' | 'remove') {
    const item = this.current;
    if (!item || item.type !== 'polyline' || index < 0 || index >= item.points.length) return;
    const points = item.points.map((p) => [...p] as Point);
    if (action === 'remove') points.splice(index, 1);
    else {
      const a = points[index],
        b = points[(index + 1) % points.length];
      // At an open end, extend the last segment by half its length.
      const previous = points[Math.max(0, index - 1)];
      points.splice(
        index + 1,
        0,
        !item.closed && index === points.length - 1
          ? [a[0] + (a[0] - previous[0]) / 2, a[1] + (a[1] - previous[1]) / 2]
          : [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2],
      );
    }
    if (!validVertices(points, item.closed)) {
      this.message = 'Vertex edit would create invalid or zero-length segments.';
      return;
    }
    this.checkpoint();
    item.points = points;
    item.segments = polylineSegments(points, item.closed);
    item.revision = (item.revision || 1) + 1;
    this.render();
  }
  checkpoint() {
    this.history.push(JSON.stringify(this.sketch));
    if (this.history.length > 100) this.history.shift();
    this.future = [];
  }
  undo() {
    this.drawingPoints = [];
    this.start = null;
    this.contextMenu = null;
    const value = this.history.pop();
    if (!value) return;
    this.future.push(JSON.stringify(this.sketch));
    this.sketch = normalizeSketch(JSON.parse(value));
    this.selected = '';
    this.selectedAnnotation = '';
    this.selectionIds = [];
    this.render();
  }
  redo() {
    this.drawingPoints = [];
    this.start = null;
    this.contextMenu = null;
    const value = this.future.pop();
    if (!value) return;
    this.history.push(JSON.stringify(this.sketch));
    this.sketch = normalizeSketch(JSON.parse(value));
    this.selected = '';
    this.selectedAnnotation = '';
    this.selectionIds = [];
    this.render();
  }
  remove() {
    if (this.currentAnnotation) {
      this.checkpoint();
      this.sketch.annotations = this.sketch.annotations.filter(
        (a) => a.id !== this.selectedAnnotation,
      );
      this.selectedAnnotation = '';
      this.render();
      return;
    }
    if (!this.current) return;
    this.checkpoint();
    this.sketch.entities = this.sketch.entities.filter((e) => e.id !== this.selected);
    this.selected = '';
    this.render();
  }
  property(field: string, raw: string, index = 0, axis = 0) {
    const current = this.current;
    if (!current) return;
    const value = Number(raw);
    if (
      field !== 'layer' &&
      (!Number.isFinite(value) || Math.abs(value) > 1e9 || (field === 'radius' && value <= 0))
    ) {
      this.message = 'Enter a finite, valid geometry value.';
      return;
    }
    if (field === 'point' && current.type === 'polyline') {
      const points = current.points.map((p) => [...p] as Point);
      points[index][axis] = value;
      if (!validVertices(points, current.closed)) {
        this.message = 'Vertex edit would create a zero-length segment.';
        return;
      }
    }
    this.checkpoint();
    current.revision = (current.revision || 1) + 1;
    if (field === 'point') current.points[index][axis] = value;
    else if (field === 'radius') current.radius = value;
    else if (field === 'start_angle' || field === 'end_angle') {
      if (Math.abs(value) > 360) {
        this.undo();
        return;
      }
      current[field] = value;
    } else if (field === 'layer') current.layer = raw === ANNOTATION_LAYER ? 'Geometry' : raw;
    if (current.type === 'polyline')
      current.segments = polylineSegments(current.points, current.closed);
    this.render();
  }
  toggleLayer(layer: string) {
    this.checkpoint();
    this.sketch.hidden_layers = this.hidden.has(layer)
      ? this.sketch.hidden_layers.filter((l) => l !== layer)
      : [...this.sketch.hidden_layers, layer];
    this.render();
  }
  addLayer() {
    if (!/^[\w .-]{1,100}$/.test(this.newLayer)) {
      this.message = 'Layer names use letters, numbers, spaces, dots, dashes or underscores.';
      return;
    }
    this.checkpoint();
    this.sketch.layers = [...new Set([...this.layers, this.newLayer])];
    this.activeLayer = this.newLayer === ANNOTATION_LAYER ? 'Geometry' : this.newLayer;
    this.newLayer = '';
  }
  changeUnits(value: string) {
    this.checkpoint();
    this.sketch.units = value || null;
    this.message = 'Units reassigned; coordinate values are unchanged (physical size may change).';
    this.render();
  }
  fresh() {
    this.drawingPoints = [];
    this.start = null;
    this.contextMenu = null;
    this.checkpoint();
    this.sketch = emptySketch();
    this.selectedAnnotation = '';
    this.selectionIds = [];
    this.extraLayers = [];
    this.activeLayer = 'Geometry';
    this.selected = '';
    this.name = 'Untitled drawing';
    this.render();
  }
  demo() {
    this.drawingPoints = [];
    this.start = null;
    this.contextMenu = null;
    this.checkpoint();
    const border = entity('polyline', [
      [0, 0],
      [120, 0],
      [120, 80],
      [0, 80],
    ]);
    border.closed = true;
    this.sketch = normalizeSketch({
      units: 'mm',
      entities: [
        border,
        ...[
          [15, 15],
          [105, 15],
          [105, 65],
          [15, 65],
        ].map((p) => entity('circle', [p as Point], 5)),
        entity('circle', [[60, 40]], 20),
      ],
    });
    this.selectedAnnotation = '';
    this.selectionIds = [];
    this.name = 'Mounting plate';
    this.fit();
  }
  fit() {
    syncAnnotations(this.sketch);
    const points = this.sketch.entities.flatMap((e) =>
      e.type === 'circle' || e.type === 'arc'
        ? [
            [e.points[0][0] - e.radius, e.points[0][1] - e.radius],
            [e.points[0][0] + e.radius, e.points[0][1] + e.radius],
          ]
        : e.points,
    );
    for (const a of this.sketch.annotations) {
      const b = textBounds(a);
      points.push([b[0], b[1]], [b[2], b[3]]);
    }
    if (!points.length) {
      this.zoom = 4;
      this.offset = [100, 400];
      this.render();
      return;
    }
    let minX = Infinity,
      maxX = -Infinity,
      minY = Infinity,
      maxY = -Infinity;
    for (const p of points) {
      minX = Math.min(minX, p[0]);
      maxX = Math.max(maxX, p[0]);
      minY = Math.min(minY, p[1]);
      maxY = Math.max(maxY, p[1]);
    }
    this.zoom = Math.min(
      Math.max(100, this.stage.width() - 100) / Math.max(maxX - minX, 1),
      Math.max(100, this.stage.height() - 100) / Math.max(maxY - minY, 1),
    );
    this.offset = [
      (this.stage.width() - (minX + maxX) * this.zoom) / 2,
      (this.stage.height() + (minY + maxY) * this.zoom) / 2,
    ];
    this.render();
  }
  render() {
    syncAnnotations(this.sketch);
    checkAnnotationCollisions(this.sketch);
    if (this.saveStatus !== 'Storage unavailable')
      this.saveStatus =
        this.savedSnapshot === JSON.stringify({ name: this.name, sketch: this.sketch })
          ? 'Saved in this browser'
          : 'Unsaved changes';
    this.changeDetector.markForCheck();
    if (!this.drawing) {
      this.renderInteraction();
      return;
    }
    this.drawing.destroyChildren();
    const width = this.stage.width(),
      height = this.stage.height();
    let step = 10 * this.zoom;
    while (step < 24) step *= 10;
    while (step > 180) step /= 10;
    if (this.grid) {
      for (let x = ((this.offset[0] % step) + step) % step; x < width; x += step)
        this.drawing.add(
          new Konva.Line({
            points: [x, 0, x, height],
            stroke: this.theme.grid,
            strokeWidth: 1,
            listening: false,
          }),
        );
      for (let y = ((this.offset[1] % step) + step) % step; y < height; y += step)
        this.drawing.add(
          new Konva.Line({
            points: [0, y, width, y],
            stroke: this.theme.grid,
            strokeWidth: 1,
            listening: false,
          }),
        );
    }
    this.drawing.add(
      new Konva.Line({
        points: [0, this.offset[1], width, this.offset[1]],
        stroke: this.theme.axisX,
        listening: false,
      }),
    );
    this.drawing.add(
      new Konva.Line({
        points: [this.offset[0], 0, this.offset[0], height],
        stroke: this.theme.axisY,
        listening: false,
      }),
    );
    for (const item of this.sketch.entities) {
      if (this.hidden.has(item.layer)) continue;
      const options = {
        stroke:
          item.id === this.selected || this.selectionIds.includes(item.id)
            ? this.theme.selected
            : this.theme.geometry,
        strokeWidth: item.id === this.selected || this.selectionIds.includes(item.id) ? 2.5 : 1.5,
        hitStrokeWidth: 12,
        entityId: item.id,
      };
      let node: Konva.Shape;
      if (item.type === 'circle') {
        const p = this.screen(item.points[0]);
        node = new Konva.Circle({ ...options, x: p[0], y: p[1], radius: item.radius * this.zoom });
      } else {
        let points = item.points;
        if (item.type === 'arc') {
          let sweep = (item.end_angle - item.start_angle + 360) % 360;
          if (!sweep) sweep = 360;
          points = Array.from({ length: 97 }, (_, i) => {
            const a = ((item.start_angle + (sweep * i) / 96) * Math.PI) / 180;
            return [
              item.points[0][0] + item.radius * Math.cos(a),
              item.points[0][1] + item.radius * Math.sin(a),
            ] as Point;
          });
        }
        node = new Konva.Line({
          ...options,
          points: points.flatMap((p) => this.screen(p)),
          closed: item.closed,
        });
      }
      if (this.tool === 'select') {
        node.on('mouseenter', () => {
          node.stroke(this.theme.selected);
          this.stage.container().style.cursor = 'pointer';
          this.drawing.batchDraw();
        });
        node.on('mouseleave', () => {
          node.stroke(options.stroke);
          this.stage.container().style.cursor = '';
          this.drawing.batchDraw();
        });
      }
      this.drawing.add(node);
    }
    if (!this.hidden.has(ANNOTATION_LAYER))
      for (const a of this.sketch.annotations) {
        const entities = this.sketch.entities.filter((e) => a.refs.includes(e.id));
        // Reference order matters for angular dimensions.
        const ordered = a.refs
          .map((id) => entities.find((e) => e.id === id))
          .filter((e): e is Entity => !!e);
        const group = dimensionGroup(
          a,
          ordered,
          (p) => this.screen(p),
          this.zoom,
          a.id === this.selectedAnnotation,
          (delta) => {
            a.placement.position = [
              a.placement.position[0] + delta[0],
              a.placement.position[1] + delta[1],
            ];
            a.placement.manual = true;
            this.touchAnnotation(a);
            this.selectedAnnotation = a.id;
            this.selected = '';
            this.render();
          },
          () => this.checkpoint(),
          this.theme,
        );
        group.draggable(this.tool === 'select');
        this.drawing.add(group);
      }
    if (this.start) {
      const p = this.screen(this.start);
      this.drawing.add(
        new Konva.Circle({
          x: p[0],
          y: p[1],
          radius: 4,
          fill: this.theme.selected,
          listening: false,
        }),
      );
    }
    this.drawing.batchDraw();
    this.renderInteraction();
  }
  private renderInteraction() {
    const layer = this.interaction;
    if (!layer) return;
    layer.destroyChildren();
    if (['select', 'pan', 'dimension', 'diameter', 'radius', 'angular'].includes(this.tool)) {
      layer.batchDraw();
      return;
    }
    const previewStyle = {
      stroke: this.theme.selected,
      strokeWidth: 1.5,
      dash: [6, 4],
      listening: false,
    };
    if (this.tool === 'polyline' && this.drawingPoints.length) {
      layer.add(
        new Konva.Line({
          ...previewStyle,
          points: [...this.drawingPoints, this.cursor].flatMap((p) => this.screen(p)),
        }),
      );
      for (const p of this.drawingPoints) {
        const [x, y] = this.screen(p);
        layer.add(
          new Konva.Circle({ x, y, radius: 3, fill: this.theme.selected, listening: false }),
        );
      }
    } else if (this.tool === 'arc' && this.drawingPoints.length) {
      layer.add(
        new Konva.Line({
          ...previewStyle,
          points: [...this.drawingPoints, this.cursor].flatMap((p) => this.screen(p)),
        }),
      );
      if (this.drawingPoints.length === 2) {
        try {
          const arc = createArc(
            this.arcMethod,
            this.scalarArc ? this.drawingPoints : [...this.drawingPoints, this.cursor],
            this.arcScalar,
            this.arcClockwise,
          );
          layer.add(
            new Konva.Line({
              ...previewStyle,
              dash: [],
              points: arcPreview(arc).flatMap((p) => this.screen(p)),
            }),
          );
        } catch {
          /* Incomplete/degenerate pointer positions have no arc preview. */
        }
      }
    } else if (this.start) {
      const first = this.screen(this.start),
        last = this.screen(this.cursor);
      const style = {
        stroke: this.theme.selected,
        strokeWidth: 1.5,
        dash: [6, 4],
        listening: false,
      };
      if (this.tool === 'circle')
        layer.add(
          new Konva.Circle({
            ...style,
            x: first[0],
            y: first[1],
            radius: Math.hypot(last[0] - first[0], last[1] - first[1]),
          }),
        );
      else
        layer.add(
          new Konva.Line({
            ...style,
            points:
              this.tool === 'rectangle'
                ? [first[0], first[1], last[0], first[1], last[0], last[1], first[0], last[1]]
                : [...first, ...last],
            closed: this.tool === 'rectangle',
          }),
        );
    }
    if (this.snapCandidate) {
      const [x, y] = this.screen(this.snapCandidate.point);
      layer.add(
        new Konva.Rect({
          x: x - 5,
          y: y - 5,
          width: 10,
          height: 10,
          stroke: this.theme.selected,
          strokeWidth: 2,
          listening: false,
        }),
      );
      layer.add(
        new Konva.Text({
          x: x + 9,
          y: y + 9,
          text: this.snapCandidate.kind,
          fill: this.theme.selected,
          fontSize: 12,
          listening: false,
        }),
      );
    }
    layer.batchDraw();
  }
  private validAnnotationSettings(): boolean {
    const s = this.annotationStyle;
    const valid =
      [s.text_height, s.arrow_size, s.offset].every(
        (v) => Number.isFinite(v) && v > 0 && v <= 1e6,
      ) &&
      Number.isInteger(this.annotationPrecision) &&
      this.annotationPrecision >= 0 &&
      this.annotationPrecision <= 8 &&
      /^#[0-9a-fA-F]{6}$/.test(s.color);
    if (!valid) this.message = 'Use positive annotation sizes and precision from 0 to 8.';
    return valid;
  }
  autoDimensions(selectedOnly = false) {
    if (!this.validAnnotationSettings()) return;
    if (selectedOnly && !this.selectionIds.length) {
      this.message = 'Select geometry first (Shift-click for multiple entities).';
      return;
    }
    this.checkpoint();
    const count = autoDimension(
      this.sketch,
      selectedOnly ? this.selectionIds : undefined,
      this.annotationStyle,
      this.annotationPrecision,
    );
    this.message = `${count} dimensions added. Existing dimensions retained. Invalid/zero-size geometry is skipped. Label placement is approximate; inspect leader overlaps.${this.sketch.annotations.length >= 2000 ? ' Limit: 2,000 annotations.' : ''}`;
    if (this.stage) this.fit();
    else this.render();
  }
  dimensionClick(id: string) {
    const e = this.sketch.entities.find((e) => e.id === id);
    if (!e) {
      this.message = 'Click supported geometry to dimension it.';
      return;
    }
    if (this.tool === 'angular') {
      if (e.type !== 'line') {
        this.message = 'Angular dimensions require two lines.';
        return;
      }
      if (!this.angularFirst) {
        this.angularFirst = id;
        this.message = 'First line selected. Click the second line.';
        return;
      }
      const refs = [this.angularFirst, id];
      this.angularFirst = '';
      this.addDimension('angular', refs);
      return;
    }
    if (this.tool === 'diameter' || this.tool === 'radius') {
      this.addDimension(this.tool, [id]);
      return;
    }
    if (e.type === 'polyline' && e.closed) {
      this.addDimension('horizontal', [id]);
      this.addDimension('vertical', [id]);
      return;
    }
    const type =
      e.type === 'circle'
        ? 'diameter'
        : e.type === 'arc'
          ? 'radius'
          : e.type === 'line'
            ? Math.abs(e.points[1][1] - e.points[0][1]) < 1e-8
              ? 'horizontal'
              : Math.abs(e.points[1][0] - e.points[0][0]) < 1e-8
                ? 'vertical'
                : 'aligned'
            : null;
    if (type) this.addDimension(type, [id]);
    else this.message = 'Choose a line, circle, arc or closed profile.';
  }
  addDimension(type: Annotation['type'], refs: string[]) {
    if (!this.validAnnotationSettings()) return;
    const existing = this.sketch.annotations.find(
      (a) => a.type === type && [...a.refs].sort().join('|') === [...refs].sort().join('|'),
    );
    if (existing) {
      this.selectedAnnotation = existing.id;
      this.selected = '';
      this.message = 'Existing dimension selected.';
      this.render();
      return;
    }
    if (this.sketch.annotations.length >= 2000) {
      this.message = 'Maximum 2,000 annotations reached.';
      return;
    }
    const a = makeAnnotation(type, refs, this.sketch, 'manual', this.annotationStyle);
    if (!a) {
      this.message = 'Cannot dimension incompatible, parallel, coincident or degenerate geometry.';
      return;
    }
    a.precision = this.annotationPrecision;
    placeAnnotation(a, this.sketch);
    this.checkpoint();
    this.sketch.annotations.push(a);
    this.selectedAnnotation = a.id;
    this.selected = '';
    this.selectionIds = [];
    this.message = 'Dimension created. Drag its label or edit placement in properties.';
    this.render();
  }
  touchAnnotation(a: Annotation) {
    a.revision++;
    a.updated_at = new Date().toISOString();
  }
  annotationProperty(field: string, raw: string) {
    const a = this.currentAnnotation;
    if (!a) return;
    const number = Number(raw);
    if (
      field !== 'text_override' &&
      field !== 'color' &&
      field !== 'show_units' &&
      (!Number.isFinite(number) || Math.abs(number) > 1e9)
    ) {
      this.message = 'Enter a finite annotation value.';
      return;
    }
    if (field === 'precision' && (!Number.isInteger(number) || number < 0 || number > 8)) return;
    if (['text_height', 'arrow_size', 'offset'].includes(field) && (number <= 0 || number > 1e6))
      return;
    if (['plus', 'minus'].includes(field) && number < 0) return;
    if (field === 'color' && !/^#[0-9a-fA-F]{6}$/.test(raw)) return;
    this.checkpoint();
    if (field === 'precision') a.precision = number;
    else if (field === 'x' || field === 'y') {
      a.placement.position[field === 'x' ? 0 : 1] = number;
      a.placement.manual = true;
    } else if (field === 'text_override') a.text_override = raw.trim() ? raw.slice(0, 200) : null;
    else if (field === 'plus' || field === 'minus') {
      a.tolerance = { ...(a.tolerance || { plus: 0, minus: 0 }), [field]: number };
    } else if (field === 'color') a.style.color = raw;
    else if (field === 'show_units') a.style.show_units = raw === 'true';
    else if (field === 'text_height' || field === 'arrow_size' || field === 'offset')
      a.style[field] = number;
    if (!a.placement.manual) placeAnnotation(a, this.sketch);
    this.touchAnnotation(a);
    this.render();
  }
  changeDimensionType(type: Annotation['type']) {
    const a = this.currentAnnotation;
    if (!a || !this.dimensionTypes.includes(type)) return;
    if (
      this.sketch.annotations.some(
        (b) =>
          b.id !== a.id &&
          b.type === type &&
          [...b.refs].sort().join('|') === [...a.refs].sort().join('|'),
      )
    ) {
      this.message = 'This dimension type already exists for the selected geometry.';
      return;
    }
    const replacement = makeAnnotation(type, a.refs, this.sketch, 'manual', a.style);
    if (!replacement) {
      this.message = 'This projection is degenerate for the selected geometry.';
      return;
    }
    this.checkpoint();
    a.type = type;
    this.touchAnnotation(a);
    this.render();
  }
  clearTolerance() {
    const a = this.currentAnnotation;
    if (!a) return;
    this.checkpoint();
    a.tolerance = null;
    this.touchAnnotation(a);
    this.render();
  }
  resetPlacement() {
    const a = this.currentAnnotation;
    if (!a || a.status !== 'valid') return;
    this.checkpoint();
    a.placement.manual = false;
    placeAnnotation(a, this.sketch);
    this.touchAnnotation(a);
    this.render();
  }
  importFile(event: Event) {
    const input = event.target as HTMLInputElement,
      file = input.files?.[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.dxf') || file.size > 5 * 1024 * 1024) {
      this.message = 'Choose a DXF file up to 5 MB.';
      input.value = '';
      return;
    }
    this.busy = true;
    this.message = 'Validating DXF…';
    this.http
      .post<Sketch>('/api/v1/drawings/import-dxf', file, {
        headers: { 'Content-Type': 'application/dxf' },
      })
      .subscribe({
        next: (sketch) => {
          this.drawingPoints = [];
          this.start = null;
          this.contextMenu = null;
          this.checkpoint();
          this.sketch = normalizeSketch({
            ...sketch,
            entities: sketch.entities.map((e) => ({ ...entity(e.type, e.points), ...e })),
          });
          this.selectedAnnotation = '';
          this.selectionIds = [];
          this.extraLayers = [];
          this.selected = '';
          this.name = file.name.replace(/\.dxf$/i, '');
          this.busy = false;
          this.message = !sketch.entities.length
            ? sketch.warnings[0] || 'This DXF contains no editable geometry.'
            : sketch.units
              ? 'DXF imported. Review interchange warnings.'
              : 'Units are unspecified. Choose drawing units before exporting.';
          this.fit();
        },
        error: (error) => {
          this.changeDetector.markForCheck();
          this.busy = false;
          this.message =
            error.status === 0
              ? 'Cannot reach the DXF service. Start or rebuild the backend and try again.'
              : error.status === 404
                ? 'DXF import endpoint is unavailable. Rebuild and restart the backend with the latest code.'
                : typeof error.error?.detail === 'string'
                  ? error.error.detail
                  : 'Import failed. Use a supported ASCII 2D DXF (maximum 5 MB).';
        },
      });
    input.value = '';
  }
  download(data: Blob, filename: string) {
    const url = URL.createObjectURL(data);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  exportDxf() {
    if (!this.sketch.units || this.busy) return;
    syncAnnotations(this.sketch);
    if (this.sketch.annotations.some((a) => a.status !== 'valid')) {
      this.message = 'Resolve or delete orphan/invalid annotations before DXF export.';
      return;
    }
    this.busy = true;
    this.http.post('/api/v1/drawings/export-dxf', this.sketch, { responseType: 'blob' }).subscribe({
      next: (blob) => {
        this.changeDetector.markForCheck();
        this.download(blob, `${this.name}.dxf`);
        this.busy = false;
        this.message = 'DXF exported. Only supported sketch geometry is included.';
      },
      error: () => {
        this.changeDetector.markForCheck();
        this.busy = false;
        this.message = 'Export failed. Check geometry values and the backend connection.';
      },
    });
  }
  analyzeTolerances() {
    if (this.busy) return;
    syncAnnotations(this.sketch);
    this.cad.capture(this.sketch, this.name);
    this.busy = true;
    this.cad
      .extract(this.sketch)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (extraction) => {
          this.cad.merge(extraction);
          this.busy = false;
          this.analyze.emit();
          this.changeDetector.markForCheck();
        },
        error: () => {
          this.busy = false;
          this.message =
            'Drawing validation failed. Check geometry and annotation references, and the backend connection.';
          this.changeDetector.markForCheck();
        },
      });
  }
  save() {
    syncAnnotations(this.sketch);
    try {
      localStorage.setItem('t360-sketch', JSON.stringify({ name: this.name, sketch: this.sketch }));
      this.savedSnapshot = JSON.stringify({ name: this.name, sketch: this.sketch });
      this.saveStatus = 'Saved in this browser';
      this.message = 'Sketch saved in this browser.';
    } catch {
      this.saveStatus = 'Storage unavailable';
      this.message = 'Browser storage is unavailable or full.';
    }
  }
  restore() {
    this.drawingPoints = [];
    this.start = null;
    this.contextMenu = null;
    try {
      const data = JSON.parse(localStorage.getItem('t360-sketch') || 'null');
      if (!data) {
        this.message = 'No browser save found.';
        return;
      }
      if (data.sketch.schema_version !== 1 || !Array.isArray(data.sketch.entities)) throw Error();
      this.checkpoint();
      this.sketch = normalizeSketch(data.sketch);
      this.selectedAnnotation = '';
      this.selectionIds = [];
      this.extraLayers = [];
      this.name = data.name;
      this.selected = '';
      this.fit();
      this.savedSnapshot = JSON.stringify({ name: this.name, sketch: this.sketch });
      this.saveStatus = 'Saved in this browser';
      this.message = 'Browser save restored.';
    } catch {
      this.message = 'Saved sketch could not be restored.';
    }
  }
  @HostListener('window:beforeunload') persistWorkingDrawing() {
    syncAnnotations(this.sketch);
    this.cad.capture(this.sketch, this.name);
  }
  @HostListener('window:keydown', ['$event']) key(event: KeyboardEvent) {
    if (event.key === 'Escape' && ['polyline', 'arc'].includes(this.tool)) {
      event.preventDefault();
      this.setTool('select');
      return;
    }
    if ((event.target as HTMLElement)?.matches('input,select,textarea')) return;
    if (
      event.key === 'Enter' &&
      this.tool === 'arc' &&
      this.scalarArc &&
      this.drawingPoints.length === 2
    ) {
      event.preventDefault();
      this.finishArc();
      return;
    }
    if (this.tool === 'polyline' && !event.ctrlKey && !event.metaKey) {
      if (['Enter', 'Backspace', 'c', 'C'].includes(event.key)) {
        event.preventDefault();
        if (event.key === 'Enter') this.finishPolyline();
        else if (event.key === 'Backspace') this.undoVertex();
        else this.finishPolyline(true);
        return;
      }
    }
    if (event.key === 'Escape') this.setTool('select');
    if (event.key === 'Delete') this.remove();
    if ((event.ctrlKey || event.metaKey) && event.key === 'z') {
      event.preventDefault();
      event.shiftKey ? this.redo() : this.undo();
    }
  }
}
