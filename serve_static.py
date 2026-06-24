#!/usr/bin/env python3
"""Small static server for the choir app with sensible cache headers."""

from __future__ import annotations

import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

IMMUTABLE_EXTENSIONS = {
    ".pdf",
    ".mp3",
    ".m4a",
    ".wav",
    ".flac",
    ".ogg",
    ".json",
    ".mjs",
    ".js",
    ".css",
    ".png",
    ".jpg",
    ".jpeg",
    ".webp",
    ".svg",
}
NO_CACHE_NAMES = {"/", "/index.html", "/repertoire.json", "/waveforms.json"}


class ChoirStaticHandler(SimpleHTTPRequestHandler):
    def end_headers(self) -> None:
        self.send_header("Cache-Control", self.cache_control_for_path())
        super().end_headers()

    def cache_control_for_path(self) -> str:
        parsed = urlsplit(self.path)
        path = parsed.path
        query = parse_qs(parsed.query)
        suffix = Path(path).suffix.lower()

        if path in NO_CACHE_NAMES:
            return "no-cache"

        # Manifest fingerprints are appended as ?v=<mtime-size>. Those URLs are
        # content-addressed enough for the browser to keep aggressively.
        if query.get("v") and suffix in IMMUTABLE_EXTENSIONS:
            return "public, max-age=31536000, immutable"

        if suffix in {".pdf", ".mp3", ".m4a", ".wav", ".flac", ".ogg"}:
            return "public, max-age=86400"

        return "public, max-age=300"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="0.0.0.0")
    parser.add_argument("--port", type=int, default=5174)
    parser.add_argument("--directory", default="web")
    args = parser.parse_args()

    directory = Path(args.directory).resolve()
    handler = partial(ChoirStaticHandler, directory=str(directory))
    server = ThreadingHTTPServer((args.host, args.port), handler)
    print(f"Serving choir app from {directory} on http://{args.host}:{args.port}", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
