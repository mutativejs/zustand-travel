import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = require(resolve(packageRoot, 'package.json'));
const { createStore } = require('zustand/vanilla');
const ts = require('typescript');

assert.equal(manifest.main, './dist/index.cjs');
assert.equal(manifest.module, './dist/index.esm.js');
assert.equal(manifest.types, './dist/index.d.ts');
assert.equal(
  existsSync(resolve(packageRoot, 'dist/index.js')),
  false,
  'TypeScript build input must not be published'
);

const typeConsumerPath = resolve(packageRoot, '__package-type-consumer__.ts');
const typeConsumerSource = `
import type { TravelsWarning, TravelsWarningCode } from 'zustand-travel';

const code: TravelsWarningCode = 'POSITION_CLAMPED';
const warning: TravelsWarning = { code, message: 'Position was clamped.' };
void warning;
`;
const compilerOptions = {
  module: ts.ModuleKind.NodeNext,
  moduleResolution: ts.ModuleResolutionKind.NodeNext,
  target: ts.ScriptTarget.ES2022,
  strict: true,
  noEmit: true,
  skipLibCheck: true,
};
const compilerHost = ts.createCompilerHost(compilerOptions);
const readFile = compilerHost.readFile.bind(compilerHost);
const fileExists = compilerHost.fileExists.bind(compilerHost);

compilerHost.fileExists = (fileName) =>
  fileName === typeConsumerPath || fileExists(fileName);
compilerHost.readFile = (fileName) =>
  fileName === typeConsumerPath ? typeConsumerSource : readFile(fileName);
compilerHost.getSourceFile = (fileName, languageVersion) => {
  const source = compilerHost.readFile(fileName);
  return source === undefined
    ? undefined
    : ts.createSourceFile(fileName, source, languageVersion, true);
};

const typeDiagnostics = ts.getPreEmitDiagnostics(
  ts.createProgram([typeConsumerPath], compilerOptions, compilerHost)
);
assert.equal(
  typeDiagnostics.length,
  0,
  ts.formatDiagnostics(typeDiagnostics, {
    getCanonicalFileName: (fileName) => fileName,
    getCurrentDirectory: () => packageRoot,
    getNewLine: () => '\n',
  })
);

const exercisePackage = (api, label) => {
  assert.equal(typeof api.travel, 'function', `${label} named export`);
  assert.equal(typeof api.default, 'function', `${label} default export`);

  const store = createStore(
    api.travel((set) => ({
      count: 0,
      increment: () =>
        set((state) => {
          state.count += 1;
        }),
    }))
  );

  store.getState().increment();
  assert.equal(store.getState().count, 1, `${label} update`);
  store.getControls().back();
  assert.equal(store.getState().count, 0, `${label} undo`);
};

exercisePackage(require(packageRoot), 'CommonJS legacy main entry');
exercisePackage(require('zustand-travel'), 'CommonJS exports entry');
exercisePackage(await import('zustand-travel'), 'ESM package entry');

console.log(
  'Verified zustand-travel CommonJS, ESM, and TypeScript package entries.'
);
