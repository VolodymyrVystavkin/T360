import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import Konva from 'konva';
import { DxfEditor } from './editor';
import { ANNOTATION_LAYER, Point } from './model';

describe('polyline and arc editor operations', () => {
  let editor: DxfEditor;
  beforeEach(() => {
    localStorage.removeItem('t360-arc-method');
    TestBed.configureTestingModule({
      imports: [DxfEditor],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    editor = TestBed.createComponent(DxfEditor).componentInstance;
  });
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.removeItem('t360-arc-method');
    localStorage.removeItem('t360-sketch');
  });
  const key = (editor: DxfEditor, value: string) =>
    editor.key(new KeyboardEvent('keydown', { key: value }));

  it('keeps vertices uncommitted, finishes one entity and undoes/redoes as one command', () => {
    editor.setTool('polyline');
    editor.activeLayer = 'Outline';
    editor.addDrawingPoint([1.25, 2.5]);
    editor.addDrawingPoint([10.25, 2.5]);
    editor.addDrawingPoint([10.25, 12.5]);
    expect(editor.sketch.entities).toHaveLength(0);
    expect(editor.history).toHaveLength(0);
    key(editor, 'Enter');
    expect(editor.sketch.entities).toHaveLength(1);
    const item = structuredClone(editor.sketch.entities[0]);
    expect(item.type).toBe('polyline');
    expect(item.closed).toBe(false);
    expect(item.layer).toBe('Outline');
    expect(editor.history).toHaveLength(1);
    editor.undo();
    expect(editor.sketch.entities).toHaveLength(0);
    editor.redo();
    expect(editor.sketch.entities[0]).toEqual(item);
  });
  it('closes without duplicating the first point and rejects zero-length segments', () => {
    editor.setTool('polyline');
    editor.addDrawingPoint([0, 0]);
    editor.addDrawingPoint([0, 0]);
    expect(editor.drawingPoints).toHaveLength(1);
    editor.addDrawingPoint([10, 0]);
    key(editor, 'c');
    expect(editor.sketch.entities).toHaveLength(0);
    editor.addDrawingPoint([10, 10]);
    editor.addDrawingPoint([0, 0]);
    key(editor, 'C');
    expect(editor.sketch.entities[0].points).toEqual([
      [0, 0],
      [10, 0],
      [10, 10],
    ]);
    expect(editor.sketch.entities[0].closed).toBe(true);
  });
  it('Backspace removes pending vertices and Escape cancels without modifying history', () => {
    editor.setTool('polyline');
    editor.addDrawingPoint([0, 0]);
    editor.addDrawingPoint([10, 0]);
    key(editor, 'Backspace');
    expect(editor.drawingPoints).toEqual([[0, 0]]);
    expect(editor.start).toEqual([0, 0]);
    key(editor, 'Escape');
    expect(editor.drawingPoints).toEqual([]);
    expect(editor.start).toBeNull();
    expect(editor.sketch.entities).toEqual([]);
    expect(editor.history).toEqual([]);
  });
  it('offers a bounded right-click menu without adding vertices and cancels from input focus', () => {
    editor.setTool('polyline');
    editor.addDrawingPoint([0, 0]);
    editor.addDrawingPoint([10, 0]);
    const event = new MouseEvent('contextmenu', {
      clientX: 50000,
      clientY: 50000,
      cancelable: true,
    });
    editor.openPolylineMenu(event);
    expect(event.defaultPrevented).toBe(true);
    expect(editor.contextMenu!.x).toBeLessThan(window.innerWidth);
    expect(editor.drawingPoints).toHaveLength(2);
    editor.undoVertex();
    expect(editor.contextMenu).toBeNull();
    const input = document.createElement('input');
    const escape = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true });
    Object.defineProperty(escape, 'target', { value: input });
    editor.key(escape);
    expect(editor.drawingPoints).toHaveLength(0);
    expect(editor.tool).toBe('select');
  });
  it('accepts exact fractional coordinates and relative polar input', () => {
    editor.setTool('polyline');
    editor.orthogonal = true;
    for (const value of ['1.25,2.5', '@2.5,0', '@10<90']) {
      editor.coordinateInput = value;
      editor.submitCoordinate();
    }
    editor.finishPolyline();
    expect(editor.sketch.entities[0].points[0]).toEqual([1.25, 2.5]);
    expect(editor.sketch.entities[0].points[1]).toEqual([3.75, 2.5]);
    expect(editor.sketch.entities[0].points[2][1]).toBe(12.5);
  });
  it('tracks each polyline segment orthogonally in model coordinates', () => {
    let pointer = { x: 105, y: 390 };
    editor.stage = {
      getPointerPosition: () => pointer,
      draggable: () => {},
      destroy: () => {},
    } as unknown as Konva.Stage;
    editor.setTool('polyline');
    editor.snap = false;
    editor.orthogonal = true;
    const event = { target: { attrs: {} } } as Konva.KonvaEventObject<MouseEvent>;
    editor.click(event);
    pointer = { x: 140, y: 387 };
    editor.click(event);
    pointer = { x: 142, y: 350 };
    editor.click(event);
    editor.finishPolyline();
    expect(editor.sketch.entities[0].points).toEqual([
      [1.25, 2.5],
      [10, 2.5],
      [10, 12.5],
    ]);
  });
  it('moves, inserts and removes vertices with revision and stable entity identity', () => {
    editor.setTool('polyline');
    for (const p of [
      [0, 0],
      [10, 0],
      [10, 10],
    ] as Point[])
      editor.addDrawingPoint(p);
    editor.finishPolyline(true);
    const id = editor.selected;
    editor.property('point', '12', 1, 0);
    expect(editor.current!.revision).toBe(2);
    editor.editPolylineVertex(1, 'add');
    expect(editor.current!.points[2]).toEqual([11, 5]);
    editor.editPolylineVertex(2, 'remove');
    expect(editor.current!.points).toHaveLength(3);
    editor.editPolylineVertex(2, 'remove');
    expect(editor.current!.points).toHaveLength(3);
    editor.undo();
    editor.redo();
    expect(editor.sketch.entities[0].id).toBe(id);
  });
  it('creates arc geometry, rejects collinear points, and cancels invalid input safely', () => {
    editor.chooseArcMethod('3-Point');
    editor.addDrawingPoint([10, 0]);
    editor.addDrawingPoint([0, 10]);
    editor.addDrawingPoint([-10, 0]);
    expect(editor.current!.radius).toBeCloseTo(10);
    expect(editor.current!.type).toBe('arc');
    const snapshot = JSON.stringify(editor.sketch);
    editor.addDrawingPoint([0, 0]);
    editor.addDrawingPoint([1, 1]);
    editor.addDrawingPoint([2, 2]);
    expect(JSON.stringify(editor.sketch)).toBe(snapshot);
    expect(editor.message).toContain('non-collinear');
    key(editor, 'Escape');
    expect(JSON.stringify(editor.sketch)).toBe(snapshot);
  });
  it('reuses the chosen arc method and commits exact scalar geometry on a geometry layer', () => {
    editor.chooseArcMethod('Start, End, Radius');
    editor.setTool('line');
    editor.setTool('arc');
    expect(editor.arcMethod).toBe('Start, End, Radius');
    editor.activeLayer = ANNOTATION_LAYER;
    editor.addDrawingPoint([10, 0]);
    editor.addDrawingPoint([0, 10]);
    editor.arcScalar = 10;
    editor.finishArc();
    expect(editor.current!.radius).toBeCloseTo(10);
    expect(editor.current!.layer).toBe('Geometry');
    const copy = TestBed.createComponent(DxfEditor).componentInstance;
    expect(copy.arcMethod).toBe('Start, End, Radius');
  });
  it('previews arcs and polylines without mutating saved geometry or history', () => {
    vi.spyOn(Konva.Util, 'isCanvasFarblingActive').mockReturnValue(false);
    const nodes: Konva.Node[] = [];
    Object.assign(editor, {
      interaction: {
        destroyChildren: () => {
          nodes.length = 0;
        },
        add: (node: Konva.Node) => nodes.push(node),
        batchDraw: () => {},
      },
    });
    editor.setTool('polyline');
    editor.addDrawingPoint([1, 2]);
    editor.cursor = [10, 20];
    editor.refreshDrawingPreview();
    expect((nodes[0] as Konva.Line).points()).toEqual([104, 392, 140, 320]);
    expect(editor.sketch.entities).toHaveLength(0);
    expect(editor.history).toHaveLength(0);
    editor.chooseArcMethod('Start, Center, Angle');
    editor.addDrawingPoint([10, 0]);
    editor.addDrawingPoint([0, 0]);
    editor.arcScalar = 90;
    editor.refreshDrawingPreview();
    expect((nodes.at(-1) as Konva.Line).points()).toHaveLength(194);
    expect(editor.sketch.entities).toHaveLength(0);
    editor.setTool('select');
    expect(nodes).toHaveLength(0);
  });
  it('persists polyline closure, revision, layer and units through browser save/restore', () => {
    editor.fit = () => {};
    editor.setTool('polyline');
    editor.sketch.units = 'in';
    editor.activeLayer = 'Outline';
    for (const p of [
      [0, 0],
      [1, 0],
      [1, 1],
    ] as Point[])
      editor.addDrawingPoint(p);
    editor.finishPolyline(true);
    editor.property('point', '2', 1, 0);
    const snapshot = structuredClone(editor.sketch);
    editor.save();
    editor.fresh();
    editor.restore();
    expect(editor.sketch).toEqual(snapshot);
  });
});
