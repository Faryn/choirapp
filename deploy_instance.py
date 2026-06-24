import argparse
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parent
REPERTOIRE_ROOT = REPO_ROOT / "data" / "repertoire" / "01_Aktuelles_Repertoire"


def run(cmd: list[str], cwd: Path = REPO_ROOT) -> None:
    print("+", " ".join(cmd))
    subprocess.run(cmd, cwd=cwd, check=True)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Deploy the choir app source into a static instance.")
    parser.add_argument("instance", choices=["test", "prod"], help="Instance to deploy.")
    parser.add_argument(
        "--ref",
        help="Git ref to deploy without checking it out. Omit to deploy the current working tree.",
    )
    parser.add_argument(
        "--restart",
        action="store_true",
        help="Restart the matching user systemd service after deployment.",
    )
    parser.add_argument(
        "--waveforms",
        action="store_true",
        help="Regenerate incremental waveform metadata for the target instance.",
    )
    return parser.parse_args()


def archive_ref(ref: str, target: Path) -> Path:
    archive = target / "source.tar"
    with archive.open("wb") as handle:
        subprocess.run(["git", "archive", "--format=tar", ref], cwd=REPO_ROOT, check=True, stdout=handle)
    source_root = target / "source"
    source_root.mkdir()
    run(["tar", "-xf", str(archive), "-C", str(source_root)])
    return source_root


def ensure_data_link(web_dir: Path) -> None:
    link = web_dir / "data"
    if link.exists() or link.is_symlink():
        return
    link.symlink_to("../../../data")


def copy_app(source_root: Path, web_dir: Path) -> None:
    web_dir.mkdir(parents=True, exist_ok=True)
    ensure_data_link(web_dir)

    source_web = source_root / "web"
    for name in ["index.html", "page-coder.html"]:
        shutil.copy2(source_web / name, web_dir / name)

    source_vendor = source_web / "vendor"
    target_vendor = web_dir / "vendor"
    if source_vendor.exists():
        if target_vendor.exists() or target_vendor.is_symlink():
            shutil.rmtree(target_vendor)
        shutil.copytree(source_vendor, target_vendor)


def build_metadata(source_root: Path, web_dir: Path, include_waveforms: bool) -> None:
    run([
        sys.executable,
        str(source_root / "build_repertoire_manifest.py"),
        "--root",
        str(REPERTOIRE_ROOT),
        "--web-dir",
        str(web_dir),
    ])
    if include_waveforms:
        run([
            sys.executable,
            str(source_root / "build_waveform_cache_incremental.py"),
            "--root",
            str(REPERTOIRE_ROOT),
            "--web-dir",
            str(web_dir),
        ])


def main() -> None:
    args = parse_args()
    web_dir = REPO_ROOT / "instances" / args.instance / "web"

    with tempfile.TemporaryDirectory(prefix="choir-deploy-") as tmp:
        source_root = archive_ref(args.ref, Path(tmp)) if args.ref else REPO_ROOT
        copy_app(source_root, web_dir)
        build_metadata(source_root, web_dir, args.waveforms)

    if args.restart:
        run(["systemctl", "--user", "restart", f"choir-app-{args.instance}.service"])

    print(f"deployed {args.ref or 'working tree'} to {args.instance}: {web_dir}")


if __name__ == "__main__":
    main()
