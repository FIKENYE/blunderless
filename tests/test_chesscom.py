import unittest
from unittest.mock import patch

from src.chesscom import get_recent_games


class TestChessComClient(unittest.TestCase):
    """Unit tests for src/chesscom.py using mocked HTTP responses."""

    def test_empty_username_raises(self):
        with self.assertRaises(ValueError):
            get_recent_games("   ")

    @patch("src.chesscom._fetch_json")
    def test_get_recent_games_returns_latest_five_across_archives(self, mock_fetch):
        # Simulate two monthly archives: newest has 2 games, previous has 4 games.
        mock_fetch.side_effect = [
            {
                "archives": [
                    "https://api.chess.com/pub/player/hikaru/games/2026/10",
                    "https://api.chess.com/pub/player/hikaru/games/2026/11",
                ]
            },
            {
                "games": [
                    {
                        "url": "https://chess.com/game/1",
                        "white": {"username": "hikaru", "rating": 3200, "result": "win"},
                        "black": {"username": "opp1", "rating": 3000, "result": "resigned"},
                        "time_class": "blitz",
                        "end_time": 1700000100,
                        "pgn": '[Event "Live Chess"]\n\n1. e4 e5 1-0',
                    },
                    {
                        "url": "https://chess.com/game/2",
                        "white": {"username": "opp2", "rating": 3050, "result": "checkmated"},
                        "black": {"username": "hikaru", "rating": 3205, "result": "win"},
                        "time_class": "blitz",
                        "end_time": 1700000200,
                        "pgn": '[Event "Live Chess"]\n\n1. d4 d5 0-1',
                    },
                ]
            },
            {
                "games": [
                    {
                        "url": f"https://chess.com/game/oct-{i}",
                        "white": {"username": "hikaru", "rating": 3190, "result": "win"},
                        "black": {"username": f"oct_opp_{i}", "rating": 2900, "result": "resigned"},
                        "time_class": "rapid",
                        "end_time": 1699000000 + i,
                        "pgn": '[Event "Live Chess"]\n\n1. c4 e5 1-0',
                    }
                    for i in range(4)
                ]
            },
        ]

        games = get_recent_games("Hikaru", limit=5)

        self.assertEqual(len(games), 5)
        # Most recent game (highest end_time) should come first.
        self.assertEqual(games[0]["url"], "https://chess.com/game/2")
        self.assertEqual(games[1]["url"], "https://chess.com/game/1")
        self.assertEqual(games[2]["url"], "https://chess.com/game/oct-3")
        self.assertIn("pgn", games[0])

    @patch("src.chesscom._fetch_json")
    def test_no_archives_returns_empty_list(self, mock_fetch):
        mock_fetch.return_value = {"archives": []}
        self.assertEqual(get_recent_games("newplayer"), [])


if __name__ == "__main__":
    unittest.main()
