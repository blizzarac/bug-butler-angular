import { Injectable, Injector, inject, runInInjectionContext } from '@angular/core';
import { Router } from '@angular/router';
import { BUG_BUTLER_CONFIG } from './config';
import { ContextRecorder } from './context-recorder';
import { BugReportContext } from './report';
import { describeBrowser, redactUrl } from './utils';

export type ContextKey = 'page' | 'build' | 'user' | 'browser' | 'viewport' | 'console' | 'network' | 'navigation' | 'custom';

export interface ContextItem {
  key: ContextKey;
  label: string;
  value: string;
  /** Highlights entries that likely explain the bug (errors, failed requests). */
  alert?: boolean;
}

export interface ContextSnapshot {
  context: BugReportContext;
  items: ContextItem[];
}

@Injectable({ providedIn: 'root' })
export class ContextService {
  private readonly config = inject(BUG_BUTLER_CONFIG);
  private readonly recorder = inject(ContextRecorder);
  private readonly router = inject(Router, { optional: true });
  private readonly injector = inject(Injector);

  snapshot(): ContextSnapshot {
    const c = this.config;
    const call = <T>(fn?: () => T): T | undefined => {
      if (!fn) return undefined;
      try {
        return runInInjectionContext(this.injector, fn);
      } catch (err) {
        return undefined;
      }
    };

    const context: BugReportContext = {
      url: redactUrl(location.href, c.redactQueryParams),
      route: this.router ? redactUrl(this.router.url, c.redactQueryParams) : undefined,
      pageTitle: document.title || undefined,
      environment: c.environmentLabel,
      build: c.build,
      user: call(c.user) ?? undefined,
      browser: describeBrowser(navigator.userAgent),
      userAgent: navigator.userAgent,
      viewport: `${window.innerWidth}x${window.innerHeight}@${+(window.devicePixelRatio || 1).toFixed(2)}`,
      locale: navigator.language,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      console: this.recorder.console,
      network: this.recorder.network,
      navigation: this.recorder.navigation,
      custom: call(c.customContext),
    };

    const items: ContextItem[] = [];
    items.push({ key: 'page', label: 'Page', value: context.route || context.url || '' });
    if (context.build || context.environment) {
      items.push({ key: 'build', label: 'Build', value: [context.environment, context.build].filter(Boolean).join(' · ') });
    }
    if (context.user) items.push({ key: 'user', label: 'User', value: context.user });
    items.push({ key: 'browser', label: 'Browser', value: `${context.browser} · ${context.locale}` });
    items.push({ key: 'viewport', label: 'Viewport', value: context.viewport!.replace('x', ' × ') });

    const errors = context.console!.filter((e) => e.level === 'error');
    const warns = context.console!.length - errors.length;
    const last = context.console!.at(-1);
    items.push({
      key: 'console',
      label: 'Console',
      value: context.console!.length
        ? `${plural(errors.length, 'error')}, ${plural(warns, 'warning')} · last: ${last!.message.split('\n')[0]}`
        : 'No errors or warnings',
      alert: errors.length > 0,
    });

    const failed = context.network!.filter((n) => n.failed);
    const lastFailed = failed.at(-1);
    items.push({
      key: 'network',
      label: 'Network',
      value: lastFailed
        ? `${failed.length} of ${context.network!.length} failed · ${lastFailed.method} ${lastFailed.url} → ${lastFailed.status || 'no response'}`
        : `${plural(context.network!.length, 'request')}, none failed`,
      alert: failed.length > 0,
    });
    if (context.navigation!.length > 1) {
      items.push({ key: 'navigation', label: 'Navigation', value: context.navigation!.slice(-4).map((n) => n.url).join(' → ') });
    }
    if (context.custom && Object.keys(context.custom).length) {
      items.push({ key: 'custom', label: 'Other', value: Object.entries(context.custom).map(([k, v]) => `${k}: ${v}`).join(' · ') });
    }
    return { context, items };
  }

  /** Removes the fields belonging to the excluded keys. */
  static exclude(context: BugReportContext, excluded: ReadonlySet<ContextKey>): BugReportContext {
    const out: BugReportContext = { ...context };
    const fields: Record<ContextKey, (keyof BugReportContext)[]> = {
      page: ['url', 'route', 'pageTitle'],
      build: ['build', 'environment'],
      user: ['user'],
      browser: ['browser', 'userAgent', 'locale', 'timezone'],
      viewport: ['viewport'],
      console: ['console'],
      network: ['network'],
      navigation: ['navigation'],
      custom: ['custom'],
    };
    for (const key of excluded) for (const f of fields[key]) delete out[f];
    return out;
  }
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}
