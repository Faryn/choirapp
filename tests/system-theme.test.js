const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const code = fs.readFileSync('web/vendor/choir/system-theme.js', 'utf8');
let background = '#f4f2ed';
let metaColor;
let onPreferenceChange;
let repaintEvents = 0;
const preference = { addEventListener(name, callback) {
  assert.equal(name, 'change');
  onPreferenceChange = callback;
} };
vm.runInNewContext(code, {
  window: {
    matchMedia(query) { assert.equal(query, '(prefers-color-scheme: dark)'); return preference; },
    dispatchEvent(event) { assert.equal(event.type, 'choir-theme-change'); repaintEvents += 1; },
  },
  document: {
    documentElement: {},
    querySelector: () => ({ setAttribute(name, value) { assert.equal(name, 'content'); metaColor = value; } }),
  },
  getComputedStyle: () => ({ getPropertyValue: () => background }),
  Event,
});
assert.equal(metaColor, '#f4f2ed');
assert.equal(repaintEvents, 1);
background = '#1e1d1b';
onPreferenceChange();
assert.equal(metaColor, '#1e1d1b', 'browser chrome should update without reloading');
assert.equal(repaintEvents, 2, 'waveform repaint should be requested when appearance changes');
background = '#f4f2ed';
onPreferenceChange();
assert.equal(metaColor, '#f4f2ed');
assert.equal(repaintEvents, 3);

const baseCss = fs.readFileSync('web/vendor/choir/rehearsal.css', 'utf8');
const themeCss = fs.readFileSync('web/vendor/choir/system-theme.css', 'utf8');
const lightCss = baseCss + themeCss.split('@media')[0];
const darkCss = lightCss + themeCss.split('@media')[1];
function tokens(css) {
  return Object.fromEntries([...css.matchAll(/(--[\w-]+):\s*(#[\da-f]+)\s*;/gi)].map(match => [match[1], match[2].slice(1)]));
}
function luminance(hex) {
  const full = hex.length === 3 ? [...hex].map(c => c + c).join('') : hex;
  const channels = full.match(/../g).map(c => parseInt(c, 16) / 255).map(c => c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4);
  return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722;
}
for (const [scheme, css] of [['light', lightCss], ['dark', darkCss]]) {
  const palette = tokens(css);
  for (const [foreground, surface, minimum] of [
    ['--text', '--bg', 4.5], ['--muted', '--card', 4.5], ['--on-accent', '--accent', 4.5],
    ['--weekly-ink', '--weekly-bg', 4.5], ['--weekly-ink', '--weekly-date-bg', 4.5],
    ['--weekly-muted', '--weekly-bg', 4.5], ['--wave-line', '--timeline-bg', 3],
  ]) {
    const a = luminance(palette[foreground]);
    const b = luminance(palette[surface]);
    const ratio = (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
    assert.ok(ratio >= minimum, `${scheme}: ${foreground} on ${surface} contrast ${ratio.toFixed(2)} is below ${minimum}`);
  }
}
console.log('system theme changes and light/dark contrast ok');
