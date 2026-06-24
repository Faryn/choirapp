import argparse
import json
import shutil
import subprocess
import sys
import tempfile
import urllib.request
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parent
REPERTOIRE_ROOT = REPO_ROOT / "data" / "repertoire" / "01_Aktuelles_Repertoire"
INSTANCE_PORTS = {"prod": 5174, "test": 5175}
SMOKE_SECTION_COUNTS = {"Nur ein Wort": 14, "Thank You": 8}


def run(cmd: list[str], cwd: Path = REPO_ROOT, dry_run: bool = False) -> None:
    print("+", " ".join(cmd))
    if not dry_run:
        subprocess.run(cmd, cwd=cwd, check=True)


def output(cmd: list[str], cwd: Path = REPO_ROOT) -> str:
    return subprocess.check_output(cmd, cwd=cwd, text=True).strip()


def normalize_argv(argv: list[str]) -> list[str]:
    if argv and argv[0] in {"test", "prod"}:
        return ["deploy", *argv]
    return argv


def add_deploy_args(parser: argparse.ArgumentParser) -> None:
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
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print the deployment actions without changing files or services.",
    )
    parser.add_argument(
        "--no-smoke",
        action="store_true",
        help="Skip HTTP/service smoke checks after deployment.",
    )
    parser.add_argument(
        "--allow-working-tree-prod",
        action="store_true",
        help="Allow prod deployment from the current working tree. Prefer --ref for prod.",
    )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Deploy and promote the choir app.")
    subparsers = parser.add_subparsers(dest="command", required=True)

    deploy = subparsers.add_parser("deploy", help="Deploy a working tree or Git ref to an instance.")
    add_deploy_args(deploy)

    promote = subparsers.add_parser("promote", help="Promote a tested Git ref to production.")
    promote.add_argument("--from-ref", default="main", help="Tested source ref to promote.")
    promote.add_argument("--production-branch", default="production", help="Moving prod branch to update.")
    promote.add_argument("--tag", help="Optional immutable prod tag to create at the promoted commit.")
    promote.add_argument("--restart", action="store_true", help="Restart prod after deployment.")
    promote.add_argument("--waveforms", action="store_true", help="Regenerate prod waveform metadata.")
    promote.add_argument("--dry-run", action="store_true", help="Print actions without changing refs/files/services.")
    promote.add_argument("--no-push", action="store_true", help="Do not push production branch/tag to origin.")
    promote.add_argument("--no-smoke", action="store_true", help="Skip prod smoke checks after deployment.")

    smoke = subparsers.add_parser("smoke", help="Run service and HTTP smoke checks for an instance.")
    smoke.add_argument("instance", choices=["test", "prod"], help="Instance to check.")

    return parser.parse_args(normalize_argv(sys.argv[1:]))


def resolve_commit(ref: str) -> str:
    return output(["git", "rev-parse", "--verify", f"{ref}^{{commit}}"])


