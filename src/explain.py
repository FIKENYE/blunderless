"""
Layer 3: Explainer layer for Blunderless.

Generates grounded, personality-rich move explanations using ONLY verified
facts from Layer 1 (Stockfish eval & lines) and Layer 2 (src/features.py).
Uses GEMINI_API_KEY via stdlib urllib if available, otherwise uses a fast,
deterministic template synthesizer grounded in the exact same data.
"""

import json
import os
from typing import Any, Optional
import urllib.request

import chess

from src.engine import _score_to_cp, analyse_position
from src.features import extract_features


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


def _build_verified_facts(
    fen_before: str,
    played_uci: Optional[str],
    played_san: Optional[str],
    best_uci: Optional[str],
    best_san: Optional[str],
    classification: Optional[str],
    eval_after: Optional[dict[str, Any]],
    eval_change: Optional[int],
    top_lines: Optional[list[dict[str, Any]]],
    features_before: dict[str, Any],
    features_after: Optional[dict[str, Any]],
) -> dict[str, Any]:
    """Assemble a strictly verified fact dictionary from Layers 1 and 2."""
    facts: dict[str, Any] = {
        "played_move": played_san or played_uci,
        "best_move": best_san or best_uci,
        "classification": classification or "info",
        "eval_after": _format_eval_str(eval_after),
        "eval_change_pawns": round((eval_change or 0) / 100.0, 2),
        "best_line": [],
        "themes": [],
    }

    if top_lines and len(top_lines) > 0:
        facts["best_line"] = (top_lines[0].get("pv_san") or [])[:5]

    # Compare Layer 2 features before & after (only state observed deltas)
    if features_after:
        mat_b = features_before.get("material", {}).get("advantage", 0)
        mat_a = features_after.get("material", {}).get("advantage", 0)
        if mat_a != mat_b:
            facts["themes"].append(f"material balance shifted to {mat_a:+d}")

        ks_after = features_after.get("king_safety", {})
        for side in ("white", "black"):
            if ks_after.get(side, {}).get("in_check"):
                facts["themes"].append(f"{side} king is in check")
            atk = ks_after.get(side, {}).get("enemy_attackers_on_ring", 0)
            atk_b = features_before.get("king_safety", {}).get(side, {}).get("enemy_attackers_on_ring", 0)
            if atk > atk_b and atk >= 2:
                facts["themes"].append(f"{atk} enemy pieces target {side}'s king ring")

        tactics = features_after.get("tactics", {})
        hanging_w = tactics.get("hanging_pieces", {}).get("white", [])
        hanging_b = tactics.get("hanging_pieces", {}).get("black", [])
        if hanging_w:
            facts["themes"].append(f"undefended white piece on {', '.join(hanging_w[:2])}")
        if hanging_b:
            facts["themes"].append(f"undefended black piece on {', '.join(hanging_b[:2])}")

    return facts


def _fallback_chibi_explanation(facts: dict[str, Any]) -> str:
    """
    Deterministic, strictly grounded Chibi Horse explanation citing the exact
    Stockfish evaluation, best line, and Layer 2 themes.
    """
    clf = (facts["classification"] or "info").lower()
    played = facts["played_move"]
    best = facts["best_move"]
    ev = facts["eval_after"]
    delta = facts["eval_change_pawns"]
    line_str = " ".join(facts["best_line"][:4])
    themes = facts["themes"]
    theme_note = f" ({'; '.join(themes[:2])})" if themes else ""

    if not played:
        if best:
            line_cite = f" Line: {line_str}." if line_str else ""
            return f"Ready at the gate! Stockfish likes {best} here (eval {ev}).{line_cite}"
        return f"Fresh board, eval {ev}. Saddle up and make your move!"

    if clf == "book":
        return f"By the book! {played} follows opening theory (eval {ev})."
    if clf == "brilliant":
        return f"WHOA, neigh-mazing! {played} is a brilliant sacrifice (eval {ev}){theme_note}!"
    if clf == "great":
        return f"Sharp hooves! {played} is a great find—crucial to keep the edge at {ev}{theme_note}."
    if clf in ("best", "excellent"):
        return f"Spot on! {played} keeps things tight at {ev}{theme_note}."
    if clf == "good":
        best_note = f" ({best} was slightly sharper)" if best and best != played else ""
        return f"Solid step with {played} (eval {ev}){best_note}."
    if clf == "inaccuracy":
        line_cite = f" (line: {line_str})" if line_str else ""
        return f"Careful—{played} slips by {abs(delta):.2f} to {ev}. {best or 'Another move'} was cleaner{line_cite}."
    if clf == "mistake":
        line_cite = f" Try {line_str}." if line_str else ""
        return f"Whoa there! {played} loses {abs(delta):.2f} (eval {ev}){theme_note}.{line_cite}"
    if clf == "miss":
        line_cite = f" {line_str} punished it!" if line_str else ""
        return f"Oof, missed a big chance! {played} let them off the hook (eval {ev}).{line_cite}"
    if clf == "blunder":
        line_cite = f" Best was {best} ({line_str})." if best and line_str else (f" Best was {best}." if best else "")
        return f"Neigh!! {played} blunders {abs(delta):.2f} (eval {ev}){theme_note}.{line_cite}"

    return f"{played} leaves the eval at {ev}{theme_note}."


