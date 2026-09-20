const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const code = fs.readFileSync('web/vendor/choir/media-session.js', 'utf8');

const calls = [];
const handlers = {};
const mediaSession = {
  playbackState: 'none',
  metadata: null,
  setPositionState: (state) => calls.push(['position', state]),
  setActionHandler: (action, handler) => { handlers[action] = handler; },
};

function MediaMetadata(data) {
  this.data = data;
}

const window = {
  navigator: { mediaSession },
  MediaMetadata,
  setTimeout: (fn) => {
    fn();
    return 1;
  },
  clearTimeout: () => {},
};
const context = {
  window,
  navigator: window.navigator,
  console,
  Math,
  Number,
  Object,
  Boolean,
  Promise,
};
window.window = window;
vm.createContext(context);
vm.runInContext(code, context);

let playing = false;
let position = 12;
const seeks = [];
const controller = window.ChoirMediaSession.createMediaSessionController({
  navigatorRef: window.navigator,
  windowRef: window,
  getTitle: () => 'Africa',
  getArtist: () => 'Alto',
  getDuration: () => 180,
  getPosition: () => position,
  getPlaybackRate: () => 0.85,
  isPlaying: () => playing,
  onPlay: () => { playing = true; },
  onPause: () => { playing = false; },
  onStop: () => { playing = false; position = 0; },
  onSeek: (seconds) => seeks.push(seconds),
  setTimeoutFn: window.setTimeout,
  clearTimeoutFn: window.clearTimeout,
});

assert.equal(controller.isSupported, true);
controller.updateMetadata();
assert.deepEqual(JSON.parse(JSON.stringify(mediaSession.metadata.data)), {
  title: 'Africa',
  artist: 'Alto',
  album: 'choir app',
});
assert.equal(mediaSession.playbackState, 'paused');
assert.deepEqual(JSON.parse(JSON.stringify(calls.at(-1))), ['position', { duration: 180, playbackRate: 0.85, position: 12 }]);

playing = true;
controller.updatePlaybackState();
assert.equal(mediaSession.playbackState, 'playing');

controller.setupHandlers();
handlers.seekbackward({ seekOffset: 7 });
handlers.seekforward({});
handlers.seekto({ seekTime: 42 });
assert.deepEqual(seeks, [5, 17, 42]);

controller.clearState();
assert.equal(calls.at(-1)[0], 'position');
assert.equal(calls.at(-1)[1], undefined);

console.log('media-session tests ok');
