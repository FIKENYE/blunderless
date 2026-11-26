"""
Authentication & Session helpers for Blunderless (`src/auth.py`).

Supports:
1. Real Google OAuth 2.0 ("Continue with Google") using environment variables
   `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` (never hardcoded or committed).
   Also loads a local `.env` file if present, without overriding shell env vars.
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
from pathlib import Path
from typing import Any, Optional

from src.db import (
    create_session,
    delete_session,
    get_or_create_local_user,
    get_user_by_session,
    upsert_google_user,
)

SESSION_COOKIE = "blunderless_sid"
OAUTH_STATE_COOKIE = "blunderless_oauth_state"
GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo"

# Fallback in-memory CSRF state store (cookie-bound state is primary so
# uvicorn --reload restarts never break an in-flight OAuth redirect).
_OAUTH_STATES: dict[str, float] = {}


def _load_dotenv_if_present() -> None:
    """Load simple KEY=VALUE lines from project-root `.env` without overriding env vars."""
    env_path = Path(__file__).resolve().parent.parent / ".env"
    if not env_path.is_file():
        return
    try:
        for raw_line in env_path.read_text(encoding="utf-8").splitlines():
            line = raw_line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, val = line.split("=", 1)
            key = key.strip()
            val = val.strip().strip('"').strip("'")
            if key and key not in os.environ:
                os.environ[key] = val
    except OSError:
        pass


def resolve_base_url(request_base_url: Optional[str] = None) -> str:
    """
    Determine the public base URL used to construct Google's redirect URI.

    Explicit `APP_BASE_URL` wins; otherwise we match the exact origin the user
    opened (e.g. `http://localhost:8000` vs `http://127.0.0.1:8000`) so cookies
    and redirect URIs never disagree.
    """
    _load_dotenv_if_present()
    configured = os.environ.get("APP_BASE_URL", "").strip().rstrip("/")
    if configured:
        return configured
    if request_base_url:
        return request_base_url.strip().rstrip("/")
    return "http://127.0.0.1:8000"


def get_google_config(base_url: Optional[str] = None) -> dict[str, str]:
    """Read Google OAuth configuration from environment variables (or local `.env`)."""
    _load_dotenv_if_present()
    client_id = os.environ.get("GOOGLE_CLIENT_ID", "").strip()
    client_secret = os.environ.get("GOOGLE_CLIENT_SECRET", "").strip()
    origin = resolve_base_url(base_url)
    return {
        "client_id": client_id,
        "client_secret": client_secret,
        "redirect_uri": f"{origin}/auth/google/callback",
    }


def is_google_configured() -> bool:
    cfg = get_google_config()
    return bool(cfg["client_id"] and cfg["client_secret"])


def create_google_login_url(base_url: Optional[str] = None) -> tuple[str, str]:
    """
    Build the Google OAuth 2.0 authorization redirect URL and return `(url, state)`.

    The caller should set `state` in an HttpOnly cookie (`OAUTH_STATE_COOKIE`)
    so CSRF verification survives server reloads.
    """
    cfg = get_google_config(base_url=base_url)
    if not (cfg["client_id"] and cfg["client_secret"]):
        raise RuntimeError(
            "Google OAuth is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET environment variables."
        )

    # Prune expired fallback states (> 10 minutes old)
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
    return f"{GOOGLE_AUTH_URL}?{params}", state


def _extract_http_error_detail(exc: urllib.error.HTTPError, fallback: str) -> str:
    """Pull Google's human-readable error_description from an HTTPError response."""
    try:
        raw = exc.read().decode("utf-8", errors="replace")
        data = json.loads(raw)
        desc = data.get("error_description") or data.get("error")
        if isinstance(desc, dict):
            desc = desc.get("message") or str(desc)
        if desc:
            return f"{fallback}: {desc}"
    except Exception:
        pass
    return f"{fallback} (HTTP {exc.code})."


def verify_and_exchange_google_code(
    code: str,
    state: str,
    expected_state: Optional[str] = None,
    base_url: Optional[str] = None,
) -> tuple[dict[str, Any], str]:
    """Validate OAuth state, exchange authorization code for tokens, and upsert the user."""
    cookie_ok = bool(state and expected_state and secrets.compare_digest(state, expected_state))
    memory_ok = bool(state and state in _OAUTH_STATES)
    if not (cookie_ok or memory_ok):
        raise ValueError("Invalid or expired OAuth state. Please try signing in again.")
    _OAUTH_STATES.pop(state, None)

    cfg = get_google_config(base_url=base_url)
    if not (cfg["client_id"] and cfg["client_secret"]):
        raise RuntimeError("Google OAuth credentials are missing on the server.")

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
        raise RuntimeError(_extract_http_error_detail(exc, "Google token exchange failed")) from exc
    except urllib.error.URLError as exc:
        raise RuntimeError(f"Could not reach Google OAuth server: {exc.reason}") from exc

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
        raise RuntimeError(_extract_http_error_detail(exc, "Could not read Google profile")) from exc
    except urllib.error.URLError as exc:
        raise RuntimeError(f"Could not reach Google userinfo endpoint: {exc.reason}") from exc

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
