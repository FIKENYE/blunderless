"""
Layer 3: Comparative Explainer layer for Blunderless ("Chester" the Chess Coach).

Explains WHY one move is better than another in plain, beginner-friendly (600 Elo)
language using ONLY verified facts from Layer 1 (Stockfish) and Layer 2
(src/features.py) by comparing the board state after the played move vs. after
the engine's best move across:
  - Tactics (captures, hanging pieces, lesser-piece attacks, checks, forks, pins)
  - Material & immediate gains
  - King safety & castling
  - Pawn structure & longevity (doubled, isolated, passed pawns)
  - Piece activity, development, center control & opening strategy
"""

import json
import os
from typing import Any, Optional
import urllib.request

import chess

from src.engine import analyse_position
from src.features import PIECE_VALUES, extract_features
from src.openings import lookup_opening


def _format_eval_str(score: Optional[dict[str, Any]]) -> str:
    """Format a White-POV Stockfish score dict into a readable string like +0.45 or -M3."""
    if not score:
        return "0.00"
    if score.get("type") == "mate":
        val = int(score.get("value", 0))
        prefix = "+" if val > 0 else "-"
        return f"{prefix}M{abs(val)}"
    val = int(score.get("value", 0)) / 100.0
    return f"{val:+.2f}"


def _color_str(color: chess.Color) -> str:
    return "white" if color == chess.WHITE else "black"


def _detect_fork(board_after: chess.Board, move: chess.Move, mover: chess.Color) -> list[str]:
    """Return enemy valuable pieces (or king) simultaneously attacked by the moved piece."""
    opp = not mover
    attacked_targets: list[str] = []
    for sq in board_after.attacks(move.to_square):
        p = board_after.piece_at(sq)
        if p and p.color == opp and p.piece_type in (
            chess.KING, chess.QUEEN, chess.ROOK, chess.BISHOP, chess.KNIGHT
        ):
            attacked_targets.append(f"{chess.piece_name(p.piece_type)} on {chess.square_name(sq)}")
    return attacked_targets if len(attacked_targets) >= 2 else []


