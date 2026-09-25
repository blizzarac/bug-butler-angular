import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createBugReportHandler, createJiraIssue, parseBugReport, toAdf, toJiraFields, toWikiMarkup } from '../../../dist/bug-butler-jira/index.js';

const report = {
  title: 'Invoice total shows NaN\nwhen a credit note is applied',
  type: 'data',
  severity: 'blocker',
  description: 'Steps:\n1. Filter overdue\n\nExpected a number.',
  context: {
    url: 'https://staging.app.test/invoices?status=overdue',
    route: '/invoices?status=overdue',
    environment: 'STAGING',
    build: 'web 4.18.2',
    user: 'qa@app.test',
    browser: 'Chrome 140 · macOS',
    viewport: '1440x900@2',
    timestamp: '2026-09-25T14:03:11.000Z',
    console: [{ level: 'error', message: "TypeError: Cannot read properties of undefined (reading 'amount')", timestamp: '2026-09-25T14:02:59.000Z' }],
    network: [
      { method: 'GET', url: '/api/invoices', status: 200, durationMs: 84, failed: false, timestamp: '2026-09-25T14:02:58.000Z' },
      { method: 'GET', url: '/api/credit-notes/CN-2041', status: 404, durationMs: 31, failed: true, timestamp: '2026-09-25T14:02:59.000Z' },
    ],
    custom: { tenant: 'acme|eu' },
  },
  screenshots: [{ name: 'screenshot-1.png', width: 800, height: 400 }],
  attachments: [{ name: 'trace.har', type: 'application/json', size: 4 }],
  reporterVersion: '0.1.0',
};

/** Records calls and answers like Jira does. */
function fakeJira(responses) {
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({ url, init });
    const [status, body] = responses.shift();
    return new Response(JSON.stringify(body), { status });
  };
  return { calls, fetch };
}

const options = { baseUrl: 'https://acme.atlassian.net/', auth: { email: 'bot@acme.test', apiToken: 'tok' }, projectKey: 'QA' };

describe('toJiraFields', () => {
  it('maps title, severity, type and description for Jira Cloud', () => {
    const fields = toJiraFields(report, options);
    assert.equal(fields.summary, 'Invoice total shows NaN when a credit note is applied');
    assert.deepEqual(fields.project, { key: 'QA' });
    assert.deepEqual(fields.issuetype, { name: 'Bug' });
    assert.deepEqual(fields.priority, { name: 'Highest' });
    assert.deepEqual(fields.labels, ['bug-butler', 'bug-butler-data']);
    assert.equal(fields.description.type, 'doc');
  });

  it('honours overrides and can leave priority out', () => {
    const fields = toJiraFields(report, {
      ...options,
      issueType: (r) => (r.type === 'visual' ? 'UI Bug' : 'Defect'),
      priorities: false,
      labels: ['qa'],
      components: ['Billing'],
      extraFields: { customfield_10042: 'staging' },
    });
    assert.deepEqual(fields.issuetype, { name: 'Defect' });
    assert.equal('priority' in fields, false);
    assert.deepEqual(fields.components, [{ name: 'Billing' }]);
    assert.equal(fields.customfield_10042, 'staging');
  });

  it('caps the summary at 255 characters', () => {
    assert.equal(toJiraFields({ ...report, title: 'x'.repeat(400) }, options).summary.length, 255);
  });
});

describe('toAdf', () => {
  const doc = toAdf(report);
  const find = (type) => doc.content.filter((n) => n.type === type);

  it('keeps paragraphs and line breaks from the description', () => {
    const [first, second] = find('paragraph');
    assert.deepEqual(first.content.map((n) => n.type), ['text', 'hardBreak', 'text']);
    assert.equal(second.content[0].text, 'Expected a number.');
  });

  it('adds an environment table and code blocks for console and network', () => {
    const rows = find('table')[0].content.map((r) => r.content.map((c) => c.content[0].content[0]?.text));
    assert.deepEqual(rows[0], ['Type', 'Data · severity Blocker']);
    assert.ok(rows.some(([k, v]) => k === 'Reporter' && v === 'qa@app.test'));
    assert.ok(rows.some(([k, v]) => k === 'tenant' && v === 'acme|eu'));
    const code = find('codeBlock').map((c) => c.content[0].text);
    assert.match(code[0], /\[14:02:59\] ERROR TypeError/);
    assert.match(code[1], /✗ 404 GET +\/api\/credit-notes\/CN-2041 \(31 ms\)/);
    assert.deepEqual(find('heading').map((h) => h.content[0].text), ['Environment', 'Screenshots', 'Console (1 error, 0 warnings)', 'Network (1 of 2 failed)']);
  });

  it('never emits empty text nodes, which Jira rejects', () => {
    const walk = (n) => (n.type === 'text' ? assert.ok(n.text.length > 0) : (n.content ?? []).forEach(walk));
    walk(toAdf({ ...report, description: '', context: { custom: { empty: '' } } }));
  });
});

describe('toWikiMarkup', () => {
  it('renders tables, noformat blocks and embeds screenshots, escaping table pipes', () => {
    const wiki = toWikiMarkup(report);
    assert.match(wiki, /\|\|Reporter\|qa@app\.test\|/);
    assert.match(wiki, /\|\|tenant\|acme\\\|eu\|/);
    assert.match(wiki, /\{noformat\}\n\[14:02:59\] ERROR/);
    assert.match(wiki, /!screenshot-1\.png\|thumbnail!/);
  });
});

