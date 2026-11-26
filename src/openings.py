"""
Built-in ECO Opening Book & Continuations for Blunderless.

Uses python-chess board.epd() (board + turn + castling + en-passant) as the
transposition-safe lookup key so standard openings and continuations are
always detected immediately, even when Lichess Explorer is offline or
rate-limited.
"""

from typing import Any, Optional
import chess

# Curated ECO opening lines: (ECO, Name, SAN move sequence, approx W/D/B counts)
_ECO_LINES: list[tuple[str, str, list[str], tuple[int, int, int]]] = [
    # King's Pawn (1. e4)
    ("B00", "King's Pawn Opening", ["e4"], (380000, 320000, 300000)),
    ("C20", "King's Pawn Game", ["e4", "e5"], (180000, 160000, 140000)),
    ("C40", "King's Knight Opening", ["e4", "e5", "Nf3"], (150000, 130000, 110000)),
    ("C44", "King's Pawn Game: Tayler / Scotch", ["e4", "e5", "Nf3", "Nc6"], (130000, 115000, 95000)),
    ("C60", "Ruy Lopez", ["e4", "e5", "Nf3", "Nc6", "Bb5"], (58000, 52000, 39000)),
    ("C65", "Ruy Lopez: Berlin Defense", ["e4", "e5", "Nf3", "Nc6", "Bb5", "Nf6"], (14000, 18000, 9000)),
    ("C70", "Ruy Lopez: Morphy Defense", ["e4", "e5", "Nf3", "Nc6", "Bb5", "a6"], (36000, 31000, 24000)),
    ("C78", "Ruy Lopez: Morphy Defense", ["e4", "e5", "Nf3", "Nc6", "Bb5", "a6", "Ba4", "Nf6"], (29000, 25000, 19000)),
    ("C84", "Ruy Lopez: Closed", ["e4", "e5", "Nf3", "Nc6", "Bb5", "a6", "Ba4", "Nf6", "O-O", "Be7"], (19000, 18000, 13000)),
    ("C50", "Italian Game", ["e4", "e5", "Nf3", "Nc6", "Bc4"], (35000, 28000, 26000)),
    ("C53", "Italian Game: Giuoco Piano", ["e4", "e5", "Nf3", "Nc6", "Bc4", "Bc5"], (16000, 13000, 11000)),
    ("C54", "Italian Game: Giuoco Pianissimo", ["e4", "e5", "Nf3", "Nc6", "Bc4", "Bc5", "c3", "Nf6", "d3"], (9000, 7500, 6200)),
    ("C55", "Italian Game: Two Knights Defense", ["e4", "e5", "Nf3", "Nc6", "Bc4", "Nf6"], (14000, 11000, 10000)),
    ("C57", "Italian Game: Fried Liver / Knight Attack", ["e4", "e5", "Nf3", "Nc6", "Bc4", "Nf6", "Ng5", "d5", "exd5"], (7500, 4800, 5200)),
    ("C45", "Scotch Game", ["e4", "e5", "Nf3", "Nc6", "d4", "exd4", "Nxd4"], (15000, 12000, 10000)),
    ("C45", "Scotch Game: Classical", ["e4", "e5", "Nf3", "Nc6", "d4", "exd4", "Nxd4", "Bc5"], (6500, 5200, 4400)),
    ("C42", "Petrov's Defense", ["e4", "e5", "Nf3", "Nf6"], (14000, 16000, 9000)),
    ("C42", "Petrov's Defense: Classical", ["e4", "e5", "Nf3", "Nf6", "Nxe5", "d6", "Nf3", "Nxe4"], (8500, 9500, 5500)),
    ("C41", "Philidor Defense", ["e4", "e5", "Nf3", "d6"], (9000, 6000, 5000)),
    ("C41", "Philidor Defense: Exchange", ["e4", "e5", "Nf3", "d6", "d4", "Bg4"], (3200, 1900, 1700)),
    ("C25", "Vienna Game", ["e4", "e5", "Nc3"], (8500, 6200, 6800)),
    ("C26", "Vienna Game: Falkbeer", ["e4", "e5", "Nc3", "Nf6"], (5500, 4100, 4200)),
    ("C30", "King's Gambit", ["e4", "e5", "f4"], (6200, 3800, 5400)),
    ("C23", "Bishop's Opening", ["e4", "e5", "Bc4"], (7400, 5500, 5800)),
    ("C24", "Bishop's Opening: Berlin Defense", ["e4", "e5", "Bc4", "Nf6"], (4800, 3500, 3900)),

    # Sicilian Defense (1. e4 c5)
    ("B20", "Sicilian Defense", ["e4", "c5"], (140000, 110000, 125000)),
    ("B21", "Sicilian Defense: Smith-Morra / Alapin", ["e4", "c5", "c3"], (16000, 13000, 13000)),
    ("B23", "Sicilian Defense: Closed", ["e4", "c5", "Nc3"], (19000, 14000, 16000)),
    ("B30", "Sicilian Defense: Old Sicilian", ["e4", "c5", "Nf3", "Nc6"], (38000, 30000, 32000)),
    ("B40", "Sicilian Defense: French Variation", ["e4", "c5", "Nf3", "e6"], (29000, 24000, 25000)),
    ("B50", "Sicilian Defense", ["e4", "c5", "Nf3", "d6"], (55000, 42000, 46000)),
    ("B54", "Sicilian Defense: Open", ["e4", "c5", "Nf3", "d6", "d4", "cxd4", "Nxd4"], (46000, 35000, 39000)),
    ("B90", "Sicilian Defense: Najdorf", ["e4", "c5", "Nf3", "d6", "d4", "cxd4", "Nxd4", "Nf6", "Nc3", "a6"], (24000, 19000, 21000)),
    ("B70", "Sicilian Defense: Dragon", ["e4", "c5", "Nf3", "d6", "d4", "cxd4", "Nxd4", "Nf6", "Nc3", "g6"], (11000, 8000, 9500)),
    ("B33", "Sicilian Defense: Sveshnikov", ["e4", "c5", "Nf3", "Nc6", "d4", "cxd4", "Nxd4", "Nf6", "Nc3", "e5"], (9000, 8000, 7500)),

    # French, Caro-Kann, Scandinavian, Pirc, Alekhine
    ("C00", "French Defense", ["e4", "e6"], (62000, 52000, 49000)),
    ("C01", "French Defense: Exchange", ["e4", "e6", "d4", "d5", "exd5", "exd5"], (11000, 14000, 9000)),
    ("C02", "French Defense: Advance", ["e4", "e6", "d4", "d5", "e5"], (16000, 13000, 13000)),
    ("C03", "French Defense: Tarrasch", ["e4", "e6", "d4", "d5", "Nd2"], (14000, 12000, 10000)),
    ("C10", "French Defense: Classical / Rubinstein", ["e4", "e6", "d4", "d5", "Nc3"], (19000, 15000, 15000)),
    ("C15", "French Defense: Winawer", ["e4", "e6", "d4", "d5", "Nc3", "Bb4"], (9500, 7500, 8200)),
    ("B10", "Caro-Kann Defense", ["e4", "c6"], (48000, 42000, 38000)),
    ("B12", "Caro-Kann Defense: Advance", ["e4", "c6", "d4", "d5", "e5"], (15000, 12000, 12000)),
    ("B13", "Caro-Kann Defense: Exchange", ["e4", "c6", "d4", "d5", "exd5", "cxd5"], (11000, 11000, 9000)),
    ("B18", "Caro-Kann Defense: Classical", ["e4", "c6", "d4", "d5", "Nc3", "dxe4", "Nxe4", "Bf5"], (9500, 8200, 7100)),
    ("B01", "Scandinavian Defense", ["e4", "d5"], (22000, 15000, 18000)),
    ("B01", "Scandinavian Defense: Mieses-Kotrc", ["e4", "d5", "exd5", "Qxd5", "Nc3", "Qa5"], (9000, 6200, 7100)),
    ("B07", "Pirc Defense", ["e4", "d6", "d4", "Nf6", "Nc3", "g6"], (13000, 9500, 10500)),
    ("B02", "Alekhine's Defense", ["e4", "Nf6"], (9500, 7000, 8000)),

    # Queen's Pawn (1. d4)
    ("A40", "Queen's Pawn Game", ["d4"], (290000, 260000, 230000)),
    ("D00", "Queen's Pawn Game", ["d4", "d5"], (120000, 110000, 92000)),
    ("D02", "London System", ["d4", "d5", "Nf3", "Nf6", "Bf4"], (18000, 14000, 13000)),
    ("D00", "London System", ["d4", "d5", "Bf4", "Nf6", "e3"], (14000, 11000, 10000)),
    ("A45", "London System", ["d4", "Nf6", "Bf4", "d5", "e3"], (12000, 9500, 8500)),
    ("A45", "Trompowsky Attack", ["d4", "Nf6", "Bg5"], (9500, 7200, 6800)),
    ("D06", "Queen's Gambit", ["d4", "d5", "c4"], (88000, 82000, 66000)),
    ("D20", "Queen's Gambit Accepted", ["d4", "d5", "c4", "dxc4"], (16000, 14000, 12000)),
    ("D10", "Slav Defense", ["d4", "d5", "c4", "c6"], (28000, 26000, 21000)),
    ("D30", "Queen's Gambit Declined", ["d4", "d5", "c4", "e6"], (42000, 41000, 31000)),
    ("D35", "Queen's Gambit Declined: Exchange", ["d4", "d5", "c4", "e6", "Nc3", "Nf6", "cxd5", "exd5"], (14000, 15000, 9500)),
    ("D43", "Semi-Slav Defense", ["d4", "d5", "c4", "c6", "Nf3", "Nf6", "Nc3", "e6"], (14000, 14000, 10500)),

    # Indian Defenses (1. d4 Nf6)
    ("A45", "Indian Defense", ["d4", "Nf6"], (140000, 125000, 110000)),
    ("E00", "Indian Defense: Catalan / Nimzo", ["d4", "Nf6", "c4", "e6"], (65000, 60000, 49000)),
    ("E20", "Nimzo-Indian Defense", ["d4", "Nf6", "c4", "e6", "Nc3", "Bb4"], (28000, 26000, 21000)),
    ("E12", "Queen's Indian Defense", ["d4", "Nf6", "c4", "e6", "Nf3", "b6"], (14000, 14000, 10000)),
    ("E01", "Catalan Opening", ["d4", "Nf6", "c4", "e6", "g3"], (16000, 15000, 11000)),
    ("E60", "King's Indian Defense", ["d4", "Nf6", "c4", "g6"], (42000, 32000, 34000)),
    ("E61", "King's Indian Defense", ["d4", "Nf6", "c4", "g6", "Nc3", "Bg7"], (34000, 26000, 28000)),
    ("D80", "Grünfeld Defense", ["d4", "Nf6", "c4", "g6", "Nc3", "d5"], (15000, 15000, 11000)),
    ("A60", "Benoni Defense", ["d4", "Nf6", "c4", "c5", "d5", "e6"], (8500, 6200, 6800)),
    ("A80", "Dutch Defense", ["d4", "f5"], (11000, 8200, 9200)),

    # Flank Openings (1. c4, 1. Nf3, 1. g3, 1. b3, 1. f4)
    ("A10", "English Opening", ["c4"], (68000, 58000, 52000)),
    ("A20", "English Opening: Reversed Sicilian", ["c4", "e5"], (22000, 18000, 17000)),
    ("A15", "English Opening: Anglo-Indian", ["c4", "Nf6"], (24000, 21000, 18000)),
    ("A04", "Réti Opening", ["Nf3"], (56000, 48000, 42000)),
    ("A06", "Réti Opening", ["Nf3", "d5"], (22000, 19000, 16000)),
    ("A00", "King's Fianchetto Opening", ["g3"], (12000, 9500, 9500)),
    ("A01", "Nimzo-Larsen Attack", ["b3"], (8500, 6400, 7200)),
    ("A02", "Bird's Opening", ["f4"], (6500, 4800, 5900)),
]