def ref_exists(ref: str) -> bool:
    result = subprocess.run(
        ["git", "rev-parse", "--verify", f"{ref}^{{commit}}"],
        cwd=REPO_ROOT,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    return result.returncode == 0


def ensure_fast_forward(target_ref: str, source_commit: str) -> None:
    if not ref_exists(target_ref):
        return
    subprocess.run(["git", "merge-base", "--is-ancestor", target_ref, source_commit], cwd=REPO_ROOT, check=True)


def archive_ref(ref: str, target: Path, dry_run: bool = False) -> Path:
    archive = target / "source.tar"
    source_root = target / "source"
    if dry_run:
        print(f"would archive {ref} to {source_root}")
        return REPO_ROOT
    with archive.open("wb") as handle:
        subprocess.run(["git", "archive", "--format=tar", ref], cwd=REPO_ROOT, check=True, stdout=handle)
    source_root.mkdir()
    run(["tar", "-xf", str(archive), "-C", str(source_root)])
    return source_root


def ensure_data_link(web_dir: Path, dry_run: bool = False) -> None:
    link = web_dir / "data"
    if link.exists() or link.is_symlink():
        return
    print(f"create symlink {link} -> ../../../data")
    if not dry_run:
        link.symlink_to("../../../data")


def copy_app(source_root: Path, web_dir: Path, dry_run: bool = False) -> None:
    print(f"copy app from {source_root / 'web'} to {web_dir}")
    if dry_run:
        return

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


def build_metadata(source_root: Path, web_dir: Path, include_waveforms: bool, dry_run: bool = False) -> None:
    run([
        sys.executable,
        str(source_root / "build_repertoire_manifest.py"),
        "--root",
        str(REPERTOIRE_ROOT),
        "--web-dir",
        str(web_dir),
    ], dry_run=dry_run)
    if include_waveforms:
        run([
            sys.executable,
            str(source_root / "build_waveform_cache_incremental.py"),
            "--root",
            str(REPERTOIRE_ROOT),
            "--web-dir",
            str(web_dir),
        ], dry_run=dry_run)


def http_get(url: str) -> str:
    with urllib.request.urlopen(url, timeout=5) as response:
        return response.read().decode("utf-8")


def smoke_check(instance: str) -> None:
    port = INSTANCE_PORTS[instance]
    service = f"choir-app-{instance}.service"
    state = output(["systemctl", "--user", "is-active", service])
    if state != "active":
        raise RuntimeError(f"{service} is {state}")

    base = f"http://127.0.0.1:{port}"
    index = http_get(f"{base}/")
    required = ["Set loop", "score-pdfs"]
    forbidden = ["Loop Spike", "Little Pilots rehearsal desk"]
    missing = [text for text in required if text not in index]
    stale = [text for text in forbidden if text in index]
    if missing:
        raise RuntimeError(f"{instance} page missing expected text: {missing}")
    if stale:
        raise RuntimeError(f"{instance} page contains stale text: {stale}")

    manifest = json.loads(http_get(f"{base}/repertoire.json"))
    by_song = {entry.get("song"): entry for entry in manifest}
    for song, count in SMOKE_SECTION_COUNTS.items():
        actual = len(by_song.get(song, {}).get("sections", []))
        if actual != count:
            raise RuntimeError(f"{song} section count is {actual}, expected {count}")

    print(f"smoke ok: {instance} on {base}")


def deploy_instance(args: argparse.Namespace) -> None:
    if args.instance == "prod" and not args.ref and not args.allow_working_tree_prod:
        raise SystemExit("Refusing prod deploy from working tree. Use --ref or --allow-working-tree-prod.")

    web_dir = REPO_ROOT / "instances" / args.instance / "web"
    source_label = args.ref or "working tree"

    with tempfile.TemporaryDirectory(prefix="choir-deploy-") as tmp:
        source_root = archive_ref(args.ref, Path(tmp), args.dry_run) if args.ref else REPO_ROOT
        copy_app(source_root, web_dir, args.dry_run)
        build_metadata(source_root, web_dir, args.waveforms, args.dry_run)

    if args.restart:
        run(["systemctl", "--user", "restart", f"choir-app-{args.instance}.service"], dry_run=args.dry_run)

    if not args.dry_run and not args.no_smoke:
        smoke_check(args.instance)

    print(f"deployed {source_label} to {args.instance}: {web_dir}")


def promote(args: argparse.Namespace) -> None:
    source_commit = resolve_commit(args.from_ref)
    ensure_fast_forward(args.production_branch, source_commit)

    tag_args = []
    if args.tag:
        if ref_exists(f"refs/tags/{args.tag}"):
            raise SystemExit(f"Tag already exists: {args.tag}")
        tag_args = [args.tag]

    print(f"promote {args.from_ref} ({source_commit}) to {args.production_branch}")
    run(["git", "branch", "-f", args.production_branch, source_commit], dry_run=args.dry_run)
    if args.tag:
        run(["git", "tag", args.tag, source_commit], dry_run=args.dry_run)
    if not args.no_push:
        run(["git", "push", "origin", args.production_branch], dry_run=args.dry_run)
        if tag_args:
            run(["git", "push", "origin", *tag_args], dry_run=args.dry_run)

    deploy_args = argparse.Namespace(
        instance="prod",
        ref=args.production_branch,
        restart=args.restart,
        waveforms=args.waveforms,
        dry_run=args.dry_run,
        no_smoke=args.no_smoke,
        allow_working_tree_prod=False,
    )
    deploy_instance(deploy_args)


def main() -> None:
    args = parse_args()
    if args.command == "deploy":
        deploy_instance(args)
    elif args.command == "promote":
        promote(args)
    elif args.command == "smoke":
        smoke_check(args.instance)


if __name__ == "__main__":
    main()