describe('createJiraIssue', () => {
  it('creates the issue, uploads files and returns key and browse URL', async () => {
    const jira = fakeJira([[201, { key: 'QA-1287' }], [200, [{}]]]);
    const result = await createJiraIssue({ ...options, fetch: jira.fetch }, report, {
      screenshots: [new Blob(['png'], { type: 'image/png' })],
      attachments: [new Blob(['{}'])],
    });
    assert.deepEqual(result, { key: 'QA-1287', url: 'https://acme.atlassian.net/browse/QA-1287' });

    const [create, upload] = jira.calls;
    assert.equal(create.url, 'https://acme.atlassian.net/rest/api/3/issue');
    assert.equal(create.init.headers.Authorization, `Basic ${btoa('bot@acme.test:tok')}`);
    assert.equal(JSON.parse(create.init.body).fields.project.key, 'QA');
    assert.equal(upload.url, 'https://acme.atlassian.net/rest/api/3/issue/QA-1287/attachments');
    assert.equal(upload.init.headers['X-Atlassian-Token'], 'no-check');
    assert.deepEqual(upload.init.body.getAll('file').map((f) => f.name), ['screenshot-1.png', 'trace.har']);
  });

  it('uses a bearer token and wiki markup for Server / Data Center, and skips the upload without files', async () => {
    const jira = fakeJira([[201, { key: 'OPS-9' }]]);
    await createJiraIssue({ ...options, apiVersion: 2, auth: { personalAccessToken: 'pat' }, fetch: jira.fetch }, report, { screenshots: [], attachments: [] });
    assert.equal(jira.calls.length, 1);
    assert.equal(jira.calls[0].url, 'https://acme.atlassian.net/rest/api/2/issue');
    assert.equal(jira.calls[0].init.headers.Authorization, 'Bearer pat');
    assert.equal(typeof JSON.parse(jira.calls[0].init.body).fields.description, 'string');
  });

  it("reports Jira's field errors", async () => {
    const jira = fakeJira([[400, { errorMessages: [], errors: { priority: 'Field cannot be set.' } }]]);
    await assert.rejects(createJiraIssue({ ...options, fetch: jira.fetch }, report, { screenshots: [], attachments: [] }), {
      name: 'JiraError',
      status: 400,
      message: 'Jira refused to create the issue (400): priority: Field cannot be set.',
    });
  });
});

function multipart(r = report) {
  const form = new FormData();
  form.append('report', new Blob([JSON.stringify(r)], { type: 'application/json' }), 'report.json');
  form.append('screenshots', new Blob(['png'], { type: 'image/png' }), 'screenshot-1.png');
  form.append('attachments', new Blob(['{}']), 'trace.har');
  return new Request('https://api.test/bug-reports', { method: 'POST', body: form });
}

describe('parseBugReport', () => {
  it('reads the report and files from a multipart request', async () => {
    const parsed = await parseBugReport(multipart());
    assert.equal(parsed.report.title, report.title);
    assert.deepEqual(parsed.screenshots.map((f) => f.name), ['screenshot-1.png']);
    assert.deepEqual(parsed.attachments.map((f) => f.name), ['trace.har']);
  });

  it('rejects invalid reports and oversized files', async () => {
    await assert.rejects(parseBugReport(multipart({ ...report, title: ' ' })), /needs a title/);
    await assert.rejects(parseBugReport(multipart({ ...report, severity: 'meh' })), /Unknown severity/);
    await assert.rejects(parseBugReport(multipart(), { maxFileBytes: 2 }), /larger than/);
    await assert.rejects(parseBugReport(new Request('https://x.test', { method: 'POST', body: 'hi' })), /multipart/);
  });
});

describe('createBugReportHandler', () => {
  it('files the issue and answers with key and url', async () => {
    const jira = fakeJira([[201, { key: 'QA-2' }], [200, []]]);
    const handler = createBugReportHandler({ jira: { ...options, fetch: jira.fetch } });
    const res = await handler(multipart());
    assert.equal(res.status, 201);
    assert.deepEqual(await res.json(), { key: 'QA-2', url: 'https://acme.atlassian.net/browse/QA-2' });
  });

  it('lets authorize reject and enrich add data', async () => {
    const jira = fakeJira([[201, { key: 'QA-3' }]]);
    const denied = await createBugReportHandler({ jira: options, authorize: () => new Response('no', { status: 401 }) })(multipart());
    assert.equal(denied.status, 401);

    const handler = createBugReportHandler({
      jira: { ...options, fetch: jira.fetch },
      enrich: (p) => ({ ...p, screenshots: [], attachments: [], report: { ...p.report, context: { ...p.report.context, user: 'verified@acme.test' } } }),
    });
    await handler(multipart());
    assert.match(jira.calls[0].init.body, /verified@acme\.test/);
  });

  it('maps bad input to 400 and Jira failures to 502', async () => {
    const quiet = () => {};
    const bad = await createBugReportHandler({ jira: options })(multipart({ ...report, type: 'nope' }));
    assert.equal(bad.status, 400);
    const jira = fakeJira([[403, { errorMessages: ['No permission'] }]]);
    const res = await createBugReportHandler({ jira: { ...options, fetch: jira.fetch }, onError: quiet })(multipart());
    assert.equal(res.status, 502);
    assert.match((await res.json()).error, /No permission/);
  });
});
