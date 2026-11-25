"""
Layer 2: Feature layer.

Turns a chess position (FEN) and optional Layer 1 engine output into structured,
verified chess themes (material balance, king safety, pawn structure, piece
activity, tactical threats, and initiative) so the explainer layer never has
to guess facts from raw FENs.
"""

import json
from typing import Any, Optional

import chess

from src.engine import _score_to_cp

PIECE_VALUES: dict[chess.PieceType, int] = {
    chess.PAWN: 1,
    chess.KNIGHT: 3,
    chess.BISHOP: 3,
    chess.ROOK: 5,
    chess.QUEEN: 9,
}

CENTER_SQUARES = (chess.D4, chess.D5, chess.E4, chess.E5)

STARTING_MINORS: dict[chess.Color, tuple[chess.Square, ...]] = {
    chess.WHITE: (chess.B1, chess.C1, chess.F1, chess.G1),
    chess.BLACK: (chess.B8, chess.C8, chess.F8, chess.G8),
}


def _color_name(color: chess.Color) -> str:
    return "white" if color == chess.WHITE else "black"


def get_material_balance(board: chess.Board) -> dict[str, Any]:
    """Count non-king pieces for both sides and return net material balance."""
    summary: dict[str, Any] = {}
    for color in (chess.WHITE, chess.BLACK):
        counts = {
            chess.piece_name(pt): len(board.pieces(pt, color))
            for pt in PIECE_VALUES
        }
        total = sum(
            len(board.pieces(pt, color)) * value
            for pt, value in PIECE_VALUES.items()
        )
        summary[_color_name(color)] = {"counts": counts, "total": total}

    summary["advantage"] = summary["white"]["total"] - summary["black"]["total"]
    return summary


def _king_safety_for_color(board: chess.Board, color: chess.Color) -> dict[str, Any]:
    """Compute king safety metrics for one side."""
    king_sq = board.king(color)
    opponent = not color
    in_check = (board.turn == color) and board.is_check()

    if king_sq is None:
        return {
            "square": None,
            "in_check": False,
            "castling_kingside": False,
            "castling_queenside": False,
            "pawn_shield_count": 0,
            "enemy_attackers_on_ring": 0,
        }

    # Count friendly pawns directly in front of the king (the "pawn shield").
    king_file = chess.square_file(king_sq)
    king_rank = chess.square_rank(king_sq)
    forward_rank = king_rank + 1 if color == chess.WHITE else king_rank - 1

    pawn_shield_count = 0
    if 0 <= forward_rank <= 7:
        for df in (-1, 0, 1):
            f = king_file + df
            if 0 <= f <= 7:
                sq = chess.square(f, forward_rank)
                piece = board.piece_at(sq)
                if piece and piece.color == color and piece.piece_type == chess.PAWN:
                    pawn_shield_count += 1

    # Count unique enemy pieces attacking the king's square or its 8 neighbors.
    ring_squares = [king_sq] + list(chess.SquareSet(chess.BB_KING_ATTACKS[king_sq]))
    attacking_squares: set[chess.Square] = set()
    for sq in ring_squares:
        attacking_squares.update(board.attackers(opponent, sq))

    return {
        "square": chess.square_name(king_sq),
        "in_check": in_check,
        "castling_kingside": board.has_kingside_castling_rights(color),
        "castling_queenside": board.has_queenside_castling_rights(color),
        "pawn_shield_count": pawn_shield_count,
        "enemy_attackers_on_ring": len(attacking_squares),
    }


def get_king_safety(board: chess.Board) -> dict[str, Any]:
    """Return king safety metrics for both White and Black."""
    return {
        _color_name(color): _king_safety_for_color(board, color)
        for color in (chess.WHITE, chess.BLACK)
    }


def _pawn_structure_for_color(board: chess.Board, color: chess.Color) -> dict[str, Any]:
    """Identify doubled, isolated, and passed pawns for one side."""
    friendly_pawns = board.pieces(chess.PAWN, color)
    enemy_pawns = board.pieces(chess.PAWN, not color)

    pawns_by_file: dict[int, list[chess.Square]] = {f: [] for f in range(8)}
    for sq in friendly_pawns:
        pawns_by_file[chess.square_file(sq)].append(sq)

    doubled_files = [
        chess.FILE_NAMES[f] for f, sqs in pawns_by_file.items() if len(sqs) >= 2
    ]

    isolated_pawns: list[str] = []
    passed_pawns: list[str] = []

    for sq in sorted(friendly_pawns):
        f = chess.square_file(sq)
        r = chess.square_rank(sq)

        # Isolated if no friendly pawns exist on adjacent files.
        has_neighbor = any(
            pawns_by_file[adj] for adj in (f - 1, f + 1) if 0 <= adj <= 7
        )
        if not has_neighbor:
            isolated_pawns.append(chess.square_name(sq))

        # Passed if no enemy pawns block or guard the path ahead on adjacent/same files.
        is_passed = True
        for enemy_sq in enemy_pawns:
            ef = chess.square_file(enemy_sq)
            er = chess.square_rank(enemy_sq)
            if abs(ef - f) <= 1:
                if (color == chess.WHITE and er > r) or (color == chess.BLACK and er < r):
                    is_passed = False
                    break
        if is_passed:
            passed_pawns.append(chess.square_name(sq))

    return {
        "doubled_files": doubled_files,
        "isolated_pawns": isolated_pawns,
        "passed_pawns": passed_pawns,
    }


