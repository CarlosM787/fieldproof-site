"""APPROVED_TO_POST: the human approval file. Carlos writes it; the bot only reads it.

It sits at the root of the queue folder (runs/APPROVED_TO_POST in production). One entry per line,
'#' starts a comment:

    2026-10-01 3f2a9c1b7d4e
        Approves the post queued for the morning of 2026-10-01 whose approval code is 3f2a9c1b7d4e
        (APPROVAL_QUEUE.md prints this exact line under each post). The code is a hash of the text,
        the alt text and the image, so an approval never carries over to a re-rendered post.

    standing 2026-10-15..2026-11-13
        Only after the per-post weeks, and only for the unattended daily run: approves whatever
        passes every automated check on those mornings. At most 31 days, so a human renews it at
        least monthly. `python -m bot.queue publish` ignores standing lines.
"""
from __future__ import annotations

import hashlib
import re
from datetime import date
from pathlib import Path

MAX_STANDING_DAYS = 31
CODE = re.compile(r"[0-9a-f]{12}")


def approval_code(bundle: dict, image_bytes: bytes) -> str:
    h = hashlib.sha256()
    for part in (bundle["kind"], str(bundle["as_of"]), str(bundle["data_date"]), bundle["text"], bundle["alt"]):
        h.update(part.encode())
        h.update(b"\0")
    h.update(image_bytes)
    return h.hexdigest()[:12]


def read(path: Path) -> tuple[dict[date, set[str]], list[tuple[date, date]], list[str]]:
    """(codes approved per post date, standing ranges, problems with malformed lines)."""
    per_date: dict[date, set[str]] = {}
    standing, errors = [], []
    if not path.exists():
        return per_date, standing, errors
    for n, raw in enumerate(path.read_text().splitlines(), 1):
        parts = raw.split("#", 1)[0].split()
        if not parts:
            continue
        try:
            if parts[0] == "standing" and len(parts) == 2 and ".." in parts[1]:
                a, b = (date.fromisoformat(x) for x in parts[1].split(".."))
                if not 1 <= (b - a).days + 1 <= MAX_STANDING_DAYS:
                    errors.append(f"line {n}: a standing approval covers 1 to {MAX_STANDING_DAYS} days")
                    continue
                standing.append((a, b))
            elif len(parts) == 2 and CODE.fullmatch(parts[1]):
                per_date.setdefault(date.fromisoformat(parts[0]), set()).add(parts[1])
            else:
                errors.append(f"line {n}: expected 'YYYY-MM-DD <approval code>' or 'standing YYYY-MM-DD..YYYY-MM-DD'")
        except ValueError:
            errors.append(f"line {n}: not a valid date")
    return per_date, standing, errors


def check(path, post_date: date, code: str, *, allow_standing: bool) -> tuple[bool, str]:
    path = Path(path)
    if not path.exists():
        return False, f"no approval file at {path}"
    per_date, standing, errors = read(path)
    note = f" (ignored: {'; '.join(errors)})" if errors else ""
    codes = per_date.get(post_date)
    if codes:
        if code in codes:
            return True, f"approved: {post_date} {code}"
        return False, (f"the approval for {post_date} names {', '.join(sorted(codes))}, but the queued post is {code}: "
                       f"it changed after approval, so approve the current version{note}")
    if allow_standing:
        for a, b in standing:
            if a <= post_date <= b:
                return True, f"standing approval {a}..{b}"
    return False, f"no approval entry for {post_date} in {path}{note}"
