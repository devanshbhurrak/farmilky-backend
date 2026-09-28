/**
 * patch-mongoose.cjs
 *
 * Adds a package.json `exports` map to mongoose so that Wrangler/esbuild
 * resolves the Node.js entry (./index.js) for Cloudflare Workers instead of
 * the browser bundle (./dist/browser.umd.js).
 *
 * Mongoose 8.x has no `exports` field — esbuild falls back to the `browser`
 * field and picks browser.umd.js, which crashes Workers with:
 *   TypeError: {(intermediate value)}.emitWarning is not a function
 *
 * The exports map inserted here tells esbuild:
 *   workerd condition  → ./index.js  (Cloudflare Workers)
 *   node condition     → ./index.js  (Node.js)
 *   browser condition  → ./dist/browser.umd.js  (preserved for real browsers)
 *   default            → ./index.js
 *
 * This script runs via the `postinstall` npm lifecycle hook so it applies
 * automatically after every `npm install` or `npm clean-install` — including
 * in CI — without requiring edits to node_modules to be committed.
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const pkgPath = path.resolve(__dirname, '..', 'node_modules', 'mongoose', 'package.json');

if (!fs.existsSync(pkgPath)) {
  console.log('[patch-mongoose] node_modules/mongoose/package.json not found — skipping.');
  process.exit(0);
}

const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

if (pkg.exports) {
  console.log('[patch-mongoose] exports already present — skipping.');
  process.exit(0);
}

pkg.exports = {
  '.': {
    workerd: './index.js',
    node:    './index.js',
    browser: './dist/browser.umd.js',
    default: './index.js',
  },
};

fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
console.log('[patch-mongoose] Added exports map (workerd/node → index.js, browser → browser.umd.js).');
