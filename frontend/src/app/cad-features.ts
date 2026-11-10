import { Component, DestroyRef, inject, output, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { UiState } from './ui/state';
import { FormsModule } from '@angular/forms';
import { DecimalPipe, JsonPipe } from '@angular/common';
import { CadDraftService, CadRow, CadResult } from './cad-draft.service';

@Component({
  selector: 'cad-features',
  imports: [
    UiState,
    FormsModule,
    DecimalPipe,
    JsonPipe,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
  ],
  templateUrl: './cad-features.html',
  styleUrl: './cad-features.scss',
})
export class CadFeatures {
  private readonly measurementIcons: Record<string, string> = {
    length: 'M4 12H20 M7 9L4 12L7 15 M17 9L20 12L17 15 M4 5V7 M20 5V7',
    horizontal: 'M4 5V19 M20 5V19 M4 12H20 M7 9L4 12L7 15 M17 9L20 12L17 15',
    width: 'M4 5V19 M20 5V19 M4 12H20 M7 9L4 12L7 15 M17 9L20 12L17 15',
    vertical: 'M5 4H19 M5 20H19 M12 4V20 M9 7L12 4L15 7 M9 17L12 20L15 17',
    height: 'M5 4H19 M5 20H19 M12 4V20 M9 7L12 4L15 7 M9 17L12 20L15 17',
    aligned: 'M4 17L17 4 M4 12V17H9 M12 4H17V9 M8 21L21 8',
    radius: 'M20 12A8 8 0 1 1 12 4 M12 12L19 5 M14 5H19V10 M11 12H13 M12 11V13',
    diameter: 'M20 12A8 8 0 1 1 4 12A8 8 0 1 1 20 12 M4 20L20 4 M4 15V20H9 M15 4H20V9',
    angular: 'M20 19H4L16 5 M10 19A6 6 0 0 0 8 14',
    perimeter: 'M5 4H19V20H5Z M8 8H16 M13 5L16 8L13 11 M16 16H8 M11 13L8 16L11 19',
    'path length': 'M3 18L8 6L15 16L21 5 M3 13V18H8 M16 5H21V10',
  };
  featureStatus(row: CadRow) {
    return row.feature.status === 'Missing tolerance' && row.plus !== null && row.minus !== null
      ? 'Tolerance supplied'
      : row.feature.status;
  }
  measurementIcon(type: string) {
    return this.measurementIcons[type] || this.measurementIcons['length'];
  }
  cad = inject(CadDraftService);
  private destroyRef = inject(DestroyRef);
  openEditor = output<void>();
  busy = signal(false);
  error = signal('');
  result = signal<CadResult | null>(
    this.cad.stale() ? null : this.cad.draft()?.calculation || null,
  );
  clearResult() {
    this.result.set(null);
    const d = this.cad.draft();
    if (d) d.calculation = null;
  }
  changed() {
    this.clearResult();
    this.cad.draft()!.confirmed = false;
    this.cad.save();
  }
  selectSpecified() {
    this.cad.selectSpecified();
    this.changed();
  }
  source(row: CadRow) {
    const sketch = this.cad.drawing()?.sketch;
    if (
      sketch?.drawing_id !== row.feature.drawing_id ||
      !row.feature.entity_ids.every((id) => sketch.entities.some((e) => e.id === id))
    ) {
      this.error.set(
        'Source geometry is no longer in the current drawing. Open the source drawing or refresh this draft.',
      );
      return;
    }
    this.cad.highlight.set({ ids: row.feature.entity_ids, annotation: row.feature.annotation_id });
    this.openEditor.emit();
  }
  restoreRows() {
    this.cad.draft()!.rows.forEach((r) => (r.removed = false));
    this.changed();
  }
  refresh() {
    const sketch = this.cad.drawing()?.sketch;
    if (!sketch || this.busy()) return;
    this.busy.set(true);
    this.clearResult();
    this.error.set('');
    this.cad
      .extract(sketch)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (extraction) => {
          this.cad.merge(extraction);
          this.busy.set(false);
        },
        error: (e) => {
          this.error.set(this.message(e));
          this.busy.set(false);
        },
      });
  }
  run() {
    if (this.busy()) return;
    this.clearResult();
    this.error.set('');
    if (this.cad.stale()) {
      this.error.set('Drawing changed. Refresh and review the draft.');
      return;
    }
    const d = this.cad.draft()!;
    if (!this.cad.selectedRows().length) this.cad.selectSpecified();
    const rows = this.cad.selectedRows();
    if (!rows.length) {
      this.error.set(
        'No features have both tolerance bounds. Enter upper and lower tolerances for the features you want to calculate.',
      );
      return;
    }
    const missing = rows.filter(
      (r) =>
        r.plus === null ||
        r.minus === null ||
        !Number.isFinite(r.plus) ||
        !Number.isFinite(r.minus) ||
        r.plus < 0 ||
        r.minus < 0,
    );
    if (missing.length) {
      this.error.set(
        'Enter valid upper and lower tolerances for: ' + missing.map((r) => r.name).join(', '),
      );
      return;
    }
    if (rows.some((r) => (r.changed || !!r.feature.displayed_value) && !r.reviewed)) {
      this.error.set('Review changed sources or drawing text overrides before calculating.');
      return;
    }
    d.relationship = this.cad.relationship();
    this.cad.save();
    this.busy.set(true);
    this.cad
      .calculate()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result) => {
          this.result.set(result);
          this.cad.draft()!.calculation = result;
          this.cad.save();
          this.busy.set(false);
        },
        error: (e) => {
          this.error.set(this.message(e));
          this.busy.set(false);
        },
      });
  }
  private message(e: { error?: { detail?: unknown } }) {
    const detail = e.error?.detail;
    if (detail && typeof detail === 'object' && 'message' in detail) return String(detail.message);
    return typeof detail === 'string'
      ? detail
      : 'Validation failed or service unavailable. Check geometry, units and numeric inputs.';
  }
  chartPosition(calculation: CadResult, value: number) {
    const d = this.cad.draft()!;
    const r = calculation.result;
    const values = [d.lower, d.upper, r.nominal, r.worst_case.lower, r.worst_case.upper];
    if (r.rss) values.push(r.rss.lower, r.rss.upper);
    if (r.monte_carlo) values.push(r.monte_carlo.p025, r.monte_carlo.p975);
    const low = Math.min(...values),
      high = Math.max(...values);
    const span = high - low || 1;
    return 6 + (88 * (value - low)) / span;
  }
  barHeight(count: number, counts: number[]) {
    return (100 * count) / Math.max(1, ...counts);
  }
  export() {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify({ draft: this.cad.draft(), calculation: this.result() }, null, 2)], {
        type: 'application/json',
      }),
    );
    const a = document.createElement('a');
    a.href = url;
    a.download = 'cad-tolerance-analysis.json';
    a.click();
    URL.revokeObjectURL(url);
  }
}
