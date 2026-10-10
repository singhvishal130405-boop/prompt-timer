// Validates the extension in src/ without any dependencies:
//   1. manifest.json is valid JSON with the expected basics
//   2. every file the manifest points to exists
//   3. every .js file passes a syntax check
//
// Usage: node .github/scripts/validate-extension.js

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const SRC = path.join(__dirname, '..', '..', 'src');
const errors = [];
const fail = (msg) => errors.push(msg);

function exists(rel, label) {
  if (!fs.existsSync(path.join(SRC, rel))) fail(`${label}: missing file "${rel}"`);
}

// 1. manifest
let manifest;
try {
  manifest = JSON.parse(fs.readFileSync(path.join(SRC, 'manifest.json'), 'utf8'));
} catch (e) {
  console.error('manifest.json is not valid JSON:', e.message);
  process.exit(1);
}
if (manifest.manifest_version !== 3) fail('manifest_version must be 3');
for (const key of ['name', 'version', 'description']) {
  if (!manifest[key]) fail(`manifest is missing "${key}"`);
}
if (manifest.version && !/^\d+(\.\d+){0,3}$/.test(manifest.version)) {
  fail(`version "${manifest.version}" is not a valid Chrome version string`);
}

// 2. referenced files
if (manifest.background && manifest.background.service_worker) {
  exists(manifest.background.service_worker, 'background.service_worker');
}
if (manifest.action && manifest.action.default_popup) {
  exists(manifest.action.default_popup, 'action.default_popup');
}
for (const cs of manifest.content_scripts || []) {
  for (const f of cs.js || []) exists(f, 'content_scripts.js');
  for (const f of cs.css || []) exists(f, 'content_scripts.css');
}
for (const f of Object.values(manifest.icons || {})) exists(f, 'icons');

// 3. JavaScript syntax
for (const file of fs.readdirSync(SRC).filter((f) => f.endsWith('.js'))) {
  try {
    execFileSync(process.execPath, ['--check', path.join(SRC, file)], { stdio: 'pipe' });
  } catch (e) {
    fail(`syntax error in ${file}:\n${e.stderr.toString()}`);
  }
}

if (errors.length) {
  console.error('Validation failed:\n- ' + errors.join('\n- '));
  process.exit(1);
}
console.log(`OK: ${manifest.name} v${manifest.version} passed all checks.`);
