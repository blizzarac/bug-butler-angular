import { createJiraIssue, JiraError, type JiraOptions } from './jira.js';
import { BugReportParseError, parseBugReport, type ParseLimits, type ParsedBugReport } from './parse.js';

export interface HandlerOptions extends ParseLimits {
  jira: JiraOptions;
  /**
   * Called before anything is sent to Jira. Throw or return a Response to reject the request
   * (e.g. check a session or an environment flag). Returning nothing continues.
   */
  authorize?: (request: Request) => void | Response | Promise<void | Response>;
  /** Last chance to change the parsed report, e.g. to add the authenticated user. */
  enrich?: (parsed: ParsedBugReport, request: Request) => ParsedBugReport | Promise<ParsedBugReport>;
  /** Called with unexpected errors. Defaults to console.error. */
  onError?: (error: unknown) => void;
}

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

/**
 * A fetch-style handler `(Request) => Promise<Response>` for the widget's endpoint.
 * Works as-is in Next.js route handlers, Hono, Remix, SvelteKit, Deno, Bun and Cloudflare Workers.
 */
export function createBugReportHandler(options: HandlerOptions): (request: Request) => Promise<Response> {
  return async (request) => {
    if (request.method !== 'POST') return json(405, { error: 'Use POST.' });
    try {
      const denied = await options.authorize?.(request);
      if (denied) return denied;
      let parsed = await parseBugReport(request, options);
      if (options.enrich) parsed = await options.enrich(parsed, request);
      const result = await createJiraIssue(options.jira, parsed.report, parsed);
      return json(201, result);
    } catch (err) {
      if (err instanceof BugReportParseError) return json(400, { error: err.message });
      (options.onError ?? console.error)(err);
      if (err instanceof JiraError) return json(502, { error: err.message });
      return json(500, { error: 'The bug report could not be filed.' });
    }
  };
}
