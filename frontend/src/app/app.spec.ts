import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { App } from './app';
import { AnalysisResult } from './analysis.service';
import { NgForm } from '@angular/forms';

const result: AnalysisResult = {
  nominal: .5, worst_case: { lower: .15, upper: .85, half_width: .35 },
  rss: { lower: .27, upper: .73, half_width: .23 },
  monte_carlo: { mean: .5, standard_deviation: .13, minimum: .2, maximum: .8,
    p025: .25, p975: .75, yield_percent: 99, counts: [1, 2], bin_edges: [.2, .5, .8], samples: 10000, seed: 42 },
  insights: ['Largest contribution: Housing.'],
};

describe('Engineering analysis workspace', () => {
  beforeEach(() => TestBed.configureTestingModule({ imports: [App], providers: [provideHttpClient(), provideHttpClientTesting()] }));
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('renders the editable stack and analysis action', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    expect(fixture.nativeElement.textContent).toContain('Tolerance analysis');
    expect(fixture.nativeElement.querySelectorAll('tbody tr').length).toBe(3);
    expect(fixture.nativeElement.textContent).toContain('Run analysis');
  });

  it('sends the seed and signed dimensions and displays the response', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    app.run({ invalid: false } as NgForm);
    expect(app.busy()).toBe(true);
    const request = TestBed.inject(HttpTestingController).expectOne('/api/tolerance/analyze');
    expect(request.request.method).toBe('POST');
    expect(request.request.body.seed).toBe(42);
    expect(request.request.body.components[1].coefficient).toBe(-1);
    request.flush(result);
    fixture.detectChanges();
    expect(app.busy()).toBe(false);
    expect(fixture.nativeElement.textContent).toContain('SIMULATED YIELD');
    expect(fixture.nativeElement.textContent).toContain('99.00');
  });

  it('shows service failures and allows a retry', () => {
    const app = TestBed.createComponent(App).componentInstance;
    app.run({ invalid: false } as NgForm);
    TestBed.inject(HttpTestingController).expectOne('/api/tolerance/analyze').flush('Unavailable', { status: 503, statusText: 'Unavailable' });
    expect(app.error()).toContain('Cannot reach');
    expect(app.busy()).toBe(false);
    app.run({ invalid: false } as NgForm);
    TestBed.inject(HttpTestingController).expectOne('/api/tolerance/analyze').flush(result);
    expect(app.error()).toBe('');
    app.add();
    expect(app.result()).toBeNull();
  });

  it('rejects reversed specifications without an API request', () => {
    const app = TestBed.createComponent(App).componentInstance;
    app.input.lower_spec = 2;
    app.run({ invalid: false } as NgForm);
    expect(app.error()).toContain('Lower specification');
  });
});
