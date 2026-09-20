#!/usr/bin/env python3
"""Small static server for the choir app with sensible cache headers."""

from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import hmac
import html
import os
import sqlite3
import threading
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlsplit
from zoneinfo import ZoneInfo

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
    "/vendor/choir/audio-engine.js",
    "/vendor/choir/media-cache.js",
    "/vendor/choir/media-session.js",
    "/vendor/choir/playback-controller.js",
    "/vendor/choir/practice-domain.js",
    "/vendor/choir/pdf-viewer.js",
    "/vendor/choir/practice-settings.js",
    "/vendor/choir/repertoire-data.js",
    "/vendor/choir/url-policy.js",
}
ANALYTICS_DASHBOARD_PATH = "/__analytics"
BERLIN_TZ = ZoneInfo("Europe/Berlin")


class AnalyticsStore:
    """Privacy-preserving unique visitor counters.

    The server temporarily uses a request's peer address to create separate
    HMAC tokens for each reporting period. Raw addresses are never written to
    disk or logs, and tokens cannot be used to link a visitor between periods.
    """

    def __init__(self, database_path: Path, secret_path: Path) -> None:
        self.database_path = database_path
        self.secret_path = secret_path
        self._lock = threading.Lock()
        self._secret = self._load_or_create_secret()
        self.database_path.parent.mkdir(parents=True, exist_ok=True)
        with self._connect() as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS visitor_periods (
                    period_type TEXT NOT NULL,
                    period_key TEXT NOT NULL,
                    visitor_token TEXT NOT NULL,
                    first_seen_at TEXT NOT NULL,
                    PRIMARY KEY (period_type, period_key, visitor_token)
                )
                """
            )
            conn.execute(
                "CREATE INDEX IF NOT EXISTS visitor_periods_lookup "
                "ON visitor_periods (period_type, period_key)"
            )
        self.purge_expired()

    def _load_or_create_secret(self) -> bytes:
        self.secret_path.parent.mkdir(parents=True, exist_ok=True)
        try:
            return self.secret_path.read_bytes()
        except FileNotFoundError:
            secret = os.urandom(32)
            flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL
            try:
                descriptor = os.open(self.secret_path, flags, 0o600)
            except FileExistsError:
                return self.secret_path.read_bytes()
            with os.fdopen(descriptor, "wb") as handle:
                handle.write(secret)
            return secret

    def _connect(self) -> sqlite3.Connection:
        return sqlite3.connect(self.database_path, timeout=5)

    @staticmethod
    def _periods(now: dt.datetime) -> dict[str, str]:
        iso_year, iso_week, _ = now.isocalendar()
        return {
            "day": now.date().isoformat(),
            "week": f"{iso_year}-W{iso_week:02d}",
            "month": now.strftime("%Y-%m"),
            "year": now.strftime("%Y"),
        }

    def _token(self, period_type: str, period_key: str, address: str) -> str:
        # The period key intentionally scopes a token so it cannot track a
        # person across different days, weeks, months, or years.
        payload = f"{period_type}:{period_key}:{address}".encode("utf-8")
        return hmac.new(self._secret, payload, hashlib.sha256).hexdigest()

    @staticmethod
    def _month_key(year: int, month: int, months_ago: int) -> str:
        absolute_month = year * 12 + month - 1 - months_ago
        return f"{absolute_month // 12:04d}-{absolute_month % 12 + 1:02d}"

    @classmethod
    def _retention_cutoffs(cls, now: dt.datetime) -> dict[str, str]:
        # Keep only the current period plus the stated number of prior periods.
        week_start = now.date() - dt.timedelta(days=now.weekday())
        week_year, week_number, _ = (week_start - dt.timedelta(weeks=52)).isocalendar()
        return {
            "day": (now.date() - dt.timedelta(days=89)).isoformat(),
            "week": f"{week_year}-W{week_number:02d}",
            "month": cls._month_key(now.year, now.month, 23),
            "year": f"{now.year - 4:04d}",
        }

    def _purge_expired(self, conn: sqlite3.Connection, now: dt.datetime) -> None:
        for period_type, cutoff in self._retention_cutoffs(now).items():
            conn.execute(
                "DELETE FROM visitor_periods WHERE period_type = ? AND period_key < ?",
                (period_type, cutoff),
            )

    def purge_expired(self) -> None:
        """Delete expired, period-scoped visitor tokens."""
        with self._lock, self._connect() as conn:
            self._purge_expired(conn, dt.datetime.now(BERLIN_TZ))

    def record_visit(self, address: str) -> None:
        now = dt.datetime.now(BERLIN_TZ)
        rows = [
            (period_type, period_key, self._token(period_type, period_key, address), now.isoformat())
            for period_type, period_key in self._periods(now).items()
        ]
        with self._lock, self._connect() as conn:
            self._purge_expired(conn, now)
            conn.executemany(
                "INSERT OR IGNORE INTO visitor_periods "
                "(period_type, period_key, visitor_token, first_seen_at) VALUES (?, ?, ?, ?)",
                rows,
            )

    def report(self) -> tuple[dict[str, int], dt.datetime]:
        now = dt.datetime.now(BERLIN_TZ)
        periods = self._periods(now)
        with self._connect() as conn:
            counts = {
                period_type: conn.execute(
                    "SELECT COUNT(*) FROM visitor_periods WHERE period_type = ? AND period_key = ?",
                    (period_type, period_key),
                ).fetchone()[0]
                for period_type, period_key in periods.items()
            }
        return counts, now


def analytics_dashboard(counts: dict[str, int], now: dt.datetime, title: str) -> str:
    cards = [
        ("Today", counts["day"]),
        ("This week", counts["week"]),
        ("This month", counts["month"]),
        ("This year", counts["year"]),
    ]
    card_html = "".join(
        f"<section><h2>{html.escape(label)}</h2><strong>{count}</strong><p>unique visitors</p></section>"
        for label, count in cards
    )
    updated = html.escape(now.strftime("%d %b %Y, %H:%M %Z"))
    return f"""<!doctype html>
