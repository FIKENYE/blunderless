"""
Layer 2 + Layer 3 Post-Game Coaching Report (`src/report.py`).

Builds a structured, evidence-grounded coaching report for BOTH White and Black:
- Stage-by-stage breakdown: Opening, Middlegame, Endgame (using board material
  and development thresholds, never arbitrary move counts alone)
- Tactics score + multi-bullet breakdown grounded in Stockfish & `src/features.py`
- Strategy score + multi-bullet breakdown (castling, king safety, development,
  center control, pawn structure, positional steadiness)
- Actionable Next-Game Tips tailored to the player's actual weaknesses
- Large, varied instructive comment bank; stays calm & instructive by default
  and only switches to sarcastic Chester banter when a game is blunder-heavy.
"""

from __future__ import annotations

import hashlib
import math
from typing import Any, Optional

import chess

from src.features import (
    get_king_safety,
    get_pawn_structure,
    get_piece_activity,
    get_tactical_threats,
)

NON_PAWN_VALUES = {
    chess.KNIGHT: 3,
    chess.BISHOP: 3,
    chess.ROOK: 5,
    chess.QUEEN: 9,
}


def _stable_pick(options: list[str], seed_key: str) -> str:
    """Deterministically pick a varied template based on the game & section key."""
    if not options:
        return ""
    digest = hashlib.sha256(seed_key.encode("utf-8")).digest()
    idx = int.from_bytes(digest[:4], "big") % len(options)
    return options[idx]


def _format_eval_str(score: Optional[dict[str, Any]]) -> str:
    if not score:
        return "0.00"
    if score.get("type") == "mate":
        val = int(score["value"])
        if val == 0:
            return "#"
        return f"{'+' if val > 0 else '-'}M{abs(val)}"
    val = int(score.get("value", 0)) / 100.0
    return f"{'+' if val >= 0 else ''}{val:.2f}"


def _non_pawn_material(board: chess.Board, color: chess.Color) -> int:
    return sum(len(board.pieces(pt, color)) * val for pt, val in NON_PAWN_VALUES.items())


def _move_accuracy(epl: float) -> float:
    """Authentic Lichess single-move accuracy curve (0..100, no multipliers)."""
    win_loss = max(0.0, float(epl)) * 100.0
    return max(0.0, min(100.0, 103.1668 * math.exp(-0.04354 * win_loss) - 3.1669))


def _grade_from_accuracy(acc: Optional[float]) -> dict[str, str]:
    if acc is None:
        return {"label": "Not Reached", "cls": "na"}
    if acc >= 88.0:
        return {"label": "Strong", "cls": "strong"}
    if acc >= 76.0:
        return {"label": "Solid", "cls": "solid"}
    if acc >= 63.0:
        return {"label": "Uneven", "cls": "uneven"}
    if acc >= 50.0:
        return {"label": "Tough", "cls": "tough"}
    return {"label": "Rough", "cls": "rough"}


