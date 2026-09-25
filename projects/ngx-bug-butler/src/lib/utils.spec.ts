import { DEFAULT_REDACT_QUERY_PARAMS, isEnabled } from './config';
import { describeBrowser, matchesShortcut, redactUrl } from './utils';

describe('redactUrl', () => {
  it('redacts sensitive query values and keeps relative URLs relative', () => {
    expect(redactUrl('/api/items?access_token=abc&page=2', DEFAULT_REDACT_QUERY_PARAMS, 'https://app.test/'))
      .toBe('/api/items?access_token=[redacted]&page=2');
  });

  it('keeps absolute URLs absolute and leaves clean URLs untouched', () => {
    expect(redactUrl('https://x.test/a?sig=1', DEFAULT_REDACT_QUERY_PARAMS)).toBe('https://x.test/a?sig=[redacted]');
    expect(redactUrl('/a?page=1&sort=asc', DEFAULT_REDACT_QUERY_PARAMS)).toBe('/a?page=1&sort=asc');
  });

  it('matches string parameter names case-insensitively', () => {
    expect(redactUrl('/a?Tenant=acme', ['tenant'], 'https://app.test/')).toBe('/a?Tenant=[redacted]');
  });
});

describe('describeBrowser', () => {
  it('names common browsers and operating systems', () => {
    expect(describeBrowser('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36')).toBe('Chrome 140 · macOS');
    expect(describeBrowser('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 Edg/140.0.0.0')).toBe('Edge 140 · Windows');
    expect(describeBrowser('Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0')).toBe('Firefox 131 · Linux');
    expect(describeBrowser('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1')).toBe('Safari 18 · iOS');
  });
});

describe('matchesShortcut', () => {
  const key = (init: KeyboardEventInit) => new KeyboardEvent('keydown', init);
  it('accepts ctrl or meta for "ctrl" and requires the exact modifiers', () => {
    expect(matchesShortcut(key({ key: 'B', ctrlKey: true, shiftKey: true }), 'ctrl+shift+b')).toBeTrue();
    expect(matchesShortcut(key({ key: 'b', metaKey: true, shiftKey: true }), 'ctrl+shift+b')).toBeTrue();
    expect(matchesShortcut(key({ key: 'b', ctrlKey: true }), 'ctrl+shift+b')).toBeFalse();
    expect(matchesShortcut(key({ key: 'b', ctrlKey: true, shiftKey: true, altKey: true }), 'ctrl+shift+b')).toBeFalse();
  });
});

describe('isEnabled', () => {
  it('requires the flag and, when given, an allowed host', () => {
    expect(isEnabled({ enabled: false }, 'localhost')).toBeFalse();
    expect(isEnabled({ enabled: () => true }, 'anything')).toBeTrue();
    expect(isEnabled({ enabled: true, allowedHosts: ['qa.app.test', /\.staging\.app\.test$/] }, 'eu.staging.app.test')).toBeTrue();
    expect(isEnabled({ enabled: true, allowedHosts: ['qa.app.test'] }, 'app.test')).toBeFalse();
  });
});
