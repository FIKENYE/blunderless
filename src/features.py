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

# Used for relative value comparisons in skewers & discovered attacks
_TACTICAL_VALUES: dict[chess.PieceType, int] = {
    **PIECE_VALUES,
    chess.KING: 100,
}

CENTER_SQUARES = (chess.D4, chess.D5, chess.E4, chess.E5)

STARTING_MINORS: dict[chess.Color, tuple[chess.Square, ...]] = {
    chess.WHITE: (chess.B1, chess.C1, chess.F1, chess.G1),
    chess.BLACK: (chess.B8, chess.C8, chess.F8, chess.G8),
}

_ROOK_DIRS = ((1, 0), (-1, 0), (0, 1), (0, -1))
_BISHOP_DIRS = ((1, 1), (1, -1), (-1, 1), (-1, -1))


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


def _is_back_rank_weak(board: chess.Board, color: chess.Color, king_sq: chess.Square) -> bool:
    """
    Detect classic back-rank mate vulnerability:
    - King sits on its own back rank (1st for White, 8th for Black)
    - Opponent still has at least one rook or queen
    - Every adjacent square on the 2nd/7th rank is either blocked by a friendly piece
      (typically the unmoved pawn shield) or attacked by the opponent, leaving no 'luft'.
    """
    back_rank = 0 if color == chess.WHITE else 7
    escape_rank = 1 if color == chess.WHITE else 6
    if chess.square_rank(king_sq) != back_rank:
        return False

    opponent = not color
    has_heavy = bool(board.pieces(chess.ROOK, opponent) or board.pieces(chess.QUEEN, opponent))
    if not has_heavy:
        return False

    king_file = chess.square_file(king_sq)
    blocked_or_attacked = 0
    checked_squares = 0
    friendly_pawn_blockers = 0

    for df in (-1, 0, 1):
        f = king_file + df
        if 0 <= f <= 7:
            checked_squares += 1
            sq = chess.square(f, escape_rank)
            occ = board.piece_at(sq)
            if occ and occ.color == color:
                blocked_or_attacked += 1
                if occ.piece_type == chess.PAWN:
                    friendly_pawn_blockers += 1
            elif board.is_attacked_by(opponent, sq):
                blocked_or_attacked += 1

    # Require at least 2 friendly pawns trapping the king (avoids false positives on open boards)
    return checked_squares > 0 and blocked_or_attacked == checked_squares and friendly_pawn_blockers >= 2


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
            "back_rank_weak": False,
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
        "back_rank_weak": _is_back_rank_weak(board, color, king_sq),
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
    """
    Measure legal move mobility, center control, undeveloped minor pieces,
    and rook placement (open files, semi-open files, and 7th/2nd rank).
    """
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

    pawns_by_color_file: dict[chess.Color, set[int]] = {
        chess.WHITE: {chess.square_file(sq) for sq in board.pieces(chess.PAWN, chess.WHITE)},
        chess.BLACK: {chess.square_file(sq) for sq in board.pieces(chess.PAWN, chess.BLACK)},
    }

    for color in (chess.WHITE, chess.BLACK):
        undeveloped = 0
        for sq in STARTING_MINORS[color]:
            piece = board.piece_at(sq)
            if piece and piece.color == color and piece.piece_type in (chess.KNIGHT, chess.BISHOP):
                undeveloped += 1

        opp = not color
        seventh_rank = 6 if color == chess.WHITE else 1
        rooks_open: list[str] = []
        rooks_semi_open: list[str] = []
        rooks_seventh: list[str] = []

        for rsq in sorted(board.pieces(chess.ROOK, color)):
            f = chess.square_file(rsq)
            r = chess.square_rank(rsq)
            sq_name = chess.square_name(rsq)
            has_own_pawn = f in pawns_by_color_file[color]
            has_opp_pawn = f in pawns_by_color_file[opp]

            if not has_own_pawn and not has_opp_pawn:
                rooks_open.append(sq_name)
            elif not has_own_pawn and has_opp_pawn:
                rooks_semi_open.append(sq_name)
            if r == seventh_rank:
                rooks_seventh.append(sq_name)

        result[_color_name(color)] = {
            "undeveloped_minors": undeveloped,
            "rooks_on_open_files": rooks_open,
            "rooks_on_semi_open_files": rooks_semi_open,
            "rooks_on_seventh": rooks_seventh,
        }

    return result


