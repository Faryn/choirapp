const assert = require('node:assert/strict');

const baseUrl = new URL(process.env.CHOIR_TEST_URL || 'http://127.0.0.1:5175/');

function appUrl(path) {
  return new URL(path, baseUrl).href;
}

async function get(path) {
  const response = await fetch(appUrl(path), { cache: 'no-store' });
  assert.equal(response.ok, true, `${path} returned ${response.status}`);
  return response;
}

(async () => {
  const index = await get('');
  assert.match(index.headers.get('content-security-policy') || '', /default-src 'self'/);
  assert.equal(index.headers.get('referrer-policy'), 'same-origin');
  assert.equal(index.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(index.headers.get('x-frame-options'), 'DENY');

  const html = await index.text();
  assert.match(html, /vendor\/choir\/url-policy\.js\?v=20260628-2/);
  assert.doesNotMatch(html, /%2520/);
  const alignTolerance = Number(html.match(/const sameTimelineToleranceSec = ([0-9.]+)/)?.[1] || 0);
  assert.equal(alignTolerance >= 3, true, 'same-timeline alignment tolerance should cover short export tails');

  const helper = await get('vendor/choir/url-policy.js?v=20260628-2');
  assert.match(helper.headers.get('cache-control') || '', /no-cache/);
  assert.match(await helper.text(), /ChoirUrlPolicy/);

  const manifest = await get('repertoire.json');
  const repertoire = await manifest.json();
  const africa = repertoire.find((entry) => entry.song === 'Africa');
  assert.ok(africa?.score?.url, 'Africa score missing from repertoire');
  assert.doesNotMatch(africa.score.url, /%2520/);
  const waveforms = await (await get('waveforms/africa.json')).json();
  const waveformFor = (name) => Object.entries(waveforms).find(([url]) => url.endsWith(name))?.[1];
  const alto = waveformFor('TM Africa - A.mp3');
  const bass = waveformFor('TM Africa - B.mp3');
  assert.ok(alto?.duration && bass?.duration, 'Africa Alto/Bass waveform metadata missing');
  const altoBassTailDiff = Math.abs(alto.duration - bass.duration);
  assert.equal(altoBassTailDiff > 0.25, true, 'Africa timing guard should cover a real tail difference');
  assert.equal(altoBassTailDiff < alignTolerance, true, 'Africa Alto/Bass should not be stretched against each other');

  const alientoPage = await get('?r=aliento');
  assert.match(await alientoPage.text(), /vendor\/choir\/url-policy\.js\?v=20260628-2/);

  const alientoManifest = await get('data/repertoire/02_Aliento/repertoire.json');
  const aliento = await alientoManifest.json();
  assert.deepEqual(aliento.map((entry) => entry.song).sort(), ['amarantine', 'incayuyo']);
  for (const entry of aliento) {
    assert.equal(entry.files.length > 0, true, `${entry.song} has no tracks`);
    assert.ok(entry.score?.url, `${entry.song} has no score`);
    assert.match(entry.score.url, /^data\/repertoire\/02_Aliento\//);
    assert.doesNotMatch(entry.score.url, /%2520/);
  }

  console.log(`http contract ok: ${baseUrl.href}`);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
