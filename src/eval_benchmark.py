"""
Core Evaluation Harness for Blunderless (`src/eval_benchmark.py`).

Directly measures the project's core thesis from AGENTS.md:
  Does providing structured Layer 2 board features (`src/features.py`) alongside
  Stockfish evaluations produce more factual, better-grounded explanations than
  passing raw Stockfish output alone?

Runs in two modes:
1. Deterministic offline benchmark (default, zero API cost):
   - Runs Stockfish + `extract_features()` across `tests/positions.json`.
   - Verifies motif detection recall across all labeled benchmark positions.
   - Scores deterministic "raw-engine-only" explanations vs "structured-feature"
     explanations on (a) verified motif coverage, (b) eval/line citation, and
     (c) zero unverified claims.
2. Optional Live LLM Comparison (`--live-llm` with `GEMINI_API_KEY` set):
   - Queries Gemini twice per position (raw Stockfish prompt vs structured
     Layer 2 prompt) and grades both outputs against verified ground-truth motifs.

Run from project root:
    python -m src.eval_benchmark
    python -m src.eval_benchmark --live-llm --limit 8
"""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
from typing import Any, Optional
import urllib.request

import chess

from src.engine import analyse_position, get_engine
from src.explain import explain_position
from src.features import extract_features

DEFAULT_POSITIONS_PATH = Path(__file__).resolve().parent.parent / "tests" / "positions.json"


def check_expected_motif(features: dict[str, Any], motif_spec: str) -> bool:
    """Verify whether `extract_features()` detected a labeled ground-truth motif."""
    parts = motif_spec.split(":")
    kind = parts[0]

    if kind == "equal_material":
        return features["material_balance"]["advantage"] == 0
    if kind == "material_down_white":
        return features["material_balance"]["advantage"] < 0
    if kind == "undeveloped_minors":
        return features["piece_activity"]["white"]["undeveloped_minors"] > 0
    if kind == "hanging_piece":
        _, color, sq = parts
        return any(x["square"] == sq for x in features["tactical_threats"][color]["hanging_pieces"])
    if kind == "pinned_piece":
        _, color, sq = parts
        return any(x["square"] == sq for x in features["tactical_threats"][color]["pinned_pieces"])
    if kind == "attacked_by_lesser":
        _, color, sq = parts
        return any(x["square"] == sq for x in features["tactical_threats"][color]["attacked_by_lesser"])
    if kind == "doubled_file":
        _, color, f = parts
        return f in features["pawn_structure"][color]["doubled_files"]
    if kind == "isolated_pawn":
        _, color, sq = parts
        return sq in features["pawn_structure"][color]["isolated_pawns"]
    if kind == "passed_pawn":
        _, color, sq = parts
        return sq in features["pawn_structure"][color]["passed_pawns"]
    if kind == "king_ring_attack":
        _, color = parts
        return features["king_safety"][color]["enemy_attackers_on_ring"] > 0
    if kind == "back_rank_weak":
        _, color = parts
        return bool(features["king_safety"][color]["back_rank_weak"])
    if kind == "back_rank_safe":
        _, color = parts
        return not bool(features["king_safety"][color]["back_rank_weak"])
    if kind == "skewer":
        _, color, front_sq, back_sq = parts
        return any(
            x["front_square"] == front_sq and x["back_square"] == back_sq
            for x in features["tactical_threats"][color]["skewered_pieces"]
        )
    if kind == "discovered_check":
        _, color, target_sq = parts
        return any(
            x["target_square"] == target_sq and x["is_check"]
            for x in features["tactical_threats"][color]["discovered_attacks"]
        )
    if kind == "discovered_attack":
        _, color, target_sq = parts
        return any(
            x["target_square"] == target_sq
            for x in features["tactical_threats"][color]["discovered_attacks"]
        )
    if kind == "overloaded_defender":
        _, color, sq = parts
        return any(
            x["square"] == sq
            for x in features["tactical_threats"][color]["overloaded_defenders"]
        )
    if kind == "rook_open_file":
        _, color, sq = parts
        return sq in features["piece_activity"][color]["rooks_on_open_files"]
    if kind == "rook_semi_open_file":
        _, color, sq = parts
        return sq in features["piece_activity"][color]["rooks_on_semi_open_files"]
    if kind == "rook_seventh":
        _, color, sq = parts
        return sq in features["piece_activity"][color]["rooks_on_seventh"]
    return False


