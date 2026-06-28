(function () {
  const DEFAULT_REPERTOIRE_URL = './repertoire.json';
  const REPERTOIRE_PATH_PREFIX = 'data/repertoire/';
  const REPERTOIRE_ALIASES = {
    aliento: 'data/repertoire/02_Aliento',
  };

  function repertoireUrlFromLocation(search) {
    const params = new URLSearchParams(search || window.location.search);
    const explicitManifest = String(params.get('repertoire') || '').trim();
    const songsFolder = String(params.get('songs') || '').trim();
    const shortRepertoire = String(params.get('r') || '').trim();
    const rawSource = explicitManifest || songsFolder || shortRepertoire;
    const source = REPERTOIRE_ALIASES[rawSource.toLowerCase()] || rawSource;
    if (!source) return DEFAULT_REPERTOIRE_URL;

    const candidate = /\.json(?:$|[?#])/i.test(source)
      ? source
      : `${source.replace(/\/+$/, '')}/repertoire.json`;
    const pathOnly = candidate.split(/[?#]/)[0];
    const normalized = pathOnly.replace(/^\.?\//, '').replace(/^\/+/, '');
    const unsafe =
      /^[a-z][a-z0-9+.-]*:/i.test(candidate) ||
      candidate.startsWith('//') ||
      candidate.includes('\\') ||
      normalized.split('/').includes('..') ||
      !normalized.startsWith(REPERTOIRE_PATH_PREFIX) ||
      !/\.json$/i.test(normalized);

    if (unsafe) {
      console.warn('Ignoring unsafe repertoire URL parameter:', candidate);
      return DEFAULT_REPERTOIRE_URL;
    }
    return candidate;
  }

  function repertoireAssetUrl(currentRepertoireUrl, path) {
    const manifestPath = String(currentRepertoireUrl || DEFAULT_REPERTOIRE_URL).split(/[?#]/)[0];
    const slash = manifestPath.lastIndexOf('/');
    const base = slash >= 0 ? manifestPath.slice(0, slash + 1) : './';
    return `${base}${path}`;
  }

  function browserSafeUrl(url) {
    const raw = String(url || '');
    try {
      const parsed = new URL(raw, window.location.href);
      if (parsed.origin !== window.location.origin || /^[a-z][a-z0-9+.-]*:/i.test(raw)) {
        return parsed.href;
      }
    } catch {}

    const [path, query] = raw.split('?');
    const encodedPath = path.split('/').map((part) => {
      try {
        return encodeURIComponent(decodeURIComponent(part));
      } catch {
        return encodeURIComponent(part);
      }
    }).join('/');
    return query ? `${encodedPath}?${query}` : encodedPath;
  }

  function cacheBustedUrl(url, fingerprint) {
    if (!fingerprint) return browserSafeUrl(url);
    const sep = String(url || '').includes('?') ? '&' : '?';
    return browserSafeUrl(`${url}${sep}v=${encodeURIComponent(fingerprint)}`);
  }

  window.ChoirUrlPolicy = Object.freeze({
    DEFAULT_REPERTOIRE_URL,
    REPERTOIRE_PATH_PREFIX,
    REPERTOIRE_ALIASES,
    repertoireUrlFromLocation,
    repertoireAssetUrl,
    browserSafeUrl,
    cacheBustedUrl,
  });
})();
