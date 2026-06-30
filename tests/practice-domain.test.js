const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const code = fs.readFileSync('web/vendor/choir/practice-domain.js', 'utf8');

const window = {};
const context = {
  window,
  console,
  Math,
  Number,
  Object,
  RegExp,
  Set,
  String,
};
window.window = window;
vm.createContext(context);
vm.runInContext(code, context);

const domain = window.ChoirPracticeDomain;

{
  const sections = domain.normalizeSections({
    entry: {
      song: 'Song',
      sections: [
        { label: 'B', time: 12 },
        { name: 'A', start: 0 },
        { name: '', start: 4 },
        { name: 'Too late', start: 99 },
      ],
    },
    currentGroup: 'main',
    duration: 60,
  });
  assert.deepEqual(JSON.parse(JSON.stringify(sections)), [
    { name: 'A', start: 0 },
    { name: 'B', start: 12 },
  ]);
  assert.deepEqual(JSON.parse(JSON.stringify(domain.currentSectionAt(sections, 12.01))), { name: 'B', start: 12 });
  assert.equal(domain.normalizeSections({ entry: { sections: [{ name: 'A', start: 0 }] }, currentGroup: 'slow' }).length, 0);
}

{
  const sections = [{ name: 'A', start: 0 }, { name: 'B', start: 30 }];
  assert.equal(domain.snapToSegmentMarker({
    seconds: 30.2,
    duration: 60,
    sections,
    timelineWidth: 600,
  }), 30);
  assert.equal(domain.snapToSegmentMarker({
    seconds: 25,
    duration: 60,
    sections,
    timelineWidth: 600,
  }), 25);
}

{
  const entry = {
    files: [
      { name: 'Main S.mp3', url: 'main-s' },
      { name: 'Main A.mp3', url: 'main-a' },
      { name: 'Slow.mp3', url: 'slow' },
      { name: 'Coda.mp3', url: 'coda' },
      { name: 'Short.mp3', url: 'short' },
      { name: 'Other.wav', url: 'ignored' },
    ],
  };
  const waveformCache = {
    'main-s': { duration: 101 },
    'main-a': { duration: 100 },
    slow: { duration: 140 },
    coda: { duration: 15 },
    short: { duration: 40 },
  };
  assert.equal(domain.mainDurationForEntry(entry, waveformCache), 101);
  assert.equal(domain.versionGroupForFile(entry.files[2], { entry, waveformCache }), 'slow');
  assert.equal(domain.versionGroupForFile(entry.files[3], { entry, waveformCache }), 'coda');
  assert.equal(domain.versionGroupForFile(entry.files[4], { entry, waveformCache }), 'short');
  assert.deepEqual(Array.from(domain.versionGroupsForEntry(entry, waveformCache)), ['main', 'coda', 'short', 'slow']);
  assert.deepEqual(Array.from(domain.filesForVersion(entry, 'main', waveformCache).map((file) => file.url)), ['main-s', 'main-a']);
}

{
  assert.equal(domain.inferTrackSection('TM Africa - A.mp3'), 'Alto');
  assert.equal(domain.inferTrackSection('Beatbox.mp3'), 'Beatbox');
  assert.equal(domain.inferTrackSection('Full Chor reference.mp3'), 'Tutti / Reference');
  assert.equal(domain.inferTrackSection('Whatever.mp3'), 'Other');
  assert.equal(domain.sectionEndTime([{ start: 0 }, { start: 8 }], 0, 20), 8);
  assert.equal(domain.sectionEndTime([{ start: 0 }], 0, 20), 20);
  assert.equal(domain.trackOptionLabel({ name: 'Alto' }, 0, [{ buffer: true }], []), 'Alto (loaded)');
  assert.equal(domain.trackOptionLabel({ name: 'Alto' }, 0, [], [true]), 'Alto (cached)');
}

console.log('practice-domain tests ok');