<html lang=\"en\"><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">
<title>{html.escape(title)}</title>
<style>
body {{ max-width: 760px; margin: 40px auto; padding: 0 20px; font: 16px system-ui, sans-serif; color: #17231f; background: #f5f7f4; }}
h1 {{ margin-bottom: 6px; }} .cards {{ display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; margin: 28px 0; }}
section {{ padding: 18px; background: white; border-radius: 12px; box-shadow: 0 1px 4px #0001; }} h2 {{ font-size: 14px; margin: 0; color: #52635a; }}
strong {{ display: block; font-size: 42px; margin-top: 8px; }} p, small {{ color: #52635a; }}
@media (max-width: 480px) {{ .cards {{ grid-template-columns: 1fr; }} }}
</style>
<h1>{html.escape(title)}</h1><small>Updated {updated}</small>
<div class=\"cards\">{card_html}</div>
<p>Privacy: no IP addresses or request logs are retained. Counts use independent, non-reversible HMAC tokens scoped to each reporting period, so visitors cannot be linked across periods.</p>
</html>"""


class ChoirStaticHandler(SimpleHTTPRequestHandler):
    analytics: AnalyticsStore | None = None
    analytics_title = "Choir app analytics"

    def do_GET(self) -> None:
        path = urlsplit(self.path).path
        if path == ANALYTICS_DASHBOARD_PATH:
            if self.analytics is None:
                self.send_error(404)
                return
            counts, now = self.analytics.report()
            body = analytics_dashboard(counts, now, self.analytics_title).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        if self.analytics is not None and path in {"/", "/index.html"}:
            # client_address exists only for this request and is discarded as
            # soon as its scoped HMAC tokens have been recorded.
            self.analytics.record_visit(self.client_address[0])
        super().do_GET()

    def log_message(self, _format: str, *_args: object) -> None:
        # BaseHTTPRequestHandler logs client addresses. Do not retain them.
        return

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
    parser.add_argument(
        "--analytics-db",
        help="Enable privacy-preserving visitor analytics stored in this SQLite database.",
    )
    parser.add_argument(
        "--analytics-secret",
        help="Path to the local HMAC secret (required with --analytics-db).",
    )
    parser.add_argument(
        "--analytics-title",
        default="Choir app analytics",
        help="Title displayed by the analytics dashboard.",
    )
    args = parser.parse_args()

    if bool(args.analytics_db) != bool(args.analytics_secret):
        parser.error("--analytics-db and --analytics-secret must be used together")

    directory = Path(args.directory).resolve()
    handler = partial(ChoirStaticHandler, directory=str(directory))
    if args.analytics_db:
        ChoirStaticHandler.analytics = AnalyticsStore(Path(args.analytics_db), Path(args.analytics_secret))
        ChoirStaticHandler.analytics_title = args.analytics_title
    server = ThreadingHTTPServer((args.host, args.port), handler)
    print(f"Serving choir app from {directory} on http://{args.host}:{args.port}", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