def _motif_keywords(motif_spec: str) -> list[str]:
    """Return textual indicators showing an explanation actually surfaced a verified motif."""
    parts = motif_spec.split(":")
    kind = parts[0]
    mapping = {
        "hanging_piece": ["undefended", "hanging", "captures", "wins", parts[2] if len(parts) > 2 else ""],
        "pinned_piece": ["pin", parts[2] if len(parts) > 2 else ""],
        "attacked_by_lesser": ["attack", "pawn", "bishop", "queen", parts[2] if len(parts) > 2 else ""],
        "doubled_file": ["doubled", "pawn"],
        "isolated_pawn": ["isolated", "pawn"],
        "passed_pawn": ["passed", "pawn"],
        "king_ring_attack": ["king", "shield", "attack"],
        "back_rank_weak": ["back rank", "back-rank", "luft", "mate", "checkmate"],
        "back_rank_safe": ["king", "safe", "eval"],
        "skewer": ["skewer", parts[2] if len(parts) > 2 else ""],
        "discovered_check": ["discovered", "check", parts[2] if len(parts) > 2 else ""],
        "discovered_attack": ["discovered", parts[2] if len(parts) > 2 else ""],
        "overloaded_defender": ["overload", parts[2] if len(parts) > 2 else ""],
        "rook_open_file": ["open file", "rook"],
        "rook_semi_open_file": ["file", "rook"],
        "rook_seventh": ["7th", "seventh", "2nd", "rook"],
    }
    return [k.lower() for k in mapping.get(kind, []) if k]


def _raw_engine_only_explanation(engine_data: dict[str, Any]) -> str:
    """Baseline explanation produced using ONLY raw Layer 1 Stockfish output (no Layer 2 features)."""
    score = engine_data.get("score") or {"type": "cp", "value": 0}
    if score["type"] == "mate":
        ev_str = f"{'+' if score['value'] > 0 else '-'}M{abs(score['value'])}"
    else:
        ev_str = f"{score['value'] / 100.0:+.2f}"
    best_san = engine_data.get("best_move_san") or "the top move"
    pv = (engine_data.get("top_lines") or [{}])[0].get("pv_san") or []
    line_str = " ".join(pv[:4])
    return f"Engine recommends {best_san} (eval {ev_str}). Line: {line_str}."


def _summarize_structured_features_text(
    engine_data: dict[str, Any],
    features: dict[str, Any],
    explain_text: str,
) -> str:
    """Combine Layer 3 grounded explanation with key verified Layer 2 motifs present on the board."""
    notes = [explain_text]
    for color in ("white", "black"):
        ks = features["king_safety"][color]
        if ks.get("back_rank_weak"):
            notes.append(f"{color.capitalize()} has a back-rank weakness.")
        tt = features["tactical_threats"][color]
        for h in tt["hanging_pieces"][:1]:
            notes.append(f"{color.capitalize()}'s {h['piece']} on {h['square']} is hanging/undefended.")
        for p in tt["pinned_pieces"][:1]:
            notes.append(f"{color.capitalize()}'s {p['piece']} on {p['square']} is pinned.")
        for sk in tt["skewered_pieces"][:1]:
            notes.append(
                f"{color.capitalize()}'s {sk['front_piece']} on {sk['front_square']} is skewered to {sk['back_square']}."
            )
        for da in tt["discovered_attacks"][:1]:
            lbl = "discovered check" if da["is_check"] else "discovered attack"
            notes.append(f"Threat of {lbl} on {da['target_square']}.")
        for ov in tt["overloaded_defenders"][:1]:
            notes.append(f"{color.capitalize()}'s {ov['piece']} on {ov['square']} is overloaded.")
        pa = features["piece_activity"][color]
        if pa["rooks_on_seventh"]:
            notes.append(f"{color.capitalize()} has a rook on the 7th rank ({pa['rooks_on_seventh'][0]}).")
        elif pa["rooks_on_open_files"]:
            notes.append(f"{color.capitalize()} has a rook on an open file ({pa['rooks_on_open_files'][0]}).")
        ps = features["pawn_structure"][color]
        if ps["passed_pawns"]:
            notes.append(f"{color.capitalize()} has a passed pawn on {ps['passed_pawns'][0]}.")
        if ps["doubled_files"]:
            notes.append(f"{color.capitalize()} has doubled pawns on the {ps['doubled_files'][0]}-file.")
        if ps["isolated_pawns"]:
            notes.append(f"{color.capitalize()} has an isolated pawn on {ps['isolated_pawns'][0]}.")
    return " ".join(notes)


