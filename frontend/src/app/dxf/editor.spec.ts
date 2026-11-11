import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { DxfEditor } from './editor';
import Konva from 'konva';
import { ANNOTATION_LAYER, newEntity } from './model';

describe('DXF sketch editing', () => {
  let editor: DxfEditor;
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [DxfEditor],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    editor = TestBed.createComponent(DxfEditor).componentInstance;
  });
  afterEach(() => TestBed.inject(HttpTestingController).verify());
  it('snaps to fractional endpoints, excludes hidden layers and can disable snapping', () => {
    editor.sketch.entities = [
      newEntity('line', [
        [5.25, 10.5],
        [25, 20],
      ]),
    ];
    editor.stage = {
      getPointerPosition: () => ({ x: 122, y: 357 }),
      destroy: () => {},
    } as Konva.Stage;
    expect(editor.world()).toEqual([5.25, 10.5]);
    expect(editor.snapCandidate?.kind).toBe('endpoint');
    editor.sketch.hidden_layers = ['Geometry'];
    editor.gridSnap = false;
    expect(editor.world()).toEqual([5.5, 10.75]);
    expect(editor.snapCandidate).toBeNull();
    editor.sketch.hidden_layers = [];
    editor.snap = false;
    expect(editor.world()).toEqual([5.5, 10.75]);
  });
  it('commits orthogonal geometry with stable IDs through undo/redo and Escape cancels', () => {
    let pointer = { x: 105, y: 390 };
    editor.stage = {
      getPointerPosition: () => pointer,
      destroy: () => {},
      draggable: () => {},
    } as unknown as Konva.Stage;
    editor.tool = 'line';
    editor.snap = false;
    editor.orthogonal = true;
    const event = { target: { attrs: {} } } as Konva.KonvaEventObject<MouseEvent>;
    editor.click(event);
    pointer = { x: 139, y: 387 };
    editor.click(event);
    expect(editor.sketch.entities[0].points).toEqual([
      [1.25, 2.5],
      [9.75, 2.5],
    ]);
    const id = editor.sketch.entities[0].id;
    editor.undo();
    editor.redo();
    expect(editor.sketch.entities[0].id).toBe(id);
    editor.click(event);
    editor.key(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(editor.start).toBeNull();
    expect(editor.sketch.entities).toHaveLength(1);
  });
  it('lets orthogonal mode take precedence over off-axis snap candidates', () => {
    editor.stage = {
      getPointerPosition: () => ({ x: 140, y: 398 }),
      destroy: () => {},
    } as Konva.Stage;
    editor.sketch.entities = [
      newEntity('line', [
        [10, 0.25],
        [20, 20],
      ]),
    ];
    editor.tool = 'line';
    editor.start = [0, 0];
    editor.orthogonal = true;
    expect(editor.world()).toEqual([10, 0]);
    expect(editor.snapCandidate).toBeNull();
  });
  it('draws in model coordinates independently of screen scale and supports undo/redo', () => {
    let pointer = { x: 120, y: 360 };
    editor.stage = { getPointerPosition: () => pointer, destroy: () => {} } as Konva.Stage;
    editor.tool = 'line';
    const event = { target: { attrs: {} } } as Konva.KonvaEventObject<MouseEvent>;
    editor.click(event);
    pointer = { x: 180, y: 320 };
    editor.click(event);
    expect(editor.sketch.entities[0].points).toEqual([
      [5, 10],
      [20, 20],
    ]);
    const id = editor.sketch.entities[0].id;
    editor.undo();
    expect(editor.sketch.entities).toHaveLength(0);
    editor.redo();
    expect(editor.sketch.entities[0].id).toBe(id);
  });
  it('rejects invalid radius and edits exact geometry with undo', () => {
    editor.fit = () => {};
    editor.demo();
    editor.selected = editor.sketch.entities[1].id;
    editor.property('radius', '-2');
    expect(editor.current?.radius).toBe(5);
    editor.property('radius', '7.25');
    expect(editor.current?.radius).toBe(7.25);
    editor.undo();
    expect(editor.sketch.entities[1].radius).toBe(5);
  });
  it('requires units before export and sends native geometry to the API', () => {
    editor.sketch.units = null;
    editor.exportDxf();
    TestBed.inject(HttpTestingController).expectNone('/api/v1/drawings/export-dxf');
    editor.changeUnits('in');
    editor.exportDxf();
    const request = TestBed.inject(HttpTestingController).expectOne('/api/v1/drawings/export-dxf');
    expect(request.request.body.units).toBe('in');
    request.error(new ProgressEvent('error'));
    expect(editor.busy).toBe(false);
    expect(editor.message).toContain('Export failed');
  });
  it('generates for selected geometry and allows explicit radius and diameter tools', () => {
    const circle = newEntity('circle', [[0, 0]], 10),
      other = newEntity('circle', [[50, 0]], 20);
    editor.sketch.entities = [circle, other];
    editor.selectionIds = [circle.id];
    editor.autoDimensions(true);
    expect(editor.sketch.annotations).toHaveLength(1);
    expect(editor.sketch.annotations[0].measured_value).toBe(20);
    editor.autoDimensions(true);
    expect(editor.sketch.annotations).toHaveLength(1);
    editor.tool = 'radius';
    editor.dimensionClick(circle.id);
    expect(editor.sketch.annotations.map((a) => a.type)).toEqual(['diameter', 'radius']);
  });
  it('synchronizes geometry edits and restores geometry plus annotation with undo/redo', () => {
    const circle = newEntity('circle', [[0, 0]], 10);
    editor.sketch.entities = [circle];
    editor.autoDimensions();
    const id = editor.sketch.annotations[0].id;
    editor.selected = circle.id;
    editor.property('radius', '12.5');
    expect(editor.sketch.annotations[0].measured_value).toBe(25);
    editor.undo();
    expect(editor.sketch.entities[0].radius).toBe(10);
    expect(editor.sketch.annotations[0].measured_value).toBe(20);
    editor.redo();
    expect(editor.sketch.annotations[0].id).toBe(id);
    expect(editor.sketch.annotations[0].measured_value).toBe(25);
    editor.selected = circle.id;
    editor.remove();
    expect(editor.sketch.annotations[0].status).toBe('orphan');
    editor.exportDxf();
    TestBed.inject(HttpTestingController).expectNone('/api/v1/drawings/export-dxf');
    expect(editor.message).toContain('orphan');
  });
  it('persists annotations, layers, manual placement and optional tolerances', () => {
    editor.fit = () => {};
    editor.sketch.entities = [newEntity('circle', [[0, 0]], 10)];
    editor.autoDimensions();
    const a = editor.sketch.annotations[0];
    editor.selectedAnnotation = a.id;
    editor.annotationProperty('x', '123');
    editor.annotationProperty('plus', '0.15');
    editor.annotationProperty('minus', '0.05');
    editor.annotationProperty('text_override', 'Inspection');
    editor.toggleLayer(ANNOTATION_LAYER);
    editor.save();
    editor.fresh();
    editor.restore();
    expect(editor.layers.filter((l) => l === ANNOTATION_LAYER)).toHaveLength(1);
    expect(editor.hidden.has(ANNOTATION_LAYER)).toBe(true);
    expect(editor.sketch.annotations[0].placement.position[0]).toBe(123);
    expect(editor.sketch.annotations[0].placement.manual).toBe(true);
    expect(editor.sketch.annotations[0].tolerance).toEqual({ plus: 0.15, minus: 0.05 });
    expect(editor.sketch.entities[0].radius).toBe(10);
    localStorage.removeItem('t360-sketch');
  });
  it('hides annotations and deletes an annotation without modifying geometry', () => {
    editor.sketch.entities = [newEntity('circle', [[0, 0]], 10)];
    editor.autoDimensions();
    const geometry = JSON.stringify(editor.sketch.entities);
    editor.toggleLayer(ANNOTATION_LAYER);
    expect(editor.hidden.has(ANNOTATION_LAYER)).toBe(true);
    expect(JSON.stringify(editor.sketch.entities)).toBe(geometry);
    editor.selectedAnnotation = editor.sketch.annotations[0].id;
    editor.remove();
    expect(editor.sketch.annotations).toHaveLength(0);
    expect(JSON.stringify(editor.sketch.entities)).toBe(geometry);
    editor.undo();
    expect(editor.sketch.annotations).toHaveLength(1);
  });
  it('keeps measurements unchanged by zoom, pan and explicit unit reassignment', () => {
    editor.sketch.entities = [
      newEntity('line', [
        [0, 0],
        [30, 40],
      ]),
    ];
    editor.autoDimensions();
    editor.zoom = 19;
    editor.offset = [-400, 630];
    editor.render();
    expect(editor.sketch.annotations[0].measured_value).toBe(50);
    editor.changeUnits('in');
    expect(editor.sketch.annotations[0].measured_value).toBe(50);
    expect(editor.sketch.annotations[0].units).toBe('in');
    expect(editor.message).toContain('reassigned');
  });
  it('supports angular picking and flags unsafe pairs without creating annotations', () => {
    const first = newEntity('line', [
        [0, 0],
        [10, 0],
      ]),
      second = newEntity('line', [
        [0, 0],
        [0, 10],
      ]);
    editor.sketch.entities = [first, second];
    editor.tool = 'angular';
    editor.dimensionClick(first.id);
    editor.dimensionClick(first.id);
    expect(editor.sketch.annotations).toHaveLength(0);
    editor.dimensionClick(first.id);
    editor.dimensionClick(second.id);
    expect(editor.sketch.annotations[0].measured_value).toBe(90);
  });
  it('migrates legacy browser saves with the mandatory annotation layer', () => {
    editor.fit = () => {};
    localStorage.setItem(
      't360-sketch',
      JSON.stringify({
        name: 'Legacy',
        sketch: { schema_version: 1, units: 'mm', entities: [], warnings: [] },
      }),
    );
    editor.restore();
    expect(editor.layers).toContain(ANNOTATION_LAYER);
    expect(editor.layers).toContain('Geometry');
    expect(editor.sketch.annotations).toEqual([]);
    localStorage.removeItem('t360-sketch');
  });
});

