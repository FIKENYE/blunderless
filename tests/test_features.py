import json
import unittest
from pathlib import Path
import chess

from src.features import (
    get_material_balance,
    get_king_safety,
    get_pawn_structure,
    get_piece_activity,
    get_tactical_threats,
    get_initiative,
    extract_features,
)

POSITIONS_PATH = Path(__file__).parent / "positions.json"


class TestFeatureLayer(unittest.TestCase):
    """Tests for Layer 2 (src/features.py)."""

    @classmethod
    def setUpClass(cls):
        with open(POSITIONS_PATH, "r", encoding="utf-8") as f:
            cls.positions = json.load(f)

    def test_material_balance_equal_and_imbalanced(self):
        start_board = chess.Board(self.positions["starting_position"]["fen"])
        start_mat = get_material_balance(start_board)
        self.assertEqual(start_mat["white"]["total"], 39)
        self.assertEqual(start_mat["black"]["total"], 39)
        self.assertEqual(start_mat["advantage"], 0)

        hanging_board = chess.Board(self.positions["hanging_knight"]["fen"])
        hanging_mat = get_material_balance(hanging_board)
        self.assertEqual(hanging_mat["white"]["total"], 9)
        self.assertEqual(hanging_mat["black"]["total"], 3)
        self.assertEqual(hanging_mat["advantage"], 6)

    def test_king_safety(self):
        board = chess.Board(self.positions["exposed_king"]["fen"])
        safety = get_king_safety(board)

        self.assertFalse(safety["white"]["in_check"])
        self.assertEqual(safety["white"]["pawn_shield_count"], 2)
        self.assertGreater(safety["white"]["enemy_attackers_on_ring"], 0)
        self.assertEqual(safety["black"]["pawn_shield_count"], 3)

    def test_pawn_structure(self):
        board = chess.Board(self.positions["pawn_structure"]["fen"])
        pawns = get_pawn_structure(board)

        self.assertIn("c", pawns["white"]["doubled_files"])
        self.assertIn("a2", pawns["white"]["isolated_pawns"])
        self.assertIn("e4", pawns["black"]["passed_pawns"])

    def test_piece_activity_starting_position(self):
        board = chess.Board(self.positions["starting_position"]["fen"])
        activity = get_piece_activity(board)

        self.assertEqual(activity["side_to_move_mobility"], 20)
        self.assertEqual(activity["white"]["undeveloped_minors"], 4)
        self.assertEqual(activity["black"]["undeveloped_minors"], 4)
        self.assertIn("white", activity["center_control"])
        self.assertIn("black", activity["center_control"])

    def test_tactical_threats_hanging_and_pin(self):
        hanging_board = chess.Board(self.positions["hanging_knight"]["fen"])
        threats = get_tactical_threats(hanging_board)
        hanging_squares = [item["square"] for item in threats["black"]["hanging_pieces"]]
        self.assertIn("e5", hanging_squares)

        pinned_board = chess.Board(self.positions["pinned_knight"]["fen"])
        pin_threats = get_tactical_threats(pinned_board)
        pinned_squares = [item["square"] for item in pin_threats["black"]["pinned_pieces"]]
        self.assertIn("e5", pinned_squares)

    def test_initiative_with_and_without_engine(self):
        board = chess.Board(self.positions["starting_position"]["fen"])
        init_no_eng = get_initiative(board)
        self.assertEqual(init_no_eng["turn"], "white")
        self.assertIsNone(init_no_eng["top_move_gap_cp"])

        mock_engine_data = {
            "top_lines": [
                {"rank": 1, "move": "e2e4", "score": {"type": "cp", "value": 250}},
                {"rank": 2, "move": "d2d4", "score": {"type": "cp", "value": 30}},
            ]
        }
        init_with_eng = get_initiative(board, engine_data=mock_engine_data)
        self.assertEqual(init_with_eng["top_move_gap_cp"], 220)
        self.assertTrue(init_with_eng["is_critical_moment"])

    def test_extract_features_returns_json_serializable_dict(self):
        fen = self.positions["starting_position"]["fen"]
        features = extract_features(fen)

        expected_keys = {
            "fen",
            "material_balance",
            "king_safety",
            "pawn_structure",
            "piece_activity",
            "tactical_threats",
            "initiative",
        }
        self.assertEqual(set(features.keys()), expected_keys)
        # Must serialize cleanly to JSON
        dumped = json.dumps(features)
        self.assertIsInstance(dumped, str)

    def test_extract_features_invalid_fen_raises(self):
        with self.assertRaises(ValueError):
            extract_features("invalid fen string")


if __name__ == "__main__":
    unittest.main()
