import { UiIcon } from './ui/icon';
import { Component, ElementRef, HostListener, inject, input, output, signal } from '@angular/core';

@Component({
  selector: 'workbench-header',
  imports: [UiIcon],
  templateUrl: './workbench-header.html',
  styleUrl: './workbench-header.scss',
})
export class WorkbenchHeader {
  private element = inject<ElementRef<HTMLElement>>(ElementRef);
  closeMenus() {
    this.element.nativeElement.querySelectorAll('details').forEach((menu) => (menu.open = false));
  }
  goWorkspace(value: string) {
    this.closeMenus();
    this.workspaceChange.emit(value);
  }
  @HostListener('document:click', ['$event']) outsideClick(event: MouseEvent) {
    if (!this.element.nativeElement.contains(event.target as Node)) this.closeMenus();
  }
  @HostListener('keydown.escape') closeMenu() {
    const menu = this.element.nativeElement.querySelector('details[open]');
    this.closeMenus();
    menu?.querySelector('summary')?.focus();
  }
  workspace = input('tolerance');
  analysisTab = input<'cad' | 'manual'>('manual');
  context = input('');
  saveStatus = input('Local workspace');
  workspaceChange = output<string>();
  analysisTabChange = output<'cad' | 'manual'>();
  helpOpen = signal(false);
  chooseTab(tab: 'cad' | 'manual', focus = false) {
    this.goWorkspace('tolerance');
    this.analysisTabChange.emit(tab);
    if (focus) document.getElementById(tab + '-tab')?.focus();
  }
}
