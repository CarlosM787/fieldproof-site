"""Publishing, guarded three ways. Dry run by default.

Live posting needs ALL of:
  1. the --live flag,
  2. an OAuth 2.0 user-context token in X_USER_TOKEN (Carlos's authorized account),
  3. a file APPROVED_TO_POST in the run directory containing today's date (a human's daily or
     standing approval, written by Carlos, never by the bot).
Endpoints follow docs.x.com as mirrored in xdevplatform/docs @3ef050bd (VERIFIED by the research
lane); run the first live post by hand and watch it.
"""
from __future__ import annotations

import json
import os
import urllib.request
from datetime import date
from pathlib import Path

API = "https://api.x.com/2"


def _post(url, token, data=None, body=None, ctype="application/json"):
    req = urllib.request.Request(url, data=body if body is not None else json.dumps(data).encode(), method="POST")
    req.add_header("Authorization", f"Bearer {token}")
    req.add_header("Content-Type", ctype)
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read().decode())


def _multipart(fields: dict, file_field: str, filename: str, content: bytes, mime: str):
    boundary = "----cdr" + os.urandom(8).hex()
    parts = []
    for k, v in fields.items():
        parts.append(f"--{boundary}\r\nContent-Disposition: form-data; name=\"{k}\"\r\n\r\n{v}\r\n".encode())
    parts.append(f"--{boundary}\r\nContent-Disposition: form-data; name=\"{file_field}\"; filename=\"{filename}\"\r\nContent-Type: {mime}\r\n\r\n".encode() + content + b"\r\n")
    parts.append(f"--{boundary}--\r\n".encode())
    return b"".join(parts), f"multipart/form-data; boundary={boundary}"


def publish(bundle: dict, run_dir: Path, live: bool = False) -> dict:
    if not live:
        return {"status": "dry-run", "would_post": bundle["text"], "image": bundle["image"]}
    token = os.environ.get("X_USER_TOKEN")
    approval = run_dir / "APPROVED_TO_POST"
    today = date.today().isoformat()
    if not token:
        return {"status": "blocked", "reason": "X_USER_TOKEN not set"}
    if not approval.exists() or today not in approval.read_text():
        return {"status": "blocked", "reason": f"no human approval for {today} in {approval}"}
    img = Path(bundle["image"]).read_bytes()
    body, ctype = _multipart({"media_category": "tweet_image"}, "media", "chart.png", img, "image/png")
    media = _post(f"{API}/media/upload", token, body=body, ctype=ctype)
    media_id = media.get("data", {}).get("id") or media.get("id") or media.get("media_id_string")
    _post(f"{API}/media/metadata", token, {"id": media_id, "metadata": {"alt_text": {"text": bundle["alt"][:1000]}}})
    res = _post(f"{API}/tweets", token, {"text": bundle["text"], "media": {"media_ids": [media_id]}})
    return {"status": "posted", "id": res.get("data", {}).get("id"), "media_id": media_id}
