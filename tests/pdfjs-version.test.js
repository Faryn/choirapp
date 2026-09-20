const assert = require('node:assert/strict');
const fs = require('node:fs');

const expectedVersion = '6.2.108';
const viewer = fs.readFileSync('web/vendor/pdfjs/pdf.min.mjs', 'utf8');
const worker = fs.readFileSync('web/vendor/pdfjs/pdf.worker.min.mjs', 'utf8');
const integration = fs.readFileSync('web/vendor/choir/pdf-viewer.js', 'utf8');

assert.match(viewer, new RegExp(expectedVersion.replaceAll('.', '\\.')));
assert.match(worker, new RegExp(expectedVersion.replaceAll('.', '\\.')));
assert.match(integration, new RegExp(`PDFJS_VERSION = '${expectedVersion}'`));
assert.match(integration, /pdf\.worker\.min\.mjs\?v=\$\{PDFJS_VERSION\}/);

console.log(`pdfjs ${expectedVersion} vendor pair verified`);
