"""
Multi-Game Insights Aggregator & Background Batch Analyser (`src/insights.py`).

Aggregates cached Stockfish analyses from SQLite across a user's games for a
chosen time control & time period, producing strictly factual metrics:
- ELO progression series, current/peak/delta ELO
- 10-tile KPI summary (avg accuracy, games, win rate, avg ACPL, brilliants, blunders)
- Clickable Highlights (longest win streak, best game, biggest upset, fastest checkmate)
- Accuracy over time, Results breakdown, 10-category Move Quality counts
- Accuracy by Game Phase (Opening / Middlegame / Endgame)
- Conversion Rate (winning positions converted) & Tactics Punishment Rate
- Where Your Mistakes Happen matrix (Phase x Inaccuracy/Mistake/Blunder)
- Blunder Direction (Allowed vs Missed)
- How Your Games End & Openings Repertoire split by White / Black
- Top clickable Brilliants & Great Moves gallery
"""

from __future__ import annotations

import datetime
import secrets
import threading
import time
from collections import defaultdict
from typing import Any, Callable, Optional

import chess

from src.db import (
    delete_saved_report,
    get_games_for_report,
    get_linked_accounts,
    mark_batch_job_cancelled,
    save_game_analysis,
    save_insights_report,
    upsert_batch_job,
)
from src.engine import _score_to_cp, get_engine

_CANCEL_FLAGS: dict[str, threading.Event] = {}
_JOBS_LOCK = threading.Lock()


def _normalize_opening_family(raw_name: str) -> str:
    """Group sub-variations into clean opening family names (e.g. 'Pirc Defense')."""
    name = (raw_name or "").strip()
    if not name or name.lower() in ("starting position", "unknown"):
        return ""
    # Split on ':' (Lichess/ECO standard) or clean long Chess.com slugs
    if ":" in name:
        name = name.split(":", 1)[0].strip()
    # Keep first 3-4 words if it's a long slug without ':'
    for sep in (" Variation", " Attack ", " Defense ", " Opening ", " Gambit "):
        idx = name.find(sep)
        if idx != -1 and sep != " Variation":
            end = idx + len(sep.rstrip())
            if end >= 8:
                name = name[:end].strip()
                break
    return name[:42]


def _format_eval_short(score: Optional[dict[str, Any]]) -> str:
    if not score:
        return "0.00"
    if score.get("type") == "mate":
        val = int(score["value"])
        return "#" if val == 0 else f"{'+' if val > 0 else '-'}M{abs(val)}"
    val = int(score.get("value", 0)) / 100.0
    return f"{'+' if val >= 0 else ''}{val:.2f}"


