# Choir App Agent Notes

Default workflow:

- Treat this directory as the single Git repo for the choir app.
- Prod runs from `instances/prod/web` on port `5174` and is routed as `/choir`.
- Test runs from `instances/test/web` on port `5175` and is routed as `/choir-test`.
- When Paul asks for choir app changes, implement and verify them in test first.
- Do not change prod until Paul explicitly approves promoting the tested change.
- Keep repertoire source files shared in `data/repertoire/01_Aktuelles_Repertoire`; both instances expose them through `web/data -> ../../../data`.
- Use Git LFS for media, score, and document assets.

Useful commands:

```bash
python3 serve_static.py --directory instances/test/web --port 5175
python3 build_repertoire_manifest.py --web-dir instances/test/web
python3 build_waveform_cache_incremental.py --web-dir instances/test/web
systemctl --user restart choir-app-test.service
```
