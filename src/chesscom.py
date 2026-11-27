"""
Chess.com Public API client (`src/chesscom.py`).

Uses Python's standard library `urllib` (no external HTTP dependency required) to:
- Fetch player profile (avatar, title, country, joined date)
- Fetch live & peak Rapid/Blitz/Bullet/Daily ELO ratings (`/stats`)
- Fetch paginated recent games (5 to 200+) across monthly archives
- Reconstruct ELO rating history series directly from game archives
"""

from __future__ import annotations

import json
import re
import time
import urllib.error
import urllib.request
from typing import Any, Optional

USER_AGENT = "Blunderless/2.2 (chess analysis tool)"
PLAYER_URL = "https://api.chess.com/pub/player/{username}"
STATS_URL = "https://api.chess.com/pub/player/{username}/stats"
ARCHIVES_URL = "https://api.chess.com/pub/player/{username}/games/archives"

_PGN_HEADER_RE = re.compile(r'^\[(\w+)\s+"([^"]*)"\]', re.M)


def _fetch_json(url: str, timeout: float = 12.0) -> dict[str, Any]:
    """Fetch JSON from a URL with a Chess.com-compliant User-Agent header."""
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        if exc.code == 404:
            raise ValueError(f"Resource not found at Chess.com: {url}") from exc
        raise RuntimeError(f"Chess.com API error ({exc.code}): {exc.reason}") from exc
    except urllib.error.URLError as exc:
        raise RuntimeError(f"Network error contacting Chess.com: {exc.reason}") from exc


def _extract_opening_from_pgn(pgn: str) -> tuple[str, str]:
    """Extract (ECO, readable opening name) from Chess.com PGN headers."""
    headers = dict(_PGN_HEADER_RE.findall(pgn or ""))
    eco = headers.get("ECO", "")
    opening = headers.get("Opening", "")
    if not opening and headers.get("ECOUrl"):
        slug = headers["ECOUrl"].rstrip("/").split("/")[-1]
        # Clean Chess.com ECOUrl slug like "Pirc-Defense-Classical-Variation-4.Nf3"
        slug = re.sub(r"-\d+\..*$", "", slug)
        opening = slug.replace("-", " ").strip()
    return eco, opening


def _extract_termination(raw_game: dict[str, Any]) -> str:
    """Determine how the game ended (checkmate, resignation, timeout, stalemate, etc.)."""
    w_res = (raw_game.get("white", {}).get("result") or "").lower()
    b_res = (raw_game.get("black", {}).get("result") or "").lower()
    for res in (w_res, b_res):
        if res == "checkmated":
            return "checkmate"
        if res == "resigned":
            return "resignation"
        if res == "timeout":
            return "timeout"
        if res == "abandoned":
            return "abandoned"
        if res in ("stalemate", "repetition", "insufficient", "agreed", "50move", "timevsinsufficient"):
            return res
    return "other"


def _format_game(raw_game: dict[str, Any]) -> dict[str, Any]:
    """Extract normalized Blunderless game fields from a Chess.com game object."""
    white = raw_game.get("white", {})
    black = raw_game.get("black", {})
    pgn = raw_game.get("pgn", "")
    eco, opening = _extract_opening_from_pgn(pgn)
    url = raw_game.get("url", "")
    ext_id = url.rstrip("/").split("/")[-1] if url else str(raw_game.get("end_time", 0))

    return {
        "platform": "chesscom",
        "external_id": ext_id,
        "url": url,
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
        "time_class": (raw_game.get("time_class") or "").lower(),
        "time_control": raw_game.get("time_control", ""),
        "end_time": int(raw_game.get("end_time") or 0),
        "termination": _extract_termination(raw_game),
        "opening_eco": eco,
        "opening_name": opening,
        "pgn": pgn,
    }


def get_player_profile(username: str) -> dict[str, Any]:
    """Fetch public Chess.com profile metadata."""
    cleaned = username.strip().lower()
    if not cleaned:
        raise ValueError("Username cannot be empty.")
    try:
        raw = _fetch_json(PLAYER_URL.format(username=cleaned))
    except ValueError as exc:
        raise ValueError(f"Chess.com user '{username}' not found.") from exc
    return {
        "username": raw.get("username", username.strip()),
        "avatar": raw.get("avatar", ""),
        "title": raw.get("title", ""),
        "country": (raw.get("country") or "").rstrip("/").split("/")[-1],
        "joined": raw.get("joined", 0),
        "url": raw.get("url", ""),
    }


