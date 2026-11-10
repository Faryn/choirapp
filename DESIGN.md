# Choir app — rehearsal desk

Approved direction, 2026-11-10. Test instance first; production must not be promoted without Paul's explicit approval.

- Product: choir practice with selectable songs, versions and voice tracks, score viewing, tempo controls, and precise A/B loops.
- Character: calm, readable, practical.
- World: sheet music on a rehearsal desk. Light neutral paper, white score, ink text, muted teal controls.
- Moments: real sheet music and the real waveform. No generated imagery or decorative filler.
- Signature: aligned time measurements and clearly marked loop boundaries.
- Mode: Operate. Musical content and playback reliability outrank visual expression.

## Surface hierarchy

1. Weekly rehearsal, when supplied, retains its existing collapsible behavior. Paul requested stronger visibility: a soft teal-green fill, defined frame, larger dark-teal heading and contrasting white date label distinguish it from ordinary controls.
2. Song, version, and voice/track selection are clearly labelled above the player.
3. The compact sticky player retains song title, Play / Pause / Stop, loop toggle, tempo, waveform and timing.
4. Loop-section selection uses a collapsible native disclosure; it does not consume permanent score space.
5. Channel mix, cache/load counters and alignment live in Settings. Escape closes Settings and restores focus; outside clicks dismiss it. Alignment remains accessible on mobile.
6. Score viewing gets the remaining viewport height, derived from the actual sticky player height rather than a fixed desktop/mobile estimate.

`web/vendor/choir/rehearsal.css` owns the practice surface theme. Canvas `#f4f2ed`, panels white, text `#262e2b`, secondary `#626c66`, action teal `#24685d`. Use 4px spacing, weight 400/500, simple borders, visible focus, and no marketing bylines or technical constraint formulas.

## Automatic dark mode

Both practice and score tagger follow the browser/OS preference via shared `system-theme.css` tokens. Light retains the approved paper palette; dark uses warm neutral charcoal surfaces, ivory text, and muted amber controls and loop markers. The rehearsal summary uses a restrained amber-tinted fill and defined border. Avoid green-tinted backgrounds, borders or body text; colour is reserved for functional accents. Native fields, highlights, waveform markers and browser chrome adapt too. Theme changes repaint canvases without restarting playback. In dark mode, rendered score canvases invert to white notation on black; hue rotation keeps coloured markings closer to their original hue. Only score pixels are filtered, not controls, waveform or overlays. Light mode and printing retain the original PDF appearance. `coder-theme.css` only themes the existing tagger and does not redesign its layout.

## Preserved behavior

All existing JS-bound element IDs remain unique and present. Audio engine, track alignment algorithms, playback controller, score renderer, repertoire files and saved practice settings remain unchanged. UI-only sizing/dismissal is isolated in `rehearsal-layout.js`. The score tagger remains available and is not redesigned in this pass.

## Verification boundary

Run layout, playback, audio, score and settings unit tests plus test-instance HTTP smoke checks. Browser navigation to the local instance was denied by browser policy during this session; do not claim a rendered visual or playback-in-browser check until permitted browser access is available.

Process informed by [unslop by Damir Sokolovsky](https://github.com/heydamir/unslop), CC BY 4.0.
