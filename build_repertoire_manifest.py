import json
import os
import argparse
from pathlib import Path

AUDIO_EXTS = {'.mp3', '.m4a'}
SCORE_EXTS = {'.pdf'}
REPO_ROOT = Path(__file__).resolve().parent
DEFAULT_REPERTOIRE_ROOT = REPO_ROOT / "data" / "repertoire" / "01_Aktuelles_Repertoire"
DEFAULT_PUBLIC_DATA_PREFIX = 'data/repertoire/01_Aktuelles_Repertoire'


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--root",
        type=Path,
        default=DEFAULT_REPERTOIRE_ROOT,
        help="Repertoire source directory containing one folder per song.",
    )
    parser.add_argument(
        "--web-dir",
        type=Path,
        default=Path("/home/paul/.openclaw/workspace/choir-app/instances/test/web"),
        help="Instance web root that should receive repertoire.json.",
    )
    parser.add_argument(
        "--public-prefix",
        help="Browser-visible prefix for files under --root. Defaults to data/repertoire/<root> when possible.",
    )
    return parser.parse_args()


def path_absolute(path: Path) -> Path:
    expanded = path.expanduser()
    return expanded if expanded.is_absolute() else Path.cwd() / expanded


def infer_public_prefix(root: Path, explicit: str | None) -> str:
    if explicit:
        return explicit.strip().strip('/')
    try:
        rel = root.relative_to(REPO_ROOT / "data" / "repertoire").as_posix()
        return f"data/repertoire/{rel}"
    except ValueError:
        return DEFAULT_PUBLIC_DATA_PREFIX


def public_file_url(path: Path, root: Path, public_prefix: str) -> str:
    """Return the browser-visible URL for a repertoire file.

    The web server exposes choir-app/web as its document root, with web/data as
    a symlink to ../data. Avoid ../data URLs because browsers resolve those to
    /data from the root page and static servers may not expose parent paths.
    """
    return f"{public_prefix}/{path.relative_to(root).as_posix()}"


def public_audio_url(path: Path, root: Path, public_prefix: str) -> str:
    return public_file_url(path, root, public_prefix)


def public_score_url(path: Path, root: Path, public_prefix: str) -> str:
    return public_file_url(path, root, public_prefix)

def infer_group(display: str) -> str:
    parts = display.replace('\\', '/').split('/')
    filename = parts[-1]
    subfolders = parts[:-1]
    if subfolders:
        return ' / '.join(subfolders)

    n = filename.lower()
    if 'coda' in n:
        return 'coda'
    if 'slow' in n or 'schneckentempo' in n:
        return 'slow'
    return 'main'


def score_sort_key(item: dict) -> tuple:
    name = item['name'].lower()
    return (
        1 if 'lead sheet' in name or 'leadsheet' in name else 0,
        0 if 'noten' in name else 1,
        name,
    )


def load_sections(song_dir: Path) -> list[dict]:
    path = song_dir / "sections.json"
    if not path.exists():
        return []
    data = json.loads(path.read_text(encoding="utf-8"))
    raw_sections = data if isinstance(data, list) else data.get("sections", [])
    sections = []
    for item in raw_sections:
        name = str(item.get("name", "")).strip()
        try:
            start = float(item.get("start"))
        except (TypeError, ValueError):
            continue
        if not name or start < 0:
            continue
        sections.append({"name": name, "start": start})
    return sorted(sections, key=lambda item: item["start"])


def main() -> None:
    args = parse_args()
    root = path_absolute(args.root)
    web_dir = args.web_dir.resolve()
    public_prefix = infer_public_prefix(root, args.public_prefix)
    out = web_dir / "repertoire.json"

    manifest = []
    for song_dir in sorted([p for p in root.iterdir() if p.is_dir()]):
        files = []
        score_files = []
        for path in sorted(song_dir.iterdir()):
            if not path.is_file() or path.suffix.lower() not in SCORE_EXTS:
                continue
            st = path.stat()
            display = os.path.relpath(path, song_dir).replace(os.sep, '/')
            score_files.append({
                'name': display,
                'url': public_score_url(path, root, public_prefix),
                'fingerprint': f"{int(st.st_mtime)}-{st.st_size}",
                'size': st.st_size,
                'mtime': int(st.st_mtime),
            })
        score_files.sort(key=score_sort_key)

        for path in sorted(song_dir.rglob('*')):
            if not path.is_file():
                continue
            if path.suffix.lower() not in AUDIO_EXTS:
                continue
            st = path.stat()
            rel = public_audio_url(path, root, public_prefix)
            display = os.path.relpath(path, song_dir).replace(os.sep, '/')
            files.append({
                'name': display,
                'url': rel,
                'fingerprint': f"{int(st.st_mtime)}-{st.st_size}",
                'size': st.st_size,
                'mtime': int(st.st_mtime),
                'group': infer_group(display),
            })
        if files:
            # The UI intentionally exposes one score PDF per song. If a folder has
            # more than one PDF, pick the first deterministic match but record the
            # count so we can surface that ambiguity later if needed.
            entry = {'song': song_dir.name, 'files': files}
            if score_files:
                entry['score'] = score_files[0]
                entry['scoreCount'] = len(score_files)
            sections = load_sections(song_dir)
            if sections:
                entry['sections'] = sections
            manifest.append(entry)

    out.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f'wrote {out} with {len(manifest)} songs')


if __name__ == "__main__":
    main()