def _compare_played_vs_best(
    board_before: chess.Board,
    played_move: Optional[chess.Move],
    played_san: Optional[str],
    best_move: Optional[chess.Move],
    best_san: Optional[str],
    feat_before: dict[str, Any],
    feat_played: Optional[dict[str, Any]],
    feat_best: Optional[dict[str, Any]],
) -> dict[str, Any]:
    """
    Compare verified Layer 2 themes between the played move and the best move.
    Returns structured reasons explaining WHY `best_move` outperforms `played_move`
    (or why `played_move` itself is strong when played == best).
    """
    mover = board_before.turn
    opp = not mover
    m_key = _color_str(mover)
    o_key = _color_str(opp)
    sign = 1 if mover == chess.WHITE else -1

    why_best_better: list[str] = []
    why_played_hurts: list[str] = []
    played_strengths: list[str] = []

    # Opening context if known
    opening_info = lookup_opening(board_before.fen())
    opening_name = (
        opening_info["opening"]["name"]
        if opening_info and opening_info.get("opening")
        else None
    )

    board_played = None
    if played_move and played_move in board_before.legal_moves:
        board_played = board_before.copy()
        board_played.push(played_move)

    board_best = None
    if best_move and best_move in board_before.legal_moves:
        board_best = board_before.copy()
        board_best.push(best_move)

    same_move = played_move is not None and best_move is not None and played_move == best_move

    # ── 1. Immediate Tactics & Captures ──
    if board_best and best_move:
        if board_best.is_checkmate():
            why_best_better.append("delivers checkmate on the spot")

        fork_targets = _detect_fork(board_best, best_move, mover)
        if fork_targets and not same_move:
            why_best_better.append(f"sets up a fork attacking {' and '.join(fork_targets[:2])}")
        elif fork_targets and same_move:
            played_strengths.append(f"forks {' and '.join(fork_targets[:2])}")

        if board_before.is_capture(best_move):
            captured = board_before.piece_at(best_move.to_square)
            cap_name = chess.piece_name(captured.piece_type) if captured else "pawn"
            sq_name = chess.square_name(best_move.to_square)
            if not (played_move and board_before.is_capture(played_move)):
                why_best_better.append(f"wins the {cap_name} on {sq_name}")
            elif same_move:
                played_strengths.append(f"captures the {cap_name} on {sq_name}")

        if not board_best.is_checkmate() and board_best.is_check() and not (board_played and board_played.is_check()):
            why_best_better.append("hits the enemy king with check, forcing them onto the back foot")

    # ── 2. Hanging Pieces & Tactical Blunders ──
    if feat_played:
        hang_b = {h["square"] for h in feat_before["tactical_threats"][m_key]["hanging_pieces"]}
        hang_p = feat_played["tactical_threats"][m_key]["hanging_pieces"]
        hang_best_sqs = (
            {h["square"] for h in feat_best["tactical_threats"][m_key]["hanging_pieces"]}
            if feat_best else set()
        )

        # Pieces left undefended by played_move that best_move kept safe
        new_hanging = [h for h in hang_p if h["square"] not in hang_best_sqs]
        if new_hanging:
            h = new_hanging[0]
            if h["square"] in hang_b:
                why_played_hurts.append(f"ignores your undefended {h['piece']} on {h['square']}")
                why_best_better.append(f"protects or moves your threatened {h['piece']} on {h['square']}")
            else:
                why_played_hurts.append(f"leaves your {h['piece']} on {h['square']} completely undefended")

        # Pieces attacked by a cheaper enemy piece after played_move
        lesser_p = feat_played["tactical_threats"][m_key]["attacked_by_lesser"]
        lesser_best_sqs = (
            {x["square"] for x in feat_best["tactical_threats"][m_key]["attacked_by_lesser"]}
            if feat_best else set()
        )
        new_lesser = [x for x in lesser_p if x["square"] not in lesser_best_sqs]
        if new_lesser:
            x = new_lesser[0]
            why_played_hurts.append(
                f"lets their {x['attacker_piece']} on {x['attacker_square']} attack your {x['piece']} on {x['square']}"
            )

        # Pins created by best_move on the opponent
        if feat_best:
            pins_p = len(feat_played["tactical_threats"][o_key]["pinned_pieces"])
            pins_best = feat_best["tactical_threats"][o_key]["pinned_pieces"]
            if len(pins_best) > pins_p:
                pin = pins_best[0]
                why_best_better.append(f"pins their {pin['piece']} on {pin['square']} to the king")

            # Opponent hanging pieces created by best_move
            opp_hang_p = len(feat_played["tactical_threats"][o_key]["hanging_pieces"])
            opp_hang_best = feat_best["tactical_threats"][o_key]["hanging_pieces"]
            if len(opp_hang_best) > opp_hang_p:
                oh = opp_hang_best[0]
                why_best_better.append(f"immediately targets their undefended {oh['piece']} on {oh['square']}")

    # ── 3. King Safety & Castling ──
    if best_move and board_before.is_castling(best_move) and not (played_move and board_before.is_castling(played_move)):
        why_best_better.append("castles your king out of the center and activates your rook")
    elif played_move and board_before.is_castling(played_move) and same_move:
        played_strengths.append("tucks your king to safety and connects the rooks")

    if feat_played and feat_best:
        shield_before = feat_before["king_safety"][m_key]["pawn_shield_count"]
        shield_p = feat_played["king_safety"][m_key]["pawn_shield_count"]
        if shield_p < shield_before:
            why_played_hurts.append("weakens the pawn shield protecting your king")

        atk_p = feat_played["king_safety"][m_key]["enemy_attackers_on_ring"]
        atk_best = feat_best["king_safety"][m_key]["enemy_attackers_on_ring"]
        if atk_p > atk_best and atk_p >= 2:
            why_played_hurts.append(f"invites {atk_p} enemy pieces around your king")

        opp_atk_best = feat_best["king_safety"][o_key]["enemy_attackers_on_ring"]
        opp_atk_p = feat_played["king_safety"][o_key]["enemy_attackers_on_ring"]
        if opp_atk_best > opp_atk_p and opp_atk_best >= 2:
            why_best_better.append("builds an attack directly against the enemy king")

    # ── 4. Pawn Structure & Long-Term Longevity ──
    if feat_played and feat_best:
        ps_p = feat_played["pawn_structure"][m_key]
        ps_best = feat_best["pawn_structure"][m_key]
        if len(ps_p["doubled_files"]) > len(ps_best["doubled_files"]):
            why_played_hurts.append("creates doubled pawns that are harder to defend long-term")
        if len(ps_p["isolated_pawns"]) > len(ps_best["isolated_pawns"]):
            why_played_hurts.append("leaves you with an isolated pawn weakness")
        if len(ps_best["passed_pawns"]) > len(ps_p["passed_pawns"]):
            why_best_better.append("creates a dangerous passed pawn for the endgame")

        opp_ps_p = feat_played["pawn_structure"][o_key]
        opp_ps_best = feat_best["pawn_structure"][o_key]
        if len(opp_ps_best["doubled_files"]) > len(opp_ps_p["doubled_files"]):
            why_best_better.append("damages their pawn structure with doubled pawns")
        if len(opp_ps_p["passed_pawns"]) > len(opp_ps_best["passed_pawns"]):
            why_played_hurts.append("gives the opponent a dangerous passed pawn")

    # ── 5. Piece Activity, Development, Center Control & Opening Strategy ──
    if feat_played and feat_best:
        undev_p = feat_played["piece_activity"][m_key]["undeveloped_minors"]
        undev_best = feat_best["piece_activity"][m_key]["undeveloped_minors"]
        if undev_best < undev_p:
            why_best_better.append("develops a sleeping minor piece into the game instead of wasting a tempo")
        elif same_move and undev_p < feat_before["piece_activity"][m_key]["undeveloped_minors"]:
            played_strengths.append("brings a new piece into the fight")

        cen_p = feat_played["piece_activity"]["center_control"][m_key]
        cen_best = feat_best["piece_activity"]["center_control"][m_key]
        if cen_best > cen_p:
            why_best_better.append("claims stronger control of the center (d4/d5/e4/e5), giving your pieces more room")
        elif same_move and cen_p > feat_before["piece_activity"]["center_control"][m_key]:
            played_strengths.append("tightens your grip on the center")

        # Net material difference between best and played after 1 ply
        mat_p = feat_played["material_balance"]["advantage"] * sign
        mat_best = feat_best["material_balance"]["advantage"] * sign
        if mat_best > mat_p and not any("wins the" in r for r in why_best_better):
            why_best_better.append(f"keeps you {mat_best - mat_p} points ahead in material")

    return {
        "opening_name": opening_name,
        "why_best_better": why_best_better[:3],
        "why_played_hurts": why_played_hurts[:2],
        "played_strengths": played_strengths[:2],
    }


