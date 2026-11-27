"""
Lichess Public API client (`src/lichess.py`).

Uses Python's standard library `urllib` (no extra dependencies) to fetch:
- Player profile & live Rapid/Blitz/Bullet/Classical/Puzzle ratings
- Full official ELO rating history (`/api/user/{username}/rating-history`)
- Recent games (50-200+) in NDJSON format with embedded PGNs, clocks, and ECO openings
"""

from __future__ import annotations

import datetime
import json
import time
import urllib.error
import urllib.parse
import urllib.request
from typing import Any, Optional

USER_AGENT = "Blunderless/2.2 (chess analysis tool)"
USER_URL = "https://lichess.org/api/user/{username}"
RATING_HISTORY_URL = "https://lichess.org/api/user/{username}/rating-history"
GAMES_URL = "https://lichess.org/api/games/user/{username}"


def _fetch_json(url: str, timeout: float = 12.0) -> Any:
    req = urllib.request.Request(
        url,
        headers={"User-Agent": USER_AGENT, "Accept": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        if exc.code == 404:
            raise ValueError(f"Lichess user not found: {url}") from exc
        raise RuntimeError(f"Lichess API error ({exc.code}): {exc.reason}") from exc
    except urllib.error.URLError as exc:
        raise RuntimeError(f"Network error contacting Lichess: {exc.reason}") from exc


def get_lichess_profile_and_stats(username: str) -> tuple[dict[str, Any], dict[str, Any]]:
    """Fetch Lichess profile metadata and live ratings per time control."""
    cleaned = username.strip()
    if not cleaned:
        raise ValueError("Lichess username cannot be empty.")
    raw = _fetch_json(USER_URL.format(username=urllib.parse.quote(cleaned)))

    profile = {
        "username": raw.get("username", cleaned),
        "title": raw.get("title", ""),
        "url": raw.get("url", f"https://lichess.org/@/{cleaned}"),
        "avatar": "",
    }
    perfs = raw.get("perfs") or {}

    def _perf(key: str) -> Optional[dict[str, Any]]:
        p = perfs.get(key)
        if not isinstance(p, dict) or not p.get("rating") or not p.get("games"):
            return None
        return {
            "rating": int(p["rating"]),
            "best": int(p["rating"]),
            "games": int(p.get("games", 0)),
            "prog": int(p.get("prog", 0)),
        }

    stats = {
        "rapid": _perf("rapid"),
        "blitz": _perf("blitz"),
        "bullet": _perf("bullet"),
        "daily": _perf("correspondence"),
        "puzzles": int((perfs.get("puzzle") or {}).get("rating") or 0) or None,
    }
    return profile, stats


def get_lichess_rating_history(username: str) -> dict[str, list[dict[str, int]]]:
    """
    Fetch official Lichess rating history and normalize into
    `{rapid: [{ts, rating}], blitz: [...], bullet: [...], daily: [...]}`.
    """
    cleaned = username.strip()
    if not cleaned:
        return {}
    try:
        raw_list = _fetch_json(RATING_HISTORY_URL.format(username=urllib.parse.quote(cleaned)))
    except Exception:
        return {}

    name_map = {
        "Rapid": "rapid",
        "Blitz": "blitz",
        "Bullet": "bullet",
        "Correspondence": "daily",
    }
    history: dict[str, list[dict[str, int]]] = {}
    for entry in raw_list if isinstance(raw_list, list) else []:
        key = name_map.get(entry.get("name", ""))
        if not key:
            continue
        pts = []
        for pt in (entry.get("points") or [])[-180:]:
            if len(pt) >= 4:
                year, month_zero_idx, day, rating = pt[0], pt[1], pt[2], pt[3]
                dt = datetime.datetime(year, month_zero_idx + 1, day, tzinfo=datetime.timezone.utc)
                pts.append({"ts": int(dt.timestamp()), "rating": int(rating)})
        if pts:
            history[key] = pts
    return history


def _map_lichess_speed(speed: str) -> str:
    s = (speed or "").lower()
    if s in ("ultrabullet", "bullet"):
        return "bullet"
    if s == "blitz":
        return "blitz"
    if s in ("rapid", "classical"):
        return "rapid"
    if s == "correspondence":
        return "daily"
    return s or "rapid"


def _map_lichess_termination(status: str) -> str:
    s = (status or "").lower()
    if s == "mate":
        return "checkmate"
    if s == "resign":
        return "resignation"
    if s in ("outoftime", "timeout"):
        return "timeout"
    if s == "stalemate":
        return "stalemate"
    if s in ("draw", "insufficient", "repetition"):
        return s
    return s or "other"


def get_lichess_games(
    username: str,
    limit: int = 50,
    days: Optional[int] = None,
    time_class: Optional[str] = None,
) -> list[dict[str, Any]]:
    """Fetch recent Lichess games as normalized Blunderless game dicts (with PGNs)."""
    cleaned = username.strip()
    if not cleaned:
        raise ValueError("Lichess username cannot be empty.")

    max_fetch = 1000 if limit <= 0 else max(1, min(1000, limit))
    params: dict[str, Any] = {
        "max": max_fetch,
        "pgnInJson": "true",
        "clocks": "true",
        "opening": "true",
    }
    if days and days > 0:
        params["since"] = int((time.time() - days * 86400) * 1000)
    if time_class and time_class not in ("all", ""):
        perf_map = {"bullet": "bullet", "blitz": "blitz", "rapid": "rapid,classical", "daily": "correspondence"}
        if time_class in perf_map:
            params["perfType"] = perf_map[time_class]

    url = f"{GAMES_URL.format(username=urllib.parse.quote(cleaned))}?{urllib.parse.urlencode(params)}"
    req = urllib.request.Request(
        url,
        headers={"User-Agent": USER_AGENT, "Accept": "application/x-ndjson"},
    )
    try:
        with urllib.request.urlopen(req, timeout=20.0) as resp:
            raw_text = resp.read().decode("utf-8")
    except urllib.error.HTTPError as exc:
        if exc.code == 404:
            raise ValueError(f"Lichess user '{username}' not found.") from exc
        raise RuntimeError(f"Lichess games API error ({exc.code}).") from exc
    except urllib.error.URLError as exc:
        raise RuntimeError(f"Network error contacting Lichess: {exc.reason}") from exc

    games: list[dict[str, Any]] = []
    for line in raw_text.splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            g = json.loads(line)
        except json.JSONDecodeError:
            continue

        pgn = g.get("pgn") or ""
        if not pgn.strip():
            continue

        players = g.get("players") or {}
        wp = players.get("white") or {}
        bp = players.get("black") or {}
        winner = g.get("winner")  # "white", "black", or None (draw)
        status = g.get("status", "")

        def _side_result(side: str) -> str:
            if winner == side:
                return "win"
            if winner is None:
                return status or "draw"
            return "checkmated" if status == "mate" else ("timeout" if status == "outoftime" else "resigned")

        clock = g.get("clock") or {}
        tc_str = f"{clock.get('initial', 0)}+{clock.get('increment', 0)}" if clock else ""
        opening = g.get("opening") or {}
        gid = g.get("id", "")
        end_ms = g.get("lastMoveAt") or g.get("createdAt") or 0

        games.append(
            {
                "platform": "lichess",
                "external_id": gid,
                "url": f"https://lichess.org/{gid}" if gid else "",
                "white": {
                    "username": (wp.get("user") or {}).get("name", "White"),
                    "rating": wp.get("rating"),
                    "result": _side_result("white"),
                },
                "black": {
                    "username": (bp.get("user") or {}).get("name", "Black"),
                    "rating": bp.get("rating"),
                    "result": _side_result("black"),
                },
                "time_class": _map_lichess_speed(g.get("speed", "")),
                "time_control": tc_str,
                "end_time": int(end_ms // 1000) if end_ms else 0,
                "termination": _map_lichess_termination(status),
                "opening_eco": opening.get("eco", ""),
                "opening_name": opening.get("name", ""),
                "pgn": pgn,
            }
        )

    return games
