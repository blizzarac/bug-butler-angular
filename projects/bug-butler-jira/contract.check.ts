// Compile-time check that this package and ngx-bug-butler agree on the report format.
// Run with `npm run check:contract`; it fails to compile if the two drift apart.
import type * as Widget from '../ngx-bug-butler/src/lib/report.js';
import type * as Jira from './src/report.js';

type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
const checks: [
  Same<Widget.BugReport, Jira.BugReport>,
  Same<Widget.BugReportResult, Jira.BugReportResult>,
] = [true, true];
void checks;
