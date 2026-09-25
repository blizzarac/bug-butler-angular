import { toAdf, toWikiMarkup } from './description.js';
import type { BugReport, BugReportResult, BugSeverity } from './report.js';

export interface JiraOptions {
  /** e.g. `https://acme.atlassian.net` or `https://jira.acme.internal`. */
  baseUrl: string;
  /** Jira Cloud: email + API token. Server / Data Center: a personal access token. */
  auth: { email: string; apiToken: string } | { personalAccessToken: string };
  projectKey: string;
  /** Issue type name. Defaults to `Bug`. */
  issueType?: string | ((report: BugReport) => string);
  /** 3 for Jira Cloud (rich text description), 2 for Server / Data Center (wiki markup). Defaults to 3. */
  apiVersion?: 2 | 3;
  /**
   * Priority name per severity. Defaults to Low / Medium / High / Highest.
   * Pass `false` when the project's create screen has no priority field.
   */
  priorities?: Partial<Record<BugSeverity, string>> | false;
  /** Defaults to `['bug-butler', 'bug-butler-<type>']`. */
  labels?: string[] | ((report: BugReport) => string[]);
  /** Component names to set. */
  components?: string[];
  /** Any other fields, e.g. custom fields: `{ customfield_10042: 'staging' }`. */
  extraFields?: Record<string, unknown> | ((report: BugReport) => Record<string, unknown>);
  /** Custom fetch, e.g. for proxies or tests. Defaults to the global fetch. */
  fetch?: typeof fetch;
}

export interface JiraFiles {
  /** Named to match `report.screenshots[i].name`. */
  screenshots: Blob[];
  attachments: Blob[];
}

export class JiraError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: unknown,
  ) {
    super(message);
    this.name = 'JiraError';
  }
}

const DEFAULT_PRIORITIES: Record<BugSeverity, string> = { low: 'Low', medium: 'Medium', high: 'High', blocker: 'Highest' };

/** The `fields` object for `POST /rest/api/{2|3}/issue`. */
export function toJiraFields(report: BugReport, options: Omit<JiraOptions, 'baseUrl' | 'auth' | 'fetch'>): Record<string, unknown> {
  const call = <T>(v: T | ((r: BugReport) => T) | undefined): T | undefined => (typeof v === 'function' ? (v as (r: BugReport) => T)(report) : v);
  const fields: Record<string, unknown> = {
    project: { key: options.projectKey },
    issuetype: { name: call(options.issueType) ?? 'Bug' },
    // Jira rejects summaries over 255 characters and line breaks.
    summary: report.title.replace(/\s+/g, ' ').trim().slice(0, 255) || 'Bug report',
    description: (options.apiVersion ?? 3) === 3 ? toAdf(report) : toWikiMarkup(report),
    labels: call(options.labels) ?? ['bug-butler', `bug-butler-${report.type}`],
  };
  if (options.priorities !== false) {
    const name = { ...DEFAULT_PRIORITIES, ...options.priorities }[report.severity];
    if (name) fields['priority'] = { name };
  }
  if (options.components?.length) fields['components'] = options.components.map((name) => ({ name }));
  return { ...fields, ...call(options.extraFields) };
}

/**
 * Creates the issue and uploads screenshots and attachments to it.
 * Returns the issue key and its browse URL, which is what the widget shows the reporter.
 */
export async function createJiraIssue(options: JiraOptions, report: BugReport, files: JiraFiles): Promise<Required<BugReportResult>> {
  const doFetch = options.fetch ?? fetch;
  const base = options.baseUrl.replace(/\/+$/, '');
  const version = options.apiVersion ?? 3;
  const authorization =
    'personalAccessToken' in options.auth
      ? `Bearer ${options.auth.personalAccessToken}`
      : `Basic ${btoa(`${options.auth.email}:${options.auth.apiToken}`)}`;

  const res = await doFetch(`${base}/rest/api/${version}/issue`, {
    method: 'POST',
    headers: { Authorization: authorization, Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: toJiraFields(report, options) }),
  });
  const created = await readJson(res);
  if (!res.ok) throw new JiraError(`Jira refused to create the issue (${res.status}): ${describeJiraError(created)}`, res.status, created);
  const key = (created as { key: string }).key;

  const form = new FormData();
  files.screenshots.forEach((blob, i) => form.append('file', blob, report.screenshots[i]?.name ?? `screenshot-${i + 1}.png`));
  files.attachments.forEach((blob, i) => form.append('file', blob, report.attachments[i]?.name ?? `attachment-${i + 1}`));
  if (files.screenshots.length || files.attachments.length) {
    const up = await doFetch(`${base}/rest/api/${version}/issue/${encodeURIComponent(key)}/attachments`, {
      method: 'POST',
      // Required by Jira for attachment uploads (XSRF check).
      headers: { Authorization: authorization, Accept: 'application/json', 'X-Atlassian-Token': 'no-check' },
      body: form,
    });
    if (!up.ok) {
      const body = await readJson(up);
      throw new JiraError(`Issue ${key} was created, but uploading its attachments failed (${up.status}): ${describeJiraError(body)}`, up.status, body);
    }
  }
  return { key, url: `${base}/browse/${key}` };
}

async function readJson(res: Response): Promise<unknown> {
  const t = await res.text();
  try {
    return t ? JSON.parse(t) : {};
  } catch {
    return t;
  }
}

/** Jira answers `{ errorMessages: [], errors: { field: message } }`. */
export function describeJiraError(body: unknown): string {
  if (typeof body === 'string') return body.slice(0, 300) || 'no details';
  const b = body as { errorMessages?: string[]; errors?: Record<string, string> } | null;
  const parts = [...(b?.errorMessages ?? []), ...Object.entries(b?.errors ?? {}).map(([f, m]) => `${f}: ${m}`)];
  return parts.join('; ') || 'no details';
}
