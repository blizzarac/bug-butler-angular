import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const cli = fileURLToPath(new URL('./check-dist.mjs', import.meta.url));
const lib = fileURLToPath(new URL('..', import.meta.url));
const run = (...args) => spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' });

function build(files) {
  const dir = mkdtempSync(join(tmpdir(), 'bb-dist-'));
  for (const [name, content] of Object.entries(files)) {
    mkdirSync(join(dir, name, '..'), { recursive: true });
    writeFileSync(join(dir, name), content);
  }
  return dir;
}

test('passes when the build does not contain the widget', () => {
  const dir = build({ 'main-ABC.js': 'console.log("app")', 'chunk/lazy.js': 'x', 'index.html': '<html></html>' });
  const result = run(dir);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /OK: Bug Butler is not in the build \(2 JavaScript files/);
});

test('fails and names the file when the widget is in the build', () => {
  const dir = build({ 'main.js': 'ok', 'chunk-XYZ.js': 'a=sessionStorage.getItem("bug-butler:draft")' });
  const result = run(dir);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /chunk-XYZ\.js/);
  assert.doesNotMatch(result.stderr, /main\.js/);
});

test('exits 2 for a missing folder, an empty build and no arguments', () => {
  assert.equal(run(join(tmpdir(), 'bb-does-not-exist')).status, 2);
  assert.equal(run(build({ 'index.html': '<html></html>' })).status, 2);
  assert.equal(run().status, 2);
});

test('the marker is still what the widget ships (keeps the guard in sync with the library)', () => {
  const marker = /const MARKER = '([^']+)'/.exec(readFileSync(join(lib, 'bin/check-dist.mjs'), 'utf8'))[1];
  assert.match(readFileSync(join(lib, 'src/lib/bug-butler.component.ts'), 'utf8'), new RegExp(`DRAFT_KEY = '${marker}'`));
  const fesm = join(lib, '../../dist/bug-butler-angular/fesm2022/bug-butler-angular.mjs');
  assert.ok(readFileSync(fesm, 'utf8').includes(marker), `${marker} not in the built library`);
});
