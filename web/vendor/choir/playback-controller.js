(function () {
  function createPlaybackController({
    ctx,
    nativeAudio,
    getTracks,
    getCurrentTrackIndex,
    setCurrentTrackIndex,
    getPlaybackRate,
    getChannelMix,
    getTrackFile,
    toTrackTime,
    fromTrackTime,
    safeTrackOffset,
    getDuration,
    cacheBustedUrl,
    browserSafeUrl,
    onStarted = () => {},
    onStopped = () => {},
    onFailed = () => {},
    logger = console,
  }) {
    let playback = null;
    let startedAt = 0;

    function connectChannelMix(source, gain) {
      const mix = getChannelMix();
      if (mix === 'stereo') {
        source.connect(gain);
        return {};
      }

      const splitter = ctx.createChannelSplitter(2);
      const merger = ctx.createChannelMerger(2);
      const sourceChannel = mix.startsWith('left') ? 0 : 1;
      source.connect(splitter);
      splitter.connect(merger, sourceChannel, 0);
      if (mix.endsWith('-both')) splitter.connect(merger, sourceChannel, 1);
      merger.connect(gain);
      return { splitter, merger };
    }

    function disconnectEntry(entry) {
      if (!entry) return;
      try { entry.source.onended = null; entry.source.stop(); } catch {}
      try { entry.source.disconnect(); } catch {}
      try { entry.gain.disconnect(); } catch {}
      try { entry.splitter?.disconnect(); } catch {}
      try { entry.merger?.disconnect(); } catch {}
    }

    function stop() {
      if (playback?.mode === 'native') {
        try { nativeAudio.pause(); } catch {}
      } else if (playback?.entries) {
        playback.entries.forEach(disconnectEntry);
      }
      playback = null;
      onStopped();
    }

    function currentPosition({ isPlaying, pausedAt }) {
      if (!isPlaying) return pausedAt;
      if (playback?.mode === 'native') return fromTrackTime(nativeAudio.currentTime || 0, getCurrentTrackIndex());
      return Math.max(0, Math.min(getDuration(), ctx.currentTime - startedAt));
    }

    function setActiveTrack(nextIdx, fadeSec) {
      if (!playback?.entries) {
        setCurrentTrackIndex(nextIdx);
        return;
      }
      const now = ctx.currentTime;
      playback.entries.forEach((entry, idx) => {
        if (!entry) return;
        const target = idx === nextIdx ? 1 : 0;
        entry.gain.gain.cancelScheduledValues(now);
        entry.gain.gain.setValueAtTime(entry.gain.gain.value, now);
        entry.gain.gain.linearRampToValueAtTime(target, now + fadeSec);
      });
      setCurrentTrackIndex(nextIdx);
    }

    function playFrom(offsetSec) {
      const tracks = getTracks();
      const currentTrackIndex = getCurrentTrackIndex();
      if (!tracks[currentTrackIndex]?.buffer) return false;
      stop();

      const playbackRate = getPlaybackRate();
      if (playbackRate !== 1) {
        const file = getTrackFile(currentTrackIndex);
        if (!file) return false;
        const src = browserSafeUrl(cacheBustedUrl(file.url, file.fingerprint));
        if (nativeAudio.src !== new URL(src, window.location.href).href) nativeAudio.src = src;
        nativeAudio.preservesPitch = true;
        nativeAudio.mozPreservesPitch = true;
        nativeAudio.webkitPreservesPitch = true;
        nativeAudio.playbackRate = playbackRate;
        nativeAudio.currentTime = safeTrackOffset(toTrackTime(offsetSec, currentTrackIndex), currentTrackIndex);
        playback = { mode: 'native' };
        nativeAudio.play().catch((err) => {
          logger.warn?.('Native playback failed', err);
          playback = null;
          onFailed(err);
        });
        onStarted({ mode: 'native', playbackRate });
        return true;
      }

      const when = ctx.currentTime + 0.02;
      const entries = [];
      tracks.forEach((track, idx) => {
        if (!track?.buffer) return;
        const source = ctx.createBufferSource();
        source.buffer = track.buffer;
        const gain = ctx.createGain();
        gain.gain.value = idx === currentTrackIndex ? 1 : 0;
        const channelNodes = connectChannelMix(source, gain);
        gain.connect(ctx.destination);
        source.start(when, safeTrackOffset(toTrackTime(offsetSec, idx), idx));
        entries[idx] = { source, gain, ...channelNodes };
      });
      if (!entries[currentTrackIndex]) return false;

      startedAt = when - offsetSec;
      playback = { entries, masterStartedAt: startedAt, lastResyncAt: ctx.currentTime };
      onStarted({ mode: 'web-audio', playbackRate });
      return true;
    }

    function resyncInactiveTracks() {
      if (!playback?.entries || playback.mode === 'native') return;
      const now = ctx.currentTime;
      if (now - playback.lastResyncAt < 2.5) return;

      const when = now + 0.02;
      const masterPos = Math.max(0, Math.min(getDuration(), now - startedAt));
      const tracks = getTracks();
      const currentTrackIndex = getCurrentTrackIndex();
      playback.entries.forEach((entry, idx) => {
        if (!entry || !tracks[idx]?.buffer || idx === currentTrackIndex) return;
        const source = ctx.createBufferSource();
        source.buffer = tracks[idx].buffer;
        const channelNodes = connectChannelMix(source, entry.gain);
        try { source.start(when, safeTrackOffset(toTrackTime(masterPos, idx), idx)); } catch { return; }
        const oldSource = entry.source;
        const oldSplitter = entry.splitter;
        const oldMerger = entry.merger;
        entry.source = source;
        entry.splitter = channelNodes.splitter;
        entry.merger = channelNodes.merger;
        try { oldSource.stop(when + 0.04); } catch {}
        try { oldSource.disconnect(); } catch {}
        try { oldSplitter?.disconnect(); } catch {}
        try { oldMerger?.disconnect(); } catch {}
      });
      playback.lastResyncAt = now;
    }

    return Object.freeze({
      currentPosition,
      playFrom,
      stop,
      setActiveTrack,
      resyncInactiveTracks,
    });
  }

  window.ChoirPlaybackController = Object.freeze({ createPlaybackController });
})();
