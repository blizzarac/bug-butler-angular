import { Rule, SchematicContext, SchematicsException, Tree, chain } from '@angular-devkit/schematics';
import { getWorkspace, updateWorkspace } from '@schematics/angular/utility/workspace';

export interface NgAddOptions {
  project?: string;
  endpoint?: string;
}

const PROVIDERS = 'bug-butler.providers';
const EXPORT_NAME = 'bugButlerProviders';
const SCRIPT_NAME = 'check:bug-butler';

/**
 * `ng add bug-butler-angular`: puts the provider in its own file, adds an empty twin for production,
 * swaps them with `fileReplacements`, registers the provider and adds a script that verifies the build.
 */
export function ngAdd(options: NgAddOptions): Rule {
  return async (tree: Tree, context: SchematicContext) => {
    const workspace = await getWorkspace(tree);
    const projectName = resolveProject(workspace, options.project);
    const project = workspace.projects.get(projectName)!;
    const build = project.targets.get('build');
    const buildOptions = (build?.options ?? {}) as Record<string, unknown>;
    const sourceRoot = project.sourceRoot ?? join(project.root, 'src');

    const appConfigPath = findAppConfig(tree, buildOptions, sourceRoot);
    const dir = appConfigPath ? dirname(appConfigPath) : join(sourceRoot, 'app');
    const devFile = join(dir, `${PROVIDERS}.ts`);
    const prodFile = join(dir, `${PROVIDERS}.prod.ts`);

    createFile(tree, context, devFile, devProviders(options.endpoint || '/api/bug-reports'));
    createFile(tree, context, prodFile, PROD_PROVIDERS);

    if (appConfigPath) registerProvider(tree, context, appConfigPath);
    else {
      context.logger.warn(
        `No app.config.ts found for "${projectName}". Add \`...${EXPORT_NAME}\` (from './${PROVIDERS}') to the providers of your bootstrapApplication call yourself.`,
      );
    }

    addScript(tree, context, SCRIPT_NAME, `bug-butler-angular-check ${outputDir(projectName, build?.builder, buildOptions)}`);

    return chain([addFileReplacement(projectName, devFile, prodFile)]);
  };
}

function resolveProject(workspace: Awaited<ReturnType<typeof getWorkspace>>, requested?: string): string {
  if (requested) {
    if (!workspace.projects.has(requested)) throw new SchematicsException(`Project "${requested}" does not exist.`);
    return requested;
  }
  const preferred = workspace.extensions['defaultProject'];
  if (typeof preferred === 'string' && workspace.projects.has(preferred)) return preferred;
  for (const [name, project] of workspace.projects) {
    if (project.extensions['projectType'] === 'application') return name;
  }
  throw new SchematicsException('No application project found. Pass one with --project.');
}

/** The file that exports the `ApplicationConfig`, found through main.ts, falling back to app/app.config.ts. */
function findAppConfig(tree: Tree, buildOptions: Record<string, unknown>, sourceRoot: string): string | undefined {
  const main = (buildOptions['browser'] ?? buildOptions['main']) as string | undefined;
  const mainSource = main && tree.exists(main) ? tree.readText(main) : '';
  const imported = /import\s*{[^}]*\bappConfig\b[^}]*}\s*from\s*['"](\.[^'"]*)['"]/.exec(mainSource);
  const candidates = [
    ...(imported && main ? [join(dirname(main), imported[1]) + '.ts'] : []),
    join(sourceRoot, 'app', 'app.config.ts'),
  ];
  return candidates.find((path) => tree.exists(path));
}

function createFile(tree: Tree, context: SchematicContext, path: string, content: string): void {
  if (tree.exists(path)) {
    context.logger.info(`Skipped ${path}: it already exists.`);
    return;
  }
  tree.create(path, content);
}

