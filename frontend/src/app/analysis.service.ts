import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';

export interface StackComponent { name: string; nominal: number; tolerance: number; coefficient: number }
export interface AnalysisInput { components: StackComponent[]; lower_spec: number; upper_spec: number; samples: number; seed: number }
export interface Interval { lower: number; upper: number; half_width: number }
export interface AnalysisResult {
  nominal: number; worst_case: Interval; rss: Interval;
  monte_carlo: { mean: number; standard_deviation: number; minimum: number; maximum: number;
    p025: number; p975: number; yield_percent: number; counts: number[]; bin_edges: number[]; samples: number; seed: number };
  insights: string[];
}
@Injectable({ providedIn: 'root' })
export class AnalysisService {
  private http = inject(HttpClient);
  analyze(input: AnalysisInput) { return this.http.post<AnalysisResult>('/api/tolerance/analyze', input); }
}