def _slider_directions(piece_type: chess.PieceType) -> tuple[tuple[int, int], ...]:
    if piece_type == chess.ROOK:
        return _ROOK_DIRS
    if piece_type == chess.BISHOP:
        return _BISHOP_DIRS
    if piece_type == chess.QUEEN:
        return _ROOK_DIRS + _BISHOP_DIRS
    return ()


def _ray_squares(start_sq: chess.Square, df: int, dr: int) -> list[chess.Square]:
    f = chess.square_file(start_sq) + df
    r = chess.square_rank(start_sq) + dr
    sqs: list[chess.Square] = []
    while 0 <= f <= 7 and 0 <= r <= 7:
        sqs.append(chess.square(f, r))
        f += df
        r += dr
    return sqs


def _blocker_can_vacate_ray(
    board: chess.Board,
    blocker_sq: chess.Square,
    ray_set: set[chess.Square],
    slider_sq: chess.Square,
) -> bool:
    """Check whether `blocker_sq` can step off the ray line between `slider_sq` and target."""
    line_sqs = ray_set | {slider_sq}
    blocker = board.piece_at(blocker_sq)
    if blocker is None:
        return False

    # Use exact legal moves when it is the blocker's turn; otherwise check pseudo-legal moves
    # (respecting absolute pins along a *different* ray) so latent discovered attacks are visible.
    if board.turn == blocker.color:
        for mv in board.legal_moves:
            if mv.from_square == blocker_sq and mv.to_square not in line_sqs:
                return True
        return False

    tmp = board.copy(stack=False)
    tmp.turn = blocker.color
    try:
        for mv in tmp.legal_moves:
            if mv.from_square == blocker_sq and mv.to_square not in line_sqs:
                return True
    except Exception:
        return False
    return False