def get_pawn_structure(board: chess.Board) -> dict[str, Any]:
    """Return pawn structure features for both sides."""
    return {
        _color_name(color): _pawn_structure_for_color(board, color)
        for color in (chess.WHITE, chess.BLACK)
    }


def get_piece_activity(board: chess.Board) -> dict[str, Any]:
    """Measure legal move mobility, center control, and undeveloped minor pieces."""
    center_control = {
        _color_name(color): sum(
            1 for sq in CENTER_SQUARES if board.is_attacked_by(color, sq)
        )
        for color in (chess.WHITE, chess.BLACK)
    }

    result: dict[str, Any] = {
        "side_to_move_mobility": board.legal_moves.count(),
        "center_control": center_control,
    }

    for color in (chess.WHITE, chess.BLACK):
        undeveloped = 0
        for sq in STARTING_MINORS[color]:
            piece = board.piece_at(sq)
            if piece and piece.color == color and piece.piece_type in (chess.KNIGHT, chess.BISHOP):
                undeveloped += 1
        result[_color_name(color)] = {"undeveloped_minors": undeveloped}

    return result


def _tactical_threats_for_color(board: chess.Board, color: chess.Color) -> dict[str, Any]:
    """Detect hanging pieces, lower-value threats, and pinned pieces for one side."""
    opponent = not color
    hanging_pieces: list[dict[str, str]] = []
    attacked_by_lesser: list[dict[str, str]] = []
    pinned_pieces: list[dict[str, str]] = []

    for pt, value in PIECE_VALUES.items():
        for sq in sorted(board.pieces(pt, color)):
            sq_name = chess.square_name(sq)
            piece_name = chess.piece_name(pt)
            attackers = board.attackers(opponent, sq)
            defenders = board.attackers(color, sq)

            if attackers and not defenders:
                hanging_pieces.append({"square": sq_name, "piece": piece_name})

            # Check if attacked by a strictly less valuable enemy piece (e.g. pawn vs queen).
            for att_sq in attackers:
                att_piece = board.piece_at(att_sq)
                if att_piece and att_piece.piece_type != chess.KING:
                    if PIECE_VALUES[att_piece.piece_type] < value:
                        attacked_by_lesser.append(
                            {
                                "square": sq_name,
                                "piece": piece_name,
                                "attacker_square": chess.square_name(att_sq),
                                "attacker_piece": chess.piece_name(att_piece.piece_type),
                            }
                        )
                        break

            if board.is_pinned(color, sq):
                pinned_pieces.append({"square": sq_name, "piece": piece_name})

    return {
        "hanging_pieces": hanging_pieces,
        "attacked_by_lesser": attacked_by_lesser,
        "pinned_pieces": pinned_pieces,
    }


def get_tactical_threats(board: chess.Board) -> dict[str, Any]:
    """Return verified tactical threats (hanging, attacked by lesser, pinned) per side."""
    return {
        _color_name(color): _tactical_threats_for_color(board, color)
        for color in (chess.WHITE, chess.BLACK)
    }


def get_initiative(
    board: chess.Board,
    engine_data: Optional[dict[str, Any]] = None,
) -> dict[str, Any]:
    """
    Summarize turn/check state and (if engine data is provided) whether the top
    move stands far above the second-best move (a sharp/critical moment).
    """
    top_move_gap_cp: Optional[int] = None
    is_critical = False

    if engine_data and len(engine_data.get("top_lines", [])) >= 2:
        lines = engine_data["top_lines"]
        cp_1 = _score_to_cp(lines[0]["score"], board.turn)
        cp_2 = _score_to_cp(lines[1]["score"], board.turn)
        top_move_gap_cp = abs(cp_1 - cp_2)
        is_critical = top_move_gap_cp >= 100

    return {
        "turn": _color_name(board.turn),
        "in_check": board.is_check(),
        "top_move_gap_cp": top_move_gap_cp,
        "is_critical_moment": is_critical,
    }


def extract_features(
    fen: str,
    engine_data: Optional[dict[str, Any]] = None,
) -> dict[str, Any]:
    """
    Validate a FEN and extract all structured Layer 2 chess themes into a plain dict.
    """
    board = chess.Board(fen)
    if not board.is_valid():
        raise ValueError(f"Invalid chess position (illegal board state): '{fen}'")

    return {
        "fen": fen,
        "material_balance": get_material_balance(board),
        "king_safety": get_king_safety(board),
        "pawn_structure": get_pawn_structure(board),
        "piece_activity": get_piece_activity(board),
        "tactical_threats": get_tactical_threats(board),
        "initiative": get_initiative(board, engine_data=engine_data),
    }


if __name__ == "__main__":
    sample_fen = "4k3/8/8/4n3/8/8/4Q3/4K3 w - - 0 1"
    print(json.dumps(extract_features(sample_fen), indent=2))
