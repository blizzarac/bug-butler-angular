import type { BugReport } from './report.js';

/** Jira Cloud rich text (Atlassian Document Format). */
export interface AdfNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: AdfNode[];
  text?: string;
  marks?: { type: string; attrs?: Record<string, unknown> }[];
}
export interface AdfDocument {
  version: 1;
  type: 'doc';
  content: AdfNode[];
}

type Block =
  | { kind: 'heading'; text: string }
  | { kind: 'text'; text: string }
  | { kind: 'table'; rows: [string, string][] }
  | { kind: 'code'; lines: string[] }
  | { kind: 'list'; items: string[] }
  | { kind: 'images'; names: string[] }
  | { kind: 'note'; text: string };

const MAX_CONSOLE = 20;
const MAX_NETWORK = 30;
const MAX_LINE = 500;

const SEVERITY_LABEL = { low: 'Low', medium: 'Medium', high: 'High', blocker: 'Blocker' } as const;
const TYPE_LABEL = { bug: 'Bug', visual: 'Visual', data: 'Data', performance: 'Performance' } as const;

function clip(s: string, max = MAX_LINE): string {
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

function time(iso: string): string {
  return iso.length >= 19 ? iso.slice(11, 19) : iso;
}

/** The report as a neutral list of blocks, rendered to ADF or wiki markup below. */
function blocks(report: BugReport): Block[] {
  const c = report.context;
  const out: Block[] = [];

  const description = report.description.trim();
  out.push(description ? { kind: 'text', text: description } : { kind: 'note', text: 'No description given.' });

  const rows: [string, string][] = [];
  const add = (k: string, v: string | undefined) => v && rows.push([k, v]);
  add('Type', `${TYPE_LABEL[report.type] ?? report.type} · severity ${SEVERITY_LABEL[report.severity] ?? report.severity}`);
  add('Page', c.route && c.url ? `${c.route} (${c.url})` : (c.route ?? c.url));
  add('Page title', c.pageTitle);
  add('Environment', [c.environment, c.build].filter(Boolean).join(' · ') || undefined);
  add('Reporter', c.user);
  add('Browser', c.browser);
  add('Viewport', c.viewport);
  add('Locale', [c.locale, c.timezone].filter(Boolean).join(' · ') || undefined);
  add('Reported at', c.timestamp);
  for (const [k, v] of Object.entries(c.custom ?? {})) add(k, v);
  if (rows.length) out.push({ kind: 'heading', text: 'Environment' }, { kind: 'table', rows });

  if (report.screenshots.length) {
    out.push({ kind: 'heading', text: 'Screenshots' }, { kind: 'images', names: report.screenshots.map((s) => s.name) });
  }

  if (c.console?.length) {
    const errors = c.console.filter((e) => e.level === 'error').length;
    out.push(
      { kind: 'heading', text: `Console (${errors} error${errors === 1 ? '' : 's'}, ${c.console.length - errors} warning${c.console.length - errors === 1 ? '' : 's'})` },
      { kind: 'code', lines: c.console.slice(-MAX_CONSOLE).map((e) => `[${time(e.timestamp)}] ${e.level.toUpperCase()} ${clip(e.message)}`) },
    );
  }

  if (c.network?.length) {
    const failed = c.network.filter((n) => n.failed).length;
    out.push(
      { kind: 'heading', text: `Network (${failed} of ${c.network.length} failed)` },
      {
        kind: 'code',
        lines: c.network.slice(-MAX_NETWORK).map((n) => `${n.failed ? '✗' : ' '} ${String(n.status || '---').padEnd(3)} ${n.method.padEnd(6)} ${clip(n.url, 200)} (${n.durationMs} ms)`),
      },
    );
  }

  if (c.navigation?.length) {
    out.push({ kind: 'heading', text: 'Navigation' }, { kind: 'list', items: c.navigation.slice(-10).map((n) => `${time(n.timestamp)} ${n.url}`) });
  }

  out.push({ kind: 'note', text: `Reported with Bug Butler ${report.reporterVersion}.` });
  return out;
}

const text = (t: string, marks?: AdfNode['marks']): AdfNode => ({ type: 'text', text: t, ...(marks ? { marks } : {}) });

/** Plain text with line breaks → ADF paragraphs (blank lines) and hard breaks (single newlines). */
function paragraphs(t: string): AdfNode[] {
  return t
    .split(/\n{2,}/)
    .filter((p) => p.trim())
    .map((p) => ({
      type: 'paragraph',
      content: p.split('\n').flatMap((line, i) => [...(i ? [{ type: 'hardBreak' }] : []), ...(line ? [text(line)] : [])]),
    }));
}

const cell = (type: 'tableHeader' | 'tableCell', t: string): AdfNode => ({ type, content: [{ type: 'paragraph', content: t ? [text(t)] : [] }] });

/** Builds the issue description for Jira Cloud (REST API v3). */
export function toAdf(report: BugReport): AdfDocument {
  const content: AdfNode[] = [];
  for (const b of blocks(report)) {
    switch (b.kind) {
      case 'heading':
        content.push({ type: 'heading', attrs: { level: 3 }, content: [text(b.text)] });
        break;
      case 'text':
        content.push(...paragraphs(b.text));
        break;
      case 'note':
        content.push({ type: 'paragraph', content: [text(b.text, [{ type: 'em' }])] });
        break;
      case 'table':
        content.push({
          type: 'table',
          attrs: { isNumberColumnEnabled: false, layout: 'default' },
          content: b.rows.map(([k, v]) => ({ type: 'tableRow', content: [cell('tableHeader', k), cell('tableCell', v)] })),
        });
        break;
      case 'code':
        content.push({ type: 'codeBlock', attrs: { language: 'text' }, content: [text(b.lines.join('\n'))] });
        break;
      case 'list':
      case 'images': {
        const items = b.kind === 'list' ? b.items : b.names.map((n) => `${n} (attached)`);
        content.push({ type: 'bulletList', content: items.map((i) => ({ type: 'listItem', content: [{ type: 'paragraph', content: [text(i)] }] })) });
        break;
      }
    }
  }
  return { version: 1, type: 'doc', content };
}

const escapeWiki = (s: string) => s.replace(/([|{}[\]!])/g, '\\$1'); // characters that would start tables, macros, links or images

/** Builds the issue description as wiki markup for Jira Server / Data Center (REST API v2). Screenshots are embedded. */
export function toWikiMarkup(report: BugReport): string {
  const parts: string[] = [];
  for (const b of blocks(report)) {
    switch (b.kind) {
      case 'heading':
        parts.push(`h3. ${b.text}`);
        break;
      case 'text':
        parts.push(escapeWiki(b.text));
        break;
      case 'note':
        parts.push(`_${escapeWiki(b.text)}_`);
        break;
      case 'table':
        parts.push(b.rows.map(([k, v]) => `||${escapeWiki(k)}|${escapeWiki(v)}|`).join('\n'));
        break;
      case 'code':
        parts.push(`{noformat}\n${b.lines.join('\n').replace(/\{noformat\}/g, '{ noformat}')}\n{noformat}`);
        break;
      case 'list':
        parts.push(b.items.map((i) => `* ${escapeWiki(i)}`).join('\n'));
        break;
      case 'images':
        parts.push(b.names.map((n) => `!${n}|thumbnail!`).join(' '));
        break;
    }
  }
  return parts.join('\n\n');
}
