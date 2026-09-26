"""Publishing, guarded. Dry run by default.

A live post needs ALL of:
  1. live=True (the --live flag),
  2. approved=True: the caller found a matching line in APPROVED_TO_POST (bot/approval.py),
  3. a posted log with no refusal (bot/ledger.py): the caller checks it; publish() writes the
     `attempt` line just before creating the post and the `posted` line right after,
  4. a user-context access token (bot/xauth.py), fetched only at this point and never stored here.
Endpoints and request shapes follow docs.x.com as mirrored in xdevplatform/docs @3ef050bd
(openapi.json v2.168): POST /2/media/upload (multipart: media, media_category), POST /2/media/metadata
(id, metadata.alt_text.text, at most 1,000 characters), POST /2/tweets (text, media.media_ids).
Run the first live post by hand and watch it.
"""
from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from pathlib import Path

from . import xauth

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


def publish(bundle: dict, run_dir: Path, live: bool = False, approved: bool = False, ledger=None,
            token_provider=xauth.access_token) -> dict:
    image = Path(run_dir) / bundle["image"]
    if not live:
        return {"status": "dry-run", "would_post": bundle["text"], "image": str(image)}
    if not approved:
        return {"status": "blocked", "reason": "no human approval for this post"}
    token = token_provider()
    if not token:
        return {"status": "blocked", "reason": "no X user token (X_REFRESH_TOKEN + X_CLIENT_ID, or X_USER_TOKEN)"}
    body, ctype = _multipart({"media_category": "tweet_image"}, "media", image.name, image.read_bytes(), "image/png")
    media = _post(f"{API}/media/upload", token, body=body, ctype=ctype)
    media_id = (media.get("data") or {}).get("id") or media.get("media_id_string")
    if not media_id:
        raise RuntimeError(f"media upload returned no id: {media}")
    _post(f"{API}/media/metadata", token, {"id": media_id, "metadata": {"alt_text": {"text": bundle["alt"]}}})
    if ledger:
        ledger.record("attempt", bundle, media_id=media_id)
    try:
        res = _post(f"{API}/tweets", token, {"text": bundle["text"], "media": {"media_ids": [media_id]}})
    except urllib.error.HTTPError as e:
        if ledger and 400 <= e.code < 500:  # refused outright, so nothing was posted; a timeout or 5xx stays unconfirmed
            ledger.record("not-posted", bundle, error=f"HTTP {e.code}")
        raise
    post_id = (res.get("data") or {}).get("id")
    if not post_id:
        raise RuntimeError(f"create-post returned no id (the attempt stays unconfirmed): {res}")
    if ledger:
        ledger.record("posted", bundle, post_id=post_id, media_id=media_id)
    return {"status": "posted", "id": post_id, "media_id": media_id}
