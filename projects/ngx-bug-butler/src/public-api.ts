/*
 * Public API Surface of ngx-bug-butler
 */
export { provideBugButler } from './lib/provide';
export { BugButlerComponent } from './lib/bug-butler.component';
export { BugButler } from './lib/bug-butler.service';
export { BUG_BUTLER_CONFIG, BUG_BUTLER_ENABLED, DEFAULT_REDACT_QUERY_PARAMS, DEFAULT_REDACT_SELECTORS } from './lib/config';
export type { BugButlerConfig, BugButlerPosition, ResolvedBugButlerConfig } from './lib/config';
export { BugReportTransport, HttpBugReportTransport, BugReportError, toFormData } from './lib/transport';
export type { BugReportFiles } from './lib/transport';
export { ScreenshotService } from './lib/screenshot.service';
export type { CaptureRect } from './lib/screenshot.service';
export { ContextService } from './lib/context.service';
export type { ContextItem, ContextKey, ContextSnapshot } from './lib/context.service';
export { ContextRecorder } from './lib/context-recorder';
export { REPORTER_VERSION } from './lib/version';
export type * from './lib/report';
