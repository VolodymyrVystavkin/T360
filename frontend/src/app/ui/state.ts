import { Component, input } from '@angular/core';
import { UiIcon } from './icon';
@Component({
  selector: 'ui-state',
  imports: [UiIcon],
  template: `<div
    class="state"
    [class.compact]="compact()"
    [class.loading]="kind() === 'loading'"
    [class.error]="kind() === 'error'"
    [attr.role]="kind() === 'error' ? 'alert' : 'status'"
  >
    <span class="state-icon"><ui-icon [name]="kind() === 'empty' ? 'select' : 'info'" /></span>
    <div>
      <h3>{{ title() }}</h3>
      <p>{{ text() }}</p>
      <ng-content />
    </div>
  </div>`,
  styles: `
    .state {
      display: flex;
      align-items: start;
      gap: 16px;
      padding: 24px;
      color: var(--text-secondary);
      border: 1px dashed var(--border-strong);
      border-radius: var(--radius);
      background: var(--surface-muted);
    }
    h3 {
      margin: 0 0 6px;
      color: var(--text);
      font-size: 15px;
    }
    p {
      margin: 0 0 12px;
      font-size: 13px;
      line-height: 1.7;
    }
    .state-icon {
      display: grid;
      place-items: center;
      width: 40px;
      height: 40px;
      flex-shrink: 0;
      border-radius: 12px;
      background: var(--brand-subtle);
      color: var(--brand);
    }
    .compact {
      flex-direction: column;
      align-items: center;
      text-align: center;
      padding: 16px;
    }
    .error {
      border-style: solid;
      border-color: var(--error);
      background: var(--error-bg);
    }
    .error h3,
    .error p {
      color: var(--error-text);
    }
    .loading .state-icon {
      border: 3px solid var(--brand-subtle);
      border-top-color: var(--brand);
      border-radius: 50%;
      animation: spin 1s linear infinite;
    }
    .loading ui-icon {
      visibility: hidden;
    }
    @keyframes spin {
      to {
        transform: rotate(360deg);
      }
    }
  `,
})
export class UiState {
  compact = input(false);
  kind = input<'empty' | 'loading' | 'error'>('empty');
  title = input('');
  text = input('');
}
