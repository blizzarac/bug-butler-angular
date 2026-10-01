import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

// Runs the compiled schematic from dist, so `npm run build:lib` comes first.
const require = createRequire(import.meta.url);
const { SchematicTestRunner } = require('@angular-devkit/schematics/testing');
const collection = fileURLToPath(new URL('../../../../dist/bug-butler-angular/schematics/collection.json', import.meta.url));

const runner = new SchematicTestRunner('bug-butler-angular', collection);
const ng = new SchematicTestRunner('@schematics/angular', fileURLToPath(new URL('../../../../node_modules/@schematics/angular/collection.json', import.meta.url)));

async function newApp(name = 'shop') {
  let tree = await ng.runSchematic('workspace', { name: 'ws', newProjectRoot: 'projects', version: '17.3.0' });
  tree = await ng.runSchematic('application', { name, projectRoot: '', standalone: true, routing: false, style: 'css' }, tree);
  tree.overwrite('package.json', JSON.stringify({ name: 'ws', scripts: { build: 'ng build' } }, null, 2));
  return tree;
}

const angularJson = (tree) => JSON.parse(tree.readText('angular.json'));

test('creates the provider files, registers them and swaps them in the production build', async () => {
  const tree = await runner.runSchematic('ng-add', { endpoint: '/api/bugs' }, await newApp());

  assert.match(tree.readText('src/app/bug-butler.providers.ts'), /provideBugButler\(\{[\s\S]*endpoint: '\/api\/bugs'/);
  const prod = tree.readText('src/app/bug-butler.providers.prod.ts');
  assert.match(prod, /bugButlerProviders: EnvironmentProviders\[\] = \[\]/);
  assert.doesNotMatch(prod, /from 'bug-butler-angular'/);

  const config = tree.readText('src/app/app.config.ts');
  assert.match(config, /import \{ bugButlerProviders \} from '\.\/bug-butler\.providers';/);
  assert.match(config, /providers: \[\.\.\.bugButlerProviders\]/);

  const production = angularJson(tree).projects.shop.architect.build.configurations.production;
  assert.deepEqual(production.fileReplacements, [
    { replace: 'src/app/bug-butler.providers.ts', with: 'src/app/bug-butler.providers.prod.ts' },
  ]);

  const pkg = JSON.parse(tree.readText('package.json'));
  assert.equal(pkg.scripts['check:bug-butler'], 'bug-butler-angular-check dist/shop/browser');
  assert.equal(pkg.scripts.build, 'ng build');
});

test('running it twice changes nothing the second time', async () => {
  const once = await runner.runSchematic('ng-add', {}, await newApp());
  const twice = await runner.runSchematic('ng-add', {}, once);
  for (const file of ['src/app/app.config.ts', 'angular.json', 'package.json', 'src/app/bug-butler.providers.ts']) {
    assert.equal(twice.readText(file), once.readText(file), file);
  }
});

test('keeps existing file replacements and puts the widget first so later providers win', async () => {
  const app = await newApp();
  const json = angularJson(app);
  json.projects.shop.architect.build.configurations.production.fileReplacements = [{ replace: 'a.ts', with: 'b.ts' }];
  app.overwrite('angular.json', JSON.stringify(json));

  app.overwrite(
    'src/app/app.config.ts',
    "import { ApplicationConfig } from '@angular/core';\nimport { provideAnimations } from '@angular/platform-browser/animations';\n\nexport const appConfig: ApplicationConfig = {\n  providers: [\n    provideAnimations(),\n  ],\n};\n",
  );

  const tree = await runner.runSchematic('ng-add', {}, app);
  const replacements = angularJson(tree).projects.shop.architect.build.configurations.production.fileReplacements;
  assert.equal(replacements.length, 2);
  assert.deepEqual(replacements[0], { replace: 'a.ts', with: 'b.ts' });
  const config = tree.readText('src/app/app.config.ts');
  assert.ok(config.indexOf('...bugButlerProviders') < config.indexOf('provideAnimations()'));
});

test('does not fail without an app.config.ts', async () => {
  const app = await newApp();
  app.delete('src/app/app.config.ts');
  app.overwrite('src/main.ts', 'console.log("custom bootstrap");\n');
  const tree = await runner.runSchematic('ng-add', {}, app);
  assert.ok(tree.exists('src/app/bug-butler.providers.ts'));
  assert.ok(tree.exists('src/app/bug-butler.providers.prod.ts'));
});

test('rejects an unknown project', async () => {
  await assert.rejects(runner.runSchematic('ng-add', { project: 'nope' }, await newApp()), /does not exist/);
});
