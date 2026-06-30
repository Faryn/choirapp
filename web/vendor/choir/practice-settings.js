(function () {
  const LEGACY_LAST_SELECTION_KEY = 'choir-app-last-selection-v1';
  const PRACTICE_SETTINGS_KEY = 'choir-app-practice-settings-v1';

  function readJson(key, fallback = null) {
    try {
      return JSON.parse(localStorage.getItem(key) || 'null') || fallback;
    } catch {
      return fallback;
    }
  }

  function writeJson(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function settingsKey(repertoireUrl, defaultRepertoireUrl) {
    return repertoireUrl || defaultRepertoireUrl;
  }

  function read({ repertoireUrl, defaultRepertoireUrl }) {
    const key = settingsKey(repertoireUrl, defaultRepertoireUrl);
    const store = readJson(PRACTICE_SETTINGS_KEY, {}) || {};
    const saved = store[key];
    if (saved) return saved;
    if (key === defaultRepertoireUrl) {
      return readJson(LEGACY_LAST_SELECTION_KEY, null);
    }
    return null;
  }

  function write({
    repertoireUrl,
    defaultRepertoireUrl,
    song,
    group,
    file,
    playbackRate = 1,
    loopEnabled = true,
  }) {
    if (!song || !file) return false;

    const store = readJson(PRACTICE_SETTINGS_KEY, {}) || {};
    const next = {
      song,
      group,
      trackUrl: file.url,
      trackName: file.name,
      savedAt: Date.now(),
    };
    if (playbackRate !== 1) next.playbackRate = playbackRate;
    if (!loopEnabled) next.loopEnabled = false;
    store[settingsKey(repertoireUrl, defaultRepertoireUrl)] = next;
    writeJson(PRACTICE_SETTINGS_KEY, store);
    return true;
  }

  window.ChoirPracticeSettings = Object.freeze({
    LEGACY_LAST_SELECTION_KEY,
    PRACTICE_SETTINGS_KEY,
    read,
    write,
    readJson,
    writeJson,
  });
})();
