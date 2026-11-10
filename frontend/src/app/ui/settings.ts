import { Component, inject } from '@angular/core';
import { UiPreferences } from './preferences';
@Component({
  selector: 'workspace-settings',
  template: `<p class="eyebrow">Make room for your work</p>
    <h1>Workspace settings</h1>
    <p class="muted">
      Display preferences apply to this browser. Drawing coordinates, units and calculations stay
      unchanged.
    </p>
    <section class="panel">
      <h2>Appearance & accessibility</h2>
      <label
        ><input
          type="checkbox"
          [checked]="preferences.compact()"
          (change)="preferences.update(!preferences.compact(), preferences.reduceMotion())"
        /><span
          ><strong>Compact spacing</strong
          ><small>Reduce card padding to fit more information on screen.</small></span
        ></label
      ><label
        ><input
          type="checkbox"
          [checked]="preferences.reduceMotion()"
          (change)="preferences.update(preferences.compact(), !preferences.reduceMotion())"
        /><span
          ><strong>Reduce motion</strong
          ><small
            >Minimize interface transitions. Your system's reduced-motion setting is always
            respected.</small
          ></span
        ></label
      ><button class="ui-button" (click)="preferences.update(false, false)">
        Reset display preferences
      </button>
    </section>
    @if (preferences.storageError()) {
      <p role="alert">{{ preferences.storageError() }}</p>
    }`,
  styles: `
    :host {
      display: block;
      max-width: 900px;
      padding: 32px;
      margin: auto;
    }
    h1 {
      margin: 8px 0;
    }
    section {
      margin-top: 24px;
    }
    label {
      display: flex;
      align-items: start;
      gap: 12px;
      margin: 24px 0;
      cursor: pointer;
    }
    label strong,
    label small {
      display: block;
    }
    small {
      font-size: 12px;
      color: var(--text-secondary);
      margin-top: 6px;
      line-height: 1.7;
    }
    [role='alert'] {
      color: var(--error-text);
    }
  `,
})
export class WorkspaceSettings {
  preferences = inject(UiPreferences);
}
