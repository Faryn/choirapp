#!/usr/bin/env python3
"""Import Sphere Groove weekly rehearsal plans from the forwarding mailbox."""

from __future__ import annotations

import argparse
import datetime as dt
import json
import re
import sqlite3
import subprocess
from email.utils import parsedate_to_datetime
from pathlib import Path


TIME_RE = re.compile(r"^\d{1,2}[.:]\d{2}$")
FORWARDED_DATE_RE = re.compile(r"^Date:\s*(.+)$", re.MULTILINE)
HUMAN_DATE_RE = re.compile(r"(?:[A-Za-z]{3},\s+)?([A-Za-z]{3})\s+(\d{1,2}),\s+(\d{4})")
GERMAN_SHORT_DATE_RE = re.compile(r"^(\d{1,2})\.(\d{1,2})\.$")
SPACE_RE = re.compile(r"\s+")


def clean(value: str) -> str:
    return SPACE_RE.sub(" ", value.strip()).strip("*").strip()


def plan_date(message: str) -> str | None:
    # A forwarded message retains the delivery date first and the original
    # rehearsal-mail date later. The latter is what labels the rehearsal.
    for value in reversed(FORWARDED_DATE_RE.findall(message)):
        try:
            return parsedate_to_datetime(value).date().isoformat()
        except (TypeError, ValueError):
            match = HUMAN_DATE_RE.search(value)
            if match:
                try:
                    return dt.datetime.strptime(" ".join(match.groups()), "%b %d %Y").date().isoformat()
                except ValueError:
                    pass
    return None


def rehearsal_date(message: str) -> str | None:
    """Return the scheduled rehearsal date from the overview when present."""
    sent_date = plan_date(message)
    if not sent_date:
        return None
    year = dt.date.fromisoformat(sent_date).year
    lines = [clean(line) for line in message.replace("\r\n", "\n").split("\n")]
    try:
        overview = next(idx for idx, line in enumerate(lines) if "übersichtsplan" in line.casefold())
    except StopIteration:
        return sent_date
    for line in lines[overview + 1:]:
        if line.casefold().startswith("probenplan"):
            break
        match = GERMAN_SHORT_DATE_RE.match(line)
        if match:
            day, month = map(int, match.groups())
            try:
                return dt.date(year, month, day).isoformat()
            except ValueError:
                continue
    return sent_date


def parse_weekly_plan(message: str) -> dict[str, object] | None:
    """Parse the deliberately simple three-column schedule in a Wochenmail."""
    lines = [clean(line) for line in message.replace("\r\n", "\n").split("\n")]
    try:
        start = next(idx for idx, line in enumerate(lines) if line.casefold() == "wann")
    except StopIteration:
        return None

    # The first headings are Wann / Was / Inhalt. Everything after that is rows
    # until the sign-off or links collection begins.
    rows: list[dict[str, object]] = []
    idx = start + 1
    while idx < len(lines):
        line = lines[idx]
        if ("linksammlung" in line.casefold() or line.casefold().startswith(("lg", "liebe ", "übeaufträge", "tickets "))):
            break
        if not TIME_RE.match(line):
            idx += 1
            continue

        time = line.replace(".", ":")
        idx += 1
        fields: list[str] = []
        while idx < len(lines):
            candidate = lines[idx]
            if (TIME_RE.match(candidate) or "linksammlung" in candidate.casefold()
                    or candidate.casefold().startswith(("lg", "übeaufträge", "tickets "))):
                break
            if candidate and candidate.casefold() not in {"was", "inhalt"} and not re.fullmatch(r"[-—]{3,}", candidate):
                fields.append(candidate)
            idx += 1
        if fields:
            rows.append({
                "time": time,
                "activity": fields[0],
                "details": fields[1:],
            })

    if not rows:
        return None
    return {"date": rehearsal_date(message), "items": rows}


def connect(database: Path) -> sqlite3.Connection:
    database.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(database)
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS weekly_plans (
            source_key TEXT PRIMARY KEY,
            rehearsal_date TEXT,
            imported_at TEXT NOT NULL,
            plan_json TEXT NOT NULL
        )
        """
    )
    return conn


def save_plan(database: Path, source_key: str, plan: dict[str, object]) -> bool:
    with connect(database) as conn:
        result = conn.execute(
            "INSERT OR IGNORE INTO weekly_plans (source_key, rehearsal_date, imported_at, plan_json) VALUES (?, ?, ?, ?)",
            (source_key, plan.get("date"), dt.datetime.now(dt.UTC).isoformat(), json.dumps(plan, ensure_ascii=False)),
        )
    return result.rowcount == 1


def latest_plan(database: Path) -> dict[str, object] | None:
    if not database.exists():
        return None
    with connect(database) as conn:
        row = conn.execute(
            "SELECT plan_json FROM weekly_plans ORDER BY COALESCE(rehearsal_date, '') DESC, imported_at DESC LIMIT 1"
        ).fetchone()
    return json.loads(row[0]) if row else None


def himalaya(command: list[str]) -> str:
    return subprocess.check_output(
        ["himalaya", "--account", "paulgodassistant", *command], text=True
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="Import choir weekly plans from email.")
    parser.add_argument("--database", type=Path, required=True)
    parser.add_argument("--message", type=Path, help="Parse a saved email instead of polling the mailbox.")
    parser.add_argument("--mailbox-id", help="Explicit mailbox message id selected by the agent.")
    parser.add_argument("--source-key", default="manual")
    args = parser.parse_args()

    if args.message:
        raw = args.message.read_text(encoding="utf-8")
    elif args.mailbox_id:
        raw = himalaya(["message", "read", args.mailbox_id, "--mailbox", "INBOX"])
    else:
        parser.error("use --message or --mailbox-id; this importer never polls the mailbox")
    plan = parse_weekly_plan(raw)
    if not plan:
        raise SystemExit("No weekly rehearsal plan found in message")
    source_key = args.source_key if args.message else f"mailbox:{args.mailbox_id}"
    print("imported" if save_plan(args.database, source_key, plan) else "already imported")


if __name__ == "__main__":
    main()
