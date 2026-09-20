const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function loadController() {
  const context = { window: {}, console, URL };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync('web/vendor/choir/playback-controller.js', 'utf8'), context);
  return context.window.ChoirPlaybackController;
}

function fakeContext() {
  const createdSources = [];
  const context = {
    currentTime: 10,
    destination: {},
    createBufferSource() {
      const source = {
        connectCalls: [],
        connect(node) { this.connectCalls.push(node); },
        disconnect() { this.disconnected = true; },
        start(when, offset) { this.started = { when, offset }; },
        stop() { this.stopped = true; },
      };
      createdSources.push(source);
      return source;
    },
    createGain() {
      return {
        gain: {
          value: 0,
          cancelScheduledValues() {},
          setValueAtTime(value) { this.value = value; },
          linearRampToValueAtTime(value) { this.value = value; },
        },
        connect() {},
        disconnect() {},
      };
    },
    createChannelSplitter() { return { connect() {}, disconnect() {} }; },
    createChannelMerger() { return { connect() {}, disconnect() {} }; },
  };
  return { context, createdSources };
}

const { createPlaybackController } = loadController();
const { context, createdSources } = fakeContext();
const tracks = [
  { buffer: { duration: 120 } },
  { buffer: { duration: 120 } },
];
let currentTrackIndex = 0;
let started = null;
let stopped = 0;
const controller = createPlaybackController({
  ctx: context,
  nativeAudio: { src: '', pause() {}, play: async () => {} },
  getTracks: () => tracks,
  getCurrentTrackIndex: () => currentTrackIndex,
  setCurrentTrackIndex: (idx) => { currentTrackIndex = idx; },
  getPlaybackRate: () => 1,
  getChannelMix: () => 'stereo',
  getTrackFile: () => ({ url: 'track.mp3', fingerprint: '1' }),
  toTrackTime: (seconds) => seconds,
  fromTrackTime: (seconds) => seconds,
  safeTrackOffset: (seconds) => seconds,
  getDuration: () => 120,
  cacheBustedUrl: (url) => url,
  browserSafeUrl: (url) => url,
  onStarted: (event) => { started = event; },
  onStopped: () => { stopped += 1; },
});

assert.equal(controller.playFrom(12), true);
assert.equal(started.mode, 'web-audio');
assert.equal(started.playbackRate, 1);
assert.equal(createdSources.length, 2);
assert.equal(createdSources[0].started.offset, 12);
context.currentTime = 14;
assert.equal(controller.currentPosition({ isPlaying: true, pausedAt: 0 }), 15.98);

controller.setActiveTrack(1, 0.01);
assert.equal(currentTrackIndex, 1);
controller.stop();
assert.equal(stopped >= 2, true, 'playback is stopped before a replacement source is started and when explicitly stopped');
assert.equal(createdSources.every((source) => source.stopped), true);

console.log('playback-controller tests ok');
