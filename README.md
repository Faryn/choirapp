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
so songs and scores stay in `data/repertoire/01_Aktuelles_Repertoire`. The authored
HTML/CSS/JS lives in `web/`; `instances/test/web` and `instances/prod/web` are
deployed outputs with separate manifests and waveform cache files.

Deploy the current working tree to test:

```bash
python3 deploy_instance.py test --restart
```

Deploy an exact Git ref to prod:

```bash
python3 deploy_instance.py prod --ref production --restart
```

Add `--waveforms` when waveform metadata needs to be regenerated. Systemd unit
templates live in `infra/systemd/`.

Default change workflow:

1. Make app changes in `web/` and commit them on `main`.
2. Deploy/verify test from the working tree or a test ref.
3. Promote by fast-forwarding `production` to the tested commit and deploying prod from that ref.
4. Optionally tag important prod releases for immutable rollback points.

The whole app is prepared as one Git repo. Song `sections.json` marker files are
tracked as lightweight authored metadata. Media, score, document assets, generated
manifests, and waveform cache files stay local/ignored.

## Target MVP outcomes
- Login-protected app
- Admin-managed songs + MP3 tracks
- Member playback with track switching
- A/B loop with practical gapless quality
- Docker deploy on small VPS
