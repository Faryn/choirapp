import argparse
import json
import os
import re
import subprocess
import unicodedata
from pathlib import Path

AUDIO_EXTS = {'.mp3', '.m4a'}
SAMPLES = 128
PUBLIC_DATA_PREFIX = 'data/repertoire/01_Aktuelles_Repertoire'


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--root",
        type=Path,
        default=Path("/home/paul/.openclaw/workspace/choir-app/data/repertoire/01_Aktuelles_Repertoire"),
        help="Repertoire source directory containing one folder per song.",
    )
    parser.add_argument(
        "--web-dir",
        type=Path,
        default=Path("/home/paul/.openclaw/workspace/choir-app/instances/test/web"),
        help="Instance web root that should receive waveform cache files.",
    )
    return parser.parse_args()


def public_audio_url(path: Path, root: Path) -> str:
    return f"{PUBLIC_DATA_PREFIX}/{path.relative_to(root).as_posix()}"


def song_slug(name: str) -> str:
    value = unicodedata.normalize('NFKD', name).encode('ascii', 'ignore').decode('ascii')
    value = re.sub(r'[^a-zA-Z0-9]+', '-', value).strip('-').lower()
    return value or 'song'


def write_split_waveforms(cache: dict, split_dir: Path) -> int:
    by_song = {}
    prefix = PUBLIC_DATA_PREFIX + '/'
    for url, meta in cache.items():
        if not url.startswith(prefix):
            continue
        rest = url[len(prefix):]
        parts = rest.split('/')
        if len(parts) < 2:
            continue
        by_song.setdefault(parts[0], {})[url] = meta

    split_dir.mkdir(parents=True, exist_ok=True)
    expected = {f'{song_slug(song)}.json' for song in by_song}
    for stale in split_dir.glob('*.json'):
        if stale.name not in expected:
            stale.unlink()
    for song_name, song_cache in sorted(by_song.items()):
        out = split_dir / f'{song_slug(song_name)}.json'
        out.write_text(json.dumps(song_cache, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    return len(by_song)


def ffprobe_duration(path: Path) -> float:
    result = subprocess.run(
        ['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', str(path)],
        capture_output=True, text=True, check=True
    )
    return float(result.stdout.strip())


def ffmpeg_waveform(path: Path):
    result = subprocess.run(
        ['ffmpeg', '-v', 'error', '-i', str(path), '-ac', '1', '-ar', '1200', '-f', 's16le', '-'],
        capture_output=True, check=True
    )
    raw = result.stdout
    if not raw:
        return []
    import array
    samples = array.array('h')
    samples.frombytes(raw)
    vals = [abs(s) / 32768.0 for s in samples]
    if not vals:
        return []
    chunk = max(1, len(vals) // SAMPLES)
    peaks = []
    for i in range(0, len(vals), chunk):
        segment = vals[i:i+chunk]
        if segment:
            peaks.append(round(max(segment), 4))
    return peaks[:SAMPLES]


def main() -> None:
    args = parse_args()
    root = args.root.resolve()
    web_dir = args.web_dir.resolve()
    out = web_dir / "waveforms.json"
    split_dir = web_dir / "waveforms"

    if out.exists():
        try:
            cache = json.loads(out.read_text(encoding='utf-8'))
        except Exception:
            cache = {}
    else:
        cache = {}

    count = 0
    for path in sorted(root.rglob('*')):
        if not path.is_file() or path.suffix.lower() not in AUDIO_EXTS:
            continue
        st = path.stat()
        rel = public_audio_url(path, root)
        fingerprint = f"{int(st.st_mtime)}-{st.st_size}"
        existing = cache.get(rel)
        if existing and existing.get('fingerprint') == fingerprint:
            continue
        try:
            duration = ffprobe_duration(path)
            peaks = ffmpeg_waveform(path)
            if peaks:
                max_peak = max(peaks)
                thr = max(0.02, max_peak * 0.08)
                first = next((i for i, v in enumerate(peaks) if v >= thr), 0)
                last = next((i for i in range(len(peaks)-1, -1, -1) if peaks[i] >= thr), len(peaks)-1)
                active_start = round((first / max(1, len(peaks)-1)) * duration, 3)
                active_end = round((last / max(1, len(peaks)-1)) * duration, 3)
            else:
                active_start = 0.0
                active_end = round(duration, 3)
            cache[rel] = {
                'fingerprint': fingerprint,
                'duration': round(duration, 3),
                'waveform': peaks,
                'activeStart': active_start,
                'activeEnd': active_end,
            }
            out.write_text(json.dumps(cache, ensure_ascii=False, indent=2), encoding='utf-8')
            count += 1
            print(f'cached {count}: {rel}')
        except Exception as e:
            print(f'skip {rel}: {e}')

    print(f'done, {count} updated')
    split_count = write_split_waveforms(cache, split_dir)
    print(f'wrote {split_count} split waveform files')


if __name__ == "__main__":
    main()