function registerProvider(tree: Tree, context: SchematicContext, path: string): void {
  let source = tree.readText(path);
  if (source.includes(EXPORT_NAME)) {
    context.logger.info(`Skipped ${path}: ${EXPORT_NAME} is already registered.`);
    return;
  }
  const providers = /providers\s*:\s*\[(\s*\n)?([ \t]*)/.exec(source);
  if (!providers) {
    context.logger.warn(`Could not find a providers array in ${path}. Add \`...${EXPORT_NAME}\` to it yourself.`);
    return;
  }
  // First in the list, so providers you add after it (a custom transport, say) win.
  const end = providers.index + providers[0].length;
  const empty = source.slice(end).trimStart().startsWith(']');
  const insertion = providers[1] ? `...${EXPORT_NAME},\n${providers[2]}` : `...${EXPORT_NAME}${empty ? '' : ', '}`;
  source = source.slice(0, end) + insertion + source.slice(end);

  const importLine = `import { ${EXPORT_NAME} } from './${PROVIDERS}';\n`;
  const imports = [...source.matchAll(/^import[\s\S]*?from\s+['"][^'"]+['"];?[ \t]*\r?\n/gm)];
  const last = imports[imports.length - 1];
  const at = last ? last.index! + last[0].length : 0;
  tree.overwrite(path, source.slice(0, at) + importLine + source.slice(at));
}

function addFileReplacement(projectName: string, devFile: string, prodFile: string): Rule {
  return (_tree, context) =>
    updateWorkspace((workspace) => {
      const build = workspace.projects.get(projectName)?.targets.get('build');
      const production = build?.configurations?.['production'] as Record<string, unknown> | undefined;
      if (!build || !production) {
        context.logger.warn(
          `"${projectName}" has no production build configuration. Add this to the build configuration you ship to production:\n` +
            `  "fileReplacements": [{ "replace": "${devFile}", "with": "${prodFile}" }]`,
        );
        return;
      }
      const replacements = (production['fileReplacements'] ?? []) as { replace: string; with: string }[];
      if (replacements.some((r) => r.replace === devFile)) return;
      production['fileReplacements'] = [...replacements, { replace: devFile, with: prodFile }];
    });
}

function addScript(tree: Tree, context: SchematicContext, name: string, command: string): void {
  if (!tree.exists('package.json')) return;
  const pkg = JSON.parse(tree.readText('package.json'));
  pkg.scripts ??= {};
  if (pkg.scripts[name]) {
    context.logger.info(`Skipped the "${name}" script: it already exists.`);
    return;
  }
  pkg.scripts[name] = command;
  tree.overwrite('package.json', JSON.stringify(pkg, null, 2) + '\n');
}

/** Where `ng build` puts the browser bundles. */
function outputDir(projectName: string, builder: string | undefined, options: Record<string, unknown>): string {
  const configured = options['outputPath'];
  const esbuild = !!builder && /:(application|browser-esbuild)$/.test(builder);
  if (typeof configured === 'string') return esbuild ? join(configured, 'browser') : configured;
  if (configured && typeof configured === 'object') {
    const { base, browser } = configured as { base?: string; browser?: string };
    return join(base ?? `dist/${projectName}`, browser ?? 'browser');
  }
  return esbuild ? `dist/${projectName}/browser` : `dist/${projectName}`;
}

function join(...parts: string[]): string {
  return parts
    .filter((p) => p !== '')
    .join('/')
    .replace(/\/+/g, '/')
    .split('/')
    .reduce<string[]>((out, part) => {
      if (part === '..') out.pop();
      else if (part !== '.') out.push(part);
      return out;
    }, [])
    .join('/');
}

function dirname(path: string): string {
  const i = path.lastIndexOf('/');
  return i < 0 ? '' : path.slice(0, i);
}

function devProviders(endpoint: string): string {
  return `import type { EnvironmentProviders } from '@angular/core';
import { provideBugButler } from 'bug-butler-angular';

// Bug Butler for non-production environments.
// The production build swaps this file for bug-butler.providers.prod.ts (see "fileReplacements" in angular.json),
// so the widget is not in the production bundle. Check it with \`npm run ${SCRIPT_NAME}\` after \`ng build\`.
export const ${EXPORT_NAME}: EnvironmentProviders[] = [
  provideBugButler({
    enabled: true,
    // Optional second gate if the same build is deployed to several environments:
    // allowedHosts: ['localhost', /\\.test\\.example\\.com$/],
    endpoint: '${endpoint}',
  }),
];
`;
}

const PROD_PROVIDERS = `import type { EnvironmentProviders } from '@angular/core';

// Replaces bug-butler.providers.ts in the production build. Keep it free of imports from the library, or it ends up in the bundle.
export const ${EXPORT_NAME}: EnvironmentProviders[] = [];
`;