def detect_game_phases(
    moves_out: list[dict[str, Any]],
    boards: Optional[list[chess.Board]] = None,
) -> tuple[list[str], dict[str, Optional[tuple[int, int]]]]:
    """
    Assign each ply in `moves_out` to 'opening', 'middlegame', or 'endgame'
    based on book status, piece development, and non-pawn material thresholds.
    """
    n = len(moves_out)
    if n == 0:
        return [], {"opening": None, "middlegame": None, "endgame": None}

    parsed_boards = boards if boards is not None else [chess.Board(m["fen"]) for m in moves_out]
    phases: list[str] = []
    in_opening = True
    in_endgame = False

    for idx, m in enumerate(moves_out):
        board = parsed_boards[idx]
        w_np = _non_pawn_material(board, chess.WHITE)
        b_np = _non_pawn_material(board, chess.BLACK)
        move_num = int(m.get("move_number", (idx // 2) + 1))

        # Standard engine/Lichess endgame threshold: both sides <= 13 non-pawn material
        # (e.g., queens traded + <= 1 rook + 2 minors) OR total non-pawn <= 22.
        if not in_endgame and ((w_np <= 13 and b_np <= 13) or (w_np + b_np <= 22)):
            in_endgame = True
            in_opening = False

        if in_endgame:
            phases.append("endgame")
            continue

        if in_opening:
            # Stay in opening during book moves or first 10 moves (up to 12 if still developing)
            is_book = m.get("classification") == "book"
            if not is_book and move_num > 10:
                in_opening = False
            elif not is_book and move_num >= 8:
                # End opening early if both sides already developed most minor pieces and castled/moved kings
                w_dev = sum(
                    1
                    for sq in (chess.B1, chess.C1, chess.F1, chess.G1)
                    if (p := board.piece_at(sq)) and p.color == chess.WHITE and p.piece_type in (chess.KNIGHT, chess.BISHOP)
                )
                b_dev = sum(
                    1
                    for sq in (chess.B8, chess.C8, chess.F8, chess.G8)
                    if (p := board.piece_at(sq)) and p.color == chess.BLACK and p.piece_type in (chess.KNIGHT, chess.BISHOP)
                )
                if w_dev <= 1 and b_dev <= 1 and board.king(chess.WHITE) != chess.E1 and board.king(chess.BLACK) != chess.E8:
                    in_opening = False

        phases.append("opening" if in_opening else "middlegame")

    ranges: dict[str, Optional[tuple[int, int]]] = {
        "opening": None,
        "middlegame": None,
        "endgame": None,
    }
    for stage in ("opening", "middlegame", "endgame"):
        stage_moves = [int(moves_out[i].get("move_number", (i // 2) + 1)) for i, p in enumerate(phases) if p == stage]
        if stage_moves:
            ranges[stage] = (min(stage_moves), max(stage_moves))

    return phases, ranges


def _score_stage_moves(stage_moves: list[dict[str, Any]]) -> dict[str, Any]:
    """Compute stage accuracy, ACPL, classification counts, and most impactful move."""
    if not stage_moves:
        return {
            "reached": False,
            "move_count": 0,
            "accuracy": None,
            "acpl": None,
            "grade": _grade_from_accuracy(None),
            "counts": {},
            "key_moment": None,
            "highlight_move": None,
        }

    accs = [_move_accuracy(float(m.get("epl", 0.0))) for m in stage_moves]
    arith = sum(accs) / len(accs)
    harm = len(accs) / sum(1.0 / max(1.0, a) for a in accs)
    accuracy = round((arith + harm) / 2.0, 1)

    cpls = [min(1000, max(0, -int(m.get("eval_change", 0)))) for m in stage_moves]
    acpl = int(round(sum(cpls) / len(cpls)))

    counts: dict[str, int] = {
        "brilliant": 0,
        "great": 0,
        "best": 0,
        "excellent": 0,
        "good": 0,
        "book": 0,
        "inaccuracy": 0,
        "mistake": 0,
        "miss": 0,
        "blunder": 0,
    }
    for m in stage_moves:
        clf = (m.get("classification") or "good").lower()
        if clf in counts:
            counts[clf] += 1

    # Biggest slip in this stage (by EPL)
    worst = max(stage_moves, key=lambda m: float(m.get("epl", 0.0)))
    key_moment = None
    if float(worst.get("epl", 0.0)) >= 0.06 or worst.get("classification") in ("inaccuracy", "mistake", "miss", "blunder"):
        key_moment = {
            "ply": worst["ply"],
            "move_number": worst["move_number"],
            "san": worst["san"],
            "best_move_san": worst.get("best_move_san"),
            "classification": worst.get("classification"),
            "eval_after": _format_eval_str(worst.get("eval_after")),
            "eval_change_pawns": round(int(worst.get("eval_change", 0)) / 100.0, 2),
            "epl": float(worst.get("epl", 0.0)),
            "is_positive": False,
        }

    # Best highlight in this stage (brilliant > great > best)
    highlight_candidates = [m for m in stage_moves if m.get("classification") in ("brilliant", "great", "best")]
    highlight_move = None
    if highlight_candidates:
        priority = {"brilliant": 3, "great": 2, "best": 1}
        best_hi = max(
            highlight_candidates,
            key=lambda m: (priority.get(m.get("classification", ""), 0), int(m.get("ply", 0))),
        )
        highlight_move = {
            "ply": best_hi["ply"],
            "move_number": best_hi["move_number"],
            "san": best_hi["san"],
            "best_move_san": best_hi.get("best_move_san"),
            "classification": best_hi.get("classification"),
            "eval_after": _format_eval_str(best_hi.get("eval_after")),
            "eval_change_pawns": round(int(best_hi.get("eval_change", 0)) / 100.0, 2),
            "epl": float(best_hi.get("epl", 0.0)),
            "is_positive": True,
        }

    if key_moment is None and highlight_move is not None:
        key_moment = highlight_move

    return {
        "reached": True,
        "move_count": len(stage_moves),
        "accuracy": accuracy,
        "acpl": acpl,
        "grade": _grade_from_accuracy(accuracy),
        "counts": counts,
        "key_moment": key_moment,
        "highlight_move": highlight_move,
    }


def _scan_player_features(
    moves_out: list[dict[str, Any]],
    phases: list[str],
    color: str,
    boards: Optional[list[chess.Board]] = None,
) -> dict[str, Any]:
    """
    Scan verified Layer 2 features (`src/features.py`) across the player's moves
    to power strictly factual Tactics & Strategy assessments (reusing pre-parsed boards).
    """
    castled_move: Optional[int] = None
    castled_side: Optional[str] = None
    opening_center_samples: list[int] = []
    opening_end_undeveloped: Optional[int] = None
    opening_end_king_sq: Optional[str] = None

    min_pawn_shield_with_queens: Optional[int] = None
    max_king_attackers = 0
    king_pressure_move: Optional[dict[str, Any]] = None

    max_doubled = 0
    max_isolated = 0
    passed_pawn_events: list[dict[str, Any]] = []
    hanging_oversights: list[dict[str, Any]] = []
    lesser_attack_oversights: list[dict[str, Any]] = []

    chess_color = chess.WHITE if color == "white" else chess.BLACK
    home_king_sq = "e1" if color == "white" else "e8"

    for idx, m in enumerate(moves_out):
        if m.get("color") != color:
            continue

        phase = phases[idx]
        san = m.get("san", "")
        move_num = int(m.get("move_number", (idx // 2) + 1))

        if san.startswith("O-O-O") and castled_move is None:
            castled_move = move_num
            castled_side = "queenside"
        elif san.startswith("O-O") and castled_move is None:
            castled_move = move_num
            castled_side = "kingside"

        board = boards[idx] if boards is not None else chess.Board(m["fen"])
        has_enemy_queen = len(board.pieces(chess.QUEEN, not chess_color)) > 0

        ks = get_king_safety(board)[color]

        if phase == "opening":
            act = get_piece_activity(board)
            opening_center_samples.append(int(act["center_control"][color]))
            opening_end_undeveloped = int(act[color]["undeveloped_minors"])
            opening_end_king_sq = ks["square"]

        if has_enemy_queen and move_num >= 6:
            shield = int(ks["pawn_shield_count"])
            if min_pawn_shield_with_queens is None or shield < min_pawn_shield_with_queens:
                min_pawn_shield_with_queens = shield

        attackers = int(ks["enemy_attackers_on_ring"])
        if attackers > max_king_attackers and move_num >= 6:
            max_king_attackers = attackers
            king_pressure_move = {
                "ply": m["ply"],
                "move_number": move_num,
                "san": san,
                "attackers": attackers,
                "eval_after": _format_eval_str(m.get("eval_after")),
            }

        if phase in ("middlegame", "endgame"):
            ps = get_pawn_structure(board)[color]
            max_doubled = max(max_doubled, len(ps["doubled_files"]))
            max_isolated = max(max_isolated, len(ps["isolated_pawns"]))
            if ps["passed_pawns"] and not passed_pawn_events:
                passed_pawn_events.append({
                    "ply": m["ply"],
                    "move_number": move_num,
                    "san": san,
                    "squares": ps["passed_pawns"][:2],
                })

        # Only compute tactical threat scan on moves with confirmed eval loss (epl >= 0.08)
        epl = float(m.get("epl", 0.0))
        if epl >= 0.08:
            threats = get_tactical_threats(board)[color]
            non_pawn_hanging = [h for h in threats["hanging_pieces"] if h["piece"] != "pawn"]
            if non_pawn_hanging:
                item = non_pawn_hanging[0]
                hanging_oversights.append({
                    "ply": m["ply"],
                    "move_number": move_num,
                    "san": san,
                    "piece": item["piece"],
                    "square": item["square"],
                    "best_move_san": m.get("best_move_san"),
                    "eval_after": _format_eval_str(m.get("eval_after")),
                    "epl": epl,
                })
            elif threats["attacked_by_lesser"]:
                item = threats["attacked_by_lesser"][0]
                lesser_attack_oversights.append({
                    "ply": m["ply"],
                    "move_number": move_num,
                    "san": san,
                    "piece": item["piece"],
                    "square": item["square"],
                    "attacker_piece": item["attacker_piece"],
                    "best_move_san": m.get("best_move_san"),
                    "eval_after": _format_eval_str(m.get("eval_after")),
                    "epl": epl,
                })

    avg_opening_center = (
        round(sum(opening_center_samples) / len(opening_center_samples), 1)
        if opening_center_samples
        else None
    )

    return {
        "castled_move": castled_move,
        "castled_side": castled_side,
        "stuck_in_center_after_opening": (
            castled_move is None and opening_end_king_sq == home_king_sq and len(moves_out) >= 20
        ),
        "avg_opening_center": avg_opening_center,
        "opening_end_undeveloped": opening_end_undeveloped,
        "min_pawn_shield_with_queens": min_pawn_shield_with_queens,
        "max_king_attackers": max_king_attackers,
        "king_pressure_move": king_pressure_move,
        "max_doubled": max_doubled,
        "max_isolated": max_isolated,
        "passed_pawn_events": passed_pawn_events,
        "hanging_oversights": hanging_oversights,
        "lesser_attack_oversights": lesser_attack_oversights,
    }


def _determine_tone(player_blunders: int, player_misses: int, total_game_blunders: int) -> str:
    """
    Stay calm and instructive by default; only turn sarcastic when the game is
    genuinely full of blunders (4+ severe errors by this player or 6+ total chaos).
    """
    severe = player_blunders + player_misses
    if severe >= 4 or total_game_blunders >= 6:
        return "sarcastic"
    if severe == 3:
        return "candid"
    return "instructive"


# ── Rich, Varied Coaching Commentary Builders ────────────────────────────────

def _build_opening_comment(
    stats: dict[str, Any],
    feats: dict[str, Any],
    tone: str,
    opening_name: str,
    seed: str,
) -> list[str]:
    if not stats["reached"]:
        return ["No opening moves were recorded for this side."]

    acc = stats["accuracy"]
    grade = stats["grade"]["cls"]
    book_cnt = stats["counts"].get("book", 0)
    undev = feats["opening_end_undeveloped"]
    castled = feats["castled_move"]
    center = feats["avg_opening_center"]
    km = stats["key_moment"]
    op_label = f" ({opening_name})" if opening_name and opening_name != "Starting Position" else ""

    lines: list[str] = []

    if grade in ("strong", "solid"):
        if tone == "sarcastic":
            lines.append(_stable_pick([
                f"Surprisingly clean opening{op_label} ({acc}% accuracy)! You actually kept your pieces together before the chaos started.",
                f"Credit where it's due—your opening{op_label} scored {acc}%. If only the rest of the game stayed this calm.",
                f"Solid {acc}% opening{op_label}. You built a real position before the wheels started wobbling later.",
            ], f"{seed}:op:good:s"))
        else:
            lines.append(_stable_pick([
                f"Very steady opening{op_label} at {acc}% accuracy. You kept control of the early moves and avoided premature trouble.",
                f"You handled the opening{op_label} well ({acc}% accuracy), giving yourself a healthy, playable middlegame.",
                f"Strong foundation in the opening{op_label} ({acc}% accuracy). Your early decisions kept the position balanced and active.",
                f"Nice, disciplined start{op_label} ({acc}% accuracy)—you stayed calm and didn't give away free material early.",
                f"Clean opening phase{op_label} ({acc}% accuracy). Starting games this smoothly makes every middlegame much easier to play.",
            ], f"{seed}:op:good:i"))
    elif grade == "uneven":
        if tone == "sarcastic":
            lines.append(_stable_pick([
                f"A bumpy {acc}% opening{op_label}—a few nice ideas mixed with some early gifts.",
                f"Your opening{op_label} landed at {acc}%. Not a total disaster yet, just a little shaky out of the gate.",
            ], f"{seed}:op:mid:s"))
        else:
            lines.append(_stable_pick([
                f"Mixed opening{op_label} ({acc}% accuracy). You had the right general idea, though a couple of early slips cost momentum.",
                f"Your opening{op_label} came in at {acc}% accuracy—playable overall, with one or two early moves worth reviewing.",
                f"An uneven start{op_label} ({acc}% accuracy). Tightening up just one early move will give you a much smoother middlegame.",
                f"Fair opening{op_label} ({acc}% accuracy), though small inaccuracies let your opponent gain comfortable space early.",
            ], f"{seed}:op:mid:i"))
    else:
        if tone == "sarcastic":
            lines.append(_stable_pick([
                f"Rough opening{op_label} at {acc}% accuracy—we left opening principles at the door on this one.",
                f"Oof, {acc}% in the opening{op_label}. That early turbulence put you uphill before move 12.",
                f"A wild {acc}% opening{op_label}. Let's get the knights out and the king tucked away before launching fireworks!",
            ], f"{seed}:op:bad:s"))
        else:
            lines.append(_stable_pick([
                f"The opening{op_label} was challenging ({acc}% accuracy), putting you on the back foot early.",
                f"Tough start{op_label} ({acc}% accuracy). Focusing on simple piece development and king safety will immediately pay off here.",
                f"Early slips made this opening{op_label} difficult ({acc}% accuracy), leaving you defending into the middlegame.",
                f"This opening{op_label} got tricky fast ({acc}% accuracy). Slowing down on moves 4–10 to check threats will steady your starts.",
            ], f"{seed}:op:bad:i"))

    # Feature-grounded opening observations (development, castling, center, book)
    if book_cnt >= 3:
        lines.append(f"You followed {book_cnt} recognized book moves cleanly before stepping into original territory.")
    if undev is not None:
        if undev == 0:
            lines.append("All four minor pieces (knights and bishops) left their starting squares by the end of the opening—great development habit.")
        elif undev == 1:
            lines.append("You developed 3 of 4 minor pieces during the opening; finishing that last piece early helps connect your rooks.")
        elif undev >= 2:
            lines.append(f"{undev} minor pieces were still sitting on their starting squares as the opening ended—prioritizing knights and bishops before side attacks gives you far more firepower.")

    if castled is not None and castled <= 10:
        lines.append(f"You castled {feats['castled_side']} on move {castled}, securing your king right on schedule.")
    elif feats["stuck_in_center_after_opening"]:
        lines.append("Your king remained on its starting square past the opening; castling within the first 10 moves protects against central tactics.")

    if center is not None and center >= 2.5:
        lines.append(f"Good central presence—your pieces contested an average of {center} of the 4 central squares (d4, d5, e4, e5) during the opening.")

    if km and not km["is_positive"] and km["best_move_san"]:
        lines.append(
            f"Key opening moment: move {km['move_number']} ({km['san']}, eval {km['eval_after']}) slipped by "
            f"{abs(km['eval_change_pawns']):.2f}—{km['best_move_san']} kept a cleaner structure."
        )
    elif km and km["is_positive"]:
        lines.append(f"Opening highlight: move {km['move_number']} ({km['san']}, eval {km['eval_after']}) kept your position on track.")

    return lines


def _build_middlegame_comment(
    stats: dict[str, Any],
    feats: dict[str, Any],
    tone: str,
    seed: str,
) -> list[str]:
    if not stats["reached"]:
        return ["The game concluded before a full middlegame developed."]

    acc = stats["accuracy"]
    grade = stats["grade"]["cls"]
    blunders = stats["counts"].get("blunder", 0)
    misses = stats["counts"].get("miss", 0)
    finds = stats["counts"].get("brilliant", 0) + stats["counts"].get("great", 0)
    km = stats["key_moment"]

    lines: list[str] = []

    if grade in ("strong", "solid"):
        if tone == "sarcastic":
            lines.append(_stable_pick([
                f"Wait—you actually played a crisp {acc}% middlegame?! Clean piece coordination when it mattered most.",
                f"Respectable {acc}% middlegame despite the wild moments elsewhere. You kept finding practical moves.",
            ], f"{seed}:mg:good:s"))
        else:
            lines.append(_stable_pick([
                f"Strong middlegame play ({acc}% accuracy)! You navigated the most complex phase of the game with good composure.",
                f"Well-managed middlegame at {acc}% accuracy. Your pieces stayed coordinated and you avoided major tactical traps.",
                f"Impressive composure in the middlegame ({acc}% accuracy)—you kept improving your position without overextending.",
                f"Solid middlegame decision-making ({acc}% accuracy). Staying patient in complicated positions is a huge strength.",
            ], f"{seed}:mg:good:i"))
    elif grade == "uneven":
        if tone == "sarcastic":
            lines.append(_stable_pick([
                f"A rollercoaster middlegame ({acc}% accuracy)—good instincts followed by a few heart-stopping moments.",
                f"Middlegame came in at {acc}%. You had real chances, then let the eval bar go bungee jumping.",
            ], f"{seed}:mg:mid:s"))
        else:
            lines.append(_stable_pick([
                f"Your middlegame was competitive ({acc}% accuracy), with solid ideas mixed with a couple of costly tactical moments.",
                f"An up-and-down middlegame ({acc}% accuracy). Most of your plans made sense, though sharp tactics decided the swings.",
                f"Respectable fight in the middlegame ({acc}% accuracy), though a few inaccuracies allowed counterplay.",
                f"The middlegame had bright spots ({acc}% accuracy), with one or two critical turns where a calmer move would have held control.",
            ], f"{seed}:mg:mid:i"))
    else:
        if tone == "sarcastic":
            lines.append(_stable_pick([
                f"The middlegame was pure cinema—and not the calm kind ({acc}% accuracy). Tactics were flying everywhere!",
                f"Oof, {acc}% in the middlegame. Once the pieces collided in the center, the eval bar went full roller coaster.",
                f"Spicy {acc}% middlegame! Multiple sharp turns slipped past—this is the exact phase where pausing 5 seconds saves 200 Elo.",
            ], f"{seed}:mg:bad:s"))
        else:
            lines.append(_stable_pick([
                f"The middlegame was the toughest stretch of the game ({acc}% accuracy), where tactical complications caused big eval swings.",
                f"A difficult middlegame ({acc}% accuracy). When pieces start trading and attacking at once, double-checking undefended pieces is key.",
                f"Most of the game's momentum shifted during this middlegame ({acc}% accuracy)—studying the key turning point below will help the most.",
                f"Challenging middlegame ({acc}% accuracy). Simplifying or defending weak squares first would have calmed the position down.",
            ], f"{seed}:mg:bad:i"))

    if finds >= 1:
        lines.append(f"Bright spot: you found {finds} standout tactical {'move' if finds == 1 else 'moves'} (Great/Brilliant) during the middlegame.")
    if blunders > 0 or misses > 0:
        parts = []
        if blunders:
            parts.append(f"{blunders} {'blunder' if blunders == 1 else 'blunders'}")
        if misses:
            parts.append(f"{misses} missed {'chance' if misses == 1 else 'chances'}")
        lines.append(f"This phase included {' and '.join(parts)}—catching even one of those flips the entire game trajectory.")

    kp = feats["king_pressure_move"]
    if kp and kp["attackers"] >= 3:
        lines.append(
            f"King pressure peaked around move {kp['move_number']} ({kp['san']}, eval {kp['eval_after']}), "
            f"with {kp['attackers']} enemy pieces aiming near your king's ring."
        )

    if km and not km["is_positive"] and km["best_move_san"]:
        lines.append(
            f"Turning point: move {km['move_number']} ({km['san']}, eval {km['eval_after']}) dropped "
            f"{abs(km['eval_change_pawns']):.2f}—Stockfish preferred {km['best_move_san']}."
        )
    elif km and km["is_positive"]:
        lines.append(f"Middlegame highlight: move {km['move_number']} ({km['san']}, eval {km['eval_after']}) kept strong control.")

    return lines


def _build_endgame_comment(
    stats: dict[str, Any],
    feats: dict[str, Any],
    tone: str,
    seed: str,
) -> list[str]:
    if not stats["reached"]:
        return [
            _stable_pick([
                "The game was decided before reaching an endgame—no endgame moves to grade here.",
                "No endgame was reached in this game, as the result was settled with plenty of pieces still on the board.",
                "Endgame not reached: the battle wrapped up in the opening or middlegame.",
            ], f"{seed}:eg:na")
        ]

    acc = stats["accuracy"]
    grade = stats["grade"]["cls"]
    km = stats["key_moment"]
    lines: list[str] = []

    if grade in ("strong", "solid"):
        lines.append(_stable_pick([
            f"Composed endgame technique ({acc}% accuracy). You stayed accurate with fewer pieces on the board and made practical decisions.",
            f"Clean endgame play at {acc}% accuracy—you kept your pieces active and avoided late-game slips.",
            f"Reliable finish in the endgame ({acc}% accuracy). Converting or holding simplified positions takes real discipline.",
            f"Steady hands in the endgame ({acc}% accuracy), guiding the final phase cleanly.",
        ], f"{seed}:eg:good"))
    elif grade == "uneven":
        lines.append(_stable_pick([
            f"Mixed endgame ({acc}% accuracy). A few imprecise moves made the finish tighter than it needed to be.",
            f"Your endgame scored {acc}% accuracy—solid overall, with one or two late moves where tighter calculation would have helped.",
            f"Competitive endgame ({acc}% accuracy), though small slips allowed extra counterplay near the finish.",
        ], f"{seed}:eg:mid"))
    else:
        if tone == "sarcastic":
            lines.append(_stable_pick([
                f"Endgame accuracy dipped to {acc}%—fatigue (or time trouble) definitely entered the chat!",
                f"A chaotic {acc}% endgame! Every single tempo matters once the queens come off.",
            ], f"{seed}:eg:bad:s"))
        else:
            lines.append(_stable_pick([
                f"The endgame was difficult ({acc}% accuracy). With fewer pieces left, king activity and guarding pawns become decisive.",
                f"Tough finish in the endgame ({acc}% accuracy)—small inaccuracies grow fast once material is low.",
                f"Endgame slips ({acc}% accuracy) decided the final stretch; activating your king and pushing passed pawns early helps hugely.",
            ], f"{seed}:eg:bad:i"))

    if feats["passed_pawn_events"]:
        ev = feats["passed_pawn_events"][0]
        sqs = ", ".join(ev["squares"])
        lines.append(f"You created a passed pawn on {sqs} by move {ev['move_number']} ({ev['san']})—always a major endgame asset.")

    if km and not km["is_positive"] and km["best_move_san"]:
        lines.append(
            f"Key endgame moment: move {km['move_number']} ({km['san']}, eval {km['eval_after']}) cost "
            f"{abs(km['eval_change_pawns']):.2f}; {km['best_move_san']} was much cleaner."
        )
    elif km and km["is_positive"]:
        lines.append(f"Endgame highlight: move {km['move_number']} ({km['san']}, eval {km['eval_after']}) showed crisp technique.")

    return lines


def _build_tactics_section(
    player_moves: list[dict[str, Any]],
    feats: dict[str, Any],
    tone: str,
    seed: str,
) -> dict[str, Any]:
    """Build strictly grounded Tactics score (0..100) and detailed coaching bullets."""
    n = max(1, len(player_moves))
    blunders = [m for m in player_moves if m.get("classification") == "blunder"]
    misses = [m for m in player_moves if m.get("classification") == "miss"]
    mistakes = [m for m in player_moves if m.get("classification") == "mistake"]
    finds = [m for m in player_moves if m.get("classification") in ("brilliant", "great")]

    hanging = feats["hanging_oversights"]
    lesser = feats["lesser_attack_oversights"]

    # Score starts from tactical cleanliness (grounded directly in blunder/miss/hanging rates)
    penalty = (
        len(blunders) * 16.0
        + len(misses) * 11.0
        + len(mistakes) * 4.5
        + len(hanging) * 6.0
        + len(lesser) * 4.0
    )
    bonus = min(14.0, len(finds) * 5.0)
    # Scale slightly for longer games so a 60-move game with 1 mistake isn't over-penalized
    length_norm = max(0.75, min(1.35, 25.0 / max(12, n)))
    score = int(round(max(10.0, min(98.0, 92.0 - penalty * length_norm + bonus))))

    bullets: list[str] = []

    if len(blunders) == 0 and len(misses) == 0:
        bullets.append(_stable_pick([
            "Zero blunders and zero missed wins! Your tactical radar stayed switched on from start to finish.",
            "Clean tactical discipline—you didn't drop a single major tactic or blunder away a winning edge.",
            "Very sharp board vision: you avoided game-losing tactical oversights throughout the match.",
        ], f"{seed}:tac:clean"))
    else:
        if blunders:
            worst_b = max(blunders, key=lambda m: float(m.get("epl", 0.0)))
            best_txt = f" ({worst_b['best_move_san']} held the position)" if worst_b.get("best_move_san") else ""
            if tone == "sarcastic":
                bullets.append(
                    f"{len(blunders)} tactical {'blunder' if len(blunders) == 1 else 'blunders'} stung hard—biggest ouch was "
                    f"move {worst_b['move_number']} ({worst_b['san']}, eval {_format_eval_str(worst_b.get('eval_after'))}){best_txt}."
                )
            else:
                bullets.append(
                    f"You had {len(blunders)} tactical {'blunder' if len(blunders) == 1 else 'blunders'}, led by "
                    f"move {worst_b['move_number']} ({worst_b['san']}, eval {_format_eval_str(worst_b.get('eval_after'))}){best_txt}."
                )
        if misses:
            top_m = max(misses, key=lambda m: float(m.get("epl", 0.0)))
            best_txt = f" with {top_m['best_move_san']}" if top_m.get("best_move_san") else ""
            bullets.append(
                f"You had {len(misses)} missed {'opportunity' if len(misses) == 1 else 'opportunities'} to punish your opponent—on "
                f"move {top_m['move_number']}, you played {top_m['san']} (eval {_format_eval_str(top_m.get('eval_after'))}) when "
                f"you could have pressed harder{best_txt}."
            )

    if hanging:
        ex = hanging[0]
        bullets.append(
            f"Piece safety check: {len(hanging)} {'move' if len(hanging) == 1 else 'moves'} left a piece undefended under attack "
            f"(e.g., move {ex['move_number']} {ex['san']} left your {ex['piece']} on {ex['square']} hanging; "
            f"{ex['best_move_san'] or 'a safer move'} kept it protected)."
        )
    elif lesser:
        ex = lesser[0]
        bullets.append(
            f"Watch for lower-value piece attacks: on move {ex['move_number']} ({ex['san']}), your {ex['piece']} on {ex['square']} "
            f"was left vulnerable to an enemy {ex['attacker_piece']}."
        )
    else:
        bullets.append("Good basic blunder-check: you didn't leave undefended pieces hanging on tactical slip moves.")

    if finds:
        hi = finds[0]
        bullets.append(
            f"Tactical highlight: you spotted {len(finds)} standout {'move' if len(finds) == 1 else 'moves'}, "
            f"such as move {hi['move_number']} ({hi['san']}, eval {_format_eval_str(hi.get('eval_after'))})!"
        )

    return {
        "score": score,
        "grade": _grade_from_accuracy(float(score)),
        "bullets": bullets,
    }


def _build_strategy_section(
    player_moves: list[dict[str, Any]],
    feats: dict[str, Any],
    tone: str,
    seed: str,
) -> dict[str, Any]:
    """Build strictly grounded Strategy score (0..100) and detailed coaching bullets."""
    n = max(1, len(player_moves))
    quiet_errors = [m for m in player_moves if m.get("classification") in ("inaccuracy", "mistake")]
    clean_moves = [
        m for m in player_moves
        if m.get("classification") in ("book", "good", "excellent", "best", "great", "brilliant")
    ]

    score = 86.0
    score -= (len(quiet_errors) / n) * 55.0
    if feats["stuck_in_center_after_opening"]:
        score -= 10.0
    elif feats["castled_move"] is not None and feats["castled_move"] <= 10:
        score += 4.0
    if feats["opening_end_undeveloped"] is not None:
        if feats["opening_end_undeveloped"] == 0:
            score += 4.0
        elif feats["opening_end_undeveloped"] >= 2:
            score -= 6.0 * (feats["opening_end_undeveloped"] - 1)
    if feats["min_pawn_shield_with_queens"] is not None and feats["min_pawn_shield_with_queens"] <= 1:
        score -= 6.0
    if feats["max_doubled"] >= 2:
        score -= 4.0
    if feats["passed_pawn_events"]:
        score += 4.0

    score_int = int(round(max(15.0, min(98.0, score))))
    bullets: list[str] = []

    # 1. King safety & castling
    if feats["castled_move"] is not None:
        if feats["castled_move"] <= 10:
            bullets.append(
                f"King safety: you castled {feats['castled_side']} promptly on move {feats['castled_move']}, "
                f"connecting your rooks and getting your king out of central traffic."
            )
        else:
            bullets.append(
                f"King safety: you castled {feats['castled_side']} on move {feats['castled_move']}. "
                f"Aiming to castle before move 10 usually avoids unnecessary pressure in the center."
            )
    elif feats["stuck_in_center_after_opening"]:
        bullets.append(
            "King safety: your king stayed on its home square past the opening. Castling earlier keeps your king sheltered "
            "and brings a rook into the fight automatically."
        )

    if feats["min_pawn_shield_with_queens"] is not None and feats["min_pawn_shield_with_queens"] <= 1:
        bullets.append(
            "Pawn shield watch: while queens were still on the board, your king's protective pawn shield dropped to "
            f"{feats['min_pawn_shield_with_queens']} pawn—avoid pushing the pawns directly in front of your castled king without a clear reason."
        )

    # 2. Development & center control
    undev = feats["opening_end_undeveloped"]
    center = feats["avg_opening_center"]
    if undev is not None:
        if undev == 0:
            bullets.append(
                f"Piece activity: all minor pieces entered the game smoothly (averaging {center or 0} central squares controlled in the opening)."
            )
        elif undev >= 2:
            bullets.append(
                f"Piece activity: {undev} minor pieces stayed undeveloped past the opening. Getting every knight and bishop off the back rank early creates natural tactics."
            )
        else:
            bullets.append("Piece activity: you developed most of your minor pieces cleanly out of the opening.")

    # 3. Pawn structure & positional steadiness
    if feats["passed_pawn_events"]:
        ev = feats["passed_pawn_events"][0]
        bullets.append(
            f"Pawn structure: you generated a passed pawn on {', '.join(ev['squares'])} (move {ev['move_number']}), giving yourself long-term winning pressure."
        )
    elif feats["max_doubled"] >= 2 or feats["max_isolated"] >= 2:
        bullets.append(
            f"Pawn structure: the position accumulated structural targets (up to {feats['max_doubled']} doubled pawn files / "
            f"{feats['max_isolated']} isolated pawns)—try to recapture toward the center and keep pawn chains linked."
        )

    clean_pct = int(round((len(clean_moves) / n) * 100))
    if len(quiet_errors) <= 2:
        bullets.append(
            f"Positional steadiness: {clean_pct}% of your moves were Book, Good, or better—very consistent move-to-move planning."
        )
    else:
        msg = (
            f"Positional drift: {len(quiet_errors)} inaccuracies/mistakes gradually loosened your grip ({clean_pct}% clean moves). "
            f"In quiet positions, ask 'which of my pieces is doing the least?' and improve it."
        )
        if tone == "sarcastic":
            msg += " Slow, boring improvement moves win way more games than random pawn pushes!"
        bullets.append(msg)

    return {
        "score": score_int,
        "grade": _grade_from_accuracy(float(score_int)),
        "bullets": bullets[:4],
    }


def _parse_time_control(tc: str) -> tuple[Optional[float], float]:
    """Parse PGN TimeControl like '600+5' or '180' into (base_seconds, increment_seconds)."""
    raw = (tc or "").strip()
    if not raw or not raw[0].isdigit():
        return None, 0.0
    parts = raw.split("+", 1)
    try:
        base = float(parts[0])
        inc = float(parts[1]) if len(parts) > 1 and parts[1].strip() else 0.0
        return base, max(0.0, inc)
    except ValueError:
        return None, 0.0


def compute_clock_analysis(
    moves_out: list[dict[str, Any]],
    headers: Optional[dict[str, Any]] = None,
) -> dict[str, Any]:
    """
    Compute per-ply time spent (accounting for increment) and per-side
    time-management diagnostics (time-trouble vs rushed blunders).
    Also annotates each move dict in `moves_out` with `time_spent` (seconds).
    """
    headers = headers or {}
    base_sec, inc_sec = _parse_time_control(headers.get("time_control", ""))

    # Thresholds adapt gently to bullet/blitz vs rapid
    low_clock_threshold = min(60.0, max(15.0, (base_sec or 300.0) * 0.20))
    ample_clock_threshold = min(120.0, max(30.0, (base_sec or 300.0) * 0.40))
    rushed_spend_threshold = 5.0 if (base_sec is None or base_sec >= 180.0) else 2.0

    prev_clk: dict[str, Optional[float]] = {"white": base_sec, "black": base_sec}
    series: list[dict[str, Any]] = []

    per_side: dict[str, dict[str, Any]] = {}
    for col in ("white", "black"):
        per_side[col] = {
            "has_clock_data": False,
            "moves_with_clock": 0,
            "spent_list": [],
            "longest_think": None,
            "time_trouble_moves": 0,
            "time_trouble_blunders": 0,
            "rushed_blunders": 0,
            "total_blunders_with_clock": 0,
            "tt_accs": [],
            "normal_accs": [],
        }

    for m in moves_out:
        col = m.get("color")
        if col not in ("white", "black"):
            continue
        clk = m.get("clock_seconds")
        spent: Optional[float] = None
        if clk is not None:
            clk_f = float(clk)
            if prev_clk[col] is not None:
                raw_spent = (prev_clk[col] + inc_sec) - clk_f  # type: ignore[operator]
                spent = round(max(0.0, raw_spent), 1)
            prev_clk[col] = clk_f

        m["time_spent"] = spent

        if clk is not None and spent is not None:
            st = per_side[col]
            st["has_clock_data"] = True
            st["moves_with_clock"] += 1
            st["spent_list"].append(spent)

            if st["longest_think"] is None or spent > st["longest_think"]["seconds"]:
                st["longest_think"] = {
                    "ply": m["ply"],
                    "move_number": m["move_number"],
                    "san": m["san"],
                    "seconds": spent,
                }

            clf = (m.get("classification") or "").lower()
            acc = _move_accuracy(float(m.get("epl", 0.0)))
            in_time_trouble = float(clk) < low_clock_threshold
            if in_time_trouble:
                st["time_trouble_moves"] += 1
                st["tt_accs"].append(acc)
            else:
                st["normal_accs"].append(acc)

            if clf in ("blunder", "miss"):
                st["total_blunders_with_clock"] += 1
                if in_time_trouble:
                    st["time_trouble_blunders"] += 1
                elif spent < rushed_spend_threshold and float(clk) >= ample_clock_threshold:
                    st["rushed_blunders"] += 1

            series.append({
                "ply": m["ply"],
                "move_number": m["move_number"],
                "color": col,
                "san": m["san"],
                "time_spent": spent,
                "clock_seconds": round(float(clk), 1),
                "classification": clf,
            })

    out_sides: dict[str, dict[str, Any]] = {}
    for col in ("white", "black"):
        st = per_side[col]
        spents = st["spent_list"]
        out_sides[col] = {
            "has_clock_data": st["has_clock_data"],
            "moves_with_clock": st["moves_with_clock"],
            "avg_time_spent": round(sum(spents) / len(spents), 1) if spents else None,
            "max_time_spent": round(max(spents), 1) if spents else None,
            "longest_think": st["longest_think"],
            "time_trouble_moves": st["time_trouble_moves"],
            "time_trouble_blunders": st["time_trouble_blunders"],
            "rushed_blunders": st["rushed_blunders"],
            "total_blunders_with_clock": st["total_blunders_with_clock"],
            "time_trouble_accuracy": round(sum(st["tt_accs"]) / len(st["tt_accs"]), 1) if st["tt_accs"] else None,
            "normal_accuracy": round(sum(st["normal_accs"]) / len(st["normal_accs"]), 1) if st["normal_accs"] else None,
            "low_clock_threshold_sec": round(low_clock_threshold),
        }

    return {
        "has_clock_data": bool(series),
        "series": series,
        "white": out_sides["white"],
        "black": out_sides["black"],
    }


def _build_next_game_tips(
    stages: dict[str, dict[str, Any]],
    tactics: dict[str, Any],
    strategy: dict[str, Any],
    feats: dict[str, Any],
    player_moves: list[dict[str, Any]],
    seed: str,
    clock_stats: Optional[dict[str, Any]] = None,
) -> list[dict[str, str]]:
    """Generate 3-4 prioritized, concrete Next-Game Focus Tips driven by actual game metrics."""
    tips: list[dict[str, str]] = []
    blunders = sum(1 for m in player_moves if m.get("classification") == "blunder")
    misses = sum(1 for m in player_moves if m.get("classification") == "miss")

    # Priority 0: Clock-specific habits (rushed blunders vs time trouble)
    if clock_stats and clock_stats.get("has_clock_data"):
        if int(clock_stats.get("rushed_blunders") or 0) >= 1:
            rb = int(clock_stats["rushed_blunders"])
            tips.append({
                "title": "Slow Down on Critical Turns — You Had Plenty of Clock",
                "detail": (
                    f"{rb} of your big {'mistakes' if rb != 1 else 'mistake'} happened in under 5 seconds while you still had "
                    f"ample time left. Force a 5-second pause before moving in tense middlegame positions."
                ),
            })
        elif int(clock_stats.get("time_trouble_blunders") or 0) >= 2:
            ttb = int(clock_stats["time_trouble_blunders"])
            tips.append({
                "title": "Budget Your Clock Earlier to Avoid Time Scrambling",
                "detail": (
                    f"You made {ttb} costly errors with under {clock_stats.get('low_clock_threshold_sec', 60)}s left. "
                    f"Play routine opening moves more decisively so you save time for sharp middlegame tactics."
                ),
            })

    # Priority 1: Hanging pieces / blunder check
    if feats["hanging_oversights"] or blunders >= 2:
        tips.append({
            "title": "Run a 2-Second Blunder Check Before Clicking",
            "detail": (
                "Before playing your move, glance at two things: (1) is the square I'm moving to safely defended, "
                "and (2) did the piece I just moved stop defending something else? This single habit eliminates most big swings."
            ),
        })

    # Priority 2: Missed tactics
    if misses >= 1:
        tips.append({
            "title": "Scan Checks, Captures & Threats (CCT) Every Turn",
            "detail": (
                "When your opponent slips, pause and list every legal check, capture, and attack on undefended pieces "
                "before settling on a quiet move. That's how you convert their mistakes into decisive advantages."
            ),
        })

    # Priority 3: King safety / castling
    if feats["stuck_in_center_after_opening"] or (feats["castled_move"] and feats["castled_move"] > 12):
        tips.append({
            "title": "Castle Within the First 10 Moves",
            "detail": (
                "Make developing your kingside knight and bishop and castling early your automatic opening checklist. "
                "A tucked-away king lets you attack freely without worrying about central checks."
            ),
        })
    elif feats["min_pawn_shield_with_queens"] is not None and feats["min_pawn_shield_with_queens"] <= 1:
        tips.append({
            "title": "Protect the Pawn Shield in Front of Your King",
            "detail": (
                "Keep the f-, g-, and h-pawns undisturbed in front of your castled king while enemy queens and bishops are active. "
                "Every unnecessary push creates permanent dark- or light-square holes."
            ),
        })

    # Priority 4: Opening development
    if feats["opening_end_undeveloped"] is not None and feats["opening_end_undeveloped"] >= 2:
        tips.append({
            "title": "Develop Every Minor Piece Before Attacking",
            "detail": (
                "Bring both knights and both bishops off the back rank and connect your rooks before launching a flank attack. "
                "Attacking with two pieces while two more sleep on the first rank rarely works."
            ),
        })

    # Priority 5: Endgame technique if reached and shaky
    eg = stages["endgame"]
    if eg["reached"] and (eg["accuracy"] or 100) < 70:
        tips.append({
            "title": "Activate Your King as Soon as Queens Leave the Board",
            "detail": (
                "In the endgame, your king stops hiding and becomes a fighting piece worth roughly 4 points. "
                "March it toward the center to support your pawns and blockade your opponent's."
            ),
        })

    # Priority 6: Weakest stage spotlight if we still have room
    if len(tips) < 3:
        mg = stages["middlegame"]
        op = stages["opening"]
        if op["reached"] and (op["accuracy"] or 100) < 72:
            tips.append({
                "title": "Review Move 4–10 of Your Main Opening",
                "detail": (
                    "Don't memorize 20 moves of theory—just replay the first mistake in this game's opening with [EXPLAIN] "
                    "so you know the natural developing square next time the same setup appears."
                ),
            })
        elif mg["reached"] and (mg["accuracy"] or 100) < 75:
            tips.append({
                "title": "Improve Your Worst-Placed Piece in Quiet Positions",
                "detail": (
                    "When there is no immediate tactic, find your least active rook, knight, or bishop and place it on an "
                    "open file or central outpost instead of making random pawn moves."
                ),
            })

    # Fallback growth tips for clean games so every player gets 3 concrete takeaways
    fallback_pool = [
        {
            "title": "Ask 'What Is My Opponent Threatening?' First",
            "detail": (
                "Right after your opponent moves, spend two seconds spotting what their last move attacks or opens up. "
                "Stopping their plan early keeps you in the driver's seat."
            ),
        },
        {
            "title": "Trade Pieces When Ahead, Keep Tension When Behind",
            "detail": (
                "Once you win a pawn or piece, look for clean, safe trades to simplify into an easy endgame. "
                "When down material, keep pieces on the board to create practical chances."
            ),
        },
        {
            "title": "Replay the Turning Point in Subgame Mode",
            "detail": (
                "Click the key move chip above, press 'Show Best Move (B)', and play 3–4 moves from Stockfish's line "
                "so the winning pattern sticks in your memory for your next match."
            ),
        },
    ]
    for fb in fallback_pool:
        if len(tips) >= 4:
            break
        if all(t["title"] != fb["title"] for t in tips):
            tips.append(fb)

    return tips[:4]


def _build_overall_summary(
    player_name: str,
    overall_acc: Optional[float],
    stages: dict[str, dict[str, Any]],
    tactics: dict[str, Any],
    strategy: dict[str, Any],
    player_blunders: int,
    player_misses: int,
    tone: str,
    seed: str,
) -> str:
    acc_str = f"{overall_acc}%" if overall_acc is not None else "—"
    reached_stages = [
        (name, s["accuracy"])
        for name, s in stages.items()
        if s["reached"] and s["accuracy"] is not None
    ]
    best_stage = max(reached_stages, key=lambda x: x[1])[0] if reached_stages else "opening"
    weak_stage = min(reached_stages, key=lambda x: x[1])[0] if reached_stages else "middlegame"

    if tone == "sarcastic":
        return _stable_pick([
            (
                f"Alright {player_name}, buckle up—that was a wild ride ({acc_str} overall, {player_blunders} "
                f"{'blunder' if player_blunders == 1 else 'blunders'} and {player_misses} {'miss' if player_misses == 1 else 'misses'}). "
                f"Your {best_stage} showed real sparks, while the {weak_stage} turned into pure chaos. "
                f"Check the turning points below—cleaning up just two big moments here jumps your play up a whole tier!"
            ),
            (
                f"Well {player_name}, nobody can accuse you of playing boring chess ({acc_str} overall)! "
                f"You survived {player_blunders} {'blunder' if player_blunders == 1 else 'blunders'} on the board, "
                f"with your best stretch in the {best_stage} and the biggest bumps in the {weak_stage}. "
                f"Use the tips below to turn that chaotic energy into controlled wins."
            ),
            (
                f"Pure rollercoaster chess from {player_name} ({acc_str} overall, {player_blunders + player_misses} major swings). "
                f"Good news: your {best_stage} proves you can find strong moves—now let's tighten up your {weak_stage} blunder check!"
            ),
        ], f"{seed}:sum:sarc")

    if tone == "candid":
        return _stable_pick([
            (
                f"A lively, competitive game for {player_name} ({acc_str} overall). Your {best_stage} was your strongest phase, "
                f"while a few costly moments in the {weak_stage} swung the evaluation. "
                f"Tactics scored {tactics['score']}/100 and Strategy scored {strategy['score']}/100—focusing on the key turning points below will pay off fast."
            ),
            (
                f"Good fight from {player_name} at {acc_str} accuracy. You built real play in the {best_stage}, "
                f"and only {player_blunders + player_misses} sharp tactical turns in the {weak_stage} held the score back. "
                f"Review those moments with [EXPLAIN] and you'll spot them immediately next game."
            ),
        ], f"{seed}:sum:cand")

    # Default: warm, thorough, instructive tone (0-2 severe errors)
    if (overall_acc or 0) >= 82.0:
        return _stable_pick([
            (
                f"Very clean, disciplined game by {player_name} ({acc_str} overall)! "
                f"You were especially sharp in the {best_stage}, backing it up with {tactics['score']}/100 Tactics and {strategy['score']}/100 Strategy. "
                f"Keep building on this consistency and check the notes below to sharpen your {weak_stage} even further."
            ),
            (
                f"Strong performance from {player_name} at {acc_str} accuracy. "
                f"Your {best_stage} set a great tone and you avoided major tactical meltdowns throughout. "
                f"Look through the stage notes below to see the subtle improvements that take this game to the next level."
            ),
        ], f"{seed}:sum:inst:hi")

    return _stable_pick([
        (
            f"A very instructive game for {player_name} ({acc_str} overall). "
            f"Your strongest phase was the {best_stage}, while the {weak_stage} offers the biggest room for quick improvement "
            f"(Tactics {tactics['score']}/100 · Strategy {strategy['score']}/100). "
            f"Walk through the clickable turning points below to lock in the lessons for your next game."
        ),
        (
            f"Solid effort from {player_name} ({acc_str} overall) with clear positives to build on in your {best_stage}. "
            f"The {weak_stage} is where the game's key lessons live—tightening up one or two decisions there will lift your overall accuracy right away."
        ),
        (
            f"Good learning game for {player_name} ({acc_str} overall). "
            f"Your {best_stage} gave you a solid platform, and reviewing the specific {weak_stage} moments below will help you handle similar positions with confidence next time."
        ),
    ], f"{seed}:sum:inst:mid")


def build_game_report(
    moves_out: list[dict[str, Any]],
    initial_fen: str = chess.STARTING_FEN,
    initial_eval: Optional[dict[str, Any]] = None,
    headers: Optional[dict[str, Any]] = None,
    summary: Optional[dict[str, Any]] = None,
) -> dict[str, Any]:
    """
    Build the complete post-game coaching report for both White and Black.
    Pure Layer 1+2 grounded analysis (zero Stockfish calls required).
    """
    headers = headers or {}
    summary = summary or {}
    parsed_boards = [chess.Board(m["fen"]) for m in moves_out]
    phases, phase_ranges = detect_game_phases(moves_out, boards=parsed_boards)
    opening_name = headers.get("opening") or ""

    total_game_blunders = sum(
        1 for m in moves_out if m.get("classification") in ("blunder", "miss")
    )

    clock_info = compute_clock_analysis(moves_out, headers=headers)

    report: dict[str, Any] = {
        "phase_ranges": {
            k: (list(v) if v is not None else None) for k, v in phase_ranges.items()
        },
        "clock_series": clock_info["series"],
        "has_clock_data": clock_info["has_clock_data"],
        "white": {},
        "black": {},
    }

    for color in ("white", "black"):
        player_name = headers.get(color) or ("White" if color == "white" else "Black")
        player_moves = [m for m in moves_out if m.get("color") == color]
        seed = f"{initial_fen}|{len(moves_out)}|{color}|{player_name}"

        player_blunders = sum(1 for m in player_moves if m.get("classification") == "blunder")
        player_misses = sum(1 for m in player_moves if m.get("classification") == "miss")
        tone = _determine_tone(player_blunders, player_misses, total_game_blunders)

        feats = _scan_player_features(moves_out, phases, color, boards=parsed_boards)

        stages: dict[str, dict[str, Any]] = {}
        for stage in ("opening", "middlegame", "endgame"):
            stage_moves = [
                m for idx, m in enumerate(moves_out)
                if phases[idx] == stage and m.get("color") == color
            ]
            st_stats = _score_stage_moves(stage_moves)
            st_range = phase_ranges.get(stage)
            st_stats["move_range"] = f"Moves {st_range[0]}–{st_range[1]}" if st_range else "Not reached"

            if stage == "opening":
                st_stats["comments"] = _build_opening_comment(st_stats, feats, tone, opening_name, seed)
            elif stage == "middlegame":
                st_stats["comments"] = _build_middlegame_comment(st_stats, feats, tone, seed)
            else:
                st_stats["comments"] = _build_endgame_comment(st_stats, feats, tone, seed)

            stages[stage] = st_stats

        tactics = _build_tactics_section(player_moves, feats, tone, seed)
        strategy = _build_strategy_section(player_moves, feats, tone, seed)
        side_clock = clock_info[color]
        tips = _build_next_game_tips(
            stages, tactics, strategy, feats, player_moves, seed, clock_stats=side_clock
        )
        overall_acc = summary.get(f"{color}_accuracy")
        overall_text = _build_overall_summary(
            player_name=player_name,
            overall_acc=overall_acc,
            stages=stages,
            tactics=tactics,
            strategy=strategy,
            player_blunders=player_blunders,
            player_misses=player_misses,
            tone=tone,
            seed=seed,
        )

        report[color] = {
            "player_name": player_name,
            "tone": tone,
            "overall_summary": overall_text,
            "stages": stages,
            "tactics": tactics,
            "strategy": strategy,
            "clock": side_clock,
            "tips": tips,
        }

    return report


if __name__ == "__main__":
    # Quick runnable self-test verifying phase detection, feature grounding, and blunder-gated tone
    import json

    board = chess.Board()
    sample_san = [
        "e4", "e5", "Nf3", "Nc6", "Bc4", "Bc5", "c3", "Nf6", "d3", "d6",
        "O-O", "O-O", "Re1", "a6", "Bb3", "Ba7", "h3", "h6", "Nbd2", "Re8",
        "Nf1", "Be6", "Bxe6", "Rxe6", "Ng3", "Qd7", "Nf5", "Ne7",
    ]
    sample_moves = []
    for ply, san in enumerate(sample_san, start=1):
        mv = board.parse_san(san)
        color = "white" if board.turn == chess.WHITE else "black"
        board.push(mv)
        sample_moves.append({
            "ply": ply,
            "move_number": (ply + 1) // 2,
            "color": color,
            "uci": mv.uci(),
            "san": san,
            "fen": board.fen(),
            "best_move": mv.uci(),
            "best_move_san": san,
            "eval_after": {"type": "cp", "value": 25},
            "eval_change": -5,
            "epl": 0.005,
            "classification": "book" if ply <= 8 else "best",
        })

    rep = build_game_report(
        sample_moves,
        headers={"white": "Alice", "black": "Bob", "opening": "Italian Game"},
        summary={"white_accuracy": 95.4, "black_accuracy": 94.8},
    )
    print("Clean game tone (white):", rep["white"]["tone"])
    print("Phase ranges:", rep["phase_ranges"])
    print("White summary:", rep["white"]["overall_summary"])
    print("White tips:", json.dumps(rep["white"]["tips"], indent=2))
