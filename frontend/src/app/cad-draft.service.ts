import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { AnalysisResult } from './analysis.service';
import { Sketch, Entity, normalizeSketch } from './dxf/model';

export interface CadFeature {
  id: string; entity_ids: string[]; source_handle: string | null; drawing_id: string;
  revision: number; layer: string; entity_type: string; name: string; measurement: string;
  nominal: number; units: string | null; plus: number | null; minus: number | null;
  annotation_id: string | null; annotation_ids: string[]; displayed_value: string | null; source: 'geometry' | 'dimension';
  signature: string; status: string; geometry: Entity[];
}
export interface CadExtraction { drawing_id: string; revision: number; units: string | null; features: CadFeature[]; warnings: string[] }
export interface CadRow { feature: CadFeature; selected: boolean; name: string; plus: number | null;
  minus: number | null; coefficient: number; reviewed: boolean; removed: boolean; changed: boolean }
export interface CadDraft { extraction: CadExtraction; rows: CadRow[]; relationship: string;
  calculation?: CadResult | null; confirmed: boolean; statistics: boolean; units: string; lower: number; upper: number; samples: number; seed: number }
export interface CadResult { drawing_id: string; revision: number; units: string; relationship: string; sources: unknown[]; result: Omit<AnalysisResult, 'rss' | 'monte_carlo'> & { rss: AnalysisResult['rss'] | null; monte_carlo: AnalysisResult['monte_carlo'] | null } }
export interface DrawingState { name: string; sketch: Sketch }

@Injectable({ providedIn: 'root' })
export class CadDraftService {
  private http = inject(HttpClient);
  drawing = signal<DrawingState | null>(this.read('t360-working-drawing'));
  draft = signal<CadDraft | null>(this.read('t360-cad-draft'));
  highlight = signal<{ ids: string[]; annotation: string | null } | null>(null);
  storageError = signal('');
  private read(key: string) { try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; } }
  private write(key: string, value: unknown) {
    try { localStorage.setItem(key, JSON.stringify(value)); this.storageError.set(''); }
    catch { this.storageError.set('Browser storage unavailable or full. Keep this tab open; reload persistence is unavailable.'); }
  }
  capture(sketch: Sketch, name: string) {
    const old = this.drawing();
    const content = (s: Sketch) => JSON.stringify({ ...s, revision: 0 });
    if (old?.sketch.drawing_id === sketch.drawing_id) {
      const changed = content(old.sketch) !== content(sketch);
      sketch.revision = Math.max(sketch.revision, old.sketch.revision + (changed ? 1 : 0));
    }
    const state = { name, sketch: structuredClone(normalizeSketch(sketch)) };
    this.drawing.set(state);
    this.write('t360-working-drawing', state);
  }
  stale() {
    const draft = this.draft(), sketch = this.drawing()?.sketch;
    return !!draft && (!sketch || draft.extraction.drawing_id !== sketch.drawing_id || draft.extraction.revision !== sketch.revision);
  }
  extract(sketch: Sketch) { return this.http.post<CadExtraction>('/api/v1/analysis/import-drawing', sketch); }
  merge(extraction: CadExtraction) {
    extraction = structuredClone(extraction);
    const old = this.draft();
    const same = old?.extraction.drawing_id === extraction.drawing_id;
    const rows = extraction.features.map(feature => {
      const previous = same ? old?.rows.find(r => r.feature.id === feature.id) : undefined;
      if (previous) {
        const changed = previous.feature.signature !== feature.signature;
        const meaning = (f: CadFeature) => JSON.stringify([f.entity_ids, f.entity_type, f.measurement,
          f.units, f.geometry.map(e => e.type), f.plus, f.minus, f.displayed_value]);
        const sameMeaning = meaning(previous.feature) === meaning(feature);
        // Preserve user tolerances only while identity, measurement and specification meaning remain valid.
        return { ...previous, feature, changed: changed || previous.changed,
          reviewed: changed ? false : previous.reviewed,
          plus: sameMeaning ? previous.plus : feature.plus, minus: sameMeaning ? previous.minus : feature.minus };
      }
      return { feature, selected: false, name: feature.name.slice(0, 100), plus: feature.plus, minus: feature.minus,
        coefficient: 1, reviewed: false, removed: false, changed: false };
    });
    const missing = same ? old!.rows.filter(r => this.isGeometryFeature(r.feature) && !rows.some(n => n.feature.id === r.feature.id)) : [];
    for (const r of missing) rows.push({ ...r, selected: false, reviewed: false, changed: true,
      feature: { ...r.feature, status: 'Invalid: source reference missing' } });
    const draft: CadDraft = { extraction, rows, relationship: same ? old!.relationship : '',
      confirmed: false, statistics: same ? old!.statistics : false, units: same ? old!.units : extraction.units || 'mm',
      lower: same ? old!.lower : -1, upper: same ? old!.upper : 1,
      samples: same ? old!.samples : 10000, seed: same ? old!.seed : 42 };
    this.draft.set(draft); this.save();
  }
  isGeometryFeature(feature: CadFeature) { return feature.geometry.length > 0 && feature.geometry.every(e => e.layer === 'Geometry'); }
  selectedRows() { return this.draft()?.rows.filter(r => r.selected && !r.removed && this.isGeometryFeature(r.feature)) || []; }
  relationship() {
    const rows = this.selectedRows();
    return rows.length ? 'Stack = ' + rows.map(r => `(${r.coefficient} × ${r.name})`).join(' + ') : 'Select features or calculate all features with specified tolerances.';
  }
  selectSpecified() {
    const d = this.draft();
    if (!d) return;
    for (const row of d.rows) row.selected = !row.removed && this.isGeometryFeature(row.feature) && !row.feature.status.startsWith('Invalid') &&
      row.feature.units !== 'deg' && row.plus !== null && row.minus !== null &&
      Number.isFinite(row.plus) && Number.isFinite(row.minus) && row.plus >= 0 && row.minus >= 0;
    this.save();
  }
  save() { this.write('t360-cad-draft', this.draft()); }
  calculate() {
    const d = this.draft()!;
    return this.http.post<CadResult>('/api/v1/analysis/calculate', {
      sketch: this.drawing()!.sketch, revision: d.extraction.revision, units: d.units,
      relationship: this.relationship(), automatic_relationship: true, statistics: d.statistics,
      terms: this.selectedRows().map(r => ({ feature_id: r.feature.id,
        signature: r.feature.signature, name: r.name, plus: r.plus, minus: r.minus,
        coefficient: r.coefficient, reviewed: r.reviewed })),
      lower_spec: d.lower, upper_spec: d.upper, samples: d.samples, seed: d.seed,
    });
  }
}
