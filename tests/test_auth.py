import json
import os
import unittest
from io import BytesIO
from unittest.mock import patch

from fastapi.testclient import TestClient

from src.auth import (
    OAUTH_STATE_COOKIE,
    _OAUTH_STATES,
    create_google_login_url,
    get_google_config,
    verify_and_exchange_google_code,
)
from src.server import app


class _MockHttpResponse:
    def __init__(self, payload: dict):
        self._buf = BytesIO(json.dumps(payload).encode("utf-8"))

    def read(self) -> bytes:
        return self._buf.read()

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False


class TestGoogleAuthFlow(unittest.TestCase):
    """Tests for Google OAuth dynamic redirect URI, cookie state, and error handling."""

    def test_redirect_uri_follows_request_origin_unless_overridden(self):
        with patch.dict(os.environ, {"GOOGLE_CLIENT_ID": "cid", "GOOGLE_CLIENT_SECRET": "sec"}, clear=False):
            os.environ.pop("APP_BASE_URL", None)
            cfg_local = get_google_config(base_url="http://localhost:8000")
            self.assertEqual(cfg_local["redirect_uri"], "http://localhost:8000/auth/google/callback")

            cfg_loopback = get_google_config(base_url="http://127.0.0.1:8000")
            self.assertEqual(cfg_loopback["redirect_uri"], "http://127.0.0.1:8000/auth/google/callback")

    def test_cookie_state_survives_in_memory_reload(self):
        with patch.dict(os.environ, {"GOOGLE_CLIENT_ID": "cid", "GOOGLE_CLIENT_SECRET": "sec"}, clear=False):
            _, state = create_google_login_url(base_url="http://localhost:8000")
            # Simulate uvicorn --reload wiping in-memory state dict
            _OAUTH_STATES.clear()

            responses = [
                _MockHttpResponse({"access_token": "tok_123"}),
                _MockHttpResponse({
                    "id": "google-sub-test-99",
                    "email": "tester@example.com",
                    "name": "Test Player",
                    "picture": "https://example.com/a.png",
                }),
            ]
            with patch("src.auth.urllib.request.urlopen", side_effect=responses):
                user, session_tok = verify_and_exchange_google_code(
                    code="auth_code_xyz",
                    state=state,
                    expected_state=state,
                    base_url="http://localhost:8000",
                )
            self.assertEqual(user["email"], "tester@example.com")
            self.assertTrue(bool(session_tok))

    def test_login_and_callback_routes_handle_missing_config_and_errors(self):
        client = TestClient(app)
        with patch.dict(os.environ, {"GOOGLE_CLIENT_ID": "", "GOOGLE_CLIENT_SECRET": ""}, clear=False):
            me = client.get("/api/auth/me").json()
            self.assertFalse(me["google_configured"])
            self.assertTrue(me["google_redirect_uri"].endswith("/auth/google/callback"))

            login_resp = client.get("/auth/google/login", follow_redirects=False)
            self.assertEqual(login_resp.status_code, 302)
            self.assertIn("auth_error=", login_resp.headers["location"])

            cancel_resp = client.get("/auth/google/callback?error=access_denied", follow_redirects=False)
            self.assertEqual(cancel_resp.status_code, 302)
            self.assertIn("access_denied", cancel_resp.headers["location"])

    def test_login_route_sets_state_cookie_when_configured(self):
        client = TestClient(app)
        with patch.dict(os.environ, {"GOOGLE_CLIENT_ID": "cid", "GOOGLE_CLIENT_SECRET": "sec"}, clear=False):
            resp = client.get("/auth/google/login", follow_redirects=False)
            self.assertEqual(resp.status_code, 302)
            self.assertIn("accounts.google.com/o/oauth2/v2/auth", resp.headers["location"])
            self.assertIn(OAUTH_STATE_COOKIE, resp.cookies)


if __name__ == "__main__":
    unittest.main()
