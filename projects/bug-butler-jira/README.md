# bug-butler-jira

Turns reports from [`ngx-bug-butler`](../ngx-bug-butler) into Jira issues, with screenshots and files attached.
No dependencies. Runs wherever `fetch`, `FormData` and `Request` exist: Node 18+, Deno, Bun and edge runtimes.

```bash
npm i bug-butler-jira
```

## Quick start

`createBugReportHandler` gives you a `(Request) => Promise<Response>` for the widget's endpoint.

**Next.js (app router)**, `app/api/bug-reports/route.ts`:

```ts
import { createBugReportHandler } from 'bug-butler-jira';

export const POST = createBugReportHandler({
  jira: {
    baseUrl: 'https://acme.atlassian.net',
    auth: { email: process.env.JIRA_EMAIL!, apiToken: process.env.JIRA_API_TOKEN! },
    projectKey: 'QA',
  },
});
```

**Hono / Bun / Deno / Cloudflare Workers**:

```ts
const handler = createBugReportHandler({ jira: { /* … */ } });
app.post('/api/bug-reports', (c) => handler(c.req.raw));
```

**Express** (Node 18+):

```ts
import { Readable } from 'node:stream';

const handler = createBugReportHandler({ jira: { /* … */ } });
app.post('/api/bug-reports', async (req, res) => {
  const request = new Request(`http://internal${req.originalUrl}`, {
    method: 'POST',
    headers: req.headers as Record<string, string>,
    body: Readable.toWeb(req) as ReadableStream,
    duplex: 'half',
  } as RequestInit);
  const response = await handler(request);
  res.status(response.status).type('json').send(await response.text());
});
```

The handler answers `201 { key, url }`, `400` for malformed reports, `502` when Jira refuses, and `405` for anything but `POST`.

### Only accept reports from signed-in testers

```ts
createBugReportHandler({
  jira,
  authorize: async (request) => {
    const session = await getSession(request);
    if (!session) return new Response('Sign in first', { status: 401 });
  },
  enrich: async (parsed, request) => {
    // Trust the server's idea of who reported it, not the browser's.
    const session = await getSession(request);
    parsed.report.context.user = session.email;
    return parsed;
  },
});
```

## Options

| `jira.*` | Default | |
| --- | --- | --- |
| `baseUrl` | required | `https://acme.atlassian.net` or your Server / Data Center URL. |
| `auth` | required | Cloud: `{ email, apiToken }` ([create a token](https://id.atlassian.com/manage-profile/security/api-tokens)). Server / DC: `{ personalAccessToken }`. |
| `projectKey` | required | e.g. `QA`. |
| `issueType` | `'Bug'` | Name, or `(report) => name`. |
| `apiVersion` | `3` | `3` for Cloud (rich text). `2` for Server / Data Center (wiki markup with embedded screenshots). |
| `priorities` | Low / Medium / High / Highest | Priority name per severity. `false` if the create screen has no priority field. |
| `labels` | `['bug-butler', 'bug-butler-<type>']` | Array, or `(report) => string[]`. |
| `components` | | Component names. |
| `extraFields` | | Any other fields, e.g. `{ customfield_10042: 'staging' }`, or `(report) => fields`. |
| `fetch` | global `fetch` | For proxies or tests. |

Handler options: `maxFileBytes` (default 10 MB), `maxFiles` (default 20), `authorize`, `enrich`, `onError`.

The Jira account needs the **Create issues** and **Create attachments** permissions in the project.

## The issue it creates

- **Summary**: the report title (line breaks removed, capped at 255 characters).
- **Priority**: from severity. **Labels**: `bug-butler` and the report type.
- **Description**: what the reporter wrote, then an *Environment* table (type, severity, page, build, reporter,
  browser, viewport, locale, time, custom fields), the screenshots, and code blocks with the console log and
  network requests (failures marked `✗`).
- **Attachments**: the screenshots and every attached file.

## Lower-level pieces

Use these when you already have your own endpoint:

```ts
import { parseBugReport, createJiraIssue, toJiraFields, toAdf, toWikiMarkup } from 'bug-butler-jira';

const { report, screenshots, attachments } = await parseBugReport(request); // or a FormData
const { key, url } = await createJiraIssue(jiraOptions, report, { screenshots, attachments });
```
