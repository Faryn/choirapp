(function () {
  function createMediaSessionController({
    navigatorRef = window.navigator,
    windowRef = window,
    getTitle = () => 'choir app',
    getArtist = () => 'Practice track',
    getAlbum = () => 'choir app',
    getDuration = () => 0,
    getPosition = () => 0,
    getPlaybackRate = () => 1,
    isPlaying = () => false,
    onPlay = () => {},
    onPause = () => {},
    onStop = () => {},
    onSeek = () => {},
    setTimeoutFn = window.setTimeout.bind(window),
    clearTimeoutFn = window.clearTimeout.bind(window),
    logger = console,
  } = {}) {
    const mediaSession = navigatorRef && 'mediaSession' in navigatorRef ? navigatorRef.mediaSession : null;
    let positionTimer = 0;

    function updatePlaybackState() {
      if (!mediaSession) return;
      try {
        mediaSession.playbackState = isPlaying() ? 'playing' : 'paused';
      } catch (err) {
        logger.warn?.('Could not update media session playback state', err);
      }
    }

    function updatePositionState() {
      if (!mediaSession?.setPositionState) return;
      clearTimeoutFn(positionTimer);
      positionTimer = setTimeoutFn(() => {
        const duration = Number(getDuration());
        if (!Number.isFinite(duration) || duration <= 0) return;
        const rawPosition = Number(getPosition());
        const position = Math.max(0, Math.min(duration, Number.isFinite(rawPosition) ? rawPosition : 0));
        try {
          mediaSession.setPositionState({
            duration,
            playbackRate: Math.max(0.1, Number(getPlaybackRate()) || 1),
            position,
          });
        } catch (err) {
          logger.warn?.('Could not update media session position', err);
        }
      }, 0);
    }

    function updateMetadata() {
      if (!mediaSession) return;
      try {
        if ('MediaMetadata' in windowRef) {
          mediaSession.metadata = new windowRef.MediaMetadata({
            title: getTitle() || 'choir app',
            artist: getArtist() || 'Practice track',
            album: getAlbum() || 'choir app',
          });
        }
      } catch (err) {
        logger.warn?.('Could not update media session metadata', err);
      }
      updatePlaybackState();
      updatePositionState();
    }

    function clearState() {
      if (!mediaSession) return;
      updatePlaybackState();
      if (mediaSession.setPositionState) {
        try { mediaSession.setPositionState(); } catch {}
      }
    }

    function setAction(action, handler) {
      if (!mediaSession?.setActionHandler) return;
      try {
        mediaSession.setActionHandler(action, handler);
      } catch {
        // Some browsers expose Media Session but not every action type.
      }
    }

    function setupHandlers() {
      if (!mediaSession) return;
      setAction('play', () => {
        Promise.resolve(onPlay()).catch((err) => logger.warn?.('Media session play failed', err));
      });
      setAction('pause', onPause);
      setAction('stop', onStop);
      setAction('seekbackward', (details = {}) => {
        onSeek(getPosition() - (details.seekOffset || 5));
      });
      setAction('seekforward', (details = {}) => {
        onSeek(getPosition() + (details.seekOffset || 5));
      });
      setAction('seekto', (details = {}) => {
        if (typeof details.seekTime === 'number') onSeek(details.seekTime);
      });
    }

    return Object.freeze({
      isSupported: Boolean(mediaSession),
      updatePlaybackState,
      updatePositionState,
      updateMetadata,
      clearState,
      setupHandlers,
    });
  }

  window.ChoirMediaSession = Object.freeze({
    createMediaSessionController,
  });
})();
