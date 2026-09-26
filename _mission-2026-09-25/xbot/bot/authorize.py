"""One-time authorization of the bot account, with only the scopes the bot needs.

Run once on Carlos's own computer (never in CI), signed in to X as the BOT account:

  X_CLIENT_ID=... X_CLIENT_SECRET=... python -m bot.authorize --redirect-uri http://localhost:8080/callback --out ~/x_refresh_token
  gh secret set X_REFRESH_TOKEN --repo <owner>/<bot-repo> < ~/x_refresh_token && shred -u ~/x_refresh_token

It prints X's authorize URL. Open it, approve, and paste back the address the browser is sent to
(the page itself may fail to load: the code is in the address). The authorization code is valid for
30 seconds, so paste promptly. The refresh token is written to --out (mode 600) and never printed.
The redirect URI must match one registered in the app's settings.

Flow and endpoints: OAuth 2.0 Authorization Code with PKCE (VERIFIED xdevplatform/docs @3ef050bd,
fundamentals/authentication/oauth-2-0/user-access-token.mdx and authorization-code.mdx). X's own
`xurl auth oauth2` also works but always asks for about 25 scopes, including DMs and follows.
"""
from __future__ import annotations

import argparse
import base64
import hashlib
import json
import os
import secrets
import urllib.parse
import urllib.request

AUTHORIZE_URL = "https://x.com/i/oauth2/authorize"
TOKEN_URL = "https://api.x.com/2/oauth2/token"
SCOPES = "tweet.read tweet.write users.read media.write offline.access"  # create-post, media upload, refresh


def authorize_url(client_id: str, redirect_uri: str) -> tuple[str, str, str]:
    """(url, state, code_verifier) for a PKCE S256 request."""
    verifier = secrets.token_urlsafe(64)
    challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b"=").decode()
    state = secrets.token_urlsafe(16)
    q = {"response_type": "code", "client_id": client_id, "redirect_uri": redirect_uri, "scope": SCOPES,
         "state": state, "code_challenge": challenge, "code_challenge_method": "S256"}
    return f"{AUTHORIZE_URL}?{urllib.parse.urlencode(q, quote_via=urllib.parse.quote)}", state, verifier


def exchange(redirected_to: str, state: str, verifier: str, client_id: str, client_secret: str | None,
             redirect_uri: str, opener=urllib.request.urlopen) -> dict:
    q = urllib.parse.parse_qs(urllib.parse.urlparse(redirected_to.strip()).query)
    if q.get("state", [""])[0] != state:
        raise SystemExit("state does not match: start again")
    if "code" not in q:
        raise SystemExit(f"no code in the address (error: {q.get('error', ['?'])[0]})")
    form = {"grant_type": "authorization_code", "code": q["code"][0], "redirect_uri": redirect_uri,
            "code_verifier": verifier}
    headers = {"Content-Type": "application/x-www-form-urlencoded"}
    if client_secret:
        headers["Authorization"] = "Basic " + base64.b64encode(f"{client_id}:{client_secret}".encode()).decode()
    else:
        form["client_id"] = client_id
    req = urllib.request.Request(TOKEN_URL, data=urllib.parse.urlencode(form).encode(), headers=headers, method="POST")
    with opener(req, timeout=30) as r:
        return json.loads(r.read().decode())


def save_refresh_token(tok: dict, out: str):
    if "refresh_token" not in tok:
        raise SystemExit(f"no refresh token returned (granted scopes: {tok.get('scope')}); was offline.access approved?")
    fd = os.open(os.path.expanduser(out), os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w") as f:
        f.write(tok["refresh_token"])


def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--redirect-uri", required=True, help="exactly as registered in the app's settings")
    p.add_argument("--out", required=True, help="file for the refresh token (created with mode 600)")
    a = p.parse_args(argv)
    client_id, client_secret = os.environ["X_CLIENT_ID"], os.environ.get("X_CLIENT_SECRET")
    url, state, verifier = authorize_url(client_id, a.redirect_uri)
    print("Signed in as the BOT account, open:\n\n" + url + "\n")
    redirected = input("Paste the address you were sent to: ")
    tok = exchange(redirected, state, verifier, client_id, client_secret, a.redirect_uri)
    save_refresh_token(tok, a.out)
    print(f"Saved the refresh token to {a.out} (granted: {tok.get('scope')}). Store it with gh secret set, then delete the file.")


if __name__ == "__main__":
    main()
