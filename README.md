# choir app

Private choir practice web app (MVP in progress).

## Current status
- ✅ MVP Phase 1 started: playback technical spike (A/B loop + Web Audio API)
- ⏳ Product MVP (auth, library, admin uploads) pending

## Run playback spike
```bash
cd spike
python3 -m http.server 5174
# open http://localhost:5174/public
```

Load a local MP3 sample with the file picker and test A/B looping.

## Run static app pages
```bash
python3 serve_static.py --directory instances/test/web --port 5175
# open http://localhost:5175/
# page coder: http://localhost:5175/page-coder.html
```

## Local prod/test instances

The deployed app uses two separate static roots:

- Prod: `instances/prod/web` on port `5174`, exposed as `/choir`
- Test: `instances/test/web` on port `5175`, exposed as `/choir-test`

Both roots share the same base repertoire files through `web/data -> ../../../data`,
so songs and scores stay in `data/repertoire/01_Aktuelles_Repertoire`. HTML/CSS/JS,
manifests, and waveform cache files can diverge per instance.

Rebuild metadata for one instance:

```bash
python3 build_repertoire_manifest.py
python3 build_waveform_cache_incremental.py
```

Systemd unit templates live in `infra/systemd/`.

Default change workflow:

1. Make app changes in `instances/test/web`.
2. Rebuild test metadata if repertoire files changed.
3. Restart/verify `choir-app-test.service` and `http://tinker/choir-test/`.
4. Promote the tested files to `instances/prod/web` only after explicit approval.

The whole app is prepared as one Git repo. Media, score, and document assets are
tracked through Git LFS via `.gitattributes`.

## Target MVP outcomes
- Login-protected app
- Admin-managed songs + MP3 tracks
- Member playback with track switching
- A/B loop with practical gapless quality
- Docker deploy on small VPS
