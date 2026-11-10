import { AfterViewInit, ChangeDetectorRef, Component, ElementRef, HostListener, OnDestroy, ViewChild, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import Konva from 'konva';

type Point = [number, number];
export interface Entity { id: string; type: 'line'|'circle'|'arc'|'polyline'; layer: string; points: Point[]; radius: number; start_angle: number; end_angle: number; closed: boolean; source_handle?: string }
interface Sketch { schema_version: 1; units: string | null; entities: Entity[]; warnings: string[] }
const entity = (type: Entity['type'], points: Point[], radius = 1): Entity => ({ id: crypto.randomUUID(), type, points, radius, layer: 'Geometry', start_angle: 0, end_angle: 90, closed: false });

@Component({ selector: 'dxf-editor', imports: [FormsModule], templateUrl: './editor.html', styleUrl: './editor.scss' })
export class DxfEditor implements AfterViewInit, OnDestroy {
  @ViewChild('canvas') canvas!: ElementRef<HTMLDivElement>;
  private http = inject(HttpClient);
  private changeDetector = inject(ChangeDetectorRef);
  stage!: Konva.Stage;
  private drawing!: Konva.Layer;
  private observer?: ResizeObserver;
  sketch: Sketch = { schema_version: 1, units: 'mm', entities: [], warnings: [] };
  tool = 'select'; selected = ''; name = 'Untitled drawing'; message = 'Choose a tool. Click two points to draw or measure.'; busy = false;
  snap = true; grid = true; hidden = new Set<string>(); activeLayer = 'Geometry'; newLayer = ''; extraLayers: string[] = [];
  history: string[] = []; future: string[] = []; start: Point | null = null;
  cursor: Point = [0, 0]; zoom = 4; offset: Point = [100, 400];
  get layers() { return [...new Set([...this.extraLayers, this.activeLayer, ...this.sketch.entities.map(e => e.layer)])]; }
  get current() { return this.sketch.entities.find(e => e.id === this.selected); }
  ngAfterViewInit() {
    this.stage = new Konva.Stage({ container: this.canvas.nativeElement, width: 800, height: 600 });
    this.drawing = new Konva.Layer(); this.stage.add(this.drawing);
    this.stage.on('click tap', ev => { this.click(ev); this.changeDetector.markForCheck(); });
    this.stage.on('mousemove', () => { this.cursor = this.world(); this.changeDetector.markForCheck(); });
    this.stage.on('wheel', ev => { ev.evt.preventDefault(); const p = this.stage.getPointerPosition()!; const world = [(p.x-this.offset[0])/this.zoom, (this.offset[1]-p.y)/this.zoom]; this.zoom = Math.max(.02, Math.min(200, this.zoom * (ev.evt.deltaY < 0 ? 1.15 : 1/1.15))); this.offset = [p.x-world[0]*this.zoom, p.y+world[1]*this.zoom]; this.render(); });
    this.stage.on('dragend', ev => { if (ev.target === this.stage) { this.offset = [this.offset[0]+this.stage.x(), this.offset[1]+this.stage.y()]; this.stage.position({x:0,y:0}); this.render(); } });
    this.observer = new ResizeObserver(() => { this.stage.size({ width: this.canvas.nativeElement.clientWidth, height: this.canvas.nativeElement.clientHeight }); this.render(); });
    this.observer.observe(this.canvas.nativeElement); this.render();
  }
  ngOnDestroy() { this.observer?.disconnect(); this.stage?.destroy(); }
  setTool(tool: string) { this.tool = tool; this.start = null; this.stage.draggable(tool === 'pan'); this.message = tool === 'select' ? 'Select geometry to edit its properties.' : tool === 'pan' ? 'Drag the canvas to pan. Scroll to zoom.' : 'Click the first point, then the second point.'; this.render(); }
  world(): Point { const p = this.stage.getPointerPosition() || {x:0,y:0}; const value: Point = [(p.x-this.offset[0])/this.zoom, (this.offset[1]-p.y)/this.zoom]; return this.snap ? value.map(v => Math.round(v)) as Point : value; }
  screen(p: Point): Point { return [p[0]*this.zoom+this.offset[0], this.offset[1]-p[1]*this.zoom]; }
  click(ev: Konva.KonvaEventObject<MouseEvent>) {
    if (this.busy || this.tool === 'pan') return;
    if (this.tool === 'select') { this.selected = ev.target.attrs['entityId'] || ''; this.render(); return; }
    const point = this.world();
    if (!this.start) { this.start = point; this.message = `First point: ${point.join(', ')}. Choose second point.`; this.render(); return; }
    const first = this.start; this.start = null;
    const length = Math.hypot(point[0]-first[0], point[1]-first[1]);
    if (this.tool === 'measure') { this.message = `Distance: ${length.toFixed(4)} ${this.sketch.units || '(units unspecified)'} · ΔX ${(point[0]-first[0]).toFixed(3)} · ΔY ${(point[1]-first[1]).toFixed(3)}`; this.render(); return; }
    if (length < 1e-9) { this.message = 'Choose two different points.'; return; }
    this.checkpoint();
    let item: Entity;
    if (this.tool === 'circle') item = entity('circle', [first], length);
    else if (this.tool === 'rectangle') { item = entity('polyline', [first, [point[0], first[1]], point, [first[0], point[1]]]); item.closed = true; }
    else item = entity('line', [first, point]);
    item.layer = this.activeLayer; this.sketch.entities.push(item); this.selected = item.id; this.message = 'Geometry created.'; this.render();
  }
  checkpoint() { this.history.push(JSON.stringify(this.sketch)); if (this.history.length > 100) this.history.shift(); this.future = []; }
  undo() { const value = this.history.pop(); if (!value) return; this.future.push(JSON.stringify(this.sketch)); this.sketch = JSON.parse(value); this.selected = ''; this.render(); }
  redo() { const value = this.future.pop(); if (!value) return; this.history.push(JSON.stringify(this.sketch)); this.sketch = JSON.parse(value); this.selected = ''; this.render(); }
  remove() { if (!this.current) return; this.checkpoint(); this.sketch.entities = this.sketch.entities.filter(e => e.id !== this.selected); this.selected = ''; this.render(); }
  property(field: string, raw: string, index = 0, axis = 0) {
    const current = this.current; if (!current) return;
    const value = Number(raw); if (field !== 'layer' && (!Number.isFinite(value) || Math.abs(value)>1e9 || (field==='radius' && value<=0))) { this.message = 'Enter a finite, valid geometry value.'; return; }
    this.checkpoint();
    if (field === 'point') current.points[index][axis] = value;
    else if (field === 'radius') current.radius = value;
    else if (field === 'start_angle' || field === 'end_angle') { if (Math.abs(value)>360) { this.undo(); return; } current[field] = value; }
    else if (field === 'layer') current.layer = raw;
    this.render();
  }
  toggleLayer(layer: string) { this.hidden.has(layer) ? this.hidden.delete(layer) : this.hidden.add(layer); this.render(); }
  addLayer() { if (!/^[\w .-]{1,100}$/.test(this.newLayer)) { this.message = 'Layer names use letters, numbers, spaces, dots, dashes or underscores.'; return; } this.extraLayers.push(this.newLayer); this.activeLayer = this.newLayer; this.newLayer = ''; }
  changeUnits(value: string) { this.checkpoint(); this.sketch.units = value || null; this.message = 'Units assigned; coordinate values are unchanged.'; }
  fresh() { this.checkpoint(); this.sketch = {schema_version:1, units:'mm', entities:[], warnings:[]}; this.selected = ''; this.name = 'Untitled drawing'; this.render(); }
  demo() { this.checkpoint(); const border = entity('polyline', [[0,0],[120,0],[120,80],[0,80]]); border.closed = true; this.sketch = { schema_version:1, units:'mm', warnings:[], entities:[border, ...[[15,15],[105,15],[105,65],[15,65]].map(p=>entity('circle', [p as Point], 5)), entity('circle', [[60,40]], 20)] }; this.name = 'Mounting plate'; this.fit(); }
  fit() {
    const points = this.sketch.entities.flatMap(e => e.type === 'circle' || e.type === 'arc' ? [[e.points[0][0]-e.radius,e.points[0][1]-e.radius],[e.points[0][0]+e.radius,e.points[0][1]+e.radius]] : e.points);
    if (!points.length) { this.zoom = 4; this.offset = [100,400]; this.render(); return; }
    let minX=Infinity, maxX=-Infinity, minY=Infinity, maxY=-Infinity;
    for (const p of points) { minX=Math.min(minX,p[0]); maxX=Math.max(maxX,p[0]); minY=Math.min(minY,p[1]); maxY=Math.max(maxY,p[1]); }
    this.zoom = Math.min((this.stage.width()-100)/Math.max(maxX-minX,1), (this.stage.height()-100)/Math.max(maxY-minY,1)); this.offset = [(this.stage.width()-(minX+maxX)*this.zoom)/2,(this.stage.height()+(minY+maxY)*this.zoom)/2]; this.render();
  }
  render() {
    this.changeDetector.markForCheck();
    if (!this.drawing) return; this.drawing.destroyChildren();
    const width = this.stage.width(), height = this.stage.height(); let step = 10*this.zoom; while (step<24) step*=10; while(step>180) step/=10;
    if (this.grid) { for(let x=((this.offset[0]%step)+step)%step;x<width;x+=step) this.drawing.add(new Konva.Line({points:[x,0,x,height],stroke:'#253541',strokeWidth:1,listening:false})); for(let y=((this.offset[1]%step)+step)%step;y<height;y+=step) this.drawing.add(new Konva.Line({points:[0,y,width,y],stroke:'#253541',strokeWidth:1,listening:false})); }
    this.drawing.add(new Konva.Line({points:[0,this.offset[1],width,this.offset[1]],stroke:'#416b5d',listening:false})); this.drawing.add(new Konva.Line({points:[this.offset[0],0,this.offset[0],height],stroke:'#75474e',listening:false}));
    for (const item of this.sketch.entities) {
      if (this.hidden.has(item.layer)) continue;
      const options = {stroke:item.id === this.selected ? '#ffcf70' : '#7bddd1', strokeWidth:item.id === this.selected ? 2.5 : 1.5, hitStrokeWidth:12, entityId:item.id};
      let node: Konva.Shape;
      if (item.type === 'circle') { const p = this.screen(item.points[0]); node = new Konva.Circle({...options,x:p[0],y:p[1],radius:item.radius*this.zoom}); }
      else { let points = item.points;
        if (item.type === 'arc') { let sweep = (item.end_angle-item.start_angle+360)%360; if (!sweep) sweep=360; points = Array.from({length:97},(_,i)=> {const a=(item.start_angle+sweep*i/96)*Math.PI/180; return [item.points[0][0]+item.radius*Math.cos(a),item.points[0][1]+item.radius*Math.sin(a)] as Point;}); }
        node = new Konva.Line({...options,points:points.flatMap(p=>this.screen(p)),closed:item.closed});
      }
      this.drawing.add(node);
    }
    if (this.start) { const p = this.screen(this.start); this.drawing.add(new Konva.Circle({x:p[0],y:p[1],radius:4,fill:'#ffcf70',listening:false})); }
    this.drawing.batchDraw();
  }
  importFile(event: Event) {
    const input = event.target as HTMLInputElement, file = input.files?.[0]; if (!file) return;
    if (!file.name.toLowerCase().endsWith('.dxf') || file.size>5*1024*1024) { this.message = 'Choose a DXF file up to 5 MB.'; input.value = ''; return; }
    this.busy=true; this.message='Validating DXF…';
    this.http.post<Sketch>('/api/v1/drawings/import-dxf',file,{headers:{'Content-Type':'application/dxf'}}).subscribe({ next: sketch => { this.checkpoint(); this.sketch = {...sketch, entities:sketch.entities.map(e=>({...entity(e.type,e.points),...e}))}; this.selected=''; this.name=file.name.replace(/\.dxf$/i,''); this.busy=false; this.message=!sketch.entities.length ? (sketch.warnings[0] || 'This DXF contains no editable geometry.') : sketch.units ? 'DXF imported. Review interchange warnings.' : 'Units are unspecified. Choose drawing units before exporting.'; this.fit(); }, error: error => { this.changeDetector.markForCheck(); this.busy=false; this.message=error.status === 0 ? 'Cannot reach the DXF service. Start or rebuild the backend and try again.' : error.status === 404 ? 'DXF import endpoint is unavailable. Rebuild and restart the backend with the latest code.' : typeof error.error?.detail === 'string' ? error.error.detail : 'Import failed. Use a supported ASCII 2D DXF (maximum 5 MB).'; }}); input.value='';
  }
  download(data: Blob, filename: string) { const url=URL.createObjectURL(data); const link=document.createElement('a'); link.href=url; link.download=filename; link.click(); setTimeout(()=>URL.revokeObjectURL(url),1000); }
  exportDxf() { if (!this.sketch.units || this.busy) return; this.busy=true; this.http.post('/api/v1/drawings/export-dxf',this.sketch,{responseType:'blob'}).subscribe({next: blob=>{this.changeDetector.markForCheck();this.download(blob,`${this.name}.dxf`);this.busy=false;this.message='DXF exported. Only supported sketch geometry is included.';},error:()=>{this.changeDetector.markForCheck();this.busy=false;this.message='Export failed. Check geometry values and the backend connection.';}}); }
  save() { try { localStorage.setItem('t360-sketch',JSON.stringify({name:this.name,sketch:this.sketch})); this.message='Sketch saved in this browser.'; } catch { this.message='Browser storage is unavailable or full.'; } }
  restore() { try { const data=JSON.parse(localStorage.getItem('t360-sketch') || 'null'); if(!data) {this.message='No browser save found.';return;} if(data.sketch.schema_version!==1 || !Array.isArray(data.sketch.entities)) throw Error(); this.checkpoint(); this.sketch=data.sketch;this.name=data.name;this.selected='';this.fit();this.message='Browser save restored.'; } catch {this.message='Saved sketch could not be restored.';} }
  @HostListener('window:keydown',['$event']) key(event: KeyboardEvent) { if ((event.target as HTMLElement)?.matches('input,select,textarea')) return; if (event.key==='Escape') this.setTool('select'); if (event.key==='Delete') this.remove(); if ((event.ctrlKey||event.metaKey)&&event.key==='z') {event.preventDefault();event.shiftKey?this.redo():this.undo();} }
}
