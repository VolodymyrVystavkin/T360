import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { App } from './app';
import { AnalysisResult } from './analysis.service';
import { NgForm } from '@angular/forms';

const result: AnalysisResult = {
  nominal: 0.5,
  worst_case: { lower: 0.15, upper: 0.85, half_width: 0.35 },
  rss: { lower: 0.27, upper: 0.73, half_width: 0.23 },
  monte_carlo: {
    mean: 0.5,
    standard_deviation: 0.13,
    minimum: 0.2,
    maximum: 0.8,
    p025: 0.25,
    p975: 0.75,
    yield_percent: 99,
    counts: [1, 2],
    bin_edges: [0.2, 0.5, 0.8],
    samples: 10000,
    seed: 42,
  },
  insights: ['Largest contribution: Housing.'],
};

describe('Engineering analysis workspace', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
  });
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
    expect(fixture.nativeElement.textContent).toContain('Simulated yield');
    expect(fixture.nativeElement.textContent).toContain('99.00');
  });

  it('shows service failures and allows a retry', () => {
    const app = TestBed.createComponent(App).componentInstance;
    app.run({ invalid: false } as NgForm);
    TestBed.inject(HttpTestingController)
      .expectOne('/api/tolerance/analyze')
      .flush('Unavailable', { status: 503, statusText: 'Unavailable' });
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

describe('Application shell workspace pages', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
  });
  afterEach(() => {
    location.hash = '';
    TestBed.inject(HttpTestingController).verify();
  });
  it('opens real dashboard and settings pages without changing the manual calculation input', async () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    const before = JSON.stringify(app.input);
    await fixture.whenStable();
    const navButtons = [
      ...fixture.nativeElement.querySelectorAll('workspace-nav button'),
    ] as HTMLButtonElement[];
    navButtons.find((b) => b.textContent?.trim() === 'Dashboard')!.click();
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('workspace-pages')).not.toBeNull();
    navButtons.find((b) => b.textContent?.trim() === 'Settings')!.click();
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('workspace-settings')).not.toBeNull();
    expect(JSON.stringify(app.input)).toBe(before);
  });
});
