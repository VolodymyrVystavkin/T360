import { TestBed } from '@angular/core/testing';
import { UiPreferences } from './preferences';
import { WorkspaceNav } from './workspace-nav';
import { WorkspaceSettings } from './settings';

describe('Workspace display preferences and navigation', () => {
  beforeEach(() => {
    localStorage.removeItem('t360-ui-preferences');
    TestBed.configureTestingModule({ imports: [WorkspaceNav, WorkspaceSettings] });
  });
  afterEach(() => {
    localStorage.removeItem('t360-ui-preferences');
    document.documentElement.removeAttribute('data-density');
    document.documentElement.removeAttribute('data-motion');
  });
  it('persists only display settings and restores their visual state', () => {
    localStorage.setItem('t360-sketch', 'drawing sentinel');
    const p = TestBed.inject(UiPreferences);
    p.update(true, true);
    expect(document.documentElement.dataset['density']).toBe('compact');
    expect(document.documentElement.dataset['motion']).toBe('reduced');
    const restored = TestBed.runInInjectionContext(() => new UiPreferences());
    expect(restored.compact()).toBe(true);
    expect(restored.reduceMotion()).toBe(true);
    expect(localStorage.getItem('t360-sketch')).toBe('drawing sentinel');
    localStorage.removeItem('t360-sketch');
  });
  it('renders unavailable workspaces disabled and emits only implemented navigation', async () => {
    const fixture = TestBed.createComponent(WorkspaceNav);
    await fixture.whenStable();
    const destinations: string[] = [];
    fixture.componentInstance.navigate.subscribe((value) => destinations.push(value));
    const buttons = [...fixture.nativeElement.querySelectorAll('button')] as HTMLButtonElement[];
    const future = buttons.find((b) => b.textContent?.includes('3D Workspace'))!;
    expect(future.disabled).toBe(true);
    future.click();
    expect(destinations).toEqual([]);
    buttons.find((b) => b.textContent?.trim() === 'Dashboard')!.click();
    expect(destinations).toEqual(['dashboard']);
  });
  it('settings controls update display preferences without engineering inputs', async () => {
    const fixture = TestBed.createComponent(WorkspaceSettings);
    await fixture.whenStable();
    const checkbox = fixture.nativeElement.querySelector('input') as HTMLInputElement;
    checkbox.click();
    expect(TestBed.inject(UiPreferences).compact()).toBe(true);
    (fixture.nativeElement.querySelector('button') as HTMLButtonElement).click();
    expect(TestBed.inject(UiPreferences).compact()).toBe(false);
  });
});
