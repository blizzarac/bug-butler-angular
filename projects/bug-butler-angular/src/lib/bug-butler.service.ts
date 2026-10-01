import { Injectable, inject, signal } from '@angular/core';
import { BUG_BUTLER_ENABLED } from './config';

/**
 * Programmatic control of the widget, e.g. for a "Report a bug" entry in your own menu.
 * All methods are no-ops when the widget is disabled.
 */
@Injectable({ providedIn: 'root' })
export class BugButler {
  /** True when the widget is active in this environment. */
  readonly enabled = inject(BUG_BUTLER_ENABLED);
  private readonly _open = signal(false);
  readonly isOpen = this._open.asReadonly();

  open(): void {
    if (this.enabled) this._open.set(true);
  }
  close(): void {
    this._open.set(false);
  }
  toggle(): void {
    if (this.enabled) this._open.update((v) => !v);
  }
}