def _synthesize_chester_explanation(
    facts: dict[str, Any],
    tone: str = "instructive",
    mover_name: Optional[str] = None,
    is_user_move: bool = True,
) -> str:
    """
    Build a clear, beginner-friendly (600 Elo) comparative explanation in
    Chester's adaptive voice (`instructive`, `analytical`, or `sarcastic`),
    explicitly distinguishing between the user's moves and the opponent's moves.
    """
    clf = (facts["classification"] or "info").lower()
    played = facts["played_move"]
    best = facts["best_move"]
    ev = facts["eval_after"]
    delta = facts["eval_change_pawns"]
    line_str = " ".join(facts["best_line"][:4])
    why_best = facts.get("why_best_better") or []
    why_hurts = facts.get("why_played_hurts") or []
    strengths = facts.get("played_strengths") or []
    opening = facts.get("opening_name")

    actor = "Your" if is_user_move else f"{mover_name or 'Opponent'}'s"
    subj = "You" if is_user_move else (mover_name or "Your opponent")

    if not played:
        reason = f" because it {why_best[0]}" if why_best else ""
        line_cite = f" (line: {line_str})" if line_str else ""
        if best:
            return f"Stockfish likes {best} here (eval {ev}){reason}{line_cite}."
        return f"Position eval is {ev}. Make a move and I'll break it down."

    if clf == "book":
        op_note = f" in the {opening}" if opening else ""
        extra = f" — it {strengths[0]}" if strengths else " to claim space and develop smoothly"
        if tone == "sarcastic":
            return f"Book move{op_note}! {actor} {played} holds {ev}{extra}. Let's see how long theory lasts."
        return f"Book move{op_note}! {actor} {played} keeps the eval at {ev}{extra}."

    if played == best or clf in ("brilliant", "great", "best", "excellent"):
        reason = f" It {strengths[0]}." if strengths else (f" It {why_best[0]}." if why_best else "")
        if not is_user_move:
            return f"{subj} found {played} (eval {ev}).{reason} Sharp move—stay alert!"
        if tone == "analytical":
            return f"Strong precision: {played} maintains {ev}.{reason} Best practical plan."
        if tone == "sarcastic":
            return f"Alright, {played} holds {ev}.{reason} Even I can't roast that one."
        return f"Nice find! {played} holds {ev}.{reason} Keep building on this plan."

    # Comparative explanation: WHY `best` was better than `played`!
    parts: list[str] = []
    if not is_user_move:
        # Opponent made the slip -> frame it as an opportunity for the user!
        if why_hurts:
            hurt_text = why_hurts[0].replace("your ", "their ")
            parts.append(f"{subj}'s {played} {hurt_text}!")
        else:
            parts.append(f"{subj}'s {played} drops {abs(delta):.2f} (eval {ev})!")
        if best:
            if why_best:
                joined = " and ".join(why_best[:2]).replace("your ", "their ")
                parts.append(f"They missed {best}, which {joined}.")
            else:
                parts.append(f"{best} would have held their position together.")
    else:
        if why_hurts:
            if tone == "sarcastic":
                parts.append(f"Oof—{played} {why_hurts[0]}.")
            elif tone == "analytical":
                parts.append(f"{played} concedes the edge because it {why_hurts[0]}.")
            else:
                parts.append(f"Watch out: {played} {why_hurts[0]}.")
        else:
            if tone == "sarcastic":
                parts.append(f"Yikes, {played} leaks {abs(delta):.2f} (eval {ev}).")
            elif tone == "analytical":
                parts.append(f"{played} drops {abs(delta):.2f} to {ev}.")
            else:
                parts.append(f"{played} slips by {abs(delta):.2f} (eval {ev}).")

        if best:
            if why_best:
                joined = " and ".join(why_best[:2])
                parts.append(f"{best} was stronger because it {joined}.")
            else:
                op_hint = f" and fits the {opening} plan" if opening else ""
                parts.append(f"{best} keeps your pieces better coordinated{op_hint}.")

    if line_str:
        parts.append(f"Line: {line_str} (eval {ev}).")
    elif why_hurts:
        parts.append(f"(eval {ev}).")

    return " ".join(parts)


