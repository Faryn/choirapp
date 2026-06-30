const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const code = fs.readFileSync('web/vendor/choir/repertoire-data.js', 'utf8');

function loadHelper(fetchImpl) {
  const window = {};
  const context = {
    window,
    console,
    fetch: fetchImpl,
    Object,
    Set,
    String,
  };
  window.window = window;
  vm.createContext(context);
  vm.runInContext(code, context);
  return window.ChoirRepertoireData;
}

function okJson(value) {
  return {
    ok: true,
    json: async () => value,
  };
}

function notFound() {
  return {
    ok: false,
    json: async () => {
      throw new Error('unexpected json read');
    },
  };
}

(async () => {
  assert.equal(loadHelper().songSlug('Nur ein Wort'), 'nur-ein-wort');
  assert.equal(loadHelper().songSlug('Àliento!'), 'aliento');

  {
    const helper = loadHelper(async (url) => {
      assert.equal(url, 'assets/waveforms/africa.json');
      return okJson({ 'africa-a.mp3': { duration: 1 } });
    });
    const result = await helper.loadSongWaveforms({
      song: { song: 'Africa', files: [{ url: 'africa-a.mp3' }] },
      assetUrl: (path) => `assets/${path}`,
      aggregateCache: null,
    });
    assert.deepEqual(result.waveformCache, { 'africa-a.mp3': { duration: 1 } });
    assert.equal(result.aggregateCache, null);
  }

  {
    const calls = [];
    const helper = loadHelper(async (url) => {
      calls.push(url);
      if (url.endsWith('thank-you.json')) return notFound();
      return okJson({
        'keep.mp3': { duration: 2 },
        'ignore.mp3': { duration: 3 },
      });
    });
    const result = await helper.loadSongWaveforms({
      song: { song: 'Thank You', files: [{ url: 'keep.mp3' }] },
      assetUrl: (path) => `assets/${path}`,
      aggregateCache: null,
    });
    assert.deepEqual(calls, ['assets/waveforms/thank-you.json', 'assets/waveforms.json']);
    assert.deepEqual(result.waveformCache, { 'keep.mp3': { duration: 2 } });
    assert.deepEqual(result.aggregateCache, {
      'keep.mp3': { duration: 2 },
      'ignore.mp3': { duration: 3 },
    });
  }

  {
    const helper = loadHelper(async () => okJson({ stale: true }));
    const result = await helper.loadSongWaveforms({
      song: { song: 'Africa', files: [] },
      assetUrl: (path) => path,
      aggregateCache: null,
      shouldUseResult: () => false,
    });
    assert.equal(result, null);
  }

  console.log('repertoire-data tests ok');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
