# ngx-bug-butler

A floating "Report a bug" widget for Angular 17+ apps, meant for test, QA and staging environments.
Testers capture part of the page, box or black out what matters, describe the problem, attach files,
and send it. The report includes the page, build, user, browser, recent console errors and failed
network requests.

- One provider call; the widget mounts itself.
- Region or whole-screen screenshots with highlight and redact boxes. Paste images from the clipboard.
- Password, credit card and `[data-bb-redact]` fields are blacked out in every screenshot.
- Page details are listed before sending, and each one can be switched off.
- Shadow DOM: your styles can't break it and its styles can't leak into your app. Light and dark themes.
- Sends `multipart/form-data` to **your** endpoint. Use [`bug-butler-jira`](../bug-butler-jira) there to create Jira issues.

## Install

```bash
npm i ngx-bug-butler
```

## Set up

```ts
// app.config.ts
import { provideBugButler } from 'ngx-bug-butler';
import { environment } from '../environments/environment';

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes),
    provideBugButler({
      enabled: !environment.production,
      endpoint: '/api/bug-reports',
      environmentLabel: 'STAGING',
      destinationLabel: 'Jira · QA',
      build: environment.version,
      user: () => inject(AuthService).currentUser()?.email,
    }),
  ],
};
```

That's all. The button appears in the bottom-right corner. `Ctrl+Shift+B` (`⌘⇧B` on macOS) toggles it.

### Keep it out of production builds

`enabled: false` renders nothing and installs no hooks, but the code is still in your bundle.
To remove it entirely, put the provider in its own file and swap that file in production builds:

```ts
// src/app/bug-butler.providers.ts
import { provideBugButler } from 'ngx-bug-butler';
export const bugButlerProviders = [provideBugButler({ enabled: true, endpoint: '/api/bug-reports' })];

// src/app/bug-butler.providers.prod.ts
export const bugButlerProviders = [];
```

```jsonc
// angular.json → projects.<app>.architect.build.configurations.production
"fileReplacements": [
  { "replace": "src/app/bug-butler.providers.ts", "with": "src/app/bug-butler.providers.prod.ts" }
]
```

Then use `providers: [...bugButlerProviders]`. Nothing else in the app should import `ngx-bug-butler`
for this to remove it completely. The endpoint should also only exist on non-production backends.

## Options

| Option | Default | |
| --- | --- | --- |
| `enabled` | required | `boolean` or `() => boolean`. |
| `allowedHosts` | any | Second gate: only activate on these hostnames (`string` exact match or `RegExp`). |
| `endpoint` | | Where the default transport POSTs reports. |
| `headers` | | `() => Record<string, string>` (sync or async), e.g. an auth header. `inject()` works inside. |
| `credentials` | `'same-origin'` | `fetch` credentials mode. |
| `environmentLabel` | | Badge on the button and in the report, e.g. `STAGING`. |
| `destinationLabel` | | Shown in the panel footer, e.g. `Jira · QA`. |
| `build` | | App version or commit, sent with each report. |
| `user` | | `() => string` identifying the reporter. `inject()` works inside. |
| `customContext` | | `() => Record<string, string>` with anything else, e.g. tenant or feature flags. |
| `redactSelectors` | password, `cc-*`, `[data-bb-redact]` | More elements to black out in screenshots. |
| `redactQueryParams` | token, password, secret, key, auth, code, session, signature | More query parameters to redact in recorded URLs. |
| `shortcut` | `'ctrl+shift+b'` | `false` to disable. `ctrl` also matches `⌘`. |
| `position` | `'bottom-right'` | Any corner. |
| `theme` | `'auto'` | `'light'`, `'dark'` or follow the OS. |
| `maxAttachmentBytes` | 10 MB | Per file. |
| `maxEntries` | 50 | Console and network entries kept. |
| `autoMount` | `true` | Set `false` and place `<bug-butler />` yourself (import `BugButlerComponent`). |
| `zIndex` | `2147483000` | |

## Open it from your own UI

```ts
export class HelpMenuComponent {
  protected readonly bugButler = inject(BugButler);
}
```

```html
@if (bugButler.enabled) {
  <button (click)="bugButler.open()">Report a bug</button>
}
```

## What the endpoint receives

A `POST` with `multipart/form-data`:

| Part | Content |
| --- | --- |
| `report` | JSON, see `BugReport` in [`report.ts`](src/lib/report.ts) |
| `screenshots` | One PNG per screenshot, named `screenshot-1.png`, … |
| `attachments` | The attached files |

Answer with `{ "key": "QA-1287", "url": "https://…/browse/QA-1287" }` (both optional) and the reporter
sees the key and a link. Any non-2xx status shows the response text as an error with a "Try again" button.

For Jira, [`bug-butler-jira`](../bug-butler-jira) does the parsing, validation, issue creation and
attachment upload in a few lines.

## Send somewhere else

Replace the transport:

```ts
@Injectable()
export class SlackTransport extends BugReportTransport {
  async send(report: BugReport, files: BugReportFiles): Promise<BugReportResult> {
    // ...
    return { key: 'posted' };
  }
}

providers: [provideBugButler({ enabled: true }), { provide: BugReportTransport, useClass: SlackTransport }];
```

`toFormData(report, files)` builds the default multipart body if you only need different headers or a different client.

## How screenshots work

Screenshots are made by redrawing the DOM onto a canvas with
[html2canvas-pro](https://github.com/yorickshan/html2canvas-pro), loaded on the first capture (about 55 kB gzipped).
There's no permission prompt and it can crop to any area. Unlike the original html2canvas it handles modern CSS
colours (`oklch`, `color-mix`). Because the page is redrawn rather than photographed, some things differ:

- Images from other origins only show when they're served with CORS headers.
- `<iframe>`, `<video>` frames and some effects (`backdrop-filter`, complex blend modes) may be missing or approximated.

Need pixel-exact captures? Provide your own `ScreenshotService` (for example using `getDisplayMedia`, which asks the user for permission).

## Privacy

- Screenshots black out `input[type=password]`, `input[autocomplete^=cc-]` and `[data-bb-redact]` before rendering. Mark anything else sensitive with `data-bb-redact`.
- Reporters can draw black "Redact" boxes on any screenshot.
- Recorded URLs have sensitive query parameters replaced with `[redacted]`.
- Every page detail is listed with a checkbox before sending.
- Request and response bodies are never recorded.
- Nothing is sent anywhere except your endpoint.
