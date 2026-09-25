# Bug Butler: design proposal

A drop-in Angular library that lets testers file a bug ticket from any page of a
non-production app: region screenshots with markup, description, attachments and
automatically collected page context, all from a floating panel.

Clickable prototype: [`docs/prototype/bug-butler.html`](prototype/bug-butler.html)

## Developer experience

```ts
// app.config.ts (standalone Angular 17+)
export const appConfig: ApplicationConfig = {
  providers: [
    provideBugButler({
      enabled: environment.name !== 'production',   // gate #1: config
      endpoint: '/api/bug-reports',                   // your backend relay, never the tracker directly
      destination: { label: 'Jira · QA' },
      context: { user: () => inject(AuthService).currentUser(), build: environment.build },
      redact: ['input[type=password]', '[data-bb-redact]'],
    }),
  ],
};
```

```html
<!-- app.component.html -->
<router-outlet />
<bug-butler />
```

When `enabled` is false the component renders nothing, patches nothing and
lazy-loads nothing.

## Environment gating (defense in depth)

1. **Build time**: use `fileReplacements` so production builds import a no-op
   `provideBugButler()` and the capture code is tree-shaken out of the bundle.
2. **Runtime**: `enabled` flag, plus an optional hostname allowlist.
3. **Server**: the relay endpoint only exists in non-prod deployments and holds
   the tracker token. The browser never sees Jira/GitHub/Linear credentials.

## UI

- **Floating button** (bottom-right, draggable to any corner) with an env badge
  (`STAGING`). Shortcut `Ctrl/Cmd+Shift+B`.
- **Docked panel** (400px card above the button): title, type, severity,
  description, screenshot thumbnails, attachments, collapsible page context.
- **Expanded mode** (full-viewport overlay): screenshot stage on the left for
  markup, form on the right. Clicking a thumbnail opens it here.
- **Area capture**: panel hides, page dims, drag a rectangle, `Esc` cancels.
  Also "Full page" capture and paste-from-clipboard.
- **Markup**: boxes (v1); arrows, blur/redact and text labels later.
- Draft survives minimising and route changes (kept in a service; optionally
  `sessionStorage`).
- Rendered inside a Shadow DOM root (`ViewEncapsulation.ShadowDom`) so host
  styles cannot break the widget and widget styles cannot leak into the host.
  Own CSS custom properties for theming, light/dark aware.

## Architecture

```
projects/bug-butler/src/lib/
  bug-butler.component.ts        # shell: FAB + panel, signals-based state
  panel/                          # form, thumbnails, attachments, context list
  capture/
    region-selector.component.ts  # overlay + drag rectangle
    screenshot.service.ts         # html-to-image / html2canvas, lazy-loaded
    markup-canvas.component.ts    # box drawing, undo
  context/
    console-recorder.ts           # ring buffer of console.error/warn + window.onerror
    network-recorder.ts           # HttpInterceptor: last N requests, failures flagged
    router-trail.ts               # last N NavigationEnd events
    environment-info.ts           # browser, viewport, DPR, build, user
  transport/
    bug-report.client.ts          # multipart POST to `endpoint`
  provide-bug-butler.ts           # config token, APP_INITIALIZER for recorders
```

### Screenshots

DOM-to-canvas (`html-to-image` or `html2canvas`), loaded on first capture so
the library stays small. It needs no permission prompt and can crop to a region,
but it re-renders the page, so cross-origin images need CORS and some CSS
(e.g. `backdrop-filter`) is approximated. An optional
`getDisplayMedia` mode gives pixel-perfect captures at the cost of a browser
permission prompt.

Redaction runs before rendering: elements matching `redact` selectors are
replaced by solid blocks in the cloned DOM.

### Report payload

```jsonc
{
  "title": "...", "type": "bug", "severity": "high", "description": "...",
  "context": { "url": "...", "route": "...", "build": "...", "user": "...",
               "browser": "...", "viewport": "1440x900@2",
               "console": [...], "network": [...], "routerTrail": [...] },
  "screenshots": ["<png blobs>"], "attachments": ["<files>"]
}
```

Sent as `multipart/form-data`. The backend relay (small Node/.NET/Java handler,
or a serverless function) maps it to the tracker via adapters:
Jira (create issue + attach), GitHub Issues (upload images to a branch or an
asset store, link in body), Linear, Azure DevOps.

## Build and packaging

- Angular CLI library (`ng-packagr`), standalone component, signals, zoneless-friendly.
- Peer deps: `@angular/core`, `@angular/common`, `@angular/router` (optional).
- Target bundle: under 25 KB gzipped before the lazy screenshot chunk.

## Open questions

- Which trackers matter first (Jira, GitHub, Linear, Azure DevOps)?
- Should the relay live in this repo (e.g. a small Node package) or is it up to each backend?
- Session replay (rrweb, last 30 s) as a later opt-in?
