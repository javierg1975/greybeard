// greybeard's ESLint layer: the project's own flat config (if any), then
// greybeard's functional rules on top. Plugins resolve from the project first.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.env.GREYBEARD_ROOT || process.cwd();
const here = path.dirname(new URL(import.meta.url).pathname);

async function load(pkg) {
  for (const base of [root, here]) {
    try {
      return (await import(pathToFileURL(createRequire(path.join(base, 'noop.js')).resolve(pkg)).href)).default;
    } catch { /* try the next base */ }
  }
  throw new Error(`greybeard check needs ${pkg}: npm i -D ${pkg} in the project or in greybeard`);
}

async function projectConfig() {
  for (const name of ['eslint.config.js', 'eslint.config.mjs', 'eslint.config.cjs']) {
    const file = path.join(root, name);
    if (fs.existsSync(file)) return [(await import(pathToFileURL(file).href)).default].flat();
  }
  return [];
}

const tseslint = await load('typescript-eslint');
const base = await projectConfig();
// ESLint rejects a second, different object under a plugin name the project already registered.
const registered = name => base.find(c => c?.plugins?.[name])?.plugins[name];

export default [
  ...base,
  {
    files: ['**/*.{ts,tsx,mts,cts}'],
    languageOptions: { parser: tseslint.parser, parserOptions: { projectService: true, tsconfigRootDir: root } },
    plugins: {
      functional: registered('functional') ?? (await load('eslint-plugin-functional')),
      '@typescript-eslint': registered('@typescript-eslint') ?? tseslint.plugin,
    },
    rules: {
      'functional/no-let': 'error',
      'functional/immutable-data': 'error',
      'functional/no-throw-statements': 'error',
      'functional/no-loop-statements': 'error',
      '@typescript-eslint/switch-exhaustiveness-check': 'error',
    },
  },
];
