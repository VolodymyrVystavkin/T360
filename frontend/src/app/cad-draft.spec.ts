import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { CadDraftService, CadExtraction } from './cad-draft.service';
import { DxfEditor } from './dxf/editor';
import { App } from './app';
import { CadFeatures } from './cad-features';
import { emptySketch, newEntity } from './dxf/model';

const extraction = (): CadExtraction => ({ drawing_id: 'drawing-1', revision: 1, units: 'mm', warnings: [], features: [{
  id: 'line-1:length', entity_ids: ['line-1'], source_handle: 'A1', drawing_id: 'drawing-1', revision: 1,
  layer: 'Geometry', entity_type: 'LINE', name: 'Line length', measurement: 'length', nominal: 20, units: 'mm',
  plus: null, minus: null, annotation_id: null, annotation_ids: [], displayed_value: null, source: 'geometry', signature: 'sig-1',
  status: 'Missing tolerance', geometry: [{...newEntity('line', [[0,0],[20,0]]), id: 'line-1'}],
}] });

describe('Persistent CAD draft integration', () => {
  let service: CadDraftService;
  let http: HttpTestingController;
  beforeEach(async () => {
    localStorage.clear();
    TestBed.configureTestingModule({ imports: [App, DxfEditor, CadFeatures], providers: [provideHttpClient(), provideHttpClientTesting()] });
    await TestBed.compileComponents();
    service = TestBed.inject(CadDraftService); http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => { http.verify(); TestBed.resetTestingModule(); localStorage.clear(); });

  it('transfers unsaved editor state and emits navigation after successful extraction', () => {
    const editor = TestBed.createComponent(DxfEditor).componentInstance;
    editor.sketch = emptySketch(); editor.sketch.drawing_id = 'drawing-1';
    editor.sketch.entities = [{...newEntity('line', [[0,0],[23,0]]), id: 'line-1'}];
    let navigated = false; editor.analyze.subscribe(() => navigated = true);
    editor.analyzeTolerances();
    const request = http.expectOne('/api/v1/analysis/import-drawing');
    expect(request.request.body.entities[0].points[1][0]).toBe(23);
    expect(navigated).toBe(false);
    request.flush(extraction());
    expect(navigated).toBe(true);
    expect(service.drawing()!.sketch.entities[0].points[1][0]).toBe(23);
    expect(JSON.parse(localStorage.getItem('t360-working-drawing')!).sketch.drawing_id).toBe('drawing-1');
  });

  it('restores drawing and engineering draft after service recreation', () => {
    const sketch = emptySketch(); sketch.drawing_id = 'drawing-1';
    service.capture(sketch, 'Working drawing'); service.merge(extraction());
    const d = service.draft()!;
    d.rows[0].name = 'Housing'; d.rows[0].plus = .12; d.relationship = 'Housing - Shaft'; service.save();
    const another = TestBed.runInInjectionContext(() => new CadDraftService());
    expect(another.drawing()!.name).toBe('Working drawing');
    expect(another.draft()!.rows[0].name).toBe('Housing');
    expect(another.draft()!.rows[0].plus).toBe(.12);
  });

  it('detects unsaved changes on workspace navigation and increments revisions only when content changes', () => {
    const sketch = emptySketch(); sketch.drawing_id = 'drawing-1';
    sketch.entities = [{...newEntity('line',[[0,0],[20,0]]),id:'line-1'}];
    service.capture(sketch, 'Drawing'); service.merge(extraction());
    expect(service.stale()).toBe(false);
    sketch.entities[0].points[1][0] = 25; service.capture(sketch, 'Drawing');
    expect(sketch.revision).toBe(2); expect(service.stale()).toBe(true);
    service.capture(sketch, 'Drawing'); expect(sketch.revision).toBe(2);
    sketch.revision = 1; service.capture(sketch, 'Drawing'); expect(sketch.revision).toBe(2);
  });

  it('refreshes without duplicates and preserves tolerances only while engineering meaning remains valid', () => {
    const first = extraction(); service.merge(first);
    const row = service.draft()!.rows[0];
    row.plus = .12; row.minus = .05; row.selected = true; row.reviewed = true;
    service.merge(first); expect(service.draft()!.rows).toHaveLength(1);
    expect(service.draft()!.rows[0].reviewed).toBe(true);
    const next = structuredClone(first); next.revision = 2;
    next.features[0] = {...next.features[0], nominal: 24, signature: 'sig-2', revision:2};
    service.merge(next);
    expect(service.draft()!.rows[0].plus).toBe(.12);
    expect(service.draft()!.rows[0].reviewed).toBe(false);
    next.features[0].units = 'in'; next.features[0].signature = 'sig-3';
    service.merge(next); expect(service.draft()!.rows[0].plus).toBeNull();
  });

  it('flags removed source references and excludes them from a refreshed stack', () => {
    service.merge(extraction()); service.draft()!.rows[0].selected = true;
    service.merge({...extraction(), features:[]});
    const row = service.draft()!.rows[0];
    expect(row.selected).toBe(false); expect(row.feature.status).toContain('missing');
  });

  it('returns to the exact source geometry and original annotation, unhiding their layers', () => {
    const sketch = emptySketch(); sketch.drawing_id = 'drawing-1';
    sketch.entities = [{...newEntity('line',[[0,0],[20,0]]),id:'line-1'}];
    sketch.hidden_layers = ['Geometry', 'ASME Y14.5'];
    service.capture(sketch, 'Saved source'); service.merge(extraction());
    const component = TestBed.createComponent(CadFeatures).componentInstance;
    const row = service.draft()!.rows[0]; row.feature.annotation_id = 'dim-1';
    let opened = false; component.openEditor.subscribe(() => opened = true); component.source(row);
    const editor = TestBed.createComponent(DxfEditor).componentInstance;
    editor.resumeDrawing();
    expect(opened).toBe(true); expect(editor.selected).toBe('line-1');
    expect(editor.selectionIds).toEqual(['line-1']); expect(editor.selectedAnnotation).toBe('dim-1');
    expect(editor.sketch.hidden_layers).toEqual([]); expect(editor.name).toBe('Saved source');
  });

  it('requires tolerance bounds and builds the relationship without manual approval', () => {
    service.merge(extraction());
    const c = TestBed.createComponent(CadFeatures).componentInstance;
    const s = emptySketch(); s.drawing_id = 'drawing-1'; service.capture(s,'Drawing');
    service.draft()!.rows[0].selected = true;
    c.run(); expect(c.error()).toContain('tolerance');
    http.expectNone('/api/v1/analysis/calculate');
    const d = service.draft()!;
    d.rows[0].plus = .12; d.rows[0].minus = .05;
    c.run();
    const r = http.expectOne('/api/v1/analysis/calculate');
    expect(r.request.body.statistics).toBe(false);
    expect(r.request.body.automatic_relationship).toBe(true);
    expect(r.request.body.relationship).toBe('Stack = (1 × Line length)');
    expect(r.request.body.terms[0].reviewed).toBe(false);
    expect(r.request.body.terms[0]).toMatchObject({plus:.12,minus:.05,coefficient:1,signature:'sig-1'});
    r.flush({detail:{message:'Invalid geometry'}}, {status:422,statusText:'Unprocessable Entity'});
    expect(c.error()).toBe('Invalid geometry');
  });

  it('automatically selects all specified valid features when calculating without a selection', () => {
    const data = extraction(); data.features[0].plus = .2; data.features[0].minus = .1;
    data.features.push({...structuredClone(data.features[0]), id:'other', plus:null});
    service.merge(data);
    const s = emptySketch(); s.drawing_id = 'drawing-1'; service.capture(s, 'Drawing');
    const c = TestBed.createComponent(CadFeatures).componentInstance;
    c.run();
    const request = http.expectOne('/api/v1/analysis/calculate');
    expect(request.request.body.terms).toHaveLength(1);
    expect(request.request.body.terms[0].feature_id).toBe('line-1:length');
    expect(service.draft()!.rows[1].selected).toBe(false);
    request.flush({detail:{message:'Test complete'}}, {status:422,statusText:'Unprocessable Entity'});
  });

  it('generates signed relationships and still requires review for changed sources', () => {
    service.merge(extraction());
    const s = emptySketch(); s.drawing_id = 'drawing-1'; service.capture(s, 'Drawing');
    const row = service.draft()!.rows[0];
    Object.assign(row, {selected:true,plus:.2,minus:.1,coefficient:-2,changed:true});
    expect(service.relationship()).toBe('Stack = (-2 × Line length)');
    const c = TestBed.createComponent(CadFeatures).componentInstance; c.run();
    expect(c.error()).toContain('Review changed sources');
    http.expectNone('/api/v1/analysis/calculate');
  });

  it('excludes cached features outside Geometry from selection and calculation', () => {
    const data = extraction(); data.features[0].plus = .1; data.features[0].minus = .1;
    const other = structuredClone(data.features[0]); other.id = 'construction'; other.geometry[0].layer = 'Construction';
    data.features.push(other); service.merge(data);
    // Simulate a previously selected row from a draft created before the layer restriction.
    service.draft()!.rows[1].selected = true;
    expect(service.selectedRows()).toHaveLength(0);
    service.selectSpecified();
    expect(service.selectedRows().map(r => r.feature.id)).toEqual(['line-1:length']);
    expect(service.draft()!.rows[1].selected).toBe(false);
    service.merge({...data,features:[data.features[0]]});
    expect(service.draft()!.rows).toHaveLength(1);
  });

  it('shows CAD parameters and result charts together and preserves them across analysis tabs', async () => {
    service.merge(extraction());
    const d = service.draft()!;
    d.calculation = {drawing_id:'drawing-1',revision:1,units:'mm',relationship:'Stack = (1 × Line length)',sources:[],result:{
      nominal:20,worst_case:{lower:19.8,upper:20.2,half_width:.2},
      rss:{lower:19.8,upper:20.2,half_width:.2},
      monte_carlo:{mean:20,standard_deviation:.1,minimum:19.8,maximum:20.2,p025:19.81,p975:20.19,yield_percent:95,
        counts:[1,4,1],bin_edges:[19.8,19.9,20.1,20.2],samples:100,seed:42},insights:[]}};
    const s = emptySketch(); s.drawing_id = 'drawing-1'; service.capture(s,'Drawing');
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const element: HTMLElement = fixture.nativeElement;
    expect(element.querySelector('#cad-tab')?.getAttribute('aria-selected')).toBe('true');
    expect(element.querySelector('#manual-analysis-panel')).toBeNull();
    expect(element.textContent).toContain('Set analysis parameters');
    expect(element.textContent).toContain('Tolerance ranges');
    expect(element.querySelectorAll('.cad-histogram > div')).toHaveLength(3);
    expect(element.querySelector('.cad-metrics')?.textContent).toContain('20.000');
    (element.querySelector('#manual-tab') as HTMLButtonElement).click();
    await fixture.whenStable();
    expect(element.querySelector('#manual-analysis-panel')).not.toBeNull();
    expect(element.querySelector('cad-features')).toBeNull();
    (element.querySelector('#cad-tab') as HTMLButtonElement).click();
    await fixture.whenStable();
    expect(element.querySelector('.cad-histogram')).not.toBeNull();
    expect(service.draft()!.calculation!.result.nominal).toBe(20);
  });

  it('shows worst-case visualization without fabricated statistical results', async () => {
    service.merge(extraction());
    const s = emptySketch(); s.drawing_id = 'drawing-1'; service.capture(s,'Drawing');
    service.draft()!.calculation = {drawing_id:'drawing-1',revision:1,units:'mm',relationship:'Stack',sources:[],result:{
      nominal:0,worst_case:{lower:0,upper:0,half_width:0},rss:null,monte_carlo:null,insights:[]}};
    const fixture = TestBed.createComponent(CadFeatures); await fixture.whenStable();
    const element: HTMLElement = fixture.nativeElement;
    expect(element.textContent).toContain('Tolerance ranges');
    expect(element.querySelector('.cad-histogram')).toBeNull();
    expect(element.querySelector('.interval-band.rss')).toBeNull();
    expect(element.textContent).toContain('Enable the independent uniform statistical assumptions');
    expect(Number.isFinite(fixture.componentInstance.chartPosition(service.draft()!.calculation!,0))).toBe(true);
  });

  it('removes a feature from the analysis without deleting drawing geometry', () => {
    const s = emptySketch(); s.entities = [newEntity('line',[[0,0],[20,0]])];
    service.capture(s,'Drawing'); service.merge(extraction());
    service.draft()!.rows[0].removed = true; service.save();
    expect(service.drawing()!.sketch.entities).toHaveLength(1);
    const c = TestBed.createComponent(CadFeatures).componentInstance; c.restoreRows();
    expect(service.draft()!.rows[0].removed).toBe(false);
  });
});
