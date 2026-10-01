import { Injectable, Injector, inject, runInInjectionContext } from '@angular/core';
import { BUG_BUTLER_CONFIG } from './config';
import { BugReport, BugReportResult } from './report';

export interface BugReportFiles {
  /** PNG blobs, same order as `report.screenshots`. */
  screenshots: Blob[];
  /** Same order as `report.attachments`. */
  attachments: File[];
}

/**
 * Sends a report somewhere. The default implementation POSTs multipart/form-data to `config.endpoint`.
 * Provide your own to send elsewhere: `{ provide: BugReportTransport, useClass: MyTransport }`.
 */
export abstract class BugReportTransport {
  abstract send(report: BugReport, files: BugReportFiles): Promise<BugReportResult>;
}

export class BugReportError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'BugReportError';
  }
}

/** Builds the multipart body the default transport sends. Exported so custom transports can reuse it. */
export function toFormData(report: BugReport, files: BugReportFiles): FormData {
  const form = new FormData();
  form.append('report', new Blob([JSON.stringify(report)], { type: 'application/json' }), 'report.json');
  files.screenshots.forEach((blob, i) => form.append('screenshots', blob, report.screenshots[i]?.name ?? `screenshot-${i + 1}.png`));
  files.attachments.forEach((file, i) => form.append('attachments', file, report.attachments[i]?.name ?? file.name));
  return form;
}

@Injectable()
export class HttpBugReportTransport extends BugReportTransport {
  private readonly config = inject(BUG_BUTLER_CONFIG);
  private readonly injector = inject(Injector);

  async send(report: BugReport, files: BugReportFiles): Promise<BugReportResult> {
    const { endpoint, headers, credentials } = this.config;
    if (!endpoint) throw new BugReportError('No endpoint is configured. Set `endpoint` in provideBugButler().');
    const extra = headers ? await runInInjectionContext(this.injector, headers) : {};

    let res: Response;
    try {
      res = await fetch(endpoint, {
        method: 'POST',
        body: toFormData(report, files),
        headers: { Accept: 'application/json', ...extra },
        credentials,
      });
    } catch {
      throw new BugReportError('Could not reach the bug report service. Check your connection and try again.');
    }
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new BugReportError(`The bug report service answered ${res.status}${detail ? `: ${detail.slice(0, 200)}` : ''}`, res.status);
    }
    const body = await res.json().catch(() => ({}));
    return { key: typeof body?.key === 'string' ? body.key : undefined, url: typeof body?.url === 'string' ? body.url : undefined };
  }
}
