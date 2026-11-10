const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const code = fs.readFileSync('web/vendor/choir/rehearsal-layout.js', 'utf8');
let height = 216.25;
let observed;
let resizeCallback;
let focused = false;
const events = {};
const properties = {};
const panel = { getBoundingClientRect: () => ({ height }) };
const summary = { focus: () => { focused = true; } };
const settings = { open: false, contains: node => node === summary, querySelector: () => summary };
const context = {
  document: {
    querySelector: () => panel,
    getElementById: () => settings,
    documentElement: { style: { setProperty: (key, value) => { properties[key] = value; } } },
    addEventListener: (name, fn) => { events[name] = fn; },
  },
  window: { addEventListener: (name, fn) => { events[`window:${name}`] = fn; } },
  ResizeObserver: class {
    constructor(callback) { resizeCallback = callback; }
    observe(element) { observed = element; }
  },
};
vm.runInNewContext(code, context);
assert.equal(observed, panel);
assert.equal(properties['--player-height'], '217px');
height = 304;
resizeCallback();
assert.equal(properties['--player-height'], '304px', 'expanded controls must not obscure the score');
height = 200;
events['window:resize']();
assert.equal(properties['--player-height'], '200px', 'score space must follow orientation changes');

settings.open = true;
events.pointerdown({ target: summary });
assert.equal(settings.open, true, 'clicking within settings must not close it');
events.pointerdown({ target: {} });
assert.equal(settings.open, false, 'outside click should dismiss settings');
settings.open = true;
events.keydown({ key: 'Enter' });
assert.equal(settings.open, true);
events.keydown({ key: 'Escape' });
assert.equal(settings.open, false);
assert.equal(focused, true, 'Escape should return keyboard focus to the settings trigger');

vm.runInNewContext(code, { document: { querySelector: () => null, getElementById: () => null } });
console.log('rehearsal layout ok');
