import unittest
import chess

from src.engine import get_engine, analyse_position, evaluate_move


class TestEngineLayer(unittest.TestCase):
    """Tests for Layer 1 (src/engine.py) using Stockfish."""

    @classmethod
    def setUpClass(cls):
        # Share one engine instance across tests for speed.
        cls.engine = get_engine()

    @classmethod
    def tearDownClass(cls):
        cls.engine.quit()

    def test_get_engine_opens_and_quits(self):
        with get_engine() as eng:
            self.assertIsNotNone(eng)

    def test_analyse_starting_position(self):
        fen = chess.STARTING_FEN
        result = analyse_position(fen, depth=10, multipv=3, engine=self.engine)

        self.assertIn("best_move", result)
        self.assertIn("best_move_san", result)
        self.assertEqual(result["score"]["type"], "cp")
        self.assertIsInstance(result["score"]["value"], int)

        # Must return top 3 lines ranked 1, 2, 3
        top_lines = result["top_lines"]
        self.assertEqual(len(top_lines), 3)
        self.assertEqual([line["rank"] for line in top_lines], [1, 2, 3])
        for line in top_lines:
            self.assertIn("move", line)
            self.assertIn("move_san", line)
            self.assertIn("score", line)
            self.assertGreater(len(line["pv"]), 0)

    def test_analyse_mate_in_one(self):
        # White to move: Re8# is mate in 1
        fen = "6k1/5ppp/8/8/8/8/5PPP/4R1K1 w - - 0 1"
        result = analyse_position(fen, depth=10, multipv=3, engine=self.engine)

        self.assertEqual(result["best_move"], "e1e8")
        self.assertEqual(result["best_move_san"], "Re8#")
        self.assertEqual(result["score"], {"type": "mate", "value": 1})

    def test_analyse_invalid_fen_raises(self):
        with self.assertRaises(ValueError):
            analyse_position("not a valid fen", engine=self.engine)

    def test_evaluate_move_blunder(self):
        # White is up a Queen (on d6), but blunders it straight onto e7 where Black's King captures it
        fen = "4k3/8/3Q4/8/8/8/8/4K3 w - - 0 1"
        result = evaluate_move(fen, "d6e7", depth=10, engine=self.engine)

        self.assertEqual(result["played_move"], "d6e7")
        self.assertEqual(result["played_move_san"], "Qe7+")
        self.assertLess(result["eval_change"], -200)
        self.assertEqual(result["classification"], "blunder")

    def test_evaluate_move_best(self):
        # Playing the mate-in-1 move should be classified as 'best'
        fen = "6k1/5ppp/8/8/8/8/5PPP/4R1K1 w - - 0 1"
        result = evaluate_move(fen, "e1e8", depth=10, engine=self.engine)

        self.assertEqual(result["played_move"], "e1e8")
        self.assertEqual(result["best_move"], "e1e8")
        self.assertEqual(result["classification"], "best")
        self.assertGreaterEqual(result["eval_change"], 0)

    def test_evaluate_illegal_move_raises(self):
        with self.assertRaises(ValueError):
            evaluate_move(chess.STARTING_FEN, "e2e5", depth=8, engine=self.engine)


if __name__ == "__main__":
    unittest.main()
