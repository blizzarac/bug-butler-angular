/** Replaces the values of sensitive query parameters with `[redacted]`. Leaves unparseable input untouched. */
export function redactUrl(url: string, params: (string | RegExp)[], base = globalThis.location?.href): string {
  let parsed: URL;
  try {
    parsed = new URL(url, base);
  } catch {
    return url;
  }
  let changed = false;
  for (const name of [...parsed.searchParams.keys()]) {
    if (params.some((p) => (typeof p === 'string' ? p.toLowerCase() === name.toLowerCase() : p.test(name)))) {
      parsed.searchParams.set(name, '[redacted]');
      changed = true;
    }
  }
  if (!changed) return url;
  // Keep relative URLs relative.
  const out = parsed.toString().replace(/%5Bredacted%5D/g, '[redacted]');
  return /^[a-z][a-z\d+.-]*:/i.test(url) ? out : out.slice(parsed.origin.length);
}

export function describeBrowser(ua: string): string {
  // Most specific first: Edge and Opera also claim to be Chrome, Chrome also claims to be Safari.
  const names: [string, string][] = [['Edg', 'Edge'], ['OPR', 'Opera'], ['Firefox', 'Firefox'], ['Chrome', 'Chrome'], ['Version', 'Safari']];
  let browser = 'Unknown browser';
  for (const [token, name] of names) {
    const m = ua.match(new RegExp(`${token}/(\\d+)`));
    if (m) {
      browser = `${name} ${m[1]}`;
      break;
    }
  }
  const os = /iPhone|iPad/.test(ua)
    ? 'iOS'
    : /Android/.test(ua)
      ? 'Android'
      : /Mac OS X/.test(ua)
        ? 'macOS'
        : /Windows/.test(ua)
          ? 'Windows'
          : /Linux/.test(ua)
            ? 'Linux'
            : '';
  return os ? `${browser} · ${os}` : browser;
}

export function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max - 1) + '…' : text;
}

export function stringifyArg(arg: unknown): string {
  if (arg instanceof Error) return arg.stack || `${arg.name}: ${arg.message}`;
  if (typeof arg === 'string') return arg;
  try {
    return JSON.stringify(arg);
  } catch {
    return String(arg);
  }
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Parses `ctrl+shift+b` style shortcuts. `ctrl` also matches ⌘ on macOS. */
export function matchesShortcut(e: KeyboardEvent, shortcut: string): boolean {
  const parts = shortcut.toLowerCase().split('+').map((p) => p.trim());
  const key = parts.pop();
  const want = new Set(parts);
  const ctrlOrMeta = e.ctrlKey || e.metaKey;
  return (
    e.key?.toLowerCase() === key &&
    (want.has('ctrl') || want.has('cmd') || want.has('meta')) === ctrlOrMeta &&
    want.has('shift') === e.shiftKey &&
    want.has('alt') === e.altKey
  );
}
