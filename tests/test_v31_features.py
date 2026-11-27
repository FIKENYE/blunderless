"""
Comprehensive tests for Blunderless v3.1 features:
- Cloud Postgres/SQLite adapter, scrypt password accounts, cross-device sessions & preferences
- Deeper Layer 2 tactical & positional motifs (back-rank, skewers, discovered attacks, overloaded defenders, rook files/7th)
- Raw-Engine vs Structured-Feature evaluation benchmark across tests/positions.json
- Time-trouble & rushed-blunder clock analysis in single-game report & multi-game insights
- SSE streaming analysis endpoint & PWA Service Worker route
"""

from __future__ import annotations

import asyncio
import json
import os
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

import chess
from fastapi import Response

from src.auth import (
    SESSION_COOKIE,
    hash_password,
    login_password_account,
    register_password_account,
    verify_password,
)
from src.db import (
    _translate_qmarks_to_percent_s,
    get_storage_mode,
    get_user_by_session,
    get_user_preferences,
    init_db,
    update_user_preferences,
)
from src.engine import get_engine
from src.eval_benchmark import check_expected_motif, run_benchmark
from src.features import extract_features
from src.insights import aggregate_multi_game_report
from src.report import build_game_report, compute_clock_analysis
from src.server import (
    LoginAccountRequest,
    PgnRequest,
    PreferencesPatchRequest,
    RegisterAccountRequest,
    analyse_pgn_stream_endpoint,
    auth_login_endpoint,
    auth_logout_endpoint,
    auth_me_endpoint,
    auth_register_endpoint,
    health_endpoint,
    service_worker_endpoint,
    update_user_preferences_endpoint,
)


class TestCloudStorageAndPasswordAuth(unittest.TestCase):
    def test_placeholder_translation_preserves_string_literals(self):
        sql = "SELECT * FROM users WHERE email = ? AND note = 'what?' AND id = ?"
        pg = _translate_qmarks_to_percent_s(sql)
        self.assertEqual(pg, "SELECT * FROM users WHERE email = %s AND note = 'what?' AND id = %s")

    def test_storage_mode_detection(self):
        with tempfile.TemporaryDirectory() as tmp:
            custom_db = Path(tmp) / "custom.db"
            with patch.dict(os.environ, {"DATABASE_URL": "postgres://user:pw@host:5432/db"}, clear=False):
                self.assertEqual(get_storage_mode(), "postgres")
                # Custom path always stays SQLite so unit tests never touch live Postgres
                self.assertEqual(get_storage_mode(custom_db), "sqlite")
            with patch.dict(os.environ, {"DATABASE_URL": ""}, clear=False):
                self.assertEqual(get_storage_mode(), "sqlite")

    def test_scrypt_password_hashing_and_cross_device_login(self):
        h = hash_password("knight_fork_2026")
        self.assertTrue(h.startswith("scrypt$"))
        self.assertTrue(verify_password("knight_fork_2026", h))
        self.assertFalse(verify_password("wrong_password", h))
        with self.assertRaises(ValueError):
            hash_password("short")

        with tempfile.TemporaryDirectory() as tmp:
            db_file = Path(tmp) / "auth.db"
            init_db(db_file)

            user1, tok_phone = register_password_account(
                "alice@example.com", "secret123", display_name="Alice", db_path=db_file
            )
            self.assertEqual(user1["email"], "alice@example.com")
            self.assertEqual(user1["display_name"], "Alice")
            self.assertNotIn("password_hash", user1)
            self.assertTrue(user1["has_password"])

            # Duplicate email rejected
            with self.assertRaises(ValueError):
                register_password_account("alice@example.com", "otherpass", db_path=db_file)

            # Second device logs in with same credentials -> distinct valid session token
            user2, tok_laptop = login_password_account("alice@example.com", "secret123", db_path=db_file)
            self.assertEqual(user1["id"], user2["id"])
            self.assertNotEqual(tok_phone, tok_laptop)
            self.assertEqual(get_user_by_session(tok_phone, db_path=db_file)["id"], user1["id"])
            self.assertEqual(get_user_by_session(tok_laptop, db_path=db_file)["id"], user1["id"])

            # Wrong password rejected
            with self.assertRaises(ValueError):
                login_password_account("alice@example.com", "badpass", db_path=db_file)

            # Cloud-synced preferences persist across sessions
            updated = update_user_preferences(
                user1["id"],
                {"theme": "dark", "tone": "sarcastic", "depth": 12},
                db_path=db_file,
            )
            self.assertEqual(updated["theme"], "dark")
            self.assertEqual(updated["tone"], "sarcastic")
            self.assertEqual(updated["depth"], 12)
            fetched = get_user_preferences(user1["id"], db_path=db_file)
            self.assertEqual(fetched["theme"], "dark")
            self.assertEqual(fetched["depth"], 12)


