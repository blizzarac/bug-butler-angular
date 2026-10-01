# Bug Butler Angular

Lets testers file bug tickets straight from the page they're looking at, in non-production
environments of any Angular app.

A floating button opens a panel for capturing and marking up screenshots, describing the problem
and attaching files. The report goes to your backend with the page details that make a ticket
useful: route, build, user, browser, console errors and failed requests. Turning the report into a
ticket (Jira, GitHub, …) is up to your endpoint.

The package is [`bug-butler-angular`](projects/bug-butler-angular), an Angular 17+ widget.

```
Angular app ── bug-butler-angular ──POST multipart──▶ your endpoint ──▶ your tracker
```

Tracker credentials only live on your server; the browser never sees them.

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
| `npm run build` | Library and demo. |
| `npm run test:lib` | Library unit tests (Karma, headless Chrome). |
| `npm run test:tools` | `ng add` schematic and build guard tests (`node --test`, needs `build:lib` first). |
| `npm run e2e` | Playwright tests against the built demo: capture, markup, redaction, sending. |

Without a Playwright browser download, point the tests at an installed Chromium with `CHROMIUM_PATH`, and the
unit tests with `CHROME_BIN`.

CI also installs the packed library into a fresh app on the newest Angular release and runs an end-to-end check there.