def _detect_skewers_and_discovered(
    board: chess.Board,
    victim_color: chess.Color,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """
    Scan every enemy sliding piece (rook, bishop, queen) along its rays to find:
    1. Skewers against `victim_color`: high-value piece in front of another valuable piece.
    2. Discovered attacks/checks against `victim_color`: enemy blocker masking an enemy slider
       aimed at `victim_color`'s king or high-value/undefended piece.
    """
    attacker_color = not victim_color
    skewers: list[dict[str, Any]] = []
    discovered: list[dict[str, Any]] = []

    for pt in (chess.ROOK, chess.BISHOP, chess.QUEEN):
        dirs = _slider_directions(pt)
        slider_val = _TACTICAL_VALUES[pt]
        for s_sq in sorted(board.pieces(pt, attacker_color)):
            for df, dr in dirs:
                ray = _ray_squares(s_sq, df, dr)
                occ_list: list[tuple[chess.Square, chess.Piece]] = []
                for sq in ray:
                    p = board.piece_at(sq)
                    if p is not None:
                        occ_list.append((sq, p))
                        if len(occ_list) == 2:
                            break
                if len(occ_list) < 2:
                    continue

                (sq1, p1), (sq2, p2) = occ_list[0], occ_list[1]

                # 1. Skewer: both occupied pieces belong to victim_color, front piece is
                # more valuable than back piece (or King in front of any non-pawn piece).
                if p1.color == victim_color and p2.color == victim_color:
                    v1 = _TACTICAL_VALUES[p1.piece_type]
                    v2 = _TACTICAL_VALUES[p2.piece_type]
                    front_forced = (
                        p1.piece_type == chess.KING
                        or v1 > slider_val
                        or not board.is_attacked_by(victim_color, sq1)
                    )
                    back_valuable = (
                        v2 >= 5
                        or (v2 >= 3 and (not board.is_attacked_by(victim_color, sq2) or p1.piece_type == chess.KING))
                    )
                    if front_forced and back_valuable and v1 > v2:
                        skewers.append({
                            "front_square": chess.square_name(sq1),
                            "front_piece": chess.piece_name(p1.piece_type),
                            "back_square": chess.square_name(sq2),
                            "back_piece": chess.piece_name(p2.piece_type),
                            "attacker_square": chess.square_name(s_sq),
                            "attacker_piece": chess.piece_name(pt),
                        })

                # 2. Discovered attack / check: first piece is attacker's own blocker,
                # second piece is victim's king, queen, rook, or undefended minor piece.
                if p1.color == attacker_color and p2.color == victim_color:
                    target_val = _TACTICAL_VALUES[p2.piece_type]
                    is_disc_check = p2.piece_type == chess.KING
                    target_worthwhile = (
                        is_disc_check
                        or target_val >= 5
                        or (target_val >= 3 and not board.is_attacked_by(victim_color, sq2))
                    )
                    if target_worthwhile and _blocker_can_vacate_ray(board, sq1, set(ray), s_sq):
                        discovered.append({
                            "blocker_square": chess.square_name(sq1),
                            "blocker_piece": chess.piece_name(p1.piece_type),
                            "slider_square": chess.square_name(s_sq),
                            "slider_piece": chess.piece_name(pt),
                            "target_square": chess.square_name(sq2),
                            "target_piece": chess.piece_name(p2.piece_type),
                            "is_check": is_disc_check,
                        })

    return skewers, discovered


def _detect_overloaded_defenders(board: chess.Board, color: chess.Color) -> list[dict[str, Any]]:
    """
    Detect friendly pieces that are simultaneously required to defend 2 or more
    currently attacked friendly pieces (classic overloading motif).
    """
    opponent = not color
    defender_duties: dict[chess.Square, list[dict[str, str]]] = {}

    for pt in (chess.PAWN, chess.KNIGHT, chess.BISHOP, chess.ROOK, chess.QUEEN):
        for sq in sorted(board.pieces(pt, color)):
            attackers = board.attackers(opponent, sq)
            if not attackers:
                continue
            defenders = board.attackers(color, sq)
            if not defenders:
                continue
            # Defender is critical when removing one defender tips the balance in opponent's favor
            if len(defenders) <= len(attackers):
                for d_sq in defenders:
                    d_piece = board.piece_at(d_sq)
                    if d_piece and d_piece.piece_type != chess.KING:
                        defender_duties.setdefault(d_sq, []).append({
                            "square": chess.square_name(sq),
                            "piece": chess.piece_name(pt),
                        })

    overloaded: list[dict[str, Any]] = []
    for d_sq in sorted(defender_duties):
        duties = defender_duties[d_sq]
        if len(duties) >= 2:
            d_piece = board.piece_at(d_sq)
            if d_piece:
                overloaded.append({
                    "square": chess.square_name(d_sq),
                    "piece": chess.piece_name(d_piece.piece_type),
                    "defending": [d["square"] for d in duties],
                    "defending_pieces": [f"{d['piece']} on {d['square']}" for d in duties],
                })
    return overloaded


def _tactical_threats_for_color(board: chess.Board, color: chess.Color) -> dict[str, Any]:
    """
    Detect verified tactical vulnerabilities for `color`:
    hanging pieces, lower-value attacks, pins, skewers, discovered attacks, and overloaded defenders.
    """
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

    skewered_pieces, discovered_attacks = _detect_skewers_and_discovered(board, color)
    overloaded_defenders = _detect_overloaded_defenders(board, color)

    return {
        "hanging_pieces": hanging_pieces,
        "attacked_by_lesser": attacked_by_lesser,
        "pinned_pieces": pinned_pieces,
        "skewered_pieces": skewered_pieces,
        "discovered_attacks": discovered_attacks,
        "overloaded_defenders": overloaded_defenders,
    }


def get_tactical_threats(board: chess.Board) -> dict[str, Any]:
    """Return verified tactical threats per side."""
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
