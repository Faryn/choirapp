(function () {
  function songSlug(name) {
    return String(name || 'song')
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'song';
  }

  async function loadSongWaveforms({
    song,
    assetUrl,
    aggregateCache,
    fallbackPath = 'waveforms.json',
    shouldUseResult = () => true,
  }) {
    if (!song) {
      return { waveformCache: {}, aggregateCache };
    }

    const splitUrl = assetUrl(`waveforms/${songSlug(song.song)}.json`);
    try {
      const response = await fetch(splitUrl, { cache: 'no-store' });
      if (response.ok) {
        const waveformCache = await response.json();
        return shouldUseResult() ? { waveformCache, aggregateCache } : null;
      }
    } catch (err) {
      console.warn('split waveform fetch failed', splitUrl, err);
    }

    try {
      let nextAggregateCache = aggregateCache;
      if (!nextAggregateCache) {
        const response = await fetch(assetUrl(fallbackPath), { cache: 'no-store' });
        nextAggregateCache = response.ok ? await response.json() : {};
      }

      const urls = new Set((song.files || []).map((file) => file.url));
      const waveformCache = Object.fromEntries(
        Object.entries(nextAggregateCache).filter(([fileUrl]) => urls.has(fileUrl)),
      );
      return shouldUseResult()
        ? { waveformCache, aggregateCache: nextAggregateCache }
        : null;
    } catch (err) {
      console.warn('aggregate waveform fallback failed', err);
      return shouldUseResult() ? { waveformCache: {}, aggregateCache } : null;
    }
  }

  window.ChoirRepertoireData = Object.freeze({
    songSlug,
    loadSongWaveforms,
  });
})();
