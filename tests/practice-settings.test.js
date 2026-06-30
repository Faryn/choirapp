const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const code = fs.readFileSync('web/vendor/choir/practice-settings.js', 'utf8');

function loadSettings(initial = {}) {
  const storage = new Map(Object.entries(initial));
  const window = {};
  const localStorage = {
    getItem: (key) => storage.get(key) || null,
    setItem: (key, value) => storage.set(key, String(value)),
  };
  const context = {
    window,
    localStorage,
    console,
    Date: { now: () => 123456 },
    JSON,
    Object,
  };
  window.window = window;
  vm.createContext(context);
  vm.runInContext(code, context);
  return { settings: window.ChoirPracticeSettings, storage };
}

{
  const { settings } = loadSettings({
    'choir-app-practice-settings-v1': JSON.stringify({
      './repertoire.json': { song: 'Africa', trackUrl: 'a.mp3' },
      'data/repertoire/02_Aliento/repertoire.json': { song: 'amarantine', trackUrl: 'x.mp3' },
    }),
  });
  assert.deepEqual(settings.read({
    repertoireUrl: './repertoire.json',
    defaultRepertoireUrl: './repertoire.json',
  }), { song: 'Africa', trackUrl: 'a.mp3' });
  assert.deepEqual(settings.read({
    repertoireUrl: 'data/repertoire/02_Aliento/repertoire.json',
    defaultRepertoireUrl: './repertoire.json',
  }), { song: 'amarantine', trackUrl: 'x.mp3' });
}

{
  const { settings } = loadSettings({
    'choir-app-last-selection-v1': JSON.stringify({ song: 'Legacy', trackUrl: 'legacy.mp3' }),
  });
  assert.deepEqual(settings.read({
    repertoireUrl: './repertoire.json',
    defaultRepertoireUrl: './repertoire.json',
  }), { song: 'Legacy', trackUrl: 'legacy.mp3' });
  assert.equal(settings.read({
    repertoireUrl: 'data/repertoire/02_Aliento/repertoire.json',
    defaultRepertoireUrl: './repertoire.json',
  }), null);
}

{
  const { settings, storage } = loadSettings();
  assert.equal(settings.write({
    repertoireUrl: 'data/repertoire/02_Aliento/repertoire.json',
    defaultRepertoireUrl: './repertoire.json',
    song: 'incayuyo',
    group: 'main',
    file: { url: 'alto.mp3', name: 'Alto' },
    playbackRate: 0.85,
    loopEnabled: false,
  }), true);
  const saved = JSON.parse(storage.get('choir-app-practice-settings-v1'));
  assert.deepEqual(saved['data/repertoire/02_Aliento/repertoire.json'], {
    song: 'incayuyo',
    group: 'main',
    trackUrl: 'alto.mp3',
    trackName: 'Alto',
    savedAt: 123456,
    playbackRate: 0.85,
    loopEnabled: false,
  });
}

{
  const { settings } = loadSettings();
  assert.equal(settings.write({
    repertoireUrl: './repertoire.json',
    defaultRepertoireUrl: './repertoire.json',
    song: '',
    file: { url: 'a.mp3', name: 'A' },
  }), false);
}

console.log('practice-settings tests ok');
