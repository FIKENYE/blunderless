"""
Dual-Backend Persistence Layer for Blunderless (`src/db.py`).

Supports:
1. Cloud PostgreSQL via `DATABASE_URL` (Neon, Supabase, Render Postgres, etc.)
   for cross-device accounts, linked profiles, synced games, cached analyses,
   saved reports, and synced user preferences.
2. Automatic local SQLite fallback (`data/blunderless.db`) when `DATABASE_URL`
   is unset or when a custom `db_path` is passed (e.g. in unit tests).
"""

from __future__ import annotations

import hashlib
import json
import os
import secrets
import sqlite3
import time
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Iterator, Optional, Sequence

DB_PATH = Path(os.environ.get("BLUNDERLESS_DB_PATH", str(Path("data") / "blunderless.db")))

DEFAULT_PREFERENCES: dict[str, Any] = {
    "theme": "light",
    "sound": True,
    "coords": True,
    "tone": "instructive",
    "depth": 10,
}

_ALLOWED_TONES = {"instructive", "analytical", "sarcastic"}


def _load_dotenv_database_url() -> None:
    """Load DATABASE_URL from project-root `.env` if not already set in the environment."""
    if os.environ.get("DATABASE_URL"):
        return
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
            if key == "DATABASE_URL" and val and "DATABASE_URL" not in os.environ:
                os.environ["DATABASE_URL"] = val
                break
    except OSError:
        pass


def get_database_url() -> str:
    """Return normalized PostgreSQL URL if configured, else empty string."""
    _load_dotenv_database_url()
    raw = os.environ.get("DATABASE_URL", "").strip()
    if raw.startswith("postgres://"):
        raw = "postgresql://" + raw[len("postgres://"):]
    return raw


def is_cloud_db_configured() -> bool:
    """True when `DATABASE_URL` points to PostgreSQL."""
    url = get_database_url()
    return url.startswith("postgresql://")


def get_storage_mode(db_path: Path = DB_PATH) -> str:
    """Return `'postgres'` when using cloud PostgreSQL, else `'sqlite'`."""
    if db_path == DB_PATH and is_cloud_db_configured():
        return "postgres"
    return "sqlite"


def _translate_qmarks_to_percent_s(sql: str) -> str:
    """Convert SQLite `?` placeholders to psycopg `%s`, ignoring single-quoted string literals."""
    out: list[str] = []
    in_quote = False
    i = 0
    n = len(sql)
    while i < n:
        ch = sql[i]
        if ch == "'":
            out.append(ch)
            if in_quote and i + 1 < n and sql[i + 1] == "'":
                out.append("'")
                i += 2
                continue
            in_quote = not in_quote
        elif ch == "?" and not in_quote:
            out.append("%s")
        else:
            out.append(ch)
        i += 1
    return "".join(out)


class _CursorWrapper:
    """Normalizes cursor results & lastrowid across SQLite and psycopg3."""

    def __init__(self, cursor: Any, lastrowid: Optional[int] = None) -> None:
        self._cursor = cursor
        self.lastrowid = lastrowid if lastrowid is not None else getattr(cursor, "lastrowid", None)

    def fetchone(self) -> Optional[dict[str, Any]]:
        row = self._cursor.fetchone()
        if row is None:
            return None
        return dict(row)

    def fetchall(self) -> list[dict[str, Any]]:
        return [dict(r) for r in self._cursor.fetchall()]


class _DBConnection:
    """Unified thin wrapper around SQLite or psycopg3 connections."""

    def __init__(self, conn: Any, backend: str) -> None:
        self._conn = conn
        self.backend = backend

    def execute(
        self,
        sql: str,
        params: Sequence[Any] = (),
        returning_id: bool = False,
    ) -> _CursorWrapper:
        if self.backend == "sqlite":
            cur = self._conn.execute(sql, tuple(params))
            return _CursorWrapper(cur, lastrowid=cur.lastrowid)

        pg_sql = _translate_qmarks_to_percent_s(sql)
        if returning_id and "RETURNING" not in pg_sql.upper():
            pg_sql = pg_sql.rstrip().rstrip(";") + " RETURNING id"
        cur = self._conn.execute(pg_sql, tuple(params))
        last_id = None
        if returning_id:
            row = cur.fetchone()
            if row is not None:
                last_id = int(row["id"])
        return _CursorWrapper(cur, lastrowid=last_id)


