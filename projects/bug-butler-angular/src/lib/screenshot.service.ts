import { Injectable, inject } from '@angular/core';
import { BUG_BUTLER_CONFIG } from './config';

/** A rectangle in viewport (client) coordinates. */
export interface CaptureRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Renders part of the page to a canvas by re-drawing the DOM (html2canvas-pro).
 * No permission prompt; the renderer is loaded lazily on the first capture.
 *
 * Override it with `{ provide: ScreenshotService, useClass: MyScreenshotService }`
 * to use a different strategy, e.g. `getDisplayMedia`.
 */
@Injectable({ providedIn: 'root' })
export class ScreenshotService {
  private readonly config = inject(BUG_BUTLER_CONFIG);

  /** Captures `rect`, or the visible viewport when omitted. `exclude` is left out of the render (the widget itself). */
  async capture(rect?: CaptureRect, exclude?: Element | null): Promise<HTMLCanvasElement> {
    const { default: html2canvas } = await import('html2canvas-pro');
    const r = rect ?? { x: 0, y: 0, width: window.innerWidth, height: window.innerHeight };
    const redact = this.config.redactSelectors.join(',');
    return html2canvas(document.documentElement, {
      x: r.x + window.scrollX,
      y: r.y + window.scrollY,
      width: r.width,
      height: r.height,
      scale: Math.max(1, Math.min(2, window.devicePixelRatio || 1)),
      backgroundColor: pageBackground(),
      useCORS: true,
      logging: false,
      ignoreElements: (el) => el === exclude || el.tagName === 'BUG-BUTLER',
      onclone: (doc) => {
        if (!redact) return;
        doc.querySelectorAll<HTMLElement>(redact).forEach(redactElement);
      },
    });
  }
}

function redactElement(el: HTMLElement): void {
  el.style.setProperty('background', '#1c1c1c', 'important');
  el.style.setProperty('color', 'transparent', 'important');
  el.style.setProperty('text-shadow', 'none', 'important');
  el.style.setProperty('border-color', '#1c1c1c', 'important');
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) el.value = '';
  for (const child of Array.from(el.children)) (child as HTMLElement).style?.setProperty('visibility', 'hidden', 'important');
}

function pageBackground(): string {
  for (const el of [document.body, document.documentElement]) {
    const bg = getComputedStyle(el).backgroundColor;
    if (bg && bg !== 'transparent' && !/rgba\(.*,\s*0\)$/.test(bg)) return bg;
  }
  return '#ffffff';
}
