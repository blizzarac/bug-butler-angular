import { InjectionToken } from '@angular/core';

export type BugButlerPosition = 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';

export interface BugButlerConfig {
  /**
   * Master switch. Keep this false in production, e.g. `!environment.production`.
   * When false nothing is rendered and no console/network hooks are installed.
   */
  enabled: boolean | (() => boolean);

  /**
   * Optional second gate: the widget only activates on these hostnames.
   * Strings match exactly, RegExps are tested against `location.hostname`.
   */
  allowedHosts?: (string | RegExp)[];

  /** URL the default transport POSTs reports to. Required unless you provide your own `BugReportTransport`. */
  endpoint?: string;

  /** Extra request headers for the default transport, e.g. an auth token. Runs in an injection context. */
  headers?: () => Record<string, string> | Promise<Record<string, string>>;

  /** `fetch` credentials mode for the default transport. Defaults to `same-origin`. */
  credentials?: RequestCredentials;

  /** Badge on the button, e.g. `STAGING`. Omit to hide the badge. */
  environmentLabel?: string;

  /** Where the report ends up, shown in the panel footer, e.g. `Jira · QA`. */
  destinationLabel?: string;

  /** App build or version sent with every report. */
  build?: string;

  /** Current user as shown in the ticket. Runs in an injection context, so `inject()` works. */
  user?: () => string | null | undefined;

  /** Extra key/value pairs added to the report context. Runs in an injection context. */
  customContext?: () => Record<string, string>;

  /**
   * Elements painted over with a solid block in every screenshot.
   * Added to the defaults (password fields, credit card fields and `[data-bb-redact]`).
   */
  redactSelectors?: string[];

  /**
   * Query parameter names whose values are replaced by `[redacted]` in recorded URLs.
   * Added to the defaults (token, password, secret, key, auth, code, session, signature).
   */
  redactQueryParams?: (string | RegExp)[];

  /** Keyboard shortcut that toggles the panel. Defaults to `ctrl+shift+b` (`cmd+shift+b` on macOS). `false` disables it. */
  shortcut?: string | false;

  /** Corner the button sits in. Defaults to `bottom-right`. */
  position?: BugButlerPosition;

  /** Defaults to `auto` (follows `prefers-color-scheme`). */
  theme?: 'auto' | 'light' | 'dark';

  /** Maximum size of one attachment in bytes. Defaults to 10 MB. */
  maxAttachmentBytes?: number;

  /** How many console and network entries to keep. Defaults to 50 each. */
  maxEntries?: number;

  /** Mount `<bug-butler>` on `document.body` automatically. Defaults to true. */
  autoMount?: boolean;

  /** CSS z-index of the widget. Defaults to 2147483000. */
  zIndex?: number;
}

export const DEFAULT_REDACT_SELECTORS = [
  'input[type="password"]',
  'input[autocomplete^="cc-"]',
  '[data-bb-redact]',
];

export const DEFAULT_REDACT_QUERY_PARAMS: RegExp[] = [
  /token/i, /passw/i, /secret/i, /^key$/i, /api[-_]?key/i, /auth/i, /^code$/i, /session/i, /signature/i, /^sig$/i,
];

export type ResolvedBugButlerConfig = Required<
  Omit<BugButlerConfig, 'allowedHosts' | 'endpoint' | 'headers' | 'environmentLabel' | 'destinationLabel' | 'build' | 'user' | 'customContext'>
> &
  Pick<BugButlerConfig, 'allowedHosts' | 'endpoint' | 'headers' | 'environmentLabel' | 'destinationLabel' | 'build' | 'user' | 'customContext'>;

export function resolveConfig(config: BugButlerConfig): ResolvedBugButlerConfig {
  return {
    credentials: 'same-origin',
    shortcut: 'ctrl+shift+b',
    position: 'bottom-right',
    theme: 'auto',
    maxAttachmentBytes: 10 * 1024 * 1024,
    maxEntries: 50,
    autoMount: true,
    zIndex: 2147483000,
    ...config,
    redactSelectors: [...DEFAULT_REDACT_SELECTORS, ...(config.redactSelectors ?? [])],
    redactQueryParams: [...DEFAULT_REDACT_QUERY_PARAMS, ...(config.redactQueryParams ?? [])],
  };
}

/** Evaluates `enabled` and `allowedHosts`. */
export function isEnabled(config: Pick<BugButlerConfig, 'enabled' | 'allowedHosts'>, hostname: string): boolean {
  const on = typeof config.enabled === 'function' ? config.enabled() : config.enabled;
  if (!on) return false;
  if (!config.allowedHosts?.length) return true;
  return config.allowedHosts.some((h) => (typeof h === 'string' ? h === hostname : h.test(hostname)));
}

export const BUG_BUTLER_CONFIG = new InjectionToken<ResolvedBugButlerConfig>('BUG_BUTLER_CONFIG');

/** True when the widget is active in this app. Inject it to render your own "report a bug" entry points conditionally. */
export const BUG_BUTLER_ENABLED = new InjectionToken<boolean>('BUG_BUTLER_ENABLED', {
  providedIn: 'root',
  factory: () => false,
});