def _try_gemini_explain(facts: dict[str, Any], tone: str = "instructive") -> Optional[str]:
    """Optionally call Gemini API if GEMINI_API_KEY is set, strictly grounded in `facts`."""
    api_key = os.environ.get("GEMINI_API_KEY", "").strip()
    if not api_key:
        return None

    tone_desc = {
        "instructive": "encouraging, calm, and instructive for a 600 Elo learner",
        "analytical": "sharp, respectful, and analytical (they are playing well!)",
        "sarcastic": "cocky, playful, and GothamChess-style sarcastic—while still teaching clearly",
    }.get(tone, "encouraging and clear")

    prompt = (
        f"You are Chester, a pixel-art knight chess coach. Your current tone is: {tone_desc}.\n"
        "Explain in 2 short, clear sentences WHY the best move is better than the played move (covering tactics, "
        "pawn structure, king safety, piece activity, or opening strategy) using ONLY the verified JSON facts below.\n"
        "RULES:\n"
        "- Never invent any tactic, square, or eval not in the JSON.\n"
        "- Always cite the eval or best move/line from the JSON.\n"
        "- Keep language easy to grasp for a 600 Elo player.\n\n"
        f"VERIFIED FACTS:\n{json.dumps(facts)}"
    )

    url = (
        "https://generativelanguage.googleapis.com/v1beta/models/"
        f"gemini-2.0-flash:generateContent?key={api_key}"
    )
    body = json.dumps({
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {"temperature": 0.35, "maxOutputTokens": 150},
    }).encode("utf-8")

    req = urllib.request.Request(
        url,
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=4.0) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            text = data["candidates"][0]["content"]["parts"][0]["text"].strip()
            if text:
                return text
    except Exception:
        return None
    return None