def aggregate_multi_game_report(
    games: list[dict[str, Any]],
    linked_accounts: list[dict[str, Any]],
    platform: str = "all",
    time_class: str = "rapid",
    period_days: int = 30,
) -> dict[str, Any]:
    """Build the complete ChessRank-inspired vital multi-game Insights report."""
    # Chronological order (oldest -> newest) for streaks, ELO curve, and trends
    ordered = sorted(games, key=lambda g: int(g.get("end_time") or 0))
    total_games = len(ordered)

    wins = sum(1 for g in ordered if g.get("user_result") == "win")
    losses = sum(1 for g in ordered if g.get("user_result") == "loss")
    draws = total_games - wins - losses
    win_rate = round((wins / total_games) * 100.0, 1) if total_games else 0.0

    # ELO progression series from games
    elo_series: list[dict[str, Any]] = []
    for g in ordered:
        elo = g.get("white_elo") if g.get("user_color") == "white" else g.get("black_elo")
        ts = int(g.get("end_time") or 0)
        if elo and ts:
            dt = datetime.datetime.fromtimestamp(ts, tz=datetime.timezone.utc).strftime("%b %d")
            elo_series.append({"ts": ts, "date": dt, "rating": int(elo)})

    current_elo = elo_series[-1]["rating"] if elo_series else None
    start_elo = elo_series[0]["rating"] if elo_series else None
    delta_elo = (current_elo - start_elo) if (current_elo is not None and start_elo is not None) else 0
    period_peak_elo = max((p["rating"] for p in elo_series), default=None)

    # All-time best ELO from linked accounts' stats
    all_time_best = period_peak_elo
    for acc in linked_accounts:
        if platform != "all" and acc.get("platform") != platform:
            continue
        st = (acc.get("stats") or {}).get(time_class) if time_class != "all" else None
        if isinstance(st, dict) and st.get("best"):
            b_val = int(st["best"])
            if all_time_best is None or b_val > all_time_best:
                all_time_best = b_val

    # Highlights: win streak, biggest upset, fastest checkmate, best accuracy
    longest_streak = 0
    cur_streak = 0
    biggest_upset: Optional[dict[str, Any]] = None
    fastest_mate: Optional[dict[str, Any]] = None
    best_game: Optional[dict[str, Any]] = None

    # Analysed game accumulators
    analysed_games = 0
    acc_values: list[float] = []
    acpl_values: list[int] = []
    daily_acc: dict[str, list[float]] = defaultdict(list)

    move_quality = {
        "brilliant": 0, "great": 0, "best": 0, "excellent": 0, "good": 0,
        "book": 0, "inaccuracy": 0, "mistake": 0, "miss": 0, "blunder": 0,
    }
    phase_acc_lists: dict[str, list[float]] = {"opening": [], "middlegame": [], "endgame": []}
    mistakes_matrix: dict[str, dict[str, int]] = {
        "opening": {"inaccuracy": 0, "mistake": 0, "blunder": 0},
        "middlegame": {"inaccuracy": 0, "mistake": 0, "blunder": 0},
        "endgame": {"inaccuracy": 0, "mistake": 0, "blunder": 0},
    }

    winning_games_total = 0
    winning_games_converted = 0
    opp_blunders_total = 0
    opp_blunders_punished = 0

    endings: dict[str, dict[str, int]] = {
        "wins": defaultdict(int),
        "losses": defaultdict(int),
        "draws": defaultdict(int),
    }
    openings_stats: dict[str, dict[str, dict[str, int]]] = {
        "white": defaultdict(lambda: {"games": 0, "wins": 0, "draws": 0, "losses": 0}),
        "black": defaultdict(lambda: {"games": 0, "wins": 0, "draws": 0, "losses": 0}),
    }
    best_moments: list[dict[str, Any]] = []

    # Time-management accumulators across analysed games
    tm_moves_with_clock = 0
    tm_total_spent_sec = 0.0
    tm_time_trouble_moves = 0
    tm_time_trouble_blunders = 0
    tm_rushed_blunders = 0
    tm_total_blunders_clock = 0
    tm_tt_acc_list: list[float] = []
    tm_normal_acc_list: list[float] = []

    for g in ordered:
        res = g.get("user_result", "draw")
        u_col = g.get("user_color", "white")
        opp_name = g.get("black_user") if u_col == "white" else g.get("white_user")
        my_elo = g.get("white_elo") if u_col == "white" else g.get("black_elo")
        opp_elo = g.get("black_elo") if u_col == "white" else g.get("white_elo")

        # Win streak
        if res == "win":
            cur_streak += 1
            longest_streak = max(longest_streak, cur_streak)
        else:
            cur_streak = 0

        # Biggest upset
        if res == "win" and my_elo and opp_elo and opp_elo > my_elo:
            diff = int(opp_elo) - int(my_elo)
            if biggest_upset is None or diff > biggest_upset["diff"]:
                biggest_upset = {
                    "game_id": g["id"],
                    "diff": diff,
                    "opponent": opp_name,
                    "opp_elo": int(opp_elo),
                }

        # How games end
        term = (g.get("termination") or "other").lower()
        bucket = "wins" if res == "win" else ("losses" if res == "loss" else "draws")
        endings[bucket][term] += 1

        # Fastest checkmate
        if res == "win" and term == "checkmate" and g.get("total_moves"):
            mv_cnt = int(g["total_moves"])
            if mv_cnt > 0 and (fastest_mate is None or mv_cnt < fastest_mate["moves"]):
                fastest_mate = {
                    "game_id": g["id"],
                    "moves": mv_cnt,
                    "opponent": opp_name,
                }

        # Openings split by color
        fam = _normalize_opening_family(g.get("opening_name", ""))
        if fam:
            st = openings_stats[u_col][fam]
            st["games"] += 1
            if res == "win":
                st["wins"] += 1
            elif res == "loss":
                st["losses"] += 1
            else:
                st["draws"] += 1

        # Analysed game deep stats
        if g.get("analysed") and g.get("user_accuracy") is not None:
            analysed_games += 1
            u_acc = float(g["user_accuracy"])
            acc_values.append(u_acc)
            if g.get("user_acpl") is not None:
                acpl_values.append(int(g["user_acpl"]))

            ts = int(g.get("end_time") or 0)
            if ts:
                day_key = datetime.datetime.fromtimestamp(ts, tz=datetime.timezone.utc).strftime("%m-%d")
                daily_acc[day_key].append(u_acc)

            if best_game is None or u_acc > best_game["accuracy"]:
                best_game = {
                    "game_id": g["id"],
                    "accuracy": round(u_acc, 1),
                    "opponent": opp_name,
                    "result": res,
                }

            analysis = g.get("analysis") or {}
            moves = analysis.get("moves") or []
            game_rep = (analysis.get("report") or {}).get(u_col) or {}
            stages = game_rep.get("stages") or {}
            phase_ranges = (analysis.get("report") or {}).get("phase_ranges") or {}

            for st_name in ("opening", "middlegame", "endgame"):
                st_obj = stages.get(st_name) or {}
                if st_obj.get("reached") and st_obj.get("accuracy") is not None:
                    phase_acc_lists[st_name].append(float(st_obj["accuracy"]))

            # Aggregate per-game clock diagnostics (back-computing if game was cached before clock feature)
            side_clock = game_rep.get("clock")
            if not side_clock and moves and any(m.get("clock_seconds") is not None for m in moves):
                from src.report import compute_clock_analysis
                side_clock = compute_clock_analysis(
                    moves, headers=analysis.get("headers") or {"time_control": g.get("time_control", "")}
                ).get(u_col)
            if side_clock and side_clock.get("has_clock_data"):
                m_cnt = int(side_clock.get("moves_with_clock") or 0)
                if m_cnt > 0 and side_clock.get("avg_time_spent") is not None:
                    tm_moves_with_clock += m_cnt
                    tm_total_spent_sec += float(side_clock["avg_time_spent"]) * m_cnt
                tm_time_trouble_moves += int(side_clock.get("time_trouble_moves") or 0)
                tm_time_trouble_blunders += int(side_clock.get("time_trouble_blunders") or 0)
                tm_rushed_blunders += int(side_clock.get("rushed_blunders") or 0)
                tm_total_blunders_clock += int(side_clock.get("total_blunders_with_clock") or 0)
                if side_clock.get("time_trouble_accuracy") is not None:
                    tm_tt_acc_list.append(float(side_clock["time_trouble_accuracy"]))
                if side_clock.get("normal_accuracy") is not None:
                    tm_normal_acc_list.append(float(side_clock["normal_accuracy"]))

            # Helper to map move_number -> phase from saved report ranges
            def _phase_for_move(mv_num: int) -> str:
                eg_r = phase_ranges.get("endgame")
                if eg_r and mv_num >= eg_r[0]:
                    return "endgame"
                op_r = phase_ranges.get("opening")
                if op_r and mv_num <= op_r[1]:
                    return "opening"
                return "middlegame"

            reached_winning = False
            sign = 1 if u_col == "white" else -1
            for idx, m in enumerate(moves):
                m_col = m.get("color")
                clf = (m.get("classification") or "good").lower()
                turn_after = chess.BLACK if m_col == "white" else chess.WHITE
                cp_white = _score_to_cp(m.get("eval_after") or {"type": "cp", "value": 0}, turn_after)
                if cp_white * sign >= 250:
                    reached_winning = True

                if m_col == u_col:
                    if clf in move_quality:
                        move_quality[clf] += 1
                    if clf in ("inaccuracy", "mistake", "blunder"):
                        ph = _phase_for_move(int(m.get("move_number") or 1))
                        mistakes_matrix[ph][clf] += 1
                    if clf in ("brilliant", "great") and len(best_moments) < 16:
                        best_moments.append({
                            "game_id": g["id"],
                            "ply": m["ply"],
                            "move_number": m["move_number"],
                            "san": m["san"],
                            "classification": clf,
                            "opponent": opp_name,
                            "eval_after": _format_eval_short(m.get("eval_after")),
                        })
                else:
                    # Did opponent blunder and did user punish it on the very next ply?
                    if clf == "blunder" and idx + 1 < len(moves):
                        opp_blunders_total += 1
                        reply_clf = (moves[idx + 1].get("classification") or "").lower()
                        if reply_clf not in ("miss", "blunder", "mistake"):
                            opp_blunders_punished += 1

            if reached_winning:
                winning_games_total += 1
                if res == "win":
                    winning_games_converted += 1

    # Sort best moments: Brilliants first
    best_moments.sort(key=lambda x: (0 if x["classification"] == "brilliant" else 1, -x["move_number"]))

    avg_acc = round(sum(acc_values) / len(acc_values), 1) if acc_values else None
    avg_acpl = int(round(sum(acpl_values) / len(acpl_values))) if acpl_values else None
    blunders_total = move_quality["blunder"]
    misses_total = move_quality["miss"]
    brilliants_total = move_quality["brilliant"]
    blunders_per_game = round(blunders_total / analysed_games, 2) if analysed_games else 0.0

    # Daily accuracy series with 3-point moving average
    acc_series: list[dict[str, Any]] = []
    raw_daily = [(day, round(sum(vals) / len(vals), 1), len(vals)) for day, vals in daily_acc.items()]
    for i, (day, val, cnt) in enumerate(raw_daily):
        win_slice = [x[1] for x in raw_daily[max(0, i - 2): i + 1]]
        acc_series.append({
            "date": day,
            "accuracy": val,
            "moving_avg": round(sum(win_slice) / len(win_slice), 1),
            "games": cnt,
        })

    phase_accuracy = {
        ph: (round(sum(vals) / len(vals), 1) if vals else None)
        for ph, vals in phase_acc_lists.items()
    }

    conv_rate = round((winning_games_converted / winning_games_total) * 100) if winning_games_total else None
    tac_rate = round((opp_blunders_punished / opp_blunders_total) * 100) if opp_blunders_total else None

    dir_total = blunders_total + misses_total
    allowed_pct = round((blunders_total / dir_total) * 100) if dir_total else 50
    missed_pct = 100 - allowed_pct if dir_total else 50

    def _format_openings(side_dict: dict[str, dict[str, int]]) -> list[dict[str, Any]]:
        rows = []
        for name, st in side_dict.items():
            cnt = st["games"]
            wr = round((st["wins"] / cnt) * 100) if cnt else 0
            rows.append({
                "name": name,
                "games": cnt,
                "wins": st["wins"],
                "draws": st["draws"],
                "losses": st["losses"],
                "win_rate": wr,
            })
        rows.sort(key=lambda r: (-r["games"], -r["win_rate"]))
        return rows[:10]

    # Chester's grounded multi-game verdict
    valid_phases = [(k, v) for k, v in phase_accuracy.items() if v is not None]
    best_ph = max(valid_phases, key=lambda x: x[1])[0] if valid_phases else "opening"
    weak_ph = min(valid_phases, key=lambda x: x[1])[0] if valid_phases else "middlegame"

    if analysed_games == 0:
        chester_verdict = (
            f"Loaded {total_games} games ({win_rate}% win rate). Click Analyze to run Stockfish "
            f"across these games and unlock phase accuracy, tactics punishment, and blunder patterns."
        )
    elif blunders_per_game >= 2.2:
        chester_verdict = (
            f"Alright, {analysed_games} games analysed ({avg_acc}% avg accuracy, {blunders_per_game} blunders/game). "
            f"Your {best_ph} ({phase_accuracy.get(best_ph)}%) is carrying the team, while the {weak_ph} "
            f"({phase_accuracy.get(weak_ph)}%) is where the chaos lives. Cut those {weak_ph} blunders in half and watch your ELO jump!"
        )
    else:
        if len(valid_phases) >= 2 and best_ph != weak_ph:
            phase_note = (
                f"Your strongest phase is the {best_ph} ({phase_accuracy.get(best_ph)}%), and tightening up your "
                f"{weak_ph} ({phase_accuracy.get(weak_ph)}%) plus punishing opponent blunders "
                f"({tac_rate if tac_rate is not None else '—'}%) is your fastest path up."
            )
        else:
            phase_note = (
                f"Your {best_ph} averaged {phase_accuracy.get(best_ph)}%, and punishing opponent blunders "
                f"({tac_rate if tac_rate is not None else '—'}%) is a high-impact edge to build on."
            )
        chester_verdict = (
            f"Across {analysed_games} analysed games, you averaged {avg_acc}% accuracy ({avg_acpl} ACPL) "
            f"with a {win_rate}% win rate. {phase_note}"
        )

    tm_other_blunders = max(0, tm_total_blunders_clock - tm_rushed_blunders - tm_time_trouble_blunders)
    time_management = {
        "has_clock_data": tm_moves_with_clock > 0,
        "moves_with_clock": tm_moves_with_clock,
        "avg_time_per_move": round(tm_total_spent_sec / tm_moves_with_clock, 1) if tm_moves_with_clock else None,
        "time_trouble_moves": tm_time_trouble_moves,
        "time_trouble_blunders": tm_time_trouble_blunders,
        "rushed_blunders": tm_rushed_blunders,
        "other_blunders": tm_other_blunders,
        "total_blunders_with_clock": tm_total_blunders_clock,
        "rushed_blunder_pct": round((tm_rushed_blunders / tm_total_blunders_clock) * 100) if tm_total_blunders_clock else 0,
        "time_trouble_blunder_pct": round((tm_time_trouble_blunders / tm_total_blunders_clock) * 100) if tm_total_blunders_clock else 0,
        "time_trouble_accuracy": round(sum(tm_tt_acc_list) / len(tm_tt_acc_list), 1) if tm_tt_acc_list else None,
        "normal_time_accuracy": round(sum(tm_normal_acc_list) / len(tm_normal_acc_list), 1) if tm_normal_acc_list else None,
    }

    return {
        "meta": {
            "platform": platform,
            "time_class": time_class,
            "period_days": period_days,
            "generated_at": int(time.time()),
        },
        "chester_verdict": chester_verdict,
        "elo": {
            "current": current_elo,
            "delta": delta_elo,
            "period_peak": period_peak_elo,
            "all_time_best": all_time_best,
            "series": elo_series,
        },
        "kpis": {
            "avg_accuracy": avg_acc,
            "games": total_games,
            "analysed_games": analysed_games,
            "win_rate": win_rate,
            "avg_acpl": avg_acpl,
            "brilliants": brilliants_total,
            "blunders": blunders_total,
            "blunders_per_game": blunders_per_game,
            "best_game_accuracy": best_game["accuracy"] if best_game else None,
            "period_peak_elo": period_peak_elo,
            "all_time_best_elo": all_time_best,
        },
        "highlights": {
            "longest_win_streak": longest_streak,
            "best_game": best_game,
            "biggest_upset": biggest_upset,
            "fastest_mate": fastest_mate,
        },
        "accuracy_over_time": acc_series,
        "results": {"wins": wins, "draws": draws, "losses": losses},
        "move_quality": move_quality,
        "phase_accuracy": phase_accuracy,
        "conversion": {
            "rate": conv_rate,
            "won": winning_games_converted,
            "total": winning_games_total,
        },
        "tactics_punishment": {
            "rate": tac_rate,
            "punished": opp_blunders_punished,
            "total": opp_blunders_total,
        },
        "mistakes_matrix": mistakes_matrix,
        "blunder_direction": {
            "allowed": blunders_total,
            "missed": misses_total,
            "allowed_pct": allowed_pct,
            "missed_pct": missed_pct,
        },
        "time_management": time_management,
        "game_endings": {k: dict(v) for k, v in endings.items()},
        "openings": {
            "white": _format_openings(openings_stats["white"]),
            "black": _format_openings(openings_stats["black"]),
        },
        "best_moments": best_moments[:8],
    }


