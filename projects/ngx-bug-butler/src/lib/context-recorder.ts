import { DestroyRef, Injectable, inject } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { BUG_BUTLER_CONFIG, ResolvedBugButlerConfig } from './config';
import { ConsoleEntry, NavigationEntry, NetworkEntry } from './report';
import { redactUrl, stringifyArg, truncate } from './utils';

const MAX_MESSAGE = 1000;

/**
 * Records console errors/warnings, network requests (fetch and XHR) and router navigation
 * into bounded ring buffers. Installed once at app start when the widget is enabled.
 */
@Injectable({ providedIn: 'root' })
export class ContextRecorder {
  private readonly config = inject(BUG_BUTLER_CONFIG, { optional: true });
  private readonly router = inject(Router, { optional: true });
  private readonly destroyRef = inject(DestroyRef);

  private consoleEntries: ConsoleEntry[] = [];
  private networkEntries: NetworkEntry[] = [];
  private navigationEntries: NavigationEntry[] = [];
  private installed = false;
  private readonly restore: (() => void)[] = [];

  get console(): ConsoleEntry[] {
    return [...this.consoleEntries];
  }
  get network(): NetworkEntry[] {
    return [...this.networkEntries];
  }
  get navigation(): NavigationEntry[] {
    return [...this.navigationEntries];
  }

  install(): void {
    if (this.installed || typeof window === 'undefined' || !this.config) return;
    this.installed = true;
    const config = this.config;
    this.patchConsole();
    this.patchFetch(config);
    this.patchXhr(config);
    this.trackNavigation();
    this.destroyRef.onDestroy(() => this.uninstall());
  }

  uninstall(): void {
    while (this.restore.length) this.restore.pop()!();
    this.installed = false;
  }

  /** For tests and "start over" flows. */
  clear(): void {
    this.consoleEntries = [];
    this.networkEntries = [];
    this.navigationEntries = [];
  }

  private push<T>(list: T[], entry: T): void {
    list.push(entry);
    const max = this.config?.maxEntries ?? 50;
    if (list.length > max) list.splice(0, list.length - max);
  }

  private recordConsole(level: ConsoleEntry['level'], args: unknown[]): void {
    this.push(this.consoleEntries, {
      level,
      message: truncate(args.map(stringifyArg).join(' '), MAX_MESSAGE),
      timestamp: new Date().toISOString(),
    });
  }

  private patchConsole(): void {
    for (const level of ['error', 'warn'] as const) {
      const original = console[level];
      console[level] = (...args: unknown[]) => {
        try {
          this.recordConsole(level, args);
        } catch {
          /* never break the host app's logging */
        }
        original.apply(console, args);
      };
      this.restore.push(() => (console[level] = original));
    }
    const onError = (e: ErrorEvent) => this.recordConsole('error', [e.error ?? e.message]);
    const onRejection = (e: PromiseRejectionEvent) => this.recordConsole('error', ['Unhandled promise rejection:', e.reason]);
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    this.restore.push(() => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
    });
  }

  private recordRequest(config: ResolvedBugButlerConfig, method: string, url: string, status: number, start: number): void {
    if (this.isOwnEndpoint(config, url)) return;
    this.push(this.networkEntries, {
      method: method.toUpperCase(),
      url: truncate(redactUrl(url, config.redactQueryParams), 500),
      status,
      durationMs: Math.round(performance.now() - start),
      failed: status === 0 || status >= 400,
      timestamp: new Date().toISOString(),
    });
  }

  private isOwnEndpoint(config: ResolvedBugButlerConfig, url: string): boolean {
    if (!config.endpoint) return false;
    try {
      const a = new URL(url, location.href);
      const b = new URL(config.endpoint, location.href);
      return a.origin === b.origin && a.pathname === b.pathname;
    } catch {
      return false;
    }
  }

  private patchFetch(config: ResolvedBugButlerConfig): void {
    const original = window.fetch;
    if (typeof original !== 'function') return;
    const recorder = this;
    window.fetch = async function (input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
      const start = performance.now();
      const method = init?.method ?? (input instanceof Request ? input.method : 'GET');
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      try {
        const res = await original.call(window, input, init);
        recorder.recordRequest(config, method, url, res.status, start);
        return res;
      } catch (err) {
        recorder.recordRequest(config, method, url, 0, start);
        throw err;
      }
    };
    this.restore.push(() => (window.fetch = original));
  }

  private patchXhr(config: ResolvedBugButlerConfig): void {
    if (typeof XMLHttpRequest === 'undefined') return;
    const proto = XMLHttpRequest.prototype;
    const originalOpen = proto.open;
    const originalSend = proto.send;
    const meta = new WeakMap<XMLHttpRequest, { method: string; url: string }>();
    const recorder = this;
    proto.open = function (this: XMLHttpRequest, method: string, url: string | URL, ...rest: unknown[]) {
      meta.set(this, { method, url: String(url) });
      return (originalOpen as (...a: unknown[]) => void).call(this, method, url, ...rest);
    } as typeof proto.open;
    proto.send = function (this: XMLHttpRequest, body?: Document | XMLHttpRequestBodyInit | null) {
      const m = meta.get(this);
      if (m) {
        const start = performance.now();
        this.addEventListener('loadend', () => recorder.recordRequest(config, m.method, m.url, this.status, start), { once: true });
      }
      return originalSend.call(this, body);
    };
    this.restore.push(() => {
      proto.open = originalOpen;
      proto.send = originalSend;
    });
  }

  private trackNavigation(): void {
    const record = (url: string) => this.push(this.navigationEntries, { url: redactUrl(url, this.config!.redactQueryParams), timestamp: new Date().toISOString() });
    if (!this.router) {
      record(location.pathname + location.search + location.hash);
      return;
    }
    const sub = this.router.events.subscribe((e) => {
      if (e instanceof NavigationEnd) record(e.urlAfterRedirects);
    });
    this.restore.push(() => sub.unsubscribe());
  }
}
