const assert = require('node:assert/strict');
const fs = require('node:fs');

const code = fs.readFileSync('web/index.html', 'utf8');
const playbackController = fs.readFileSync('web/vendor/choir/playback-controller.js', 'utf8');

assert.match(code, /id="channelMixSelect"/);
assert.match(code, /<option value="left-both">Left → both<\/option>/);
assert.match(code, /<option value="right-both">Right → both<\/option>/);
assert.match(code, /function updateChannelMixAvailability\(\)/);
assert.match(code, /const supported = playbackRate === 1;/);
assert.match(code, /Stereo playback only below 100% tempo/);
assert.match(playbackController, /ctx\.createChannelSplitter\(2\)/);
assert.match(playbackController, /ctx\.createChannelMerger\(2\)/);

console.log('channel mix tests ok');