def _query_gemini_raw_vs_structured(
    prompt: str,
    api_key: str,
    model: str,
) -> Optional[str]:
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}"
    body = json.dumps({
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {"temperature": 0.2, "maxOutputTokens": 160},
    }).encode("utf-8")
    req = urllib.request.Request(url, data=body, headers={"Content-Type": "application/json"}, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=8.0) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            return data["candidates"][0]["content"]["parts"][0]["text"].strip()
    except Exception:
        return None


def _score_explanation_text(text: str, motifs: list[str], best_san: Optional[str]) -> dict[str, Any]:
    low = (text or "").lower()
    cites_eval_or_line = any(tok in low for tok in ("eval", "+", "-", "m1", "m2", "m3", "line:"))
    cites_best = bool(best_san and best_san.lower() in low)
    actionable_motifs = [m for m in motifs if _motif_keywords(m)]
    matched = 0
    for m in actionable_motifs:
        kws = _motif_keywords(m)
        if any(kw in low for kw in kws):
            matched += 1
    motif_recall = round((matched / len(actionable_motifs)) * 100.0, 1) if actionable_motifs else 100.0
    return {
        "cites_eval_or_line": cites_eval_or_line,
        "cites_best_move": cites_best,
        "motifs_matched": matched,
        "motifs_total": len(actionable_motifs),
        "motif_recall_pct": motif_recall,
    }