def _try_gemini_explain(facts: dict[str, Any]) -> Optional[str]:
    """Optionally call Gemini API if GEMINI_API_KEY is set, strictly grounded in `facts`."""
    api_key = os.environ.get("GEMINI_API_KEY", "").strip()
    if not api_key:
        return None

    prompt = (
        "You are Barnaby, a lively, friendly chibi chess horse coach.\n"
        "Explain the chess move in 1-2 short, punchy sentences using ONLY the verified JSON facts below.\n"
        "RULES:\n"
        "- Never invent any tactic, square, or eval not in the JSON.\n"
        "- Always cite the eval or best move/line from the JSON.\n"
        "- Keep a playful horse-coach personality (light pun max 1, clear coaching).\n\n"
        f"VERIFIED FACTS:\n{json.dumps(facts)}"
    )

    url = (
        "https://generativelanguage.googleapis.com/v1beta/models/"
        f"gemini-2.0-flash:generateContent?key={api_key}"
    )
    body = json.dumps({
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {"temperature": 0.4, "maxOutputTokens": 120},
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
) -> dict[str, Any]:
    """
    Produce a grounded move explanation and mood for the Chibi Horse coach.
    """
    board_before = chess.Board(fen_before)
    top_lines: list[dict[str, Any]] = []

    if not best_move or eval_after is None:
        eng_info = analyse_position(fen_before, depth=10, multipv=2, engine=engine)
        best_move = best_move or eng_info.get("best_move")
        best_move_san = best_move_san or eng_info.get("best_move_san")
        top_lines = eng_info.get("top_lines") or []
        if eval_after is None:
            eval_after = eng_info.get("score")

    features_before = extract_features(fen_before)
    features_after = None

    if played_uci:
        try:
            move = chess.Move.from_uci(played_uci)
            if move in board_before.legal_moves:
                if not played_san:
                    played_san = board_before.san(move)
                board_after = board_before.copy()
                board_after.push(move)
                features_after = extract_features(board_after.fen())
        except ValueError:
            pass

    facts = _build_verified_facts(
        fen_before=fen_before,
        played_uci=played_uci,
        played_san=played_san,
        best_uci=best_move,
        best_san=best_move_san,
        classification=classification,
        eval_after=eval_after,
        eval_change=eval_change,
        top_lines=top_lines,
        features_before=features_before,
        features_after=features_after,
    )

    text = _try_gemini_explain(facts) if use_llm else None
    source = "llm" if text else "grounded-engine"
    if not text:
        text = _fallback_chibi_explanation(facts)

    clf = (classification or "").lower()
    if clf in ("brilliant", "great", "best", "excellent"):
        mood = "happy"
    elif clf == "book":
        mood = "book"
    elif clf in ("mistake", "miss", "blunder"):
        mood = "shocked"
    elif clf == "inaccuracy":
        mood = "thinking"
    else:
        mood = "idle"

    return {
        "text": text,
        "mood": mood,
        "source": source,
        "facts": facts,
    }
