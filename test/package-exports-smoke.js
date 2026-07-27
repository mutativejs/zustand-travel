import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = require(resolve(packageRoot, 'package.json'));
const { createStore } = require('zustand/vanilla');

assert.equal(manifest.main, './dist/index.cjs');
assert.equal(manifest.module, './dist/index.esm.js');
assert.equal(manifest.types, './dist/index.d.ts');
assert.equal(
  existsSync(resolve(packageRoot, 'dist/index.js')),
  false,
  'TypeScript build input must not be published'
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

console.log('Verified zustand-travel CommonJS and ESM package entries.');
