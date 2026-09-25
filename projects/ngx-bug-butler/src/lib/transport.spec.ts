import { TestBed } from '@angular/core/testing';
import { BUG_BUTLER_CONFIG, resolveConfig } from './config';
import { BugReport } from './report';
import { BugReportError, HttpBugReportTransport, toFormData } from './transport';

const report: BugReport = {
  title: 'Total is NaN',
  type: 'data',
  severity: 'high',
  description: '',
  context: { route: '/invoices' },
  screenshots: [{ name: 'screenshot-1.png', width: 10, height: 10 }],
  attachments: [{ name: 'log.txt', type: 'text/plain', size: 3 }],
  reporterVersion: '0.1.0',
};
const files = { screenshots: [new Blob(['png'], { type: 'image/png' })], attachments: [new File(['abc'], 'log.txt', { type: 'text/plain' })] };

describe('toFormData', () => {
  it('puts the report JSON, screenshots and attachments into named parts', async () => {
    const form = toFormData(report, files);
    const json = form.get('report') as File;
    expect(json.type).toBe('application/json');
    expect(JSON.parse(await json.text())).toEqual(report);
    expect((form.getAll('screenshots')[0] as File).name).toBe('screenshot-1.png');
    expect((form.getAll('attachments')[0] as File).name).toBe('log.txt');
  });
});

describe('HttpBugReportTransport', () => {
  function setup(config: Parameters<typeof resolveConfig>[0]) {
    TestBed.configureTestingModule({
      providers: [HttpBugReportTransport, { provide: BUG_BUTLER_CONFIG, useValue: resolveConfig(config) }],
    });
    return TestBed.inject(HttpBugReportTransport);
  }

  it('POSTs multipart with custom headers and returns the ticket key', async () => {
    const fetchSpy = spyOn(window, 'fetch').and.resolveTo(new Response(JSON.stringify({ key: 'QA-1', url: 'https://jira.test/browse/QA-1' }), { status: 201 }));
    const transport = setup({ enabled: true, endpoint: '/api/bug-reports', headers: () => ({ Authorization: 'Bearer t' }) });
    await expectAsync(transport.send(report, files)).toBeResolvedTo({ key: 'QA-1', url: 'https://jira.test/browse/QA-1' });
    const [url, init] = fetchSpy.calls.mostRecent().args as [string, RequestInit];
    expect(url).toBe('/api/bug-reports');
    expect(init.method).toBe('POST');
    expect(init.body).toBeInstanceOf(FormData);
    expect(init.headers).toEqual({ Accept: 'application/json', Authorization: 'Bearer t' });
    expect(init.credentials).toBe('same-origin');
  });

  it('turns HTTP and network failures into readable errors', async () => {
    const transport = setup({ enabled: true, endpoint: '/api/bug-reports' });
    let call = 0;
    spyOn(window, 'fetch').and.callFake(async () => {
      if (call++ === 0) return new Response('Jira is down', { status: 502 });
      throw new TypeError('Failed to fetch');
    });
    await expectAsync(transport.send(report, files)).toBeRejectedWith(new BugReportError('The bug report service answered 502: Jira is down', 502));
    await expectAsync(transport.send(report, files)).toBeRejectedWithError(BugReportError, /Could not reach/);
  });

  it('fails clearly without an endpoint', async () => {
    const transport = setup({ enabled: true });
    await expectAsync(transport.send(report, files)).toBeRejectedWithError(BugReportError, /No endpoint/);
  });
});