class TestDeeperLayer2MotifsAndBenchmark(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.engine = get_engine()

    @classmethod
    def tearDownClass(cls):
        cls.engine.quit()

    def test_all_new_layer2_motifs(self):
        # Back-rank weak vs safe with luft
        f_weak = extract_features("3r2k1/5ppp/8/8/8/8/5PPP/6K1 w - - 0 1")
        self.assertTrue(f_weak["king_safety"]["white"]["back_rank_weak"])
        f_safe = extract_features("3r2k1/5ppp/8/8/8/7P/5PP1/6K1 w - - 0 1")
        self.assertFalse(f_safe["king_safety"]["white"]["back_rank_weak"])

        # Skewer: Rook on e1 skewers King on e5 to Queen on e8
        f_skewer = extract_features("4q3/8/8/4k3/8/8/8/4R1K1 b - - 0 1")
        self.assertTrue(check_expected_motif(f_skewer, "skewer:black:e5:e8"))

        # Discovered check: White Knight on e5 masks Rook on e1 vs Black King on e8
        f_disc = extract_features("4k3/8/8/4N3/8/8/8/4R1K1 w - - 0 1")
        self.assertTrue(check_expected_motif(f_disc, "discovered_check:black:e8"))

        # Overloaded defender: Black Queen on e5 defends c5 knight and g5 rook against two rooks
        f_over = extract_features("6k1/5ppp/8/2n1q1r1/8/8/2R3R1/6K1 w - - 0 1")
        self.assertTrue(check_expected_motif(f_over, "overloaded_defender:black:e5"))

        # Rooks on open file + 7th rank
        f_rook = extract_features("6k1/3R1ppp/8/8/8/8/5PPP/6K1 w - - 0 1")
        self.assertIn("d7", f_rook["piece_activity"]["white"]["rooks_on_open_files"])
        self.assertIn("d7", f_rook["piece_activity"]["white"]["rooks_on_seventh"])

    def test_eval_benchmark_achieves_100pct_layer2_and_positive_lift(self):
        report = run_benchmark(depth=6, use_live_llm=False, engine=self.engine)
        self.assertGreaterEqual(report["positions_evaluated"], 20)
        l2 = report["layer2_motif_detection"]
        self.assertEqual(l2["detected"], l2["total"], f"Missed motifs: {report['results']}")
        self.assertGreater(
            report["comparison"]["structured_features_avg_motif_recall_pct"],
            report["comparison"]["raw_engine_avg_motif_recall_pct"],
        )


class TestClockAnalysis(unittest.TestCase):
    def test_rushed_vs_time_trouble_blunders_and_insights_aggregation(self):
        board = chess.Board()
        sans = ["e4", "e5", "Nf3", "Nc6", "Bc4", "Bc5"]
        # Base 600+0:
        # Ply 1 (W): 598s left (spent 2s, plenty of clock) -> blunder => RUSHED blunder!
        # Ply 3 (W): 40s left (spent 558s, < 60s left) -> blunder => TIME-TROUBLE blunder!
        clocks = [598.0, 595.0, 40.0, 590.0, 35.0, 580.0]
        clfs = ["blunder", "best", "blunder", "best", "best", "best"]
        epls = [0.35, 0.0, 0.30, 0.0, 0.0, 0.0]
        moves = []
        for idx, san in enumerate(sans, start=1):
            mv = board.parse_san(san)
            col = "white" if board.turn == chess.WHITE else "black"
            board.push(mv)
            moves.append({
                "ply": idx,
                "move_number": (idx + 1) // 2,
                "color": col,
                "uci": mv.uci(),
                "san": san,
                "fen": board.fen(),
                "clock_seconds": clocks[idx - 1],
                "best_move": mv.uci(),
                "best_move_san": san,
                "eval_after": {"type": "cp", "value": 0},
                "eval_change": -250 if clfs[idx - 1] == "blunder" else 0,
                "epl": epls[idx - 1],
                "classification": clfs[idx - 1],
            })

        clk = compute_clock_analysis(moves, headers={"time_control": "600+0"})
        self.assertTrue(clk["has_clock_data"])
        self.assertEqual(clk["white"]["rushed_blunders"], 1)
        self.assertEqual(clk["white"]["time_trouble_blunders"], 1)
        self.assertEqual(moves[0]["time_spent"], 2.0)

        rep = build_game_report(
            moves,
            headers={"white": "Alice", "black": "Bob", "time_control": "600+0"},
            summary={"white_accuracy": 55.0, "black_accuracy": 98.0},
        )
        self.assertTrue(rep["has_clock_data"])
        self.assertEqual(rep["white"]["clock"]["rushed_blunders"], 1)
        self.assertTrue(any("Slow Down" in t["title"] for t in rep["white"]["tips"]))

        # Insights aggregation picks up time_management
        agg = aggregate_multi_game_report(
            games=[{
                "id": 1,
                "end_time": 1700000000,
                "user_color": "white",
                "user_result": "loss",
                "white_user": "Alice",
                "black_user": "Bob",
                "white_elo": 1200,
                "black_elo": 1210,
                "analysed": 1,
                "user_accuracy": 55.0,
                "user_acpl": 90,
                "time_control": "600+0",
                "analysis": {"moves": moves, "report": rep, "headers": {"time_control": "600+0"}},
            }],
            linked_accounts=[],
        )
        tm = agg["time_management"]
        self.assertTrue(tm["has_clock_data"])
        self.assertEqual(tm["rushed_blunders"], 1)
        self.assertEqual(tm["time_trouble_blunders"], 1)


def _make_req(engine=None, cookies=None):
    return SimpleNamespace(
        url=SimpleNamespace(scheme="http", netloc="127.0.0.1:8000"),
        cookies=cookies or {},
        headers={},
        app=SimpleNamespace(state=SimpleNamespace(engine=engine)),
    )


def _extract_cookie(resp: Response, name: str) -> str:
    raw = resp.headers.get("set-cookie", "")
    prefix = f"{name}="
    if prefix not in raw:
        return ""
    return raw.split(prefix, 1)[1].split(";", 1)[0]


class TestServerRoutesAndStreaming(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.engine = get_engine()

    @classmethod
    def tearDownClass(cls):
        cls.engine.quit()

    def test_streaming_pgn_service_worker_and_auth_endpoints(self):
        req = _make_req(engine=self.engine)

        # 1. Health check reports storage_mode
        h = health_endpoint(req)
        self.assertEqual(h["status"], "ok")
        self.assertIn(h["storage_mode"], ("sqlite", "postgres"))

        # 2. Root-scoped Service Worker
        sw = service_worker_endpoint()
        self.assertEqual(sw.headers.get("service-worker-allowed"), "/")
        self.assertTrue(Path(sw.path).is_file())

        # 3. Register + Login + Preferences endpoints (cleaned up after test so local DB stays spotless)
        unique_user = f"smoke_{os.getpid()}_{id(self)}"
        created_uid = None
        try:
            reg_resp = Response()
            reg = auth_register_endpoint(
                RegisterAccountRequest(identifier=unique_user, password="password123", display_name="SmokeTester"),
                req,
                reg_resp,
            )
            created_uid = reg["user"]["id"]
            self.assertEqual(reg["user"]["display_name"], "SmokeTester")
            self.assertNotIn("password_hash", reg["user"])
            sid = _extract_cookie(reg_resp, SESSION_COOKIE)
            self.assertTrue(bool(sid))

            authed_req = _make_req(engine=self.engine, cookies={SESSION_COOKIE: sid})
            pref = update_user_preferences_endpoint(
                PreferencesPatchRequest(theme="dark", tone="analytical", depth=12),
                authed_req,
            )
            self.assertEqual(pref["preferences"]["depth"], 12)

            me = auth_me_endpoint(authed_req)
            self.assertTrue(me["authenticated"])
            self.assertEqual(me["preferences"]["tone"], "analytical")

            # Logout then log back in
            out_resp = Response()
            auth_logout_endpoint(authed_req, out_resp)
            self.assertFalse(auth_me_endpoint(authed_req)["authenticated"])

            login_resp = Response()
            login = auth_login_endpoint(
                LoginAccountRequest(identifier=unique_user, password="password123"),
                req,
                login_resp,
            )
            self.assertEqual(login["user"]["display_name"], "SmokeTester")
            self.assertTrue(bool(_extract_cookie(login_resp, SESSION_COOKIE)))
        finally:
            if created_uid is not None:
                from src.db import _connect
                with _connect() as conn:
                    conn.execute("DELETE FROM users WHERE id = ?", (created_uid,))

        # 4. SSE streaming PGN analysis
        pgn = (
            '[White "A"]\n[Black "B"]\n[TimeControl "300+0"]\n\n'
            '1. e4 {[%clk 0:04:58]} e5 {[%clk 0:04:56]} 2. Nf3 {[%clk 0:04:50]} Nc6 {[%clk 0:04:48]} *'
        )
        stream_resp = analyse_pgn_stream_endpoint(PgnRequest(pgn=pgn, depth=6), req)

        async def _consume() -> str:
            chunks = []
            async for chunk in stream_resp.body_iterator:
                chunks.append(chunk.decode("utf-8") if isinstance(chunk, bytes) else chunk)
            return "".join(chunks)

        body = asyncio.run(_consume())
        self.assertIn("event: progress", body)
        self.assertIn("event: done", body)
        done_part = body.split("event: done\ndata: ", 1)[1].split("\n\n", 1)[0]
        done_json = json.loads(done_part)
        self.assertEqual(len(done_json["moves"]), 4)
        self.assertTrue(done_json["report"]["has_clock_data"])


if __name__ == "__main__":
    unittest.main()
