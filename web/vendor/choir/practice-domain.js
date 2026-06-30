(function () {
  function audioFiles(files = []) {
    return files.filter((file) => /\.(mp3|m4a)$/i.test(file.name));
  }

  function normalizeSections({
    entry,
    currentGroup = 'main',
    duration = 0,
    exampleMarkers = {},
    songSlug = (name) => String(name || 'song'),
  }) {
    if (currentGroup !== 'main') return [];
    const source = Array.isArray(entry?.sections) && entry.sections.length
      ? entry.sections
      : exampleMarkers[songSlug(entry?.song)];
    if (!source?.length) return [];
    return source
      .map((item) => ({
        name: String(item.name || item.label || '').trim(),
        start: Number(item.start ?? item.time ?? item.at ?? 0),
      }))
      .filter((item) => (
        item.name &&
        Number.isFinite(item.start) &&
        item.start >= 0 &&
        (!duration || item.start <= duration + 0.25)
      ))
      .sort((a, b) => a.start - b.start);
  }

  function currentSectionAt(sections, seconds) {
    if (!sections.length) return null;
    let current = sections[0];
    for (const section of sections) {
      if (section.start <= seconds + 0.05) current = section;
      else break;
    }
    return current;
  }

  function snapToSegmentMarker({ seconds, duration, sections, timelineWidth, pixelThreshold = 12 }) {
    if (!duration || !sections.length || !Number.isFinite(seconds)) return seconds;
    const threshold = duration * (pixelThreshold / Math.max(timelineWidth, 1));
    const markers = [...sections.map((section) => section.start), duration]
      .filter((value) => Number.isFinite(value) && value >= 0 && value <= duration);
    let best = seconds;
    let bestDistance = Infinity;
    markers.forEach((marker) => {
      const distance = Math.abs(marker - seconds);
      if (distance < bestDistance) {
        best = marker;
        bestDistance = distance;
      }
    });
    return bestDistance <= threshold ? best : seconds;
  }

  function fallbackVersionGroup(file) {
    const group = String(file?.group || 'main');
    if (/^(champion|playback|reference)$/i.test(group)) return 'main';
    return group || 'main';
  }

  function mainDurationForEntry(entry, waveformCache = {}) {
    const durations = audioFiles(entry?.files || [])
      .filter((file) => fallbackVersionGroup(file) === 'main')
      .filter((file) => !/slow|schneckentempo|coda/i.test(file.name || ''))
      .map((file) => Number(waveformCache[file.url]?.duration || 0))
      .filter((duration) => duration >= 45)
      .sort((a, b) => a - b);
    if (!durations.length) return 0;

    const clusters = [];
    for (const duration of durations) {
      const cluster = clusters.find((item) => Math.abs(item.center - duration) <= 5);
      if (cluster) {
        cluster.values.push(duration);
        cluster.center = cluster.values.reduce((sum, value) => sum + value, 0) / cluster.values.length;
      } else {
        clusters.push({ center: duration, values: [duration] });
      }
    }
    clusters.sort((a, b) => b.values.length - a.values.length || b.center - a.center);
    const values = clusters[0].values.slice().sort((a, b) => a - b);
    return values[Math.floor(values.length / 2)] || 0;
  }

  function versionGroupForFile(file, { entry, waveformCache = {} } = {}) {
    const fallback = fallbackVersionGroup(file);
    if (fallback !== 'main') return fallback;

    const name = String(file?.name || '');
    if (/slow|schneckentempo/i.test(name)) return 'slow';
    if (/coda/i.test(name)) return 'coda';

    const mainDuration = mainDurationForEntry(entry, waveformCache);
    const duration = Number(waveformCache[file?.url]?.duration || 0);
    if (!mainDuration || !duration) return 'main';

    const tolerance = Math.max(3, mainDuration * 0.025);
    if (Math.abs(duration - mainDuration) <= tolerance) return 'main';
    if (duration < mainDuration * 0.55) return 'short';
    return 'alternate';
  }

  function versionGroupsForEntry(entry, waveformCache = {}) {
    const seen = new Set();
    audioFiles(entry?.files || []).forEach((file) => {
      seen.add(versionGroupForFile(file, { entry, waveformCache }));
    });
    return [...seen].sort((a, b) => {
      if (a === 'main') return -1;
      if (b === 'main') return 1;
      return a.localeCompare(b);
    });
  }

  function filesForVersion(entry, group, waveformCache = {}) {
    return audioFiles(entry?.files || []).filter((file) => (
      versionGroupForFile(file, { entry, waveformCache }) === group
    ));
  }

  function inferTrackSection(name) {
    const n = String(name || '').toLowerCase();
    const tokens = n.split(/[^a-z0-9]+/).filter(Boolean);
    const hasVoiceToken = (letters) => tokens.some((token) => new RegExp(`^${letters}(?:\\d+(?:_?\\d+)*)?$`).test(token));
    if (/tutti|playback|original|aufnahme|demo|reference|chor/.test(n)) return 'Tutti / Reference';
    if (/beatbox/.test(n)) return 'Beatbox';
    if (/sopran|soprano/.test(n) || hasVoiceToken('s')) return 'Soprano';
    if (/alt|alto/.test(n) || hasVoiceToken('a')) return 'Alto';
    if (/mezzo/.test(n) || hasVoiceToken('m')) return 'Mezzo';
    if (/tenor/.test(n) || hasVoiceToken('t')) return 'Tenor';
    if (/bass|bariton/.test(n) || hasVoiceToken('b')) return 'Bass';
    return 'Other';
  }

  function sectionEndTime(sections, idx, duration) {
    return sections[idx + 1]?.start ?? duration;
  }

  function sectionOptionLabel(section, formatTime) {
    return `${section.name} · ${formatTime(section.start)}`;
  }

  function sectionEndOptionLabel(sections, idx, duration, formatTime) {
    return `${sections[idx].name} · ${formatTime(sectionEndTime(sections, idx, duration))}`;
  }

  function trackOptionLabel(track, idx, tracks = [], trackCacheState = []) {
    const suffixes = [];
    if (tracks[idx]?.buffer) suffixes.push('loaded');
    else if (trackCacheState[idx]) suffixes.push('cached');
    return suffixes.length ? `${track.name} (${suffixes.join(', ')})` : track.name;
  }

  window.ChoirPracticeDomain = Object.freeze({
    audioFiles,
    normalizeSections,
    currentSectionAt,
    snapToSegmentMarker,
    fallbackVersionGroup,
    mainDurationForEntry,
    versionGroupForFile,
    versionGroupsForEntry,
    filesForVersion,
    inferTrackSection,
    sectionEndTime,
    sectionOptionLabel,
    sectionEndOptionLabel,
    trackOptionLabel,
  });
})();
