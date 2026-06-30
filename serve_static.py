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
NO_CACHE_NAMES = {
    "/",
    "/index.html",
    "/repertoire.json",
    "/waveforms.json",
    "/vendor/choir/media-cache.js",
    "/vendor/choir/practice-domain.js",
    "/vendor/choir/pdf-viewer.js",
    "/vendor/choir/practice-settings.js",
    "/vendor/choir/repertoire-data.js",
    "/vendor/choir/url-policy.js",
}


class ChoirStaticHandler(SimpleHTTPRequestHandler):
    def end_headers(self) -> None:
        self.send_header("Cache-Control", self.cache_control_for_path())
        self.send_header("Content-Security-Policy", self.content_security_policy())
        self.send_header("Cross-Origin-Resource-Policy", "same-origin")
        self.send_header("Permissions-Policy", "camera=(), geolocation=(), microphone=()")
        self.send_header("Referrer-Policy", "same-origin")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("X-Frame-Options", "DENY")
        super().end_headers()

    def content_security_policy(self) -> str:
        return "; ".join([
            "default-src 'self'",
            "script-src 'self' 'unsafe-inline'",
            "style-src 'self' 'unsafe-inline'",
            "img-src 'self' data:",
            "media-src 'self' blob:",
            "connect-src 'self'",
            "worker-src 'self' blob:",
            "object-src 'none'",
            "base-uri 'self'",
            "frame-ancestors 'none'",
        ])

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
