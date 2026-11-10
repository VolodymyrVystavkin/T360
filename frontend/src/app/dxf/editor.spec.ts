import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { DxfEditor } from './editor';
import Konva from 'konva';

describe('DXF sketch editing', () => {
  let editor: DxfEditor;
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [DxfEditor], providers: [provideHttpClient(), provideHttpClientTesting()] });
    editor = TestBed.createComponent(DxfEditor).componentInstance;
  });
  afterEach(() => TestBed.inject(HttpTestingController).verify());
  it('draws in model coordinates independently of screen scale and supports undo/redo', () => {
    let pointer = {x:120,y:360};
    editor.stage = {getPointerPosition:()=>pointer, destroy:()=>{}} as Konva.Stage;
    editor.tool='line';
    const event = {target:{attrs:{}}} as Konva.KonvaEventObject<MouseEvent>;
    editor.click(event); pointer={x:180,y:320}; editor.click(event);
    expect(editor.sketch.entities[0].points).toEqual([[5,10],[20,20]]);
    const id=editor.sketch.entities[0].id;
    editor.undo(); expect(editor.sketch.entities).toHaveLength(0);
    editor.redo(); expect(editor.sketch.entities[0].id).toBe(id);
  });
  it('rejects invalid radius and edits exact geometry with undo', () => {
    editor.fit=()=>{}; editor.demo();
    editor.selected=editor.sketch.entities[1].id;
    editor.property('radius','-2'); expect(editor.current?.radius).toBe(5);
    editor.property('radius','7.25'); expect(editor.current?.radius).toBe(7.25);
    editor.undo(); expect(editor.sketch.entities[1].radius).toBe(5);
  });
  it('requires units before export and sends native geometry to the API', () => {
    editor.sketch.units=null; editor.exportDxf();
    TestBed.inject(HttpTestingController).expectNone('/api/v1/drawings/export-dxf');
    editor.changeUnits('in'); editor.exportDxf();
    const request=TestBed.inject(HttpTestingController).expectOne('/api/v1/drawings/export-dxf');
    expect(request.request.body.units).toBe('in');
    request.error(new ProgressEvent('error'));
    expect(editor.busy).toBe(false);
    expect(editor.message).toContain('Export failed');
  });
});
