import tempfile
import threading
import time
import unittest
from pathlib import Path
from unittest.mock import patch

from src import db, insights


class TestInsightsCancelAndAllGames(unittest.TestCase):
    """Tests for instant batch cancellation (no saved report) and max_games=0 (all games)."""

    def test_get_games_for_report_returns_all_games_when_max_games_is_zero(self):
        with tempfile.TemporaryDirectory() as tmp:
            db_path = Path(tmp) / "test.db"
            db.init_db(db_path)
            user = db.get_or_create_local_user("HistoryTester", db_path=db_path)
            games = [
                {
                    "external_id": f"g-{i}",
                    "url": f"https://chess.com/game/{i}",
                    "time_class": "rapid",
                    "time_control": "600",
                    "end_time": 1700000000 + i * 60,
                    "white": {"username": "HistoryTester", "rating": 1200 + i, "result": "win"},
                    "black": {"username": f"Opp{i}", "rating": 1200, "result": "resigned"},
                    "termination": "resignation",
                    "opening_eco": "C20",
                    "opening_name": "King's Pawn",
                    "pgn": "1. e4 e5 2. Nf3 Nc6 1-0",
                }
                for i in range(15)
            ]
            db.upsert_games(user["id"], "chesscom", "HistoryTester", games, db_path=db_path)

            capped = db.get_games_for_report(
                user["id"], platform="all", time_class="rapid", period_days=0, max_games=5, db_path=db_path
            )
            self.assertEqual(len(capped), 5)

            all_games = db.get_games_for_report(
                user["id"], platform="all", time_class="rapid", period_days=0, max_games=0, db_path=db_path
            )
            self.assertEqual(len(all_games), 15)

    def test_cancel_batch_job_stops_mid_game_and_saves_no_report(self):
        with tempfile.TemporaryDirectory() as tmp:
            db_path = Path(tmp) / "cancel.db"
            db.init_db(db_path)
            user = db.get_or_create_local_user("CancelTester", db_path=db_path)
            games = [
                {
                    "external_id": f"c-{i}",
                    "url": f"https://chess.com/game/{i}",
                    "time_class": "rapid",
                    "time_control": "600",
                    "end_time": 1700000000 + i * 60,
                    "white": {"username": "CancelTester", "rating": 1200, "result": "win"},
                    "black": {"username": f"Opp{i}", "rating": 1200, "result": "resigned"},
                    "termination": "resignation",
                    "opening_eco": "C20",
                    "opening_name": "King's Pawn",
                    "pgn": "1. e4 e5 2. Nf3 Nc6 1-0",
                }
                for i in range(4)
            ]
            db.upsert_games(user["id"], "chesscom", "CancelTester", games, db_path=db_path)

            started_ev = threading.Event()
            aborted_fast = threading.Event()

            def slow_cancellable_analyse(pgn, depth=8, engine=None, cancel_event=None):
                started_ev.set()
                # Simulate per-ply cancellation check
                for _ in range(50):
                    if cancel_event is not None and cancel_event.is_set():
                        aborted_fast.set()
                        raise InterruptedError("Analysis cancelled.")
                    time.sleep(0.01)
                return {"depth": depth, "moves": [], "summary": {}, "headers": {}}

            # Route insights DB calls to the temp DB & stub Stockfish engine
            class _DummyEng:
                def quit(self):
                    pass

            with (
                patch.object(db, "DB_PATH", db_path),
                patch.object(insights, "get_engine", return_value=_DummyEng()),
                patch.object(insights, "get_games_for_report", side_effect=lambda **kw: db.get_games_for_report(db_path=db_path, **kw)),
                patch.object(insights, "get_linked_accounts", side_effect=lambda uid: db.get_linked_accounts(uid, db_path=db_path)),
                patch.object(insights, "save_game_analysis", side_effect=lambda *a, **kw: db.save_game_analysis(*a, db_path=db_path, **kw)),
                patch.object(insights, "save_insights_report", side_effect=lambda **kw: db.save_insights_report(db_path=db_path, **kw)),
                patch.object(insights, "delete_saved_report", side_effect=lambda rid, uid: db.delete_saved_report(rid, uid, db_path=db_path)),
                patch.object(insights, "upsert_batch_job", side_effect=lambda j: db.upsert_batch_job(j, db_path=db_path)),
                patch.object(insights, "mark_batch_job_cancelled", side_effect=lambda jid: db.mark_batch_job_cancelled(jid, db_path=db_path)),
            ):
                job = insights.start_batch_analysis_job(
                    user_id=user["id"],
                    platform="all",
                    time_class="rapid",
                    period_days=0,
                    max_games=0,
                    depth=8,
                    analyse_fn=slow_cancellable_analyse,
                )
                self.assertTrue(started_ev.wait(timeout=2.0))
                t0 = time.monotonic()
                insights.cancel_batch_job(job["id"])
                self.assertTrue(aborted_fast.wait(timeout=1.0))
                elapsed = time.monotonic() - t0
                self.assertLess(elapsed, 0.5)

                # Wait briefly for worker finally block to settle
                time.sleep(0.08)
                final_job = db.get_batch_job(job["id"], user["id"], db_path=db_path)
                self.assertEqual(final_job["status"], "cancelled")
                self.assertIsNone(final_job["report_id"])
                self.assertEqual(db.list_saved_reports(user["id"], db_path=db_path), [])


if __name__ == "__main__":
    unittest.main()
