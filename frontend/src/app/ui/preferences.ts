import { Injectable, signal } from '@angular/core';
@Injectable({ providedIn: 'root' })
export class UiPreferences {
  compact = signal(false);
  reduceMotion = signal(false);
  storageError = signal('');
  constructor() {
    try {
      const saved = JSON.parse(localStorage.getItem('t360-ui-preferences') || '{}');
      this.compact.set(saved.compact === true);
      this.reduceMotion.set(saved.reduceMotion === true);
    } catch {
      /* Defaults remain usable without storage. */
    }
    this.apply();
  }
  update(compact: boolean, reduceMotion: boolean) {
    this.compact.set(compact);
    this.reduceMotion.set(reduceMotion);
    this.apply();
    try {
      localStorage.setItem('t360-ui-preferences', JSON.stringify({ compact, reduceMotion }));
      this.storageError.set('');
    } catch {
      this.storageError.set(
        'Display settings apply to this session; browser storage is unavailable.',
      );
    }
  }
  private apply() {
    if (typeof document !== 'undefined') {
      document.documentElement.dataset['density'] = this.compact() ? 'compact' : 'comfortable';
      document.documentElement.dataset['motion'] = this.reduceMotion() ? 'reduced' : 'system';
    }
  }
}
