import type { BugReport } from './report.js';

export interface ParsedBugReport {
  report: BugReport;
  screenshots: File[];
  attachments: File[];
}

export interface ParseLimits {
  /** Largest single file in bytes. Defaults to 10 MB. */
  maxFileBytes?: number;
  /** Most files in one report (screenshots + attachments). Defaults to 20. */
  maxFiles?: number;
}

export class BugReportParseError extends Error {
  readonly status = 400;
  constructor(message: string) {
    super(message);
    this.name = 'BugReportParseError';
  }
}

const TYPES = ['bug', 'visual', 'data', 'performance'];
const SEVERITIES = ['low', 'medium', 'high', 'blocker'];

/** Reads and validates the multipart body sent by ngx-bug-butler. Accepts a fetch `Request` or its parsed `FormData`. */
export async function parseBugReport(input: Request | FormData, limits: ParseLimits = {}): Promise<ParsedBugReport> {
  let form: FormData;
  try {
    form = input instanceof FormData ? input : await input.formData();
  } catch {
    throw new BugReportParseError('Expected a multipart/form-data body.');
  }
  const raw = form.get('report');
  if (!raw) throw new BugReportParseError('Missing the "report" part.');
  let report: BugReport;
  try {
    report = JSON.parse(typeof raw === 'string' ? raw : await raw.text());
  } catch {
    throw new BugReportParseError('The "report" part is not valid JSON.');
  }
  if (!report || typeof report.title !== 'string' || !report.title.trim()) throw new BugReportParseError('The report needs a title.');
  if (!TYPES.includes(report.type)) throw new BugReportParseError(`Unknown type "${report.type}".`);
  if (!SEVERITIES.includes(report.severity)) throw new BugReportParseError(`Unknown severity "${report.severity}".`);
  report.description = typeof report.description === 'string' ? report.description : '';
  report.context = report.context && typeof report.context === 'object' ? report.context : {};
  report.screenshots = Array.isArray(report.screenshots) ? report.screenshots : [];
  report.attachments = Array.isArray(report.attachments) ? report.attachments : [];

  const files = (name: string) => form.getAll(name).filter((f): f is File => typeof f !== 'string');
  const screenshots = files('screenshots');
  const attachments = files('attachments');
  const maxFiles = limits.maxFiles ?? 20;
  const maxBytes = limits.maxFileBytes ?? 10 * 1024 * 1024;
  if (screenshots.length + attachments.length > maxFiles) throw new BugReportParseError(`Too many files (limit ${maxFiles}).`);
  const big = [...screenshots, ...attachments].find((f) => f.size > maxBytes);
  if (big) throw new BugReportParseError(`${big.name} is larger than ${Math.round(maxBytes / 1024 / 1024)} MB.`);
  return { report, screenshots, attachments };
}
