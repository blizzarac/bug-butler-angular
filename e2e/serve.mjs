// Minimal static server for a built app (the demo by default, ROOT overrides it): SPA fallback, and 404 for /api/* (there is no backend).
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const root = process.env.ROOT ?? new URL('../dist/demo/browser/', import.meta.url).pathname;
const port = Number(process.env.PORT ?? 4300);
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.ico': 'image/x-icon', '.json': 'application/json' };

createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
  if (path.startsWith('/api/')) {
    res.writeHead(404, { 'Content-Type': 'application/json' }).end('{"error":"not found"}');
    return;
  }
  const file = extname(path) ? join(root, path) : join(root, 'index.html');
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': types[extname(file)] ?? 'application/octet-stream' }).end(body);
  } catch {
    res.writeHead(404).end('not found');
  }
}).listen(port, () => console.log(`demo on http://localhost:${port}`));
