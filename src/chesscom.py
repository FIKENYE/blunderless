"""
Chess.com Public API client.

Fetches the most recent games for a Chess.com username using Python's
standard library urllib (no external HTTP dependency required).
"""

import json
import urllib.error
import urllib.request
from typing import Any

USER_AGENT = "Blunderless/0.1 (chess analysis tool)"
ARCHIVES_URL = "https://api.chess.com/pub/player/{username}/games/archives"


def _fetch_json(url: str) -> dict[str, Any]:
    """Fetch JSON from a URL with a Chess.com-compliant User-Agent header."""
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(req, timeout=10) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        if exc.code == 404:
            raise ValueError(f"Resource not found at Chess.com: {url}") from exc
        raise RuntimeError(f"Chess.com API error ({exc.code}): {exc.reason}") from exc
    except urllib.error.URLError as exc:
        raise RuntimeError(f"Network error contacting Chess.com: {exc.reason}") from exc


def _format_game(raw_game: dict[str, Any]) -> dict[str, Any]:
    """Extract only the fields needed by Blunderless from a Chess.com game object."""
    white = raw_game.get("white", {})
    black = raw_game.get("black", {})
    return {
        "url": raw_game.get("url", ""),
        "white": {
            "username": white.get("username", "?"),
            "rating": white.get("rating"),
            "result": white.get("result", ""),
        },
        "black": {
            "username": black.get("username", "?"),
            "rating": black.get("rating"),
            "result": black.get("result", ""),
        },
        "time_class": raw_game.get("time_class", ""),
        "end_time": raw_game.get("end_time", 0),
        "pgn": raw_game.get("pgn", ""),
    }


def get_recent_games(username: str, limit: int = 5) -> list[dict[str, Any]]:
    """
    Return up to `limit` most recent games (with PGNs) for a Chess.com username.
    Walks backwards through monthly archives so it still returns `limit` games
    even if the current month has fewer than `limit` games.
    """
    cleaned = username.strip().lower()
    if not cleaned:
        raise ValueError("Username cannot be empty.")

    try:
        archives_data = _fetch_json(ARCHIVES_URL.format(username=cleaned))
    except ValueError as exc:
        raise ValueError(f"Chess.com user '{username}' not found.") from exc

    archives = archives_data.get("archives", [])
    collected: list[dict[str, Any]] = []

    for archive_url in reversed(archives):
        month_data = _fetch_json(archive_url)
        raw_games = month_data.get("games", [])
        # Sort newest first within the month.
        raw_games.sort(key=lambda g: g.get("end_time", 0), reverse=True)
        for game in raw_games:
            if game.get("pgn"):
                collected.append(_format_game(game))
                if len(collected) >= limit:
                    return collected

    return collected


if __name__ == "__main__":
    import sys

    user = sys.argv[1] if len(sys.argv) > 1 else "hikaru"
    for g in get_recent_games(user, limit=5):
        print(f"{g['white']['username']} vs {g['black']['username']} ({g['time_class']})")
