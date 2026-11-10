import { Component, inject, signal } from '@angular/core';
import { DxfEditor } from './dxf/editor';
import { DecimalPipe } from '@angular/common';
import { FormsModule, NgForm } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { AnalysisInput, AnalysisResult, AnalysisService } from './analysis.service';

@Component({
  selector: 'app-root', imports: [DxfEditor, DecimalPipe, FormsModule, MatButtonModule, MatFormFieldModule, MatInputModule, MatProgressBarModule],
  templateUrl: './app.html', styleUrl: './app.scss',
})
export class App {
  workspace = typeof location !== 'undefined' && location.hash === '#dxf' ? 'dxf' : 'tolerance';
  switchWorkspace(value: string) { this.workspace = value; location.hash = value; }
  private service = inject(AnalysisService);
  busy = signal(false);
  error = signal('');
  result = signal<AnalysisResult | null>(null);
  input: AnalysisInput = {
    components: [
      { name: 'Housing', nominal: 50, tolerance: 0.2, coefficient: 1 },
      { name: 'Shaft', nominal: 30, tolerance: 0.1, coefficient: -1 },
      { name: 'Spacer', nominal: 19.5, tolerance: 0.05, coefficient: -1 },
    ], lower_spec: 0.2, upper_spec: 0.8, samples: 10000, seed: 42,
  };
  invalidate() { this.result.set(null); this.error.set(''); }
  add() {
    this.input.components.push({ name: `Component ${this.input.components.length + 1}`, nominal: 0, tolerance: 0.1, coefficient: 1 });
    this.invalidate();
  }
  remove(index: number) { this.input.components.splice(index, 1); this.invalidate(); }
  run(form: NgForm) {
    if (form.invalid || this.busy()) return;
    this.invalidate();
    if (this.input.lower_spec >= this.input.upper_spec) { this.error.set('Lower specification must be below upper specification.'); return; }
    this.busy.set(true);
    this.service.analyze(this.input).subscribe({
      next: result => { this.result.set(result); this.busy.set(false); },
      error: error => {
        this.error.set(error.status === 422 ? 'Check the dimensions and simulation limits. The server rejected this input.' : 'Cannot reach the analysis service. Check that the backend is running and try again.');
        this.busy.set(false);
      },
    });
  }
  barHeight(count: number, counts: number[]) { return 100 * count / Math.max(...counts, 1); }
  exportResult() {
    const result = this.result();
    if (!result) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify({ input: this.input, result }, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = 'tolerance-analysis.json'; link.click(); URL.revokeObjectURL(url);
  }
}
