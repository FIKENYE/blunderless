"""
Authentication & Session helpers for Blunderless (`src/auth.py`).

Supports:
1. Real Google OAuth 2.0 ("Continue with Google") using environment variables
   `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` (never hardcoded or committed).
2. Instant Local Profile Sign-In so users can link Chess.com + Lichess accounts,
   track ELO, and cache analysed games on localhost even before configuring Google OAuth.
"""

from __future__ import annotations

import json
import os
import secrets
import time
import urllib.error
import urllib.parse
import urllib.request
from typing import Any, Optional

from src.db import (
    create_session,
    delete_session,
    get_or_create_local_user,
    get_user_by_session,
    upsert_google_user,
)

SESSION_COOKIE = "blunderless_sid"
GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo"

# In-memory short-lived CSRF state tokens for Google OAuth redirects
_OAUTH_STATES: dict[str, float] = {}


def get_google_config() -> dict[str, str]:
    """Read Google OAuth configuration strictly from environment variables."""
    client_id = os.environ.get("GOOGLE_CLIENT_ID", "").strip()
    client_secret = os.environ.get("GOOGLE_CLIENT_SECRET", "").strip()
    base_url = os.environ.get("APP_BASE_URL", "http://127.0.0.1:8000").rstrip("/")
    return {
        "client_id": client_id,
        "client_secret": client_secret,
        "redirect_uri": f"{base_url}/auth/google/callback",
    }


def is_google_configured() -> bool:
    cfg = get_google_config()
    return bool(cfg["client_id"] and cfg["client_secret"])


def create_google_login_url() -> str:
    """Build the Google OAuth 2.0 authorization redirect URL with a fresh CSRF state."""
    cfg = get_google_config()
    if not (cfg["client_id"] and cfg["client_secret"]):
        raise RuntimeError(
            "Google OAuth is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET environment variables."
        )

    # Prune expired states (> 10 minutes old)
    now = time.time()
    for st, ts in list(_OAUTH_STATES.items()):
        if now - ts > 600:
            _OAUTH_STATES.pop(st, None)

    state = secrets.token_urlsafe(24)
    _OAUTH_STATES[state] = now

    params = urllib.parse.urlencode(
        {
            "client_id": cfg["client_id"],
            "redirect_uri": cfg["redirect_uri"],
            "response_type": "code",
            "scope": "openid email profile",
            "access_type": "online",
            "prompt": "select_account",
            "state": state,
        }
    )
    return f"{GOOGLE_AUTH_URL}?{params}"


def verify_and_exchange_google_code(code: str, state: str) -> tuple[dict[str, Any], str]:
    """Validate OAuth state, exchange authorization code for tokens, and upsert the user."""
    if not state or state not in _OAUTH_STATES:
        raise ValueError("Invalid or expired OAuth state. Please try signing in again.")
    _OAUTH_STATES.pop(state, None)

    cfg = get_google_config()
    token_body = urllib.parse.urlencode(
        {
            "code": code,
            "client_id": cfg["client_id"],
            "client_secret": cfg["client_secret"],
            "redirect_uri": cfg["redirect_uri"],
            "grant_type": "authorization_code",
        }
    ).encode("utf-8")

    token_req = urllib.request.Request(
        GOOGLE_TOKEN_URL,
        data=token_body,
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(token_req, timeout=10) as resp:
            token_data = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        raise RuntimeError(f"Google token exchange failed ({exc.code}).") from exc

    access_token = token_data.get("access_token")
    if not access_token:
        raise RuntimeError("Google OAuth did not return an access token.")

    info_req = urllib.request.Request(
        GOOGLE_USERINFO_URL,
        headers={"Authorization": f"Bearer {access_token}"},
    )
    try:
        with urllib.request.urlopen(info_req, timeout=10) as resp:
            profile = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        raise RuntimeError(f"Could not read Google user profile ({exc.code}).") from exc

    user = upsert_google_user(
        google_sub=str(profile.get("id") or profile.get("sub") or ""),
        email=str(profile.get("email") or ""),
        display_name=str(profile.get("name") or profile.get("email", "Player").split("@")[0]),
        avatar_url=str(profile.get("picture") or ""),
    )
    session_token = create_session(user["id"])
    return user, session_token


def login_local_profile(display_name: str) -> tuple[dict[str, Any], str]:
    """Create or resume a local Blunderless profile and issue a session token."""
    user = get_or_create_local_user(display_name)
    token = create_session(user["id"])
    return user, token


def resolve_user(cookie_token: Optional[str]) -> Optional[dict[str, Any]]:
    return get_user_by_session(cookie_token)


def logout_session(cookie_token: Optional[str]) -> None:
    delete_session(cookie_token)
