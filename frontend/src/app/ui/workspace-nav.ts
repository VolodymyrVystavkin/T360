import { Component, input, output } from '@angular/core';
import { UiIcon } from './icon';
@Component({
  selector: 'workspace-nav',
  imports: [UiIcon],
  template: `<nav aria-label="Main navigation">
    @for (item of items; track item.id) {
      <button
        type="button"
        [class.active]="workspace() === item.id"
        [attr.aria-current]="workspace() === item.id ? 'page' : null"
        [disabled]="item.future"
        [title]="item.future ? item.label + ' — not implemented' : item.label"
        (click)="navigate.emit(item.id)"
      >
        <ui-icon [name]="item.icon" /><span>{{ item.label }}</span>
        @if (item.future) {
          <small>Coming later</small>
        }
      </button>
    }
  </nav>`,
  styles: `
    :host {
      display: block;
      background: var(--surface);
      border-right: 1px solid var(--border);
      height: 100%;
      min-height: calc(100dvh - 112px);
    }
    nav {
      position: sticky;
      top: 16px;
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding: 16px 8px;
    }
    button {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 7px;
      width: 100%;
      border: 0;
      background: none;
      color: var(--text-secondary);
      border-radius: 12px;
      padding: 12px 4px;
      font-size: 11px;
      line-height: 1.3;
    }
    button:hover {
      background: var(--surface-muted);
      color: var(--text);
    }
    button.active {
      background: var(--brand-subtle);
      color: var(--brand-hover);
      font-weight: 600;
    }
    button:disabled {
      opacity: 0.6;
    }
    small {
      font-size: 9px;
    }
    ui-icon {
      width: 22px;
      height: 22px;
    }
    @media (max-width: 760px) {
      nav {
        padding: 12px 4px;
      }
      button {
        font-size: 10px;
      }
      small {
        display: none;
      }
    }
  `,
})
export class WorkspaceNav {
  workspace = input('tolerance');
  navigate = output<string>();
  items = [
    { id: 'dashboard', label: 'Dashboard', icon: 'dashboard', future: false },
    { id: 'dxf', label: '2D CAD Editor', icon: 'cad', future: false },
    { id: 'tolerance', label: 'Tolerance Analysis', icon: 'analysis', future: false },
    { id: '3d', label: '3D Workspace', icon: 'cube', future: true },
    { id: 'assistant', label: 'AI Assistant', icon: 'assistant', future: true },
    { id: 'settings', label: 'Settings', icon: 'settings', future: false },
  ];
}
