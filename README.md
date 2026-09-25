# Bug Butler

Lets testers file bug tickets straight from the page they're looking at, in non-production
environments of any Angular app.

A floating button opens a panel for capturing and marking up screenshots, describing the problem
and attaching files. The report goes to your backend with the page details that make a ticket
useful: route, build, user, browser, console errors and failed requests. There it becomes a Jira issue.

| Package | What it is |
| --- | --- |
| [`ngx-bug-butler`](projects/ngx-bug-butler) | The Angular 17+ widget. |
| [`bug-butler-jira`](projects/bug-butler-jira) | Server-side helper that turns a report into a Jira issue with attachments. Framework-agnostic, no dependencies. |

```
Angular app ── ngx-bug-butler ──POST multipart──▶ your endpoint ── bug-butler-jira ──▶ Jira
```

Jira credentials only live on your server; the browser never sees them.

## Try it

```bash
npm install
npm start        # builds the library and serves the demo on http://localhost:4200
```

The demo is a small invoicing app with a seeded bug (a balance showing `NaN €`). There is no
backend in this repo, so while you click around, a fake endpoint in the browser answers and logs
the report to the console.

## Develop

| Command | |
| --- | --- |
| `npm run build` | Library, Jira helper and demo. |
| `npm run test:lib` | Library unit tests (Karma, headless Chrome). |
| `npm run test:jira` | Jira helper tests (`node --test`). |
| `npm run check:contract` | Fails if the widget and the Jira helper disagree on the report format. |
| `npm run e2e` | Playwright tests against the built demo: capture, markup, redaction, sending. |

Without a Playwright browser download, point the tests at an installed Chromium with `CHROMIUM_PATH`, and the
unit tests with `CHROME_BIN`.

CI also installs the packed library into a fresh app on the newest Angular release and runs an end-to-end check there.

See [docs/DESIGN.md](docs/DESIGN.md) for the design and [docs/prototype](docs/prototype/bug-butler.html) for the original clickable mock-up.
