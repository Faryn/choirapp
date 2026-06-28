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

Run local test checks against the test instance:

```bash
node tests/url-policy.test.js
node tests/http-contract.test.js
node tests/browser-smoke.test.js
CHOIR_TEST_URL=http://127.0.0.1/choir-test/ node tests/browser-smoke.test.js
```

The browser smoke covers the default repertoire, the `?r=aliento` alternate
repertoire, score canvas rendering, and page-coder loading.

Deploy an exact Git ref to prod:

```bash
python3 deploy_instance.py prod --ref production --restart
```

Promote a tested ref to prod:

```bash
python3 deploy_instance.py promote --from-ref main --tag prod-YYYY-MM-DD-N --restart
```

Add `--waveforms` when waveform metadata needs to be regenerated. Systemd unit
templates live in `infra/systemd/`.

### Alternate repertoire manifests

The player and page coder load `./repertoire.json` by default. To test or share
another song set, pass a URL parameter:

```text
/choir-test/?r=aliento
/choir-test/?songs=data/repertoire/02_Aliento
/choir-test/?songs=data/repertoire/02_Test_Repertoire
/choir-test/?repertoire=data/repertoire/02_Test_Repertoire/repertoire.json
```

For safety, both parameters only accept same-site paths under `data/repertoire/`;
remote URLs and paths with `..` are ignored. `songs` points at a web-exposed
folder that contains `repertoire.json`. `repertoire` points directly at a
manifest JSON file. `r` is a short alias for known repertoires, currently
`aliento`. The manifest itself still decides the media/PDF URLs, so alternate
folders need their own generated manifest.

Default change workflow:

1. Make app changes in `web/` and commit them on `main`.
2. Deploy/verify test from the working tree or a test ref.
3. Promote with `deploy_instance.py promote --from-ref <tested-ref> --tag <prod-tag> --restart`.
4. Roll back with `deploy_instance.py prod --ref <prod-tag> --restart`.

The whole app is prepared as one Git repo. Song `sections.json` marker files are
tracked as lightweight authored metadata. Media, score, document assets, generated
manifests, and waveform cache files stay local/ignored.

Safety rails:

- Prod deployments require `--ref` unless `--allow-working-tree-prod` is passed.
- Deployments run smoke checks by default; pass `--no-smoke` only for diagnostics.
- Use `--dry-run` to preview deploy/promote actions without changing refs, files, or services.

## Target MVP outcomes
- Login-protected app
- Admin-managed songs + MP3 tracks
- Member playback with track switching
- A/B loop with practical gapless quality
- Docker deploy on small VPS