def _build_book() -> dict[str, dict[str, Any]]:
    """Build an EPD-keyed opening tree with opening metadata and child continuations."""
    book: dict[str, dict[str, Any]] = {}

    def ensure_node(epd: str) -> dict[str, Any]:
        if epd not in book:
            book[epd] = {
                "eco": "",
                "name": "",
                "white": 0,
                "draws": 0,
                "black": 0,
                "children": {},  # uci -> { san, uci, white, draws, black }
            }
        return book[epd]

    start_epd = chess.Board().epd()
    ensure_node(start_epd)

    for eco, name, san_list, (w, d, b) in _ECO_LINES:
        board = chess.Board()
        prev_epd = board.epd()

        for idx, san in enumerate(san_list):
            move = board.parse_san(san)
            uci = move.uci()
            canonical_san = board.san(move)

            parent_node = ensure_node(prev_epd)
            if uci not in parent_node["children"]:
                parent_node["children"][uci] = {
                    "san": canonical_san,
                    "uci": uci,
                    "white": w,
                    "draws": d,
                    "black": b,
                }
            else:
                # Accumulate stats for shared trunk moves
                child = parent_node["children"][uci]
                child["white"] = max(child["white"], w)
                child["draws"] = max(child["draws"], d)
                child["black"] = max(child["black"], b)

            board.push(move)
            cur_epd = board.epd()
            cur_node = ensure_node(cur_epd)
            cur_node["white"] = max(cur_node["white"], w)
            cur_node["draws"] = max(cur_node["draws"], d)
            cur_node["black"] = max(cur_node["black"], b)

            # Set the deepest/most specific ECO & name for the end of this line
            if idx == len(san_list) - 1 or not cur_node["name"]:
                cur_node["eco"] = eco
                cur_node["name"] = name

            prev_epd = cur_epd

    # Populate root node totals from its direct children
    root = book[start_epd]
    root["eco"] = ""
    root["name"] = "Starting Position"
    for ch in root["children"].values():
        root["white"] += ch["white"]
        root["draws"] += ch["draws"]
        root["black"] += ch["black"]

    return book


_BOOK = _build_book()


def lookup_opening(fen: str) -> Optional[dict[str, Any]]:
    """
    Look up a FEN in the local ECO opening book.
    Returns a Lichess-Explorer-compatible dict or None if out of book.
    """
    try:
        epd = chess.Board(fen).epd()
    except ValueError:
        return None

    node = _BOOK.get(epd)
    if not node:
        return None

    moves = sorted(
        node["children"].values(),
        key=lambda m: m["white"] + m["draws"] + m["black"],
        reverse=True,
    )
    opening_obj = {"eco": node["eco"], "name": node["name"]} if node["name"] else None
    return {
        "white": node["white"],
        "draws": node["draws"],
        "black": node["black"],
        "moves": moves,
        "opening": opening_obj,
        "source": "local-eco",
    }


def is_book_position(fen: str) -> bool:
    """Return True if the given FEN exists in the built-in ECO opening book."""
    try:
        epd = chess.Board(fen).epd()
    except ValueError:
        return False
    return epd in _BOOK
