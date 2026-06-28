const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const code = fs.readFileSync('web/vendor/choir/url-policy.js', 'utf8');

function loadPolicy(search = '') {
  const window = {
    location: {
      href: 'http://127.0.0.1:5175/',
      origin: 'http://127.0.0.1:5175',
      search,
    },
  };
  const context = {
    window,
    console,
    URL,
    URLSearchParams,
    Object,
    String,
    decodeURIComponent,
    encodeURIComponent,
  };
  window.window = window;
  vm.createContext(context);
  vm.runInContext(code, context);
  return window.ChoirUrlPolicy;
}

const cases = [
  ['', './repertoire.json'],
  ['?r=aliento', 'data/repertoire/02_Aliento/repertoire.json'],
  ['?songs=data/repertoire/02_Test_Repertoire', 'data/repertoire/02_Test_Repertoire/repertoire.json'],
  ['?repertoire=data/repertoire/02_Test_Repertoire/repertoire.json', 'data/repertoire/02_Test_Repertoire/repertoire.json'],
  ['?repertoire=https://example.invalid/repertoire.json', './repertoire.json'],
  ['?songs=../secret', './repertoire.json'],
  ['?songs=data/repertoire/../secret', './repertoire.json'],
];

for (const [search, expected] of cases) {
  const policy = loadPolicy(search);
  assert.equal(policy.repertoireUrlFromLocation(search), expected, search);
}

{
  const policy = loadPolicy();
  assert.equal(
    policy.repertoireAssetUrl('data/repertoire/02_Test_Repertoire/repertoire.json', 'waveforms.json'),
    'data/repertoire/02_Test_Repertoire/waveforms.json',
  );
  assert.equal(
    policy.cacheBustedUrl('data/repertoire/song with spaces.mp3', '123-456'),
    'data/repertoire/song%20with%20spaces.mp3?v=123-456',
  );
  assert.equal(
    policy.browserSafeUrl(policy.cacheBustedUrl('data/repertoire/song with spaces.mp3', '123-456')),
    'data/repertoire/song%20with%20spaces.mp3?v=123-456',
  );
  assert.equal(
    policy.browserSafeUrl('data/repertoire/song%20with%20spaces.mp3?v=123-456'),
    'data/repertoire/song%20with%20spaces.mp3?v=123-456',
  );
}

console.log('url-policy tests ok');