def cancel_batch_job(job_id: str) -> None:
    """Signal the running worker to stop immediately and discard any report for this job."""
    with _JOBS_LOCK:
        ev = _CANCEL_FLAGS.get(job_id)
        if ev:
            ev.set()
    mark_batch_job_cancelled(job_id)


def start_batch_analysis_job(
    user_id: int,
    platform: str,
    time_class: str,
    period_days: int,
    max_games: int,
    depth: int,
    analyse_fn: Callable[..., dict[str, Any]],
) -> dict[str, Any]:
    """
    Start a background Stockfish batch analysis thread for the user's games
    matching (platform, time_class, period_days). Reuses cached SQLite analyses
    instantly and persists every newly analysed game as it completes.
    If cancelled, stops mid-game and does NOT save a partial report.
    """
    games = get_games_for_report(
        user_id=user_id,
        platform=platform,
        time_class=time_class,
        period_days=period_days,
        max_games=max_games,
    )
    job_id = secrets.token_hex(8)
    now = int(time.time())
    period_label = "All time" if period_days <= 0 else f"{period_days} days"
    tc_label = time_class.capitalize() if time_class != "all" else "All modes"
    report_label = f"{tc_label} · {period_label}"

    job: dict[str, Any] = {
        "id": job_id,
        "user_id": user_id,
        "status": "running",
        "platform": platform,
        "time_class": time_class,
        "period_days": period_days,
        "total_games": len(games),
        "completed_games": 0,
        "cached_games": 0,
        "brilliants_found": 0,
        "current_label": "Starting analysis...",
        "report_id": None,
        "error": "",
        "created_at": now,
    }
    upsert_batch_job(job)

    cancel_ev = threading.Event()
    with _JOBS_LOCK:
        _CANCEL_FLAGS[job_id] = cancel_ev

    def _call_analyse(pgn: str, engine: Any) -> dict[str, Any]:
        try:
            return analyse_fn(pgn, depth=depth, engine=engine, cancel_event=cancel_ev)
        except TypeError:
            # Backward compatibility for simple analyse_fn stubs in tests
            return analyse_fn(pgn, depth=depth, engine=engine)

    def _worker() -> None:
        worker_eng = None
        try:
            unanalysed = [g for g in games if not g.get("analysed")]
            if unanalysed and not cancel_ev.is_set():
                worker_eng = get_engine()

            completed = 0
            cached = 0
            brilliants_found = 0

            for g in games:
                if cancel_ev.is_set():
                    break

                opp = g["black_user"] if g["user_color"] == "white" else g["white_user"]
                if g.get("analysed") and g.get("analysis"):
                    cached += 1
                    completed += 1
                    brilliants_found += int(g.get("brilliants") or 0)
                else:
                    job["current_label"] = f"Analysing vs {opp} ({completed + 1}/{len(games)})..."
                    upsert_batch_job(job)
                    try:
                        analysis = _call_analyse(g["pgn"], worker_eng)
                        if cancel_ev.is_set():
                            break
                        save_game_analysis(g["id"], analysis, g["user_color"])
                        b_in_game = sum(
                            1 for m in (analysis.get("moves") or [])
                            if m.get("color") == g["user_color"] and m.get("classification") == "brilliant"
                        )
                        brilliants_found += b_in_game
                    except InterruptedError:
                        break
                    except Exception:
                        pass
                    completed += 1

                if cancel_ev.is_set():
                    break
                job["completed_games"] = completed
                job["cached_games"] = cached
                job["brilliants_found"] = brilliants_found
                upsert_batch_job(job)

            # Cancelled jobs must NEVER save or return a report
            if cancel_ev.is_set():
                job["status"] = "cancelled"
                job["report_id"] = None
                job["current_label"] = "Cancelled — no report saved."
                upsert_batch_job(job)
                return

            fresh_games = get_games_for_report(
                user_id=user_id,
                platform=platform,
                time_class=time_class,
                period_days=period_days,
                max_games=max_games,
            )
            linked = get_linked_accounts(user_id)
            report_data = aggregate_multi_game_report(
                games=fresh_games,
                linked_accounts=linked,
                platform=platform,
                time_class=time_class,
                period_days=period_days,
            )

            # Re-check right before saving in case cancel arrived during aggregation
            if cancel_ev.is_set():
                job["status"] = "cancelled"
                job["report_id"] = None
                job["current_label"] = "Cancelled — no report saved."
                upsert_batch_job(job)
                return

            report_id = save_insights_report(
                user_id=user_id,
                platform=platform,
                time_class=time_class,
                period_days=period_days,
                label=report_label,
                report_data=report_data,
            )

            # If cancel raced right after insert, delete the freshly saved report
            if cancel_ev.is_set():
                delete_saved_report(report_id, user_id)
                job["status"] = "cancelled"
                job["report_id"] = None
                job["current_label"] = "Cancelled — no report saved."
                upsert_batch_job(job)
                return

            job["report_id"] = report_id
            job["status"] = "done"
            job["current_label"] = f"Report ready ({len(fresh_games)} games)!"
            upsert_batch_job(job)
        except Exception as exc:
            if cancel_ev.is_set():
                job["status"] = "cancelled"
                job["report_id"] = None
                job["current_label"] = "Cancelled — no report saved."
            else:
                job["status"] = "failed"
                job["error"] = str(exc)
                job["current_label"] = f"Error: {exc}"
            upsert_batch_job(job)
        finally:
            if worker_eng is not None:
                try:
                    worker_eng.quit()
                except Exception:
                    pass
            with _JOBS_LOCK:
                _CANCEL_FLAGS.pop(job_id, None)

    threading.Thread(target=_worker, daemon=True).start()
    return job
