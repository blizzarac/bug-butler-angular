#!/usr/bin/env node
// Fails when a built app still contains Bug Butler. Run it on the production build output:
//   bug-butler-angular-check dist/my-app/browser
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

// A string literal from the widget component that survives minification (the sessionStorage draft key).
// It is only in a bundle when the component is. A test keeps it in sync with the library source.
const MARKER = 'bug-butler:draft';
const EXTENSIONS = ['.js', '.mjs', '.cjs'];

const usage = `Usage: bug-butler-angular-check <build-output-dir> [more dirs…]

Exits 0 when no JavaScript file in the given folders contains Bug Butler,
1 when it is found (the files are listed), 2 on bad input.`;

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* walk(path);
    else yield path;
  }
}

const dirs = process.argv.slice(2);
if (dirs.length === 0 || dirs.some((d) => d === '-h' || d === '--help')) {
  console.log(usage);
  process.exit(dirs.length === 0 ? 2 : 0);
}

const found = [];
let scanned = 0;
for (const dir of dirs) {
  let files;
  try {
    files = [...walk(dir)];
  } catch {
    console.error(`bug-butler-angular-check: cannot read "${dir}". Build the app first.`);
    process.exit(2);
  }
  for (const file of files.filter((f) => EXTENSIONS.some((e) => f.endsWith(e)))) {
    scanned++;
    if (readFileSync(file, 'utf8').includes(MARKER)) found.push(file);
  }
}

if (scanned === 0) {
  console.error(`bug-butler-angular-check: no JavaScript files in ${dirs.join(', ')}. Is this the build output?`);
  process.exit(2);
}
if (found.length > 0) {
  console.error('Bug Butler is in this build:');
  for (const file of found) console.error(`  ${file}`);
  console.error('\nSwap the provider file for an empty one in the production configuration (fileReplacements).');
  console.error('`ng add bug-butler-angular` sets this up.');
  process.exit(1);
}
console.log(`OK: Bug Butler is not in the build (${scanned} JavaScript files checked).`);
