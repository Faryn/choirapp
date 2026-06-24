# Choir app cache plan

Current layers:
- Browser IndexedDB cache for fetched audio bytes, keyed by `url + fingerprint`
- In-memory decoded-song cache for current page session
- Server-generated `web/repertoire.json` with per-file fingerprint (`mtime-size`), size, mtime

Next useful server-side cache layers:
1. Precomputed waveform summary per track
2. Precomputed active-range metadata per track
3. Optional decodable-status index

Rebuild command:
```bash
python3 /home/paul/.openclaw/workspace/choir-app/build_repertoire_manifest.py
```

Use after files change in `data/repertoire/01_Aktuelles_Repertoire`.

## Deployment cache headers

A ready-to-adapt Nginx profile lives at:

```bash
infra/nginx/choir-app.conf
```

It enables gzip for JSON/HTML and uses safe cache policy:
- `index.html`, `repertoire.json`, and split `waveforms/*.json`: revalidate (`no-cache`)
- audio files: long immutable cache, because the browser now fetches them as `?v=<fingerprint>`
