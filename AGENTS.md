# Choir App Agent Notes

Default workflow:

- Treat this directory as the single Git repo for the choir app.
- Edit the authored app in `web/`; treat `instances/test/web` and `instances/prod/web` as deployed outputs.
- Prod runs from `instances/prod/web` on port `5174` and is routed as `/choir`.
- Test runs from `instances/test/web` on port `5175` and is routed as `/choir-test`.
- When Paul asks for choir app changes, implement in `web/`, deploy to test, and verify test first.
- Do not change prod until Paul explicitly approves promoting the tested change.
- Keep repertoire source files shared in `data/repertoire/01_Aktuelles_Repertoire`; both instances expose them through `web/data -> ../../../data`.
- Keep authored `sections.json` files in Git. Keep media, scores, generated manifests, and waveform caches out of Git.

Useful commands:

```bash
python3 serve_static.py --directory instances/test/web --port 5175
python3 deploy_instance.py test
python3 deploy_instance.py prod --ref production --restart
python3 deploy_instance.py promote --from-ref main --tag prod-YYYY-MM-DD-N --restart
python3 deploy_instance.py smoke prod
python3 build_repertoire_manifest.py --web-dir instances/test/web
python3 build_waveform_cache_incremental.py --web-dir instances/test/web
systemctl --user restart choir-app-test.service
```
