// Builds what ng-packagr doesn't: compiles the ng-add schematic and copies it, its JSON files and the
// build-guard CLI into dist/bug-butler-angular. Runs after `ng build bug-butler-angular`.
import { execFileSync } from 'node:child_process';
import { chmodSync, cpSync, existsSync } from 'node:fs';

const lib = 'projects/bug-butler-angular';
const dist = 'dist/bug-butler-angular';
if (!existsSync(dist)) throw new Error(`${dist} not found. Run \`ng build bug-butler-angular\` first.`);

execFileSync('npx', ['tsc', '-p', `${lib}/tsconfig.schematics.json`], { stdio: 'inherit' });
cpSync(`${lib}/schematics/collection.json`, `${dist}/schematics/collection.json`);
cpSync(`${lib}/schematics/ng-add/schema.json`, `${dist}/schematics/ng-add/schema.json`);
cpSync(`${lib}/bin`, `${dist}/bin`, { recursive: true });
chmodSync(`${dist}/bin/check-dist.mjs`, 0o755);