describe('CAD presentation controls preserve native geometry', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [DxfEditor],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
  });
  afterEach(() => {
    document.documentElement.style.removeProperty('--cad-geometry');
    localStorage.removeItem('t360-sketch');
  });
  it('panel visibility and entity explorer selection leave serialized drawing values unchanged', () => {
    const editor = TestBed.createComponent(DxfEditor).componentInstance;
    editor.sketch.entities = [
      newEntity('line', [
        [0, 0],
        [30, 40],
      ]),
    ];
    const before = JSON.stringify(editor.sketch);
    editor.leftPanelOpen = false;
    editor.rightPanelOpen = false;
    editor.inspectEntity(editor.sketch.entities[0].id);
    expect(editor.rightPanelOpen).toBe(true);
    expect(editor.selectedCount).toBe(1);
    expect(editor.propertyMeasurements[0].value).toBe(50);
    expect(JSON.stringify(editor.sketch)).toBe(before);
  });
  it('zoom buttons preserve the center model coordinate and all entity data', () => {
    const editor = TestBed.createComponent(DxfEditor).componentInstance;
    editor.stage = { width: () => 800, height: () => 600, destroy: () => {} } as Konva.Stage;
    editor.sketch.entities = [newEntity('circle', [[5, 6]], 10)];
    const before = JSON.stringify(editor.sketch);
    const center = [(400 - editor.offset[0]) / editor.zoom, (editor.offset[1] - 300) / editor.zoom];
    editor.zoomBy(1.15);
    expect((400 - editor.offset[0]) / editor.zoom).toBeCloseTo(center[0]);
    expect((editor.offset[1] - 300) / editor.zoom).toBeCloseTo(center[1]);
    expect(JSON.stringify(editor.sketch)).toBe(before);
  });
  it('reports local save state accurately after geometry and name edits', () => {
    const editor = TestBed.createComponent(DxfEditor).componentInstance;
    editor.sketch.entities = [newEntity('circle', [[5, 6]], 10)];
    editor.save();
    expect(editor.saveStatus).toBe('Saved in this browser');
    editor.name = 'Renamed drawing';
    editor.render();
    expect(editor.saveStatus).toBe('Unsaved changes');
    editor.save();
    editor.selected = editor.sketch.entities[0].id;
    editor.property('radius', '12');
    expect(editor.saveStatus).toBe('Unsaved changes');
  });
});
