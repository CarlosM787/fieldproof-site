"""A user-context access token for posting, without a long-lived token in the repo.

X OAuth 2.0 access tokens expire after 2 hours; refresh tokens are single-use (each refresh returns
a new one and invalidates the old) and last about 6 months (VERIFIED: xdevplatform/docs @3ef050bd,
fundamentals/authentication/oauth-2-0/oauth-1-0a-token-exchange.mdx and user-access-token.mdx). So
the bot keeps the refresh token, and every refresh must save the new one before anything else.

Environment (GitHub Actions secrets; never in code or logs):
  X_CLIENT_ID, X_CLIENT_SECRET  the app's OAuth 2.0 client (a bot app is a confidential client)
  X_REFRESH_TOKEN               the current refresh token
  X_REFRESH_TOKEN_OUT           file the rotated refresh token is written to (mode 600); the workflow
                                stores it back with `gh secret set` and deletes the file
  X_USER_TOKEN                  optional: a still-valid access token for a hand-run post (no refresh)
"""
from __future__ import annotations

import base64
import json
import os
import urllib.parse
import urllib.request

TOKEN_URL = "https://api.x.com/2/oauth2/token"


def access_token(env=None, opener=urllib.request.urlopen) -> str | None:
    """Returns an access token, or None when no credentials are configured. Refreshing rotates the
    refresh token, so it refuses to refresh unless X_REFRESH_TOKEN_OUT says where to keep the new one."""
    env = os.environ if env is None else env
    if env.get("X_USER_TOKEN"):
        return env["X_USER_TOKEN"]
    refresh, client_id = env.get("X_REFRESH_TOKEN"), env.get("X_CLIENT_ID")
    if not (refresh and client_id):
        return None
    out = env.get("X_REFRESH_TOKEN_OUT")
    if not out:
        raise RuntimeError("X_REFRESH_TOKEN_OUT is not set: a refresh would invalidate the stored refresh token "
                           "and lose the new one")
    form = {"grant_type": "refresh_token", "refresh_token": refresh}
    headers = {"Content-Type": "application/x-www-form-urlencoded"}
    if env.get("X_CLIENT_SECRET"):
        pair = f"{client_id}:{env['X_CLIENT_SECRET']}".encode()
        headers["Authorization"] = "Basic " + base64.b64encode(pair).decode()
    else:
        form["client_id"] = client_id
    req = urllib.request.Request(TOKEN_URL, data=urllib.parse.urlencode(form).encode(), headers=headers, method="POST")
    with opener(req, timeout=30) as r:
        tok = json.loads(r.read().decode())
    if tok.get("refresh_token"):
        fd = os.open(out, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        with os.fdopen(fd, "w") as f:
            f.write(tok["refresh_token"])
    return tok["access_token"]
