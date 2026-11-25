import unittest
from unittest.mock import patch
from fastapi import HTTPException

from src.engine import get_engine
from src.server import (
    FenRequest,
    PgnRequest,
    analyse_fen_endpoint,
    analyse_pgn_endpoint,
    chesscom_games_endpoint,
    parse_and_analyse_pgn,
)


class _DummyApp:
    def __init__(self, engine):
        self.state = type("State", (), {"engine": engine})()


class _DummyRequest:
    def __init__(self, engine):
        self.app = _DummyApp(engine)


class TestServerLayer(unittest.TestCase):
    """Unit tests for Stage 1 FastAPI endpoints and PGN analysis."""

    @classmethod
    def setUpClass(cls):
        cls.engine = get_engine()

    @classmethod
    def tearDownClass(cls):
        cls.engine.quit()

    def test_analyse_fen_endpoint_returns_engine_and_features(self):
        req = _DummyRequest(self.engine)
        payload = FenRequest(fen="rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1", depth=8)
        result = analyse_fen_endpoint(payload, req)

        self.assertIn("engine", result)
        self.assertIn("features", result)
        self.assertEqual(len(result["engine"]["top_lines"]), 3)
        self.assertEqual(result["features"]["material_balance"]["advantage"], 0)

    def test_analyse_fen_endpoint_invalid_fen_raises_400(self):
        req = _DummyRequest(self.engine)
        payload = FenRequest(fen="not a fen", depth=8)
        with self.assertRaises(HTTPException) as ctx:
            analyse_fen_endpoint(payload, req)
        self.assertEqual(ctx.exception.status_code, 400)

    def test_parse_and_analyse_pgn_short_game(self):
        pgn = '[White "Alice"]\n[Black "Bob"]\n\n1. e4 e5 2. Nf3 Nc6 1-0'
        result = parse_and_analyse_pgn(pgn, depth=8, engine=self.engine)

        self.assertEqual(result["headers"]["white"], "Alice")
        self.assertEqual(result["headers"]["black"], "Bob")
        self.assertEqual(len(result["moves"]), 4)

        first_move = result["moves"][0]
        self.assertEqual(first_move["ply"], 1)
        self.assertEqual(first_move["san"], "e4")
        self.assertIn("eval_after", first_move)
        self.assertIn("classification", first_move)

    def test_analyse_pgn_endpoint_empty_pgn_raises_400(self):
        req = _DummyRequest(self.engine)
        with self.assertRaises(HTTPException) as ctx:
            analyse_pgn_endpoint(PgnRequest(pgn="   ", depth=8), req)
        self.assertEqual(ctx.exception.status_code, 400)

    @patch("src.server.get_recent_games")
    def test_chesscom_games_endpoint_success_and_404(self, mock_get_games):
        mock_get_games.return_value = [{"url": "https://chess.com/game/1", "pgn": "1. e4 e5"}]
        res = chesscom_games_endpoint("hikaru")
        self.assertEqual(res["username"], "hikaru")
        self.assertEqual(len(res["games"]), 1)

        mock_get_games.side_effect = ValueError("Chess.com user 'nobody' not found.")
        with self.assertRaises(HTTPException) as ctx:
            chesscom_games_endpoint("nobody")
        self.assertEqual(ctx.exception.status_code, 404)


if __name__ == "__main__":
    unittest.main()