def get_player_stats(username: str) -> dict[str, Any]:
    """Fetch live and peak Rapid, Blitz, Bullet, Daily, and Puzzle ratings from Chess.com."""
    cleaned = username.strip().lower()
    if not cleaned:
        raise ValueError("Username cannot be empty.")
    raw = _fetch_json(STATS_URL.format(username=cleaned))

    def _mode(key: str) -> Optional[dict[str, Any]]:
        section = raw.get(key)
        if not isinstance(section, dict):
            return None
        last = section.get("last") or {}
        best = section.get("best") or {}
        rec = section.get("record") or {}
        if not last.get("rating"):
            return None
        return {
            "rating": int(last["rating"]),
            "best": int(best["rating"]) if best.get("rating") else int(last["rating"]),
            "win": int(rec.get("win", 0)),
            "loss": int(rec.get("loss", 0)),
            "draw": int(rec.get("draw", 0)),
        }

    tactics = raw.get("tactics") or {}
    return {
        "rapid": _mode("chess_rapid"),
        "blitz": _mode("chess_blitz"),
        "bullet": _mode("chess_bullet"),
        "daily": _mode("chess_daily"),
        "puzzles": int((tactics.get("highest") or {}).get("rating") or 0) or None,
    }


def build_rating_history_from_games(username: str, games: list[dict[str, Any]]) -> dict[str, list[dict[str, int]]]:
    """Reconstruct chronological ELO rating series per time class from synced Chess.com games."""
    uname_low = username.strip().lower()
    by_tc: dict[str, list[dict[str, int]]] = {"rapid": [], "blitz": [], "bullet": [], "daily": []}

    for g in sorted(games, key=lambda x: x.get("end_time", 0)):
        tc = (g.get("time_class") or "").lower()
        if tc not in by_tc:
            continue
        w = g.get("white") or {}
        b = g.get("black") or {}
        elo = w.get("rating") if (w.get("username") or "").lower() == uname_low else b.get("rating")
        ts = int(g.get("end_time") or 0)
        if elo and ts:
            by_tc[tc].append({"ts": ts, "rating": int(elo)})

    return {tc: pts[-150:] for tc, pts in by_tc.items() if pts}


def get_recent_games(
    username: str,
    limit: int = 5,
    days: Optional[int] = None,
    time_class: Optional[str] = None,
    max_archives: Optional[int] = 6,
) -> list[dict[str, Any]]:
    """
    Return up to `limit` most recent games (with PGNs) for a Chess.com username.
    Pass `limit <= 0` for all games and `max_archives=None` to scan every monthly archive.
    Walks backwards through monthly archives, optionally filtering by `days` window
    and `time_class` ('bullet', 'blitz', 'rapid', 'daily').
    """
    cleaned = username.strip().lower()
    if not cleaned:
        raise ValueError("Username cannot be empty.")

    try:
        archives_data = _fetch_json(ARCHIVES_URL.format(username=cleaned))
    except ValueError as exc:
        raise ValueError(f"Chess.com user '{username}' not found.") from exc

    archives = archives_data.get("archives", [])
    selected_archives = archives[-max_archives:] if (max_archives and max_archives > 0) else archives
    collected: list[dict[str, Any]] = []
    cutoff_ts = int(time.time()) - days * 86400 if (days and days > 0) else 0
    tc_filter = (time_class or "").lower()
    if tc_filter == "all":
        tc_filter = ""

    for archive_url in reversed(selected_archives):
        month_data = _fetch_json(archive_url)
        raw_games = month_data.get("games", [])
        raw_games.sort(key=lambda g: g.get("end_time", 0), reverse=True)

        hit_cutoff = False
        for game in raw_games:
            end_ts = int(game.get("end_time") or 0)
            if cutoff_ts and end_ts and end_ts < cutoff_ts:
                hit_cutoff = True
                break
            if not game.get("pgn"):
                continue
            if tc_filter and (game.get("time_class") or "").lower() != tc_filter:
                continue
            collected.append(_format_game(game))
            if limit > 0 and len(collected) >= limit:
                return collected

        if hit_cutoff:
            break

    return collected


if __name__ == "__main__":
    import sys

    user = sys.argv[1] if len(sys.argv) > 1 else "hikaru"
    for g in get_recent_games(user, limit=5):
        print(f"{g['white']['username']} vs {g['black']['username']} ({g['time_class']})")
