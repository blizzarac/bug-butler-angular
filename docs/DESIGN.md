# Bug Butler: design

A drop-in Angular library that lets testers file a bug ticket from any page of a
non-production app: region screenshots with markup, description, attachments and
automatically collected page context, all from a floating panel.

Original clickable mock-up: [`docs/prototype/bug-butler.html`](prototype/bug-butler.html).
Usage docs: [`projects/ngx-bug-butler`](../projects/ngx-bug-butler) and [`projects/bug-butler-jira`](../projects/bug-butler-jira).

## Decisions

| Question | Decision |
| --- | --- |
| Angular versions | 17+. Built with the Angular 17 toolchain (partial compilation), standalone, signals, works zoneless. CI checks the packed library in a fresh app on the newest Angular. |
| Tracker | Jira first (Cloud via REST v3 + ADF, Server/DC via REST v2 + wiki markup). |
| Backend | Not in this repo. The widget POSTs to an endpoint you own; `bug-butler-jira` is a helper for that endpoint. The browser never holds tracker credentials. |
| Mounting | `provideBugButler()` mounts the component on `document.body` at bootstrap. No template changes, so one file replacement removes it from production builds. |
| Isolation | `ViewEncapsulation.ShadowDom`, `all: initial` on the host, system fonts only (no external font requests from a library). |
| Screenshots | `html2canvas-pro`, lazy-loaded on first capture. Chosen over `html2canvas` (crashes on `oklch`/`color-mix`, which Tailwind 4 and Material 3 use) and over `getDisplayMedia` (permission prompt every time). Redaction happens in the cloned DOM, so the live page never flashes. Replaceable via `ScreenshotService`. |
| Markup | Highlight and redact boxes with undo, drawn directly into the screenshot canvas. |
| Context | Console errors/warnings, `window.onerror`, unhandled rejections, fetch + XHR requests (method, URL, status, duration; never bodies), router navigation. Bounded ring buffers. Each group can be switched off before sending. |
| Transport | `multipart/form-data`: `report` JSON + `screenshots` PNGs + `attachments`. Replaceable via `BugReportTransport`. |
| Drafts | Text fields survive minimising and reloads (`sessionStorage`); screenshots and files survive minimising. |

## Environment gating (defense in depth)

1. **Build time**: `fileReplacements` swaps the provider file for an empty one in production, so the library is not in the bundle.
2. **Runtime**: `enabled` flag, plus an optional `allowedHosts` list.
3. **Server**: the endpoint only exists on non-production deployments and holds the Jira token.

## Layout

```
projects/ngx-bug-butler/src/lib/
  provide.ts                 provideBugButler(): config, transport, recorder start-up, auto-mount
  config.ts                  options, defaults, enable check, injection tokens
  bug-butler.component.*     button, panel, capture overlay, markup stage, form (signals, OnPush, Shadow DOM)
  bug-butler.service.ts      BugButler: open()/close() from your own UI
  context-recorder.ts        console / fetch / XHR / router recording
  context.service.ts         snapshot of page details + per-group exclusion
  screenshot.service.ts      html2canvas-pro capture with redaction
  transport.ts               BugReportTransport, default HTTP multipart transport
  report.ts                  wire format (no Angular imports)
projects/bug-butler-jira/src/
  parse.ts                   multipart → validated report + files
  description.ts             report → ADF (Cloud) or wiki markup (Server/DC)
  jira.ts                    fields mapping, issue creation, attachment upload
  handler.ts                 fetch-style request handler
projects/demo/               sample app with a seeded bug
e2e/                         Playwright tests (demo + latest-Angular compatibility)
```

## Later

- Arrows and text labels in markup.
- More trackers: GitHub Issues, Linear, Azure DevOps (same wire format, new server helpers).
- Optional session replay (rrweb, last 30 s) as an opt-in attachment.
- Draggable button position, remembered per user.
