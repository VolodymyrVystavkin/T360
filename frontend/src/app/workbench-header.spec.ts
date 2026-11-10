import { TestBed } from '@angular/core/testing';
import { WorkbenchHeader } from './workbench-header';

describe('Workbench header navigation', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [WorkbenchHeader] }).compileComponents();
  });

  it('opens the DXF workspace from the File menu', async () => {
    const fixture = TestBed.createComponent(WorkbenchHeader);
    const changes: string[] = [];
    fixture.componentInstance.workspaceChange.subscribe((value) => changes.push(value));
    await fixture.whenStable();
    const element: HTMLElement = fixture.nativeElement;
    element.querySelector<HTMLElement>('.app-menu summary')!.click();
    await fixture.whenStable();
    expect(element.querySelector('details')!.open).toBe(true);
    const item = element.querySelector<HTMLButtonElement>('.dropdown button')!;
    item.click();
    await fixture.whenStable();
    expect(changes).toEqual(['dxf']);
  });

  it('supports keyboard tab switching and exposes workflow help', async () => {
    const fixture = TestBed.createComponent(WorkbenchHeader);
    fixture.componentRef.setInput('analysisTab', 'cad');
    fixture.componentInstance.analysisTabChange.subscribe((tab) =>
      fixture.componentRef.setInput('analysisTab', tab),
    );
    await fixture.whenStable();
    const element: HTMLElement = fixture.nativeElement;
    element
      .querySelector('#cad-tab')!
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    await fixture.whenStable();
    expect(element.querySelector('#manual-tab')!.getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement?.id).toBe('manual-tab');
    (element.querySelector('[aria-controls=workbench-help]') as HTMLButtonElement).click();
    await fixture.whenStable();
    expect(element.querySelector('#workbench-help')?.textContent).toContain('Analyze Tolerances');
    (element.querySelector('.close-help') as HTMLButtonElement).click();
    await fixture.whenStable();
    expect(element.querySelector('#workbench-help')).toBeNull();
  });
});
