(function () {
  function detectActiveRange(buffer, { clamp = (value, min, max) => Math.max(min, Math.min(max, value)) } = {}) {
    const ch = buffer.getChannelData(0);
    const sr = buffer.sampleRate;
    const win = 2048;
    const hop = 1024;
    let maxAbs = 0;

    for (let i = 0; i < ch.length; i += hop) {
      let peak = 0;
      const end = Math.min(ch.length, i + win);
      for (let j = i; j < end; j += 1) {
        const value = Math.abs(ch[j]);
        if (value > peak) peak = value;
      }
      if (peak > maxAbs) maxAbs = peak;
    }

    const threshold = Math.max(0.004, maxAbs * 0.08);
    let first = 0;
    let last = ch.length - 1;

    for (let i = 0; i < ch.length; i += hop) {
      let peak = 0;
      const end = Math.min(ch.length, i + win);
      for (let j = i; j < end; j += 1) {
        const value = Math.abs(ch[j]);
        if (value > peak) peak = value;
      }
      if (peak >= threshold) {
        first = i;
        break;
      }
    }

    for (let i = ch.length - 1; i >= 0; i -= hop) {
      let peak = 0;
      const start = Math.max(0, i - win);
      for (let j = start; j <= i; j += 1) {
        const value = Math.abs(ch[j]);
        if (value > peak) peak = value;
      }
      if (peak >= threshold) {
        last = i;
        break;
      }
    }

    const pad = Math.floor(sr * 0.03);
    return {
      start: clamp((first - pad) / sr, 0, buffer.duration),
      end: clamp((last + pad) / sr, 0, buffer.duration),
    };
  }

  function shouldActiveRangeAlignTrack({
    enabled,
    track,
    refDurationSec,
    sameTimelineToleranceSec = 3.0,
  }) {
    if (!enabled || !track?.buffer || refDurationSec <= 0) return false;
    return Math.abs(track.buffer.duration - refDurationSec) > sameTimelineToleranceSec;
  }

  function toTrackTime({
    masterSec,
    track,
    offsetSec = 0,
    shouldAlign = false,
    refDurationSec = 0,
    refActiveStartSec = 0,
    refActiveEndSec = refDurationSec,
    clamp = (value, min, max) => Math.max(min, Math.min(max, value)),
  }) {
    if (!track) return masterSec;
    const duration = track.buffer.duration;
    let value = masterSec;

    if (shouldAlign) {
      const refSpan = Math.max(0.001, refActiveEndSec - refActiveStartSec);
      const dstStart = track.activeStart ?? 0;
      const dstEnd = track.activeEnd ?? duration;
      const dstSpan = Math.max(0.001, dstEnd - dstStart);
      value = ((masterSec - refActiveStartSec) / refSpan) * dstSpan + dstStart;
    }

    value += offsetSec;
    return clamp(value, 0, duration);
  }

  function fromTrackTime({
    trackSec,
    track,
    offsetSec = 0,
    shouldAlign = false,
    duration,
    refDurationSec = 0,
    refActiveStartSec = 0,
    refActiveEndSec = refDurationSec,
    clamp = (value, min, max) => Math.max(min, Math.min(max, value)),
  }) {
    if (!track) return trackSec;
    const trackDuration = track.buffer.duration;
    let value = trackSec - offsetSec;

    if (shouldAlign && trackDuration > 0) {
      const refSpan = Math.max(0.001, refActiveEndSec - refActiveStartSec);
      const srcStart = track.activeStart ?? 0;
      const srcEnd = track.activeEnd ?? trackDuration;
      const srcSpan = Math.max(0.001, srcEnd - srcStart);
      value = ((value - srcStart) / srcSpan) * refSpan + refActiveStartSec;
    }

    return clamp(value, 0, duration);
  }

  function safeTrackOffset(sec, track, { clamp = (value, min, max) => Math.max(min, Math.min(max, value)) } = {}) {
    if (!track) return 0;
    return clamp(sec, 0, Math.max(0, track.buffer.duration - 0.001));
  }

  window.ChoirAudioEngine = Object.freeze({
    detectActiveRange,
    shouldActiveRangeAlignTrack,
    toTrackTime,
    fromTrackTime,
    safeTrackOffset,
  });
})();
