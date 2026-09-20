const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const code = fs.readFileSync('web/vendor/choir/audio-engine.js', 'utf8');

const window = {};
const context = {
  window,
  Math,
  Number,
  Object,
};
window.window = window;
vm.createContext(context);
vm.runInContext(code, context);

const audio = window.ChoirAudioEngine;

function fakeBuffer(samples, sampleRate = 1000) {
  return {
    duration: samples.length / sampleRate,
    sampleRate,
    getChannelData: () => Float32Array.from(samples),
  };
}

{
  const buffer = fakeBuffer([
    ...Array(3000).fill(0),
    ...Array(4000).fill(0.25),
    ...Array(3000).fill(0),
  ]);
  const active = audio.detectActiveRange(buffer);
  assert.equal(active.start >= 0, true);
  assert.equal(active.start < 3.1, true);
  assert.equal(active.end > 6.8, true);
  assert.equal(active.end <= 10, true);
}

{
  const track = { buffer: { duration: 110 }, activeStart: 10, activeEnd: 100 };
  assert.equal(audio.shouldActiveRangeAlignTrack({
    enabled: true,
    track,
    refDurationSec: 100,
    sameTimelineToleranceSec: 3,
  }), true);
  assert.equal(audio.shouldActiveRangeAlignTrack({
    enabled: true,
    track: { buffer: { duration: 101 } },
    refDurationSec: 100,
    sameTimelineToleranceSec: 3,
  }), false);
}

{
  const track = { buffer: { duration: 110 }, activeStart: 10, activeEnd: 100 };
  const trackTime = audio.toTrackTime({
    masterSec: 50,
    track,
    offsetSec: 0.25,
    shouldAlign: true,
    refDurationSec: 100,
    refActiveStartSec: 0,
    refActiveEndSec: 100,
  });
  assert.equal(trackTime, 55.25);

  const masterTime = audio.fromTrackTime({
    trackSec: trackTime,
    track,
    offsetSec: 0.25,
    shouldAlign: true,
    duration: 100,
    refDurationSec: 100,
    refActiveStartSec: 0,
    refActiveEndSec: 100,
  });
  assert.equal(masterTime, 50);
  assert.equal(audio.safeTrackOffset(999, track), 109.999);
}

console.log('audio-engine tests ok');