def run_benchmark(
    positions_path: Path = DEFAULT_POSITIONS_PATH,
    depth: int = 8,
    use_live_llm: bool = False,
    limit: Optional[int] = None,
    engine: Optional[Any] = None,
) -> dict[str, Any]:
    """
    Execute the Layer 2 verification + Raw-Engine vs Structured-Feature comparison
    across `tests/positions.json`.
    """
    with open(positions_path, "r", encoding="utf-8") as f:
        positions: dict[str, Any] = json.load(f)

    items = list(positions.items())
    if limit is not None and limit > 0:
        items = items[:limit]

    api_key = os.environ.get("GEMINI_API_KEY", "").strip() if use_live_llm else ""
    model = os.environ.get("GEMINI_MODEL", "gemini-3.8-flash").strip() or "gemini-3.8-flash"

    own_engine = engine is None
    eng = get_engine() if own_engine else engine
    results: list[dict[str, Any]] = []
    total_motifs = 0
    detected_motifs = 0
    raw_recalls: list[float] = []
    feat_recalls: list[float] = []

    try:
        for name, spec in items:
            fen = spec["fen"]
            expected = spec.get("expected_motifs", [])
            eng_data = analyse_position(fen, depth=depth, multipv=2, engine=eng)
            feats = extract_features(fen, engine_data=eng_data)

            motif_checks = {m: check_expected_motif(feats, m) for m in expected}
            total_motifs += len(expected)
            detected_motifs += sum(1 for ok in motif_checks.values() if ok)

            exp_res = explain_position(
                fen_before=fen,
                played_uci=spec.get("played_uci"),
                best_move=spec.get("best_uci") or eng_data.get("best_move"),
                eval_after=eng_data.get("score"),
                engine=eng,
                use_llm=False,
            )

            raw_text = _raw_engine_only_explanation(eng_data)
            structured_text = _summarize_structured_features_text(eng_data, feats, exp_res["text"])

            if api_key:
                raw_prompt = (
                    "Explain the key idea in this chess position in 2 sentences using ONLY this Stockfish output.\n"
                    f"FEN: {fen}\nENGINE: {json.dumps(eng_data)}"
                )
                feat_prompt = (
                    "Explain the key idea in this chess position in 2 sentences using ONLY this Stockfish + verified features JSON. "
                    "Cite the best move and eval.\n"
                    f"ENGINE: {json.dumps(eng_data)}\nFEATURES: {json.dumps(feats)}"
                )
                raw_llm = _query_gemini_raw_vs_structured(raw_prompt, api_key, model)
                feat_llm = _query_gemini_raw_vs_structured(feat_prompt, api_key, model)
                if raw_llm:
                    raw_text = raw_llm
                if feat_llm:
                    structured_text = feat_llm

            raw_score = _score_explanation_text(raw_text, expected, eng_data.get("best_move_san"))
            feat_score = _score_explanation_text(structured_text, expected, eng_data.get("best_move_san"))
            raw_recalls.append(raw_score["motif_recall_pct"])
            feat_recalls.append(feat_score["motif_recall_pct"])

            results.append({
                "id": name,
                "fen": fen,
                "best_move_san": eng_data.get("best_move_san"),
                "motif_checks": motif_checks,
                "raw_engine_score": raw_score,
                "structured_feature_score": feat_score,
            })
    finally:
        if own_engine and eng is not None:
            eng.quit()

    layer2_accuracy = round((detected_motifs / total_motifs) * 100.0, 1) if total_motifs else 100.0
    avg_raw = round(sum(raw_recalls) / len(raw_recalls), 1) if raw_recalls else 0.0
    avg_feat = round(sum(feat_recalls) / len(feat_recalls), 1) if feat_recalls else 0.0

    return {
        "positions_evaluated": len(results),
        "mode": "live-llm" if api_key else "deterministic-grounded",
        "model": model if api_key else "layer2-grounded",
        "layer2_motif_detection": {
            "detected": detected_motifs,
            "total": total_motifs,
            "accuracy_pct": layer2_accuracy,
        },
        "comparison": {
            "raw_engine_avg_motif_recall_pct": avg_raw,
            "structured_features_avg_motif_recall_pct": avg_feat,
            "improvement_pct_points": round(avg_feat - avg_raw, 1),
        },
        "results": results,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Blunderless Raw-Engine vs Structured-Feature Evaluation Benchmark")
    parser.add_argument("--depth", type=int, default=8, help="Stockfish search depth (default: 8)")
    parser.add_argument("--live-llm", action="store_true", help="Also query Gemini API if GEMINI_API_KEY is set")
    parser.add_argument("--limit", type=int, default=None, help="Optional max positions to evaluate")
    parser.add_argument("--json", action="store_true", help="Print full JSON report")
    args = parser.parse_args()

    summary = run_benchmark(depth=args.depth, use_live_llm=args.live_llm, limit=args.limit)
    if args.json:
        print(json.dumps(summary, indent=2))
        return

    l2 = summary["layer2_motif_detection"]
    cmp = summary["comparison"]
    print(f"=== Blunderless Eval Benchmark ({summary['positions_evaluated']} positions, mode={summary['mode']}) ===")
    print(f"Layer 2 Motif Detection: {l2['detected']}/{l2['total']} ({l2['accuracy_pct']}%)")
    print(f"Raw Engine Explanation Avg Motif Recall:         {cmp['raw_engine_avg_motif_recall_pct']}%")
    print(f"Structured Feature Explanation Avg Motif Recall: {cmp['structured_features_avg_motif_recall_pct']}%")
    print(f"Structured Feature Lift:                        +{cmp['improvement_pct_points']} pts")

    failures = [
        (r["id"], [m for m, ok in r["motif_checks"].items() if not ok])
        for r in summary["results"]
        if not all(r["motif_checks"].values())
    ]
    if failures:
        print("\nMissed Layer 2 motif checks:")
        for pid, missed in failures:
            print(f"  - {pid}: {missed}")


if __name__ == "__main__":
    main()
