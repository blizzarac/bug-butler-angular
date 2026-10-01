import { TestBed } from '@angular/core/testing';
import { BUG_BUTLER_CONFIG, resolveConfig } from './config';
import { ContextRecorder } from './context-recorder';

describe('ContextRecorder', () => {
  let recorder: ContextRecorder;
  let realFetch: typeof fetch;

  beforeEach(() => {
    realFetch = window.fetch;
    // Stub the network below the recorder's patch.
    window.fetch = ((input: RequestInfo | URL) =>
      String(input).includes('missing') ? Promise.resolve(new Response('', { status: 404 })) : String(input).includes('offline') ? Promise.reject(new TypeError('Failed to fetch')) : Promise.resolve(new Response('{}'))) as typeof fetch;
    TestBed.configureTestingModule({
      providers: [{ provide: BUG_BUTLER_CONFIG, useValue: resolveConfig({ enabled: true, endpoint: '/api/bug-reports', maxEntries: 3 }) }],
    });
    recorder = TestBed.inject(ContextRecorder);
    spyOn(console, 'error').and.stub();
    spyOn(console, 'warn').and.stub();
    recorder.install();
  });

  afterEach(() => {
    recorder.uninstall();
    window.fetch = realFetch;
  });

  it('records console errors and warnings, including Error stacks', () => {
    console.error(new TypeError('boom'));
    console.warn('careful', { id: 1 });
    expect(recorder.console.map((e) => e.level)).toEqual(['error', 'warn']);
    expect(recorder.console[0].message).toContain('TypeError: boom');
    expect(recorder.console[1].message).toBe('careful {"id":1}');
  });

  it('records fetch requests with status, marks failures and redacts tokens', async () => {
    await fetch('/api/missing?token=secret');
    await fetch('/api/offline').catch(() => undefined);
    await fetch('/api/ok', { method: 'post' });
    expect(recorder.network.map((n) => [n.method, n.url, n.status, n.failed])).toEqual([
      ['GET', '/api/missing?token=[redacted]', 404, true],
      ['GET', '/api/offline', 0, true],
      ['POST', '/api/ok', 200, false],
    ]);
  });

  it('ignores its own endpoint and keeps only the newest entries', async () => {
    await fetch('/api/bug-reports', { method: 'POST' });
    for (const n of [1, 2, 3, 4]) await fetch(`/api/ok/${n}`);
    expect(recorder.network.map((n) => n.url)).toEqual(['/api/ok/2', '/api/ok/3', '/api/ok/4']);
  });

  it('restores the original console and fetch on uninstall', () => {
    const patched = window.fetch;
    recorder.uninstall();
    expect(window.fetch).not.toBe(patched);
    console.error('after');
    expect(recorder.console).toEqual([]);
  });
});
