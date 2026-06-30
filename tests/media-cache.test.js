const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const code = fs.readFileSync('web/vendor/choir/media-cache.js', 'utf8');

const window = {};
const context = {
  window,
  console,
  indexedDB: {
    open() {
      throw new Error('indexedDB operations are browser-smoke covered');
    },
  },
  Date,
  Math,
  Number,
  Object,
};
window.window = window;
vm.createContext(context);
vm.runInContext(code, context);

const cache = window.ChoirMediaCache;
assert.equal(cache.AUDIO_STORE, 'audio-files');
assert.equal(cache.PDF_STORE, 'score-pdfs');
assert.equal(cache.recordSize({ byteLength: 12, arrayBuffer: { byteLength: 99 } }), 12);
assert.equal(cache.recordSize({ arrayBuffer: { byteLength: 99 } }), 99);
assert.equal(cache.recordSize({}), 0);
assert.equal(typeof cache.getAudio, 'function');
assert.equal(typeof cache.putAudio, 'function');
assert.equal(typeof cache.getPdf, 'function');
assert.equal(typeof cache.putPdf, 'function');

console.log('media-cache tests ok');
