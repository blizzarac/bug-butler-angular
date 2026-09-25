/**
 * Wire format sent by ngx-bug-butler. Kept in sync with the widget by `contract.check.ts`.
 *
 * Multipart parts: `report` (JSON), `screenshots` (PNG files, same order as `report.screenshots`)
 * and `attachments` (same order as `report.attachments`).
 */

export type BugType = 'bug' | 'visual' | 'data' | 'performance';
export type BugSeverity = 'low' | 'medium' | 'high' | 'blocker';

export interface ConsoleEntry {
  level: 'error' | 'warn';
  message: string;
  /** ISO 8601 */
  timestamp: string;
}

export interface NetworkEntry {
  method: string;
  /** URL with sensitive query parameters redacted. */
  url: string;
  /** HTTP status, or 0 when the request never got a response. */
  status: number;
  durationMs: number;
  failed: boolean;
  /** ISO 8601 */
  timestamp: string;
}

export interface NavigationEntry {
  url: string;
  /** ISO 8601 */
  timestamp: string;
}

export interface BugReportContext {
  /** Full page URL, sensitive query parameters redacted. */
  url?: string;
  /** Router URL, e.g. `/invoices?status=overdue`. */
  route?: string;
  pageTitle?: string;
  environment?: string;
  build?: string;
  user?: string;
  browser?: string;
  userAgent?: string;
  /** `1440x900@2` */
  viewport?: string;
  locale?: string;
  timezone?: string;
  /** ISO 8601 time the report was sent. */
  timestamp?: string;
  console?: ConsoleEntry[];
  network?: NetworkEntry[];
  navigation?: NavigationEntry[];
  custom?: Record<string, string>;
}

export interface BugReportFileInfo {
  name: string;
  type: string;
  size: number;
}

export interface BugReportScreenshotInfo {
  name: string;
  width: number;
  height: number;
}

export interface BugReport {
  title: string;
  type: BugType;
  severity: BugSeverity;
  description: string;
  context: BugReportContext;
  screenshots: BugReportScreenshotInfo[];
  attachments: BugReportFileInfo[];
  /** Version of ngx-bug-butler that produced the report. */
  reporterVersion: string;
}

/** What the endpoint should answer with. Both fields are optional. */
export interface BugReportResult {
  /** Ticket key shown to the reporter, e.g. `QA-1287`. */
  key?: string;
  /** Link to the created ticket. */
  url?: string;
}