def explain_position(
    fen_before: str,
    played_uci: Optional[str] = None,
    played_san: Optional[str] = None,
    classification: Optional[str] = None,
    eval_after: Optional[dict[str, Any]] = None,
    eval_change: Optional[int] = None,
    best_move: Optional[str] = None,
    best_move_san: Optional[str] = None,
    engine: Optional[Any] = None,
    use_llm: bool = True,
    tone: str = "instructive",
    mover_name: Optional[str] = None,
    is_user_move: bool = True,
) -> dict[str, Any]:
    """
    Produce a grounded comparative explanation (played vs best) and best PV UCI
    continuation for Chester's animated board demo.
    """
    board_before = chess.Board(fen_before)
    top_lines: list[dict[str, Any]] = []

    if engine is not None or not best_move or eval_after is None:
        eng_info = analyse_position(fen_before, depth=10, multipv=1, engine=engine)
        best_move = best_move or eng_info.get("best_move")
        best_move_san = best_move_san or eng_info.get("best_move_san")
        top_lines = eng_info.get("top_lines") or []
        if eval_after is None:
            eval_after = eng_info.get("score")

    feat_before = extract_features(fen_before)
    feat_played = None
    feat_best = None
    played_move_obj: Optional[chess.Move] = None
    best_move_obj: Optional[chess.Move] = None

    if played_uci:
        try:
            mv = chess.Move.from_uci(played_uci)
            if mv in board_before.legal_moves:
                played_move_obj = mv
                if not played_san:
                    played_san = board_before.san(mv)
                b_after = board_before.copy()
                b_after.push(mv)
                feat_played = extract_features(b_after.fen())
        except ValueError:
            pass

    if best_move:
        try:
            bmv = chess.Move.from_uci(best_move)
            if bmv in board_before.legal_moves:
                best_move_obj = bmv
                if not best_move_san:
                    best_move_san = board_before.san(bmv)
                b_best = board_before.copy()
                b_best.push(bmv)
                feat_best = extract_features(b_best.fen())
        except ValueError:
            pass

    comparison = _compare_played_vs_best(
        board_before=board_before,
        played_move=played_move_obj,
        played_san=played_san,
        best_move=best_move_obj,
        best_san=best_move_san,
        feat_before=feat_before,
        feat_played=feat_played,
        feat_best=feat_best,
    )

    best_line_uci = (top_lines[0].get("pv") or [])[:4] if top_lines else ([best_move] if best_move else [])

    facts: dict[str, Any] = {
        "played_move": played_san or played_uci,
        "best_move": best_move_san or best_move,
        "classification": classification or "info",
        "eval_after": _format_eval_str(eval_after),
        "eval_change_pawns": round((eval_change or 0) / 100.0, 2),
        "best_line": (top_lines[0].get("pv_san") or [])[:5] if top_lines else [],
        "tone": tone,
        "mover_name": mover_name,
        "is_user_move": is_user_move,
        **comparison,
    }

    text = _try_gemini_explain(facts, tone=tone) if use_llm else None
    source = "llm" if text else "grounded-comparative"
    if not text:
        text = _synthesize_chester_explanation(
            facts,
            tone=tone,
            mover_name=mover_name,
            is_user_move=is_user_move,
        )

    clf = (classification or "").lower()
    if clf in ("brilliant", "great", "best", "excellent"):
        mood = "smug"
    elif clf == "book":
        mood = "deadpan"
    elif clf in ("mistake", "miss", "blunder"):
        mood = "flabbergasted"
    elif clf == "inaccuracy":
        mood = "annoyed"
    else:
        mood = "deadpan"

    return {
        "text": text,
        "mood": mood,
        "source": source,
        "best_line_uci": best_line_uci,
        "facts": facts,
    }