@contextmanager
def _connect(db_path: Path = DB_PATH) -> Iterator[_DBConnection]:
    mode = get_storage_mode(db_path)
    if mode == "postgres":
        try:
            import psycopg
            from psycopg.rows import dict_row
        except ImportError as exc:
            raise RuntimeError(
                "DATABASE_URL is set for PostgreSQL, but `psycopg` is not installed. "
                "Install it with: pip install 'psycopg[binary]'"
            ) from exc

        conn = psycopg.connect(get_database_url(), row_factory=dict_row, connect_timeout=10)
        try:
            yield _DBConnection(conn, "postgres")
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()
        return

    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(db_path), timeout=30.0, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL;")
    conn.execute("PRAGMA foreign_keys=ON;")
    try:
        yield _DBConnection(conn, "sqlite")
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def _init_sqlite(conn: sqlite3.Connection) -> None:
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT UNIQUE,
            username TEXT UNIQUE,
            password_hash TEXT DEFAULT '',
            display_name TEXT NOT NULL,
            avatar_url TEXT DEFAULT '',
            provider TEXT NOT NULL DEFAULT 'local',
            google_sub TEXT UNIQUE,
            preferences_json TEXT DEFAULT '{}',
            created_at INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS sessions (
            token TEXT PRIMARY KEY,
            user_id INTEGER NOT NULL,
            created_at INTEGER NOT NULL,
            expires_at INTEGER NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS linked_accounts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            platform TEXT NOT NULL,
            username TEXT NOT NULL,
            avatar_url TEXT DEFAULT '',
            stats_json TEXT DEFAULT '{}',
            rating_history_json TEXT DEFAULT '{}',
            updated_at INTEGER NOT NULL,
            UNIQUE(user_id, platform),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS games (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            platform TEXT NOT NULL,
            external_id TEXT NOT NULL,
            url TEXT DEFAULT '',
            time_class TEXT DEFAULT '',
            time_control TEXT DEFAULT '',
            end_time INTEGER DEFAULT 0,
            white_user TEXT DEFAULT '',
            black_user TEXT DEFAULT '',
            white_elo INTEGER,
            black_elo INTEGER,
            user_color TEXT DEFAULT 'white',
            user_result TEXT DEFAULT 'draw',
            termination TEXT DEFAULT '',
            opening_eco TEXT DEFAULT '',
            opening_name TEXT DEFAULT '',
            pgn TEXT NOT NULL,
            pgn_hash TEXT DEFAULT '',
            analysed INTEGER NOT NULL DEFAULT 0,
            depth INTEGER DEFAULT 0,
            user_accuracy REAL,
            opp_accuracy REAL,
            user_acpl INTEGER,
            brilliants INTEGER DEFAULT 0,
            greats INTEGER DEFAULT 0,
            bests INTEGER DEFAULT 0,
            excellents INTEGER DEFAULT 0,
            goods INTEGER DEFAULT 0,
            books INTEGER DEFAULT 0,
            inaccuracies INTEGER DEFAULT 0,
            mistakes INTEGER DEFAULT 0,
            misses INTEGER DEFAULT 0,
            blunders INTEGER DEFAULT 0,
            total_moves INTEGER DEFAULT 0,
            analysis_json TEXT,
            updated_at INTEGER NOT NULL,
            UNIQUE(user_id, platform, external_id),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_games_user_time ON games(user_id, end_time DESC);
        CREATE INDEX IF NOT EXISTS idx_games_user_tc ON games(user_id, time_class, end_time DESC);
        CREATE INDEX IF NOT EXISTS idx_games_pgn_hash ON games(pgn_hash);

        CREATE TABLE IF NOT EXISTS saved_reports (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            platform TEXT NOT NULL DEFAULT 'all',
            time_class TEXT NOT NULL DEFAULT 'rapid',
            period_days INTEGER NOT NULL DEFAULT 30,
            label TEXT NOT NULL,
            game_count INTEGER NOT NULL DEFAULT 0,
            avg_accuracy REAL,
            win_rate REAL,
            brilliants INTEGER DEFAULT 0,
            blunders INTEGER DEFAULT 0,
            report_json TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS batch_jobs (
            id TEXT PRIMARY KEY,
            user_id INTEGER NOT NULL,
            status TEXT NOT NULL,
            platform TEXT NOT NULL,
            time_class TEXT NOT NULL,
            period_days INTEGER NOT NULL,
            total_games INTEGER NOT NULL DEFAULT 0,
            completed_games INTEGER NOT NULL DEFAULT 0,
            cached_games INTEGER NOT NULL DEFAULT 0,
            brilliants_found INTEGER NOT NULL DEFAULT 0,
            current_label TEXT DEFAULT '',
            report_id INTEGER,
            error TEXT DEFAULT '',
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );
        """
    )

    # Non-destructive migrations for pre-existing local SQLite databases
    cols = {row["name"] for row in conn.execute("PRAGMA table_info(users)").fetchall()}
    if "username" not in cols:
        conn.execute("ALTER TABLE users ADD COLUMN username TEXT")
    if "password_hash" not in cols:
        conn.execute("ALTER TABLE users ADD COLUMN password_hash TEXT DEFAULT ''")
    if "preferences_json" not in cols:
        conn.execute("ALTER TABLE users ADD COLUMN preferences_json TEXT DEFAULT '{}'")
    conn.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username_unique "
        "ON users(username) WHERE username IS NOT NULL AND username != ''"
    )


def _init_postgres(conn: Any) -> None:
    statements = [
        """
        CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            email TEXT UNIQUE,
            username TEXT UNIQUE,
            password_hash TEXT DEFAULT '',
            display_name TEXT NOT NULL,
            avatar_url TEXT DEFAULT '',
            provider TEXT NOT NULL DEFAULT 'local',
            google_sub TEXT UNIQUE,
            preferences_json TEXT DEFAULT '{}',
            created_at BIGINT NOT NULL
        )
        """,
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS username TEXT",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT DEFAULT ''",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS preferences_json TEXT DEFAULT '{}'",
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username_unique ON users(username) WHERE username IS NOT NULL AND username != ''",
        """
        CREATE TABLE IF NOT EXISTS sessions (
            token TEXT PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            created_at BIGINT NOT NULL,
            expires_at BIGINT NOT NULL
        )
        """,
        """
        CREATE TABLE IF NOT EXISTS linked_accounts (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            platform TEXT NOT NULL,
            username TEXT NOT NULL,
            avatar_url TEXT DEFAULT '',
            stats_json TEXT DEFAULT '{}',
            rating_history_json TEXT DEFAULT '{}',
            updated_at BIGINT NOT NULL,
            UNIQUE(user_id, platform)
        )
        """,
        """
        CREATE TABLE IF NOT EXISTS games (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            platform TEXT NOT NULL,
            external_id TEXT NOT NULL,
            url TEXT DEFAULT '',
            time_class TEXT DEFAULT '',
            time_control TEXT DEFAULT '',
            end_time BIGINT DEFAULT 0,
            white_user TEXT DEFAULT '',
            black_user TEXT DEFAULT '',
            white_elo INTEGER,
            black_elo INTEGER,
            user_color TEXT DEFAULT 'white',
            user_result TEXT DEFAULT 'draw',
            termination TEXT DEFAULT '',
            opening_eco TEXT DEFAULT '',
            opening_name TEXT DEFAULT '',
            pgn TEXT NOT NULL,
            pgn_hash TEXT DEFAULT '',
            analysed INTEGER NOT NULL DEFAULT 0,
            depth INTEGER DEFAULT 0,
            user_accuracy DOUBLE PRECISION,
            opp_accuracy DOUBLE PRECISION,
            user_acpl INTEGER,
            brilliants INTEGER DEFAULT 0,
            greats INTEGER DEFAULT 0,
            bests INTEGER DEFAULT 0,
            excellents INTEGER DEFAULT 0,
            goods INTEGER DEFAULT 0,
            books INTEGER DEFAULT 0,
            inaccuracies INTEGER DEFAULT 0,
            mistakes INTEGER DEFAULT 0,
            misses INTEGER DEFAULT 0,
            blunders INTEGER DEFAULT 0,
            total_moves INTEGER DEFAULT 0,
            analysis_json TEXT,
            updated_at BIGINT NOT NULL,
            UNIQUE(user_id, platform, external_id)
        )
        """,
        "CREATE INDEX IF NOT EXISTS idx_games_user_time ON games(user_id, end_time DESC)",
        "CREATE INDEX IF NOT EXISTS idx_games_user_tc ON games(user_id, time_class, end_time DESC)",
        "CREATE INDEX IF NOT EXISTS idx_games_pgn_hash ON games(pgn_hash)",
        """
        CREATE TABLE IF NOT EXISTS saved_reports (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            platform TEXT NOT NULL DEFAULT 'all',
            time_class TEXT NOT NULL DEFAULT 'rapid',
            period_days INTEGER NOT NULL DEFAULT 30,
            label TEXT NOT NULL,
            game_count INTEGER NOT NULL DEFAULT 0,
            avg_accuracy DOUBLE PRECISION,
            win_rate DOUBLE PRECISION,
            brilliants INTEGER DEFAULT 0,
            blunders INTEGER DEFAULT 0,
            report_json TEXT NOT NULL,
            created_at BIGINT NOT NULL
        )
        """,
        """
        CREATE TABLE IF NOT EXISTS batch_jobs (
            id TEXT PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            status TEXT NOT NULL,
            platform TEXT NOT NULL,
            time_class TEXT NOT NULL,
            period_days INTEGER NOT NULL,
            total_games INTEGER NOT NULL DEFAULT 0,
            completed_games INTEGER NOT NULL DEFAULT 0,
            cached_games INTEGER NOT NULL DEFAULT 0,
            brilliants_found INTEGER NOT NULL DEFAULT 0,
            current_label TEXT DEFAULT '',
            report_id INTEGER,
            error TEXT DEFAULT '',
            created_at BIGINT NOT NULL,
            updated_at BIGINT NOT NULL
        )
        """,
    ]
    for stmt in statements:
        conn.execute(stmt)


def init_db(db_path: Path = DB_PATH) -> None:
    """Create all tables, indexes, and non-destructive migrations if they do not yet exist."""
    with _connect(db_path) as db_conn:
        if db_conn.backend == "postgres":
            _init_postgres(db_conn._conn)
        else:
            _init_sqlite(db_conn._conn)


def _pgn_hash(pgn: str) -> str:
    return hashlib.sha256((pgn or "").strip().encode("utf-8")).hexdigest()


def _sanitize_preferences(raw: Optional[dict[str, Any]]) -> dict[str, Any]:
    prefs = dict(DEFAULT_PREFERENCES)
    if not isinstance(raw, dict):
        return prefs
    if raw.get("theme") in ("light", "dark"):
        prefs["theme"] = raw["theme"]
    if isinstance(raw.get("sound"), bool):
        prefs["sound"] = raw["sound"]
    if isinstance(raw.get("coords"), bool):
        prefs["coords"] = raw["coords"]
    if raw.get("tone") in _ALLOWED_TONES:
        prefs["tone"] = raw["tone"]
    if raw.get("depth") is not None:
        try:
            d = int(raw["depth"])
            prefs["depth"] = max(6, min(18, d))
        except (TypeError, ValueError):
            pass
    return prefs


def sanitize_user_row(row: Optional[dict[str, Any]]) -> Optional[dict[str, Any]]:
    """Strip sensitive `password_hash` and parse `preferences` before returning user objects."""
    if not row:
        return None
    d = dict(row)
    has_pw = bool(d.pop("password_hash", "") or "")
    raw_prefs = d.pop("preferences_json", "{}") or "{}"
    try:
        parsed_prefs = json.loads(raw_prefs)
    except Exception:
        parsed_prefs = {}
    d["has_password"] = has_pw
    d["preferences"] = _sanitize_preferences(parsed_prefs)
    return d


# ── Users & Sessions ─────────────────────────────────────────────────────────

def get_or_create_local_user(display_name: str, db_path: Path = DB_PATH) -> dict[str, Any]:
    clean = (display_name or "Player").strip()[:48] or "Player"
    now = int(time.time())
    with _connect(db_path) as conn:
        row = conn.execute(
            "SELECT * FROM users WHERE provider = 'local' AND LOWER(display_name) = LOWER(?)",
            (clean,),
        ).fetchone()
        if row:
            return sanitize_user_row(row)  # type: ignore[return-value]
        cur = conn.execute(
            "INSERT INTO users (display_name, provider, created_at) VALUES (?, 'local', ?)",
            (clean, now),
            returning_id=True,
        )
        row = conn.execute("SELECT * FROM users WHERE id = ?", (cur.lastrowid,)).fetchone()
        return sanitize_user_row(row)  # type: ignore[return-value]


def create_password_user(
    username: Optional[str],
    email: Optional[str],
    display_name: str,
    password_hash: str,
    db_path: Path = DB_PATH,
) -> dict[str, Any]:
    """Create a cross-device password-protected Blunderless account."""
    clean_username = username.strip().lower() if username and username.strip() else None
    clean_email = email.strip().lower() if email and email.strip() else None
    clean_display = (display_name or clean_username or (clean_email.split("@")[0] if clean_email else "Player")).strip()[:48]
    now = int(time.time())

    with _connect(db_path) as conn:
        if clean_email:
            existing = conn.execute(
                "SELECT id FROM users WHERE LOWER(email) = LOWER(?)",
                (clean_email,),
            ).fetchone()
            if existing:
                raise ValueError("An account with that email already exists. Try signing in instead.")
        if clean_username:
            existing = conn.execute(
                "SELECT id FROM users WHERE LOWER(username) = LOWER(?)",
                (clean_username,),
            ).fetchone()
            if existing:
                raise ValueError("That username is already taken. Please pick another.")

        cur = conn.execute(
            """
            INSERT INTO users (email, username, password_hash, display_name, provider, preferences_json, created_at)
            VALUES (?, ?, ?, ?, 'account', ?, ?)
            """,
            (clean_email, clean_username, password_hash, clean_display, json.dumps(DEFAULT_PREFERENCES), now),
            returning_id=True,
        )
        created = conn.execute("SELECT * FROM users WHERE id = ?", (cur.lastrowid,)).fetchone()
        return sanitize_user_row(created)  # type: ignore[return-value]


def get_user_for_password_login(identifier: str, db_path: Path = DB_PATH) -> Optional[dict[str, Any]]:
    """Return raw user row (including `password_hash`) matching email or username."""
    clean = (identifier or "").strip().lower()
    if not clean:
        return None
    with _connect(db_path) as conn:
        row = conn.execute(
            """
            SELECT * FROM users
            WHERE (email IS NOT NULL AND LOWER(email) = ?)
               OR (username IS NOT NULL AND LOWER(username) = ?)
            LIMIT 1
            """,
            (clean, clean),
        ).fetchone()
        return dict(row) if row else None


def get_user_preferences(user_id: int, db_path: Path = DB_PATH) -> dict[str, Any]:
    with _connect(db_path) as conn:
        row = conn.execute("SELECT preferences_json FROM users WHERE id = ?", (user_id,)).fetchone()
        if not row or not row.get("preferences_json"):
            return dict(DEFAULT_PREFERENCES)
        try:
            return _sanitize_preferences(json.loads(row["preferences_json"]))
        except Exception:
            return dict(DEFAULT_PREFERENCES)


def update_user_preferences(
    user_id: int,
    patch: dict[str, Any],
    db_path: Path = DB_PATH,
) -> dict[str, Any]:
    current = get_user_preferences(user_id, db_path=db_path)
    merged = _sanitize_preferences({**current, **(patch or {})})
    with _connect(db_path) as conn:
        conn.execute(
            "UPDATE users SET preferences_json = ? WHERE id = ?",
            (json.dumps(merged), user_id),
        )
    return merged


def upsert_google_user(
    google_sub: str,
    email: str,
    display_name: str,
    avatar_url: str = "",
    db_path: Path = DB_PATH,
) -> dict[str, Any]:
    now = int(time.time())
    clean_email = (email or "").strip().lower() or None
    with _connect(db_path) as conn:
        row = conn.execute(
            "SELECT * FROM users WHERE google_sub = ? OR (email IS NOT NULL AND LOWER(email) = LOWER(?))",
            (google_sub, clean_email or ""),
        ).fetchone()
        if row:
            conn.execute(
                """
                UPDATE users
                SET display_name = ?, avatar_url = ?, google_sub = ?, email = COALESCE(?, email), provider = 'google'
                WHERE id = ?
                """,
                (
                    display_name or row["display_name"],
                    avatar_url or row["avatar_url"],
                    google_sub,
                    clean_email,
                    row["id"],
                ),
            )
            updated = conn.execute("SELECT * FROM users WHERE id = ?", (row["id"],)).fetchone()
            return sanitize_user_row(updated)  # type: ignore[return-value]
        cur = conn.execute(
            """
            INSERT INTO users (email, display_name, avatar_url, provider, google_sub, preferences_json, created_at)
            VALUES (?, ?, ?, 'google', ?, ?, ?)
            """,
            (
                clean_email,
                display_name or (clean_email.split("@")[0] if clean_email else "Player"),
                avatar_url,
                google_sub,
                json.dumps(DEFAULT_PREFERENCES),
                now,
            ),
            returning_id=True,
        )
        created = conn.execute("SELECT * FROM users WHERE id = ?", (cur.lastrowid,)).fetchone()
        return sanitize_user_row(created)  # type: ignore[return-value]


def create_session(user_id: int, ttl_days: int = 30, db_path: Path = DB_PATH) -> str:
    token = secrets.token_urlsafe(32)
    now = int(time.time())
    expires = now + ttl_days * 86400
    with _connect(db_path) as conn:
        conn.execute(
            "INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)",
            (token, user_id, now, expires),
        )
    return token


def get_user_by_session(token: Optional[str], db_path: Path = DB_PATH) -> Optional[dict[str, Any]]:
    if not token:
        return None
    now = int(time.time())
    with _connect(db_path) as conn:
        row = conn.execute(
            """
            SELECT u.* FROM sessions s
            JOIN users u ON u.id = s.user_id
            WHERE s.token = ? AND s.expires_at > ?
            """,
            (token, now),
        ).fetchone()
        return sanitize_user_row(row)


def delete_session(token: Optional[str], db_path: Path = DB_PATH) -> None:
    if not token:
        return
    with _connect(db_path) as conn:
        conn.execute("DELETE FROM sessions WHERE token = ?", (token,))


# ── Linked Accounts (Chess.com & Lichess) ────────────────────────────────────

def upsert_linked_account(
    user_id: int,
    platform: str,
    username: str,
    avatar_url: str = "",
    stats: Optional[dict[str, Any]] = None,
    rating_history: Optional[dict[str, Any]] = None,
    db_path: Path = DB_PATH,
) -> dict[str, Any]:
    now = int(time.time())
    stats_str = json.dumps(stats or {})
    hist_str = json.dumps(rating_history or {})
    with _connect(db_path) as conn:
        conn.execute(
            """
            INSERT INTO linked_accounts (user_id, platform, username, avatar_url, stats_json, rating_history_json, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(user_id, platform) DO UPDATE SET
                username = excluded.username,
                avatar_url = COALESCE(NULLIF(excluded.avatar_url, ''), linked_accounts.avatar_url),
                stats_json = excluded.stats_json,
                rating_history_json = CASE
                    WHEN excluded.rating_history_json != '{}' THEN excluded.rating_history_json
                    ELSE linked_accounts.rating_history_json
                END,
                updated_at = excluded.updated_at
            """,
            (user_id, platform, username.strip(), avatar_url, stats_str, hist_str, now),
        )
        row = conn.execute(
            "SELECT * FROM linked_accounts WHERE user_id = ? AND platform = ?",
            (user_id, platform),
        ).fetchone()
        return _format_linked_row(row)  # type: ignore[arg-type]


def _format_linked_row(row: dict[str, Any]) -> dict[str, Any]:
    d = dict(row)
    d["stats"] = json.loads(d.pop("stats_json", "{}") or "{}")
    d["rating_history"] = json.loads(d.pop("rating_history_json", "{}") or "{}")
    return d


def get_linked_accounts(user_id: int, db_path: Path = DB_PATH) -> list[dict[str, Any]]:
    with _connect(db_path) as conn:
        rows = conn.execute(
            "SELECT * FROM linked_accounts WHERE user_id = ? ORDER BY platform ASC",
            (user_id,),
        ).fetchall()
        return [_format_linked_row(r) for r in rows]


def delete_linked_account(user_id: int, platform: str, db_path: Path = DB_PATH) -> None:
    with _connect(db_path) as conn:
        conn.execute(
            "DELETE FROM linked_accounts WHERE user_id = ? AND platform = ?",
            (user_id, platform),
        )


# ── Games & Cached Analyses ──────────────────────────────────────────────────

def _normalize_result(raw_result: str) -> str:
    r = (raw_result or "").lower()
    if r == "win":
        return "win"
    if r in ("checkmated", "resigned", "timeout", "abandoned", "lose", "loss", "kingofthehill", "threecheck"):
        return "loss"
    return "draw"


def upsert_games(
    user_id: int,
    platform: str,
    username: str,
    games: list[dict[str, Any]],
    db_path: Path = DB_PATH,
) -> int:
    """Insert or refresh synced games while preserving any existing cached Stockfish analysis."""
    now = int(time.time())
    uname_low = username.strip().lower()
    inserted_or_updated = 0
    with _connect(db_path) as conn:
        for g in games:
            pgn = g.get("pgn") or ""
            if not pgn.strip():
                continue
            w = g.get("white") or {}
            b = g.get("black") or {}
            w_user = w.get("username", "White")
            b_user = b.get("username", "Black")
            is_white = w_user.strip().lower() == uname_low
            user_color = "white" if is_white else "black"
            raw_res = w.get("result", "") if is_white else b.get("result", "")
            user_result = _normalize_result(raw_res)
            ext_id = str(g.get("external_id") or g.get("url") or _pgn_hash(pgn)[:24])

            conn.execute(
                """
                INSERT INTO games (
                    user_id, platform, external_id, url, time_class, time_control, end_time,
                    white_user, black_user, white_elo, black_elo, user_color, user_result,
                    termination, opening_eco, opening_name, pgn, pgn_hash, updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(user_id, platform, external_id) DO UPDATE SET
                    opening_eco = COALESCE(NULLIF(excluded.opening_eco, ''), games.opening_eco),
                    opening_name = COALESCE(NULLIF(excluded.opening_name, ''), games.opening_name),
                    termination = COALESCE(NULLIF(excluded.termination, ''), games.termination),
                    updated_at = excluded.updated_at
                """,
                (
                    user_id,
                    platform,
                    ext_id,
                    g.get("url", ""),
                    (g.get("time_class") or "").lower(),
                    g.get("time_control", ""),
                    int(g.get("end_time") or 0),
                    w_user,
                    b_user,
                    w.get("rating"),
                    b.get("rating"),
                    user_color,
                    user_result,
                    g.get("termination", ""),
                    g.get("opening_eco", ""),
                    g.get("opening_name", ""),
                    pgn,
                    _pgn_hash(pgn),
                    now,
                ),
            )
            inserted_or_updated += 1
    return inserted_or_updated


def save_game_analysis(
    game_id: int,
    analysis: dict[str, Any],
    user_color: str,
    db_path: Path = DB_PATH,
) -> None:
    """Persist Stockfish game review + move quality counters for fast SQL filtering & Insights."""
    moves = analysis.get("moves") or []
    summary = analysis.get("summary") or {}
    headers = analysis.get("headers") or {}
    opp_color = "black" if user_color == "white" else "white"

    counts = {
        "brilliant": 0, "great": 0, "best": 0, "excellent": 0, "good": 0,
        "book": 0, "inaccuracy": 0, "mistake": 0, "miss": 0, "blunder": 0,
    }
    for m in moves:
        if m.get("color") == user_color:
            clf = (m.get("classification") or "").lower()
            if clf in counts:
                counts[clf] += 1

    now = int(time.time())
    with _connect(db_path) as conn:
        conn.execute(
            """
            UPDATE games SET
                analysed = 1,
                depth = ?,
                user_accuracy = ?,
                opp_accuracy = ?,
                user_acpl = ?,
                brilliants = ?,
                greats = ?,
                bests = ?,
                excellents = ?,
                goods = ?,
                books = ?,
                inaccuracies = ?,
                mistakes = ?,
                misses = ?,
                blunders = ?,
                total_moves = ?,
                opening_eco = COALESCE(NULLIF(opening_eco, ''), ?),
                opening_name = COALESCE(NULLIF(opening_name, ''), ?),
                analysis_json = ?,
                updated_at = ?
            WHERE id = ?
            """,
            (
                int(analysis.get("depth") or 10),
                summary.get(f"{user_color}_accuracy"),
                summary.get(f"{opp_color}_accuracy"),
                summary.get(f"{user_color}_acpl"),
                counts["brilliant"],
                counts["great"],
                counts["best"],
                counts["excellent"],
                counts["good"],
                counts["book"],
                counts["inaccuracy"],
                counts["mistake"],
                counts["miss"],
                counts["blunder"],
                (len(moves) + 1) // 2,
                headers.get("eco", ""),
                headers.get("opening", ""),
                json.dumps(analysis),
                now,
                game_id,
            ),
        )


def get_game_by_id(game_id: int, user_id: Optional[int] = None, db_path: Path = DB_PATH) -> Optional[dict[str, Any]]:
    with _connect(db_path) as conn:
        if user_id is not None:
            row = conn.execute("SELECT * FROM games WHERE id = ? AND user_id = ?", (game_id, user_id)).fetchone()
        else:
            row = conn.execute("SELECT * FROM games WHERE id = ?", (game_id,)).fetchone()
        if not row:
            return None
        d = dict(row)
        raw_a = d.pop("analysis_json", None)
        d["analysis"] = json.loads(raw_a) if raw_a else None
        return d


def get_cached_analysis_by_pgn(pgn: str, depth: int = 10, db_path: Path = DB_PATH) -> Optional[dict[str, Any]]:
    h = _pgn_hash(pgn)
    with _connect(db_path) as conn:
        row = conn.execute(
            "SELECT analysis_json FROM games WHERE pgn_hash = ? AND analysed = 1 AND depth >= ? LIMIT 1",
            (h, depth),
        ).fetchone()
        if row and row["analysis_json"]:
            return json.loads(row["analysis_json"])
    return None


def query_games(
    user_id: int,
    platform: str = "all",
    time_class: str = "all",
    color: str = "all",
    result: str = "all",
    analysed: str = "all",
    opening: str = "",
    search: str = "",
    sort_by: str = "newest",
    days: Optional[int] = None,
    limit: int = 100,
    offset: int = 0,
    include_pgn: bool = False,
    db_path: Path = DB_PATH,
) -> dict[str, Any]:
    """Query the user's unified Chess.com + Lichess library with filters and sorting."""
    where = ["user_id = ?"]
    params: list[Any] = [user_id]

    if platform and platform != "all":
        where.append("platform = ?")
        params.append(platform.lower())
    if time_class and time_class != "all":
        where.append("time_class = ?")
        params.append(time_class.lower())
    if color in ("white", "black"):
        where.append("user_color = ?")
        params.append(color)
    if result in ("win", "loss", "draw"):
        where.append("user_result = ?")
        params.append(result)
    if analysed == "yes":
        where.append("analysed = 1")
    elif analysed == "no":
        where.append("analysed = 0")
    if opening.strip():
        where.append("LOWER(opening_name) LIKE ?")
        params.append(f"%{opening.strip().lower()}%")
    if search.strip():
        q = f"%{search.strip().lower()}%"
        where.append("(LOWER(white_user) LIKE ? OR LOWER(black_user) LIKE ? OR LOWER(opening_name) LIKE ?)")
        params.extend([q, q, q])
    if days and days > 0:
        cutoff = int(time.time()) - days * 86400
        where.append("end_time >= ?")
        params.append(cutoff)

    order_map = {
        "newest": "end_time DESC",
        "oldest": "end_time ASC",
        "brilliants": "brilliants DESC, greats DESC, COALESCE(user_accuracy, -1) DESC, end_time DESC",
        "accuracy_desc": "analysed DESC, COALESCE(user_accuracy, -1) DESC, end_time DESC",
        "accuracy_asc": "analysed DESC, COALESCE(user_accuracy, 999) ASC, end_time DESC",
        "blunders": "blunders DESC, misses DESC, end_time DESC",
        "upset": """
            CASE WHEN user_result = 'win' THEN
                COALESCE(CASE WHEN user_color = 'white' THEN black_elo - white_elo ELSE white_elo - black_elo END, -9999)
            ELSE -9999 END DESC, end_time DESC
        """,
        "opp_rating": """
            COALESCE(CASE WHEN user_color = 'white' THEN black_elo ELSE white_elo END, 0) DESC, end_time DESC
        """,
    }
    order_sql = order_map.get(sort_by, "end_time DESC")
    where_sql = " AND ".join(where)

    cols = """
        id, platform, external_id, url, time_class, time_control, end_time,
        white_user, black_user, white_elo, black_elo, user_color, user_result,
        termination, opening_eco, opening_name, analysed, depth,
        user_accuracy, opp_accuracy, user_acpl, brilliants, greats, bests,
        excellents, goods, books, inaccuracies, mistakes, misses, blunders, total_moves
    """
    if include_pgn:
        cols += ", pgn"

    with _connect(db_path) as conn:
        total = conn.execute(f"SELECT COUNT(*) AS c FROM games WHERE {where_sql}", params).fetchone()["c"]  # type: ignore[index]
        analysed_cnt = conn.execute(
            f"SELECT COUNT(*) AS c FROM games WHERE {where_sql} AND analysed = 1", params
        ).fetchone()["c"]  # type: ignore[index]
        rows = conn.execute(
            f"SELECT {cols} FROM games WHERE {where_sql} ORDER BY {order_sql} LIMIT ? OFFSET ?",
            params + [limit, offset],
        ).fetchall()

    return {
        "total": total,
        "analysed_count": analysed_cnt,
        "games": [dict(r) for r in rows],
    }


def get_games_for_report(
    user_id: int,
    platform: str = "all",
    time_class: str = "rapid",
    period_days: int = 30,
    max_games: int = 120,
    db_path: Path = DB_PATH,
) -> list[dict[str, Any]]:
    """Fetch full game rows (including PGN and cached analysis_json) for batch Insights."""
    where = ["user_id = ?"]
    params: list[Any] = [user_id]
    if platform and platform != "all":
        where.append("platform = ?")
        params.append(platform.lower())
    if time_class and time_class != "all":
        where.append("time_class = ?")
        params.append(time_class.lower())
    if period_days and period_days > 0:
        cutoff = int(time.time()) - period_days * 86400
        where.append("end_time >= ?")
        params.append(cutoff)

    with _connect(db_path) as conn:
        sql = f"SELECT * FROM games WHERE {' AND '.join(where)} ORDER BY end_time DESC"
        if max_games and max_games > 0:
            rows = conn.execute(f"{sql} LIMIT ?", params + [max_games]).fetchall()
        else:
            rows = conn.execute(sql, params).fetchall()
    out = []
    for r in rows:
        d = dict(r)
        raw_a = d.pop("analysis_json", None)
        d["analysis"] = json.loads(raw_a) if raw_a else None
        out.append(d)
    return out


# ── Saved Multi-Game Reports & Batch Jobs ────────────────────────────────────

def save_insights_report(
    user_id: int,
    platform: str,
    time_class: str,
    period_days: int,
    label: str,
    report_data: dict[str, Any],
    db_path: Path = DB_PATH,
) -> int:
    now = int(time.time())
    kpis = report_data.get("kpis") or {}
    with _connect(db_path) as conn:
        cur = conn.execute(
            """
            INSERT INTO saved_reports (
                user_id, platform, time_class, period_days, label,
                game_count, avg_accuracy, win_rate, brilliants, blunders, report_json, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                user_id,
                platform,
                time_class,
                period_days,
                label,
                int(kpis.get("games") or 0),
                kpis.get("avg_accuracy"),
                kpis.get("win_rate"),
                int(kpis.get("brilliants") or 0),
                int(kpis.get("blunders") or 0),
                json.dumps(report_data),
                now,
            ),
            returning_id=True,
        )
        return int(cur.lastrowid)  # type: ignore[arg-type]


def list_saved_reports(user_id: int, limit: int = 8, db_path: Path = DB_PATH) -> list[dict[str, Any]]:
    with _connect(db_path) as conn:
        rows = conn.execute(
            """
            SELECT id, platform, time_class, period_days, label,
                   game_count, avg_accuracy, win_rate, brilliants, blunders, created_at
            FROM saved_reports
            WHERE user_id = ?
            ORDER BY created_at DESC
            LIMIT ?
            """,
            (user_id, limit),
        ).fetchall()
        return [dict(r) for r in rows]


def get_saved_report(report_id: int, user_id: int, db_path: Path = DB_PATH) -> Optional[dict[str, Any]]:
    with _connect(db_path) as conn:
        row = conn.execute(
            "SELECT * FROM saved_reports WHERE id = ? AND user_id = ?",
            (report_id, user_id),
        ).fetchone()
        if not row:
            return None
        d = dict(row)
        d["report"] = json.loads(d.pop("report_json"))
        return d


def delete_saved_report(report_id: int, user_id: int, db_path: Path = DB_PATH) -> None:
    with _connect(db_path) as conn:
        conn.execute("DELETE FROM saved_reports WHERE id = ? AND user_id = ?", (report_id, user_id))


def upsert_batch_job(job: dict[str, Any], db_path: Path = DB_PATH) -> None:
    now = int(time.time())
    with _connect(db_path) as conn:
        conn.execute(
            """
            INSERT INTO batch_jobs (
                id, user_id, status, platform, time_class, period_days,
                total_games, completed_games, cached_games, brilliants_found,
                current_label, report_id, error, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                status = excluded.status,
                total_games = excluded.total_games,
                completed_games = excluded.completed_games,
                cached_games = excluded.cached_games,
                brilliants_found = excluded.brilliants_found,
                current_label = excluded.current_label,
                report_id = excluded.report_id,
                error = excluded.error,
                updated_at = excluded.updated_at
            """,
            (
                job["id"],
                job["user_id"],
                job["status"],
                job["platform"],
                job["time_class"],
                job["period_days"],
                job.get("total_games", 0),
                job.get("completed_games", 0),
                job.get("cached_games", 0),
                job.get("brilliants_found", 0),
                job.get("current_label", ""),
                job.get("report_id"),
                job.get("error", ""),
                job.get("created_at", now),
                now,
            ),
        )


def get_batch_job(job_id: str, user_id: int, db_path: Path = DB_PATH) -> Optional[dict[str, Any]]:
    with _connect(db_path) as conn:
        row = conn.execute(
            "SELECT * FROM batch_jobs WHERE id = ? AND user_id = ?",
            (job_id, user_id),
        ).fetchone()
        return dict(row) if row else None


def mark_batch_job_cancelled(job_id: str, db_path: Path = DB_PATH) -> Optional[int]:
    """
    Immediately mark a batch job cancelled and delete any partial report
    that may have been attached right as cancellation arrived.
    """
    now = int(time.time())
    with _connect(db_path) as conn:
        row = conn.execute(
            "SELECT user_id, report_id FROM batch_jobs WHERE id = ?",
            (job_id,),
        ).fetchone()
        deleted_report_id = None
        if row and row["report_id"] is not None:
            deleted_report_id = int(row["report_id"])
            conn.execute(
                "DELETE FROM saved_reports WHERE id = ? AND user_id = ?",
                (deleted_report_id, row["user_id"]),
            )
        conn.execute(
            """
            UPDATE batch_jobs
            SET status = 'cancelled',
                report_id = NULL,
                current_label = 'Cancelled — no report saved.',
                updated_at = ?
            WHERE id = ?
            """,
            (now, job_id),
        )
        return deleted_report_id


if __name__ == "__main__":
    import tempfile

    with tempfile.TemporaryDirectory() as tmp:
        p = Path(tmp) / "test.db"
        init_db(p)
        u = get_or_create_local_user("Tester", db_path=p)
        tok = create_session(u["id"], db_path=p)
        assert get_user_by_session(tok, db_path=p)["display_name"] == "Tester"
        prefs = update_user_preferences(u["id"], {"tone": "sarcastic", "depth": 12}, db_path=p)
        assert prefs["tone"] == "sarcastic" and prefs["depth"] == 12
        print("src/db.py self-test OK:", u["display_name"], prefs)
