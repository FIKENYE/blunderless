"""
FastAPI backend for Blunderless.

Serves the web UI and exposes endpoints for:
- Analysing a single FEN (Layer 1 + Layer 2)
- Parsing and evaluating a full PGN game move-by-move (including clocks & headers)
- Fetching the last 5 games for a Chess.com username
"""

from contextlib import asynccontextmanager
import hashlib
import io
import json
import math
import os
from pathlib import Path
import queue
import threading
from typing import Any, Callable, Optional
import urllib.parse
import urllib.request

import chess
import chess.pgn
from fastapi import FastAPI, HTTPException, Query, Request, Response
from fastapi.responses import FileResponse, JSONResponse, RedirectResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from src.auth import (
    OAUTH_STATE_COOKIE,
    SESSION_COOKIE,
    create_google_login_url,
    get_google_config,
    is_google_configured,
    login_local_profile,
    login_password_account,
    logout_session,
    register_password_account,
    resolve_user,
    verify_and_exchange_google_code,
)
from src.chesscom import (
    build_rating_history_from_games,
    get_player_profile,
    get_player_stats,
    get_recent_games,
)
from src.db import (
    delete_linked_account,
    delete_saved_report,
    get_batch_job,
    get_cached_analysis_by_pgn,
    get_game_by_id,
    get_linked_accounts,
    get_saved_report,
    get_storage_mode,
    get_user_preferences,
    init_db,
    list_saved_reports,
    query_games,
    save_game_analysis,
    update_user_preferences,
    upsert_games,
    upsert_linked_account,
)
from src.engine import (
    _score_to_cp,
    analyse_position,
    get_engine,
    reset_engine_hash,
)
from src.features import extract_features
from src.explain import explain_position
from src.insights import cancel_batch_job, start_batch_analysis_job
from src.lichess import (
    get_lichess_games,
    get_lichess_profile_and_stats,
    get_lichess_rating_history,
)
from src.openings import is_book_position, lookup_opening
from src.report import build_game_report

# In-memory cache for PGN analyses so re-running is instant and 100% deterministic
_PGN_CACHE: dict[tuple[str, int], dict[str, Any]] = {}
_PGN_CACHE_MAX = 32

WEB_DIR = Path("web")


class FenRequest(BaseModel):
    fen: str
    depth: int = Field(default=12, ge=1, le=22)


class PgnRequest(BaseModel):
    pgn: str
    depth: int = Field(default=10, ge=1, le=20)
    game_id: Optional[int] = None


class LocalLoginRequest(BaseModel):
    display_name: str = Field(..., min_length=1, max_length=48)


class RegisterAccountRequest(BaseModel):
    identifier: str = Field(..., min_length=3, max_length=120)
    password: str = Field(..., min_length=6, max_length=128)
    display_name: Optional[str] = Field(default="", max_length=48)


class LoginAccountRequest(BaseModel):
    identifier: str = Field(..., min_length=1, max_length=120)
    password: str = Field(..., min_length=1, max_length=128)


class PreferencesPatchRequest(BaseModel):
    theme: Optional[str] = Field(default=None, pattern="^(light|dark)$")
    sound: Optional[bool] = None
    coords: Optional[bool] = None
    tone: Optional[str] = Field(default=None, pattern="^(instructive|analytical|sarcastic)$")
    depth: Optional[int] = Field(default=None, ge=6, le=18)


class LinkAccountRequest(BaseModel):
    platform: str = Field(..., pattern="^(chesscom|lichess)$")
    username: str = Field(..., min_length=1, max_length=64)
    sync_limit: int = Field(default=60, ge=5, le=200)


class SyncGamesRequest(BaseModel):
    platform: str = Field(default="all", pattern="^(all|chesscom|lichess)$")
    limit: int = Field(default=60, ge=5, le=200)
    days: Optional[int] = Field(default=None, ge=1, le=3650)


class InsightsAnalyzeRequest(BaseModel):
    platform: str = Field(default="all", pattern="^(all|chesscom|lichess)$")
    time_class: str = Field(default="rapid", pattern="^(all|bullet|blitz|rapid|daily)$")
    period_days: int = Field(default=30, ge=0, le=3650)
    max_games: int = Field(default=50, ge=0, le=5000)
    depth: int = Field(default=8, ge=6, le=16)
    sync_first: bool = Field(default=True)


class ExplainRequest(BaseModel):
    fen_before: str
    played_uci: Optional[str] = None
    played_san: Optional[str] = None
    classification: Optional[str] = None
    eval_after: Optional[dict[str, Any]] = None
    eval_change: Optional[int] = None
    best_move: Optional[str] = None
    best_move_san: Optional[str] = None
    tone: Optional[str] = "instructive"
    mover_name: Optional[str] = None
    is_user_move: Optional[bool] = True


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialise SQLite database and keep one Stockfish engine alive for the server."""
    init_db()
    engine = get_engine()
    app.state.engine = engine
    try:
        yield
    finally:
        engine.quit()


app = FastAPI(title="Blunderless", lifespan=lifespan)
init_db()

if WEB_DIR.exists():
    app.mount("/static", StaticFiles(directory=str(WEB_DIR)), name="static")


_APP_ENGINE_LOCK = threading.Lock()


def _get_app_engine(request: Request) -> Optional[Any]:
    """Return the shared Stockfish engine, auto-restarting it if the process died."""
    eng = getattr(request.app.state, "engine", None)
    if eng is None:
        return None
    # python-chess sets transport/returncode if the child process terminated
    proc = getattr(getattr(eng, "protocol", None), "transport", None)
    if proc is not None and proc.is_closing():
        with _APP_ENGINE_LOCK:
            try:
                eng.quit()
            except Exception:
                pass
            eng = get_engine()
            request.app.state.engine = eng
    return eng


def _is_https_request(request: Request) -> bool:
    """Detect HTTPS directly or behind reverse proxies (Render, Railway, Cloudflare)."""
    headers = getattr(request, "headers", None)
    if headers:
        forwarded = headers.get("x-forwarded-proto", "").split(",")[0].strip().lower()
        if forwarded == "https":
            return True
    return getattr(request.url, "scheme", "http") == "https"


def _set_session_cookie(response: Response, token: str, request: Request) -> None:
    response.set_cookie(
        key=SESSION_COOKIE,
        value=token,
        httponly=True,
        samesite="lax",
        secure=_is_https_request(request),
        max_age=30 * 86400,
    )


def _format_clock(seconds: Optional[float]) -> Optional[str]:
    """Convert remaining seconds from PGN [%clk] tag to MM:SS or H:MM:SS."""
    if seconds is None:
        return None
    total = max(0, int(round(seconds)))
    hrs, rem = divmod(total, 3600)
    mins, secs = divmod(rem, 60)
    if hrs > 0:
        return f"{hrs}:{mins:02d}:{secs:02d}"
    return f"{mins:02d}:{secs:02d}"


def _cp_to_ep(cp_from_mover: int) -> float:
    """Convert centipawns (from mover's POV) to Expected Points [0.0, 1.0]."""
    clamped = max(-4000, min(4000, cp_from_mover))
    return 1.0 / (1.0 + math.exp(-0.00368208 * clamped))


def _material_balance(board: chess.Board, color: chess.Color) -> int:
    """Compute simple piece material (excluding pawns/king) for sacrifice detection."""
    values = {chess.KNIGHT: 3, chess.BISHOP: 3, chess.ROOK: 5, chess.QUEEN: 9}
    return sum(len(board.pieces(pt, color)) * val for pt, val in values.items())


def _classify_move_full(
    board_before: chess.Board,
    move: chess.Move,
    board_after: chess.Board,
    prev_info: dict[str, Any],
    after_info: dict[str, Any],
    in_book: bool,
    prev_move: Optional[chess.Move] = None,
) -> tuple[str, int, float]:
    """
    Classify a move into one of the 10 categories:
    brilliant, great, best, excellent, good, book, inaccuracy, mistake, miss, blunder.
    Returns (classification, eval_change_cp, epl).
    """
    mover_color = board_before.turn
    move_uci = move.uci()
    is_best = move_uci == prev_info.get("best_move")

    # White-POV scores normalized to mover's POV
    cp_before_white = _score_to_cp(prev_info["score"], mover_color)
    cp_after_white = _score_to_cp(after_info["score"], board_after.turn)
    sign = 1 if mover_color == chess.WHITE else -1

    cp_before_mover = cp_before_white * sign
    cp_after_mover = cp_after_white * sign
    eval_change = cp_after_mover - cp_before_mover

    ep_best = _cp_to_ep(cp_before_mover)
    ep_after = _cp_to_ep(cp_after_mover)
    epl = max(0.0, ep_best - ep_after)

    if in_book:
        return "book", eval_change, round(epl, 4)

    # Brilliant (!!): sound, non-forced piece sacrifice in non-winning, non-losing position
    mat_before = _material_balance(board_before, mover_color)
    mat_after = _material_balance(board_after, mover_color)
    opp_can_capture_value = 0
    if not board_after.is_game_over():
        dest_piece = board_after.piece_at(move.to_square)
        if dest_piece and dest_piece.piece_type in (chess.KNIGHT, chess.BISHOP, chess.ROOK, chess.QUEEN):
            if board_after.is_attacked_by(not mover_color, move.to_square):
                opp_can_capture_value = {chess.KNIGHT: 3, chess.BISHOP: 3, chess.ROOK: 5, chess.QUEEN: 9}[dest_piece.piece_type]

    is_sacrifice = (mat_after < mat_before) or (opp_can_capture_value >= 3 and not board_before.is_capture(move))
    is_forced = board_before.legal_moves.count() <= 1
    if epl <= 0.02 and is_sacrifice and not is_forced and (0.25 <= ep_best <= 0.80):
        return "brilliant", eval_change, round(epl, 4)

    # Great (!): 0.00 EPL and only good move / outcome swing, EXCLUDING trivial recaptures & forced check escapes
    is_trivial_recapture = (
        prev_move is not None
        and board_before.is_capture(move)
        and move.to_square == prev_move.to_square
    )
    is_forced_check_escape = board_before.is_check() and board_before.legal_moves.count() <= 2

    top_lines = prev_info.get("top_lines") or []
    only_good = False
    if len(top_lines) >= 2 and ep_best >= 0.45:
        cp_second_white = _score_to_cp(top_lines[1]["score"], mover_color)
        ep_second = _cp_to_ep(cp_second_white * sign)
        if (ep_best - ep_second) >= 0.15:
            only_good = True
    swings_outcome = (
        ep_best >= 0.55
        and len(top_lines) >= 2
        and _cp_to_ep(_score_to_cp(top_lines[1]["score"], mover_color) * sign) < 0.42
    )

    if is_best and (only_good or swings_outcome) and not is_trivial_recapture and not is_forced_check_escape:
        return "great", eval_change, round(epl, 4)

    if is_best or epl <= 0.001:
        return "best", eval_change, round(epl, 4)
    if epl <= 0.02:
        return "excellent", eval_change, round(epl, 4)
    if epl <= 0.05:
        return "good", eval_change, round(epl, 4)
    if epl <= 0.10:
        return "inaccuracy", eval_change, round(epl, 4)

    # Miss (x): failing to punish an opponent's error to gain/keep a winning position
    if ep_best >= 0.70 and ep_after < 0.60:
        return "miss", eval_change, round(epl, 4)

    if epl <= 0.20:
        return "mistake", eval_change, round(epl, 4)
    return "blunder", eval_change, round(epl, 4)


def _compute_game_summary(
    moves_out: list[dict[str, Any]],
    initial_eval: Optional[dict[str, Any]] = None,
) -> dict[str, Any]:
    """
    Compute authentic Lichess open-source Accuracy % (volatility-weighted mean
    + harmonic mean of win% accuracy), Average Centipawn Loss (ACPL), and
    ACPL-calibrated Game Rating.
    """
    if not moves_out:
        return {
            "white_accuracy": None,
            "black_accuracy": None,
            "white_game_rating": None,
            "black_game_rating": None,
            "white_acpl": None,
            "black_acpl": None,
        }

    # Build full game White-POV win% series [ply 0, ply 1, ..., ply N]
    init_cp = _score_to_cp(initial_eval, chess.WHITE) if initial_eval else 20
    win_pcts: list[float] = [_cp_to_ep(init_cp) * 100.0]
    for m in moves_out:
        turn_after = chess.BLACK if m["color"] == "white" else chess.WHITE
        cp_after = _score_to_cp(m["eval_after"], turn_after)
        win_pcts.append(_cp_to_ep(cp_after) * 100.0)

    # Volatility weights per ply using sliding window stddev (Lichess AccuracyPercent.scala)
    n_plies = len(moves_out)
    win_size = max(2, min(8, n_plies // 10 or 2))
    weights: list[float] = []
    for i in range(n_plies):
        start = max(0, i - win_size // 2)
        end = min(len(win_pcts), start + win_size)
        window = win_pcts[start:end]
        mean_w = sum(window) / len(window)
        var_w = sum((x - mean_w) ** 2 for x in window) / len(window)
        stddev = math.sqrt(var_w)
        weights.append(max(0.5, min(12.0, stddev)))

    def side_metrics(color: str) -> tuple[Optional[float], Optional[int], Optional[int]]:
        move_accs: list[float] = []
        side_weights: list[float] = []
        cpl_list: list[int] = []

        for idx, m in enumerate(moves_out):
            if m["color"] != color:
                continue
            win_loss = float(m.get("epl", 0.0)) * 100.0
            # Lichess exact formula: 103.1668 * exp(-0.04354 * winDiff) - 3.1669
            acc = max(0.0, min(100.0, 103.1668 * math.exp(-0.04354 * win_loss) - 3.1669))
            move_accs.append(acc)
            side_weights.append(weights[idx])

            cpl = min(1000, max(0, -int(m.get("eval_change", 0))))
            cpl_list.append(cpl)

        if not move_accs:
            return None, None, None

        total_w = sum(side_weights)
        weighted_mean = sum(a * w for a, w in zip(move_accs, side_weights)) / total_w
        # Harmonic mean with small floor (1.0) to avoid division by zero on 0.0% blunders
        harmonic_mean = len(move_accs) / sum(1.0 / max(1.0, a) for a in move_accs)
        accuracy = round((weighted_mean + harmonic_mean) / 2.0, 1)

        acpl = int(round(sum(cpl_list) / len(cpl_list)))
        raw_rating = 2900.0 * math.exp(-0.0165 * acpl)
        rounded_rating = int(max(100, min(3000, round(raw_rating / 50.0) * 50)))
        return accuracy, rounded_rating, acpl

    w_acc, w_rat, w_acpl = side_metrics("white")
    b_acc, b_rat, b_acpl = side_metrics("black")
    return {
        "white_accuracy": w_acc,
        "black_accuracy": b_acc,
        "white_game_rating": w_rat,
        "black_game_rating": b_rat,
        "white_acpl": w_acpl,
        "black_acpl": b_acpl,
    }


def parse_and_analyse_pgn(
    pgn_text: str,
    depth: int = 10,
    engine: Optional[Any] = None,
    cancel_event: Optional[threading.Event] = None,
    progress_cb: Optional[Callable[[int, int, str], None]] = None,
) -> dict[str, Any]:
    """
    Parse a PGN string and evaluate each move sequentially, extracting
    [%clk] timestamps, ratings, opening tags, and 10-tier EPL classifications.
    Checks `cancel_event` before every ply so batch jobs stop almost instantly.
    """
    if not pgn_text or not pgn_text.strip():
        raise ValueError("PGN text cannot be empty.")

    if cancel_event is not None and cancel_event.is_set():
        raise InterruptedError("Analysis cancelled.")

    cache_key = (hashlib.sha256(pgn_text.strip().encode("utf-8")).hexdigest(), depth)
    if cache_key in _PGN_CACHE:
        cached_res = _PGN_CACHE[cache_key]
        if progress_cb is not None:
            total = len(cached_res.get("moves") or [])
            progress_cb(total, total, "")
        return cached_res

    game = chess.pgn.read_game(io.StringIO(pgn_text))
    if game is None:
        raise ValueError("Could not parse PGN.")

    nodes = list(game.mainline())
    if not nodes:
        raise ValueError("PGN contains no moves.")

    total_plies = len(nodes)
    reset_engine_hash(engine)

    board = game.board()
    initial_fen = board.fen()
    if cancel_event is not None and cancel_event.is_set():
        raise InterruptedError("Analysis cancelled.")
    if progress_cb is not None:
        progress_cb(0, total_plies, "")
    prev_info = analyse_position(initial_fen, depth=depth, multipv=2, engine=engine)
    initial_eval = prev_info["score"]
    initial_top_lines = [
        {"score": ln["score"], "move_san": ln["move_san"], "pv_san": ln["pv_san"][:6]}
        for ln in (prev_info.get("top_lines") or [])[:2]
    ]
    still_in_book = is_book_position(initial_fen)
    prev_move: Optional[chess.Move] = None

    moves_out: list[dict[str, Any]] = []
    for ply_idx, node in enumerate(nodes, start=1):
        if cancel_event is not None and cancel_event.is_set():
            raise InterruptedError("Analysis cancelled.")
        move = node.move
        mover_color = board.turn
        move_uci = move.uci()
        move_san = board.san(move)
        clk_seconds = node.clock()
        board_before = board.copy()

        board.push(move)
        after_fen = board.fen()
        after_info = analyse_position(after_fen, depth=depth, multipv=2, engine=engine)

        if still_in_book:
            still_in_book = is_book_position(after_fen)

        classification, eval_change, epl = _classify_move_full(
            board_before=board_before,
            move=move,
            board_after=board,
            prev_info=prev_info,
            after_info=after_info,
            in_book=still_in_book,
            prev_move=prev_move,
        )

        after_top_lines = [
            {"score": ln["score"], "move_san": ln["move_san"], "pv_san": ln["pv_san"][:6]}
            for ln in (after_info.get("top_lines") or [])[:2]
        ]

        moves_out.append(
            {
                "ply": ply_idx,
                "move_number": (ply_idx + 1) // 2,
                "color": "white" if mover_color == chess.WHITE else "black",
                "uci": move_uci,
                "san": move_san,
                "fen": after_fen,
                "clock": _format_clock(clk_seconds),
                "clock_seconds": clk_seconds,
                "best_move": prev_info["best_move"],
                "best_move_san": prev_info["best_move_san"],
                "eval_after": after_info["score"],
                "eval_change": eval_change,
                "epl": epl,
                "classification": classification,
                "top_lines": after_top_lines,
            }
        )
        prev_info = after_info
        prev_move = move
        if progress_cb is not None:
            progress_cb(ply_idx, total_plies, move_san)

    # Derive initial clock from TimeControl header (e.g. "600+0" -> "10:00") if present
    tc = game.headers.get("TimeControl", "")
    initial_clock = None
    if tc and tc[0].isdigit():
        base_sec = int(tc.split("+")[0])
        initial_clock = _format_clock(base_sec)

    headers = {
        "event": game.headers.get("Event", ""),
        "site": game.headers.get("Site", ""),
        "white": game.headers.get("White", "White"),
        "black": game.headers.get("Black", "Black"),
        "white_elo": game.headers.get("WhiteElo", ""),
        "black_elo": game.headers.get("BlackElo", ""),
        "result": game.headers.get("Result", "*"),
        "termination": game.headers.get("Termination", ""),
        "date": game.headers.get("Date", ""),
        "eco": game.headers.get("ECO", ""),
        "opening": game.headers.get("Opening", ""),
        "time_control": tc,
        "initial_clock": initial_clock,
    }

    summary = _compute_game_summary(moves_out, initial_eval=initial_eval)
    report = build_game_report(
        moves_out=moves_out,
        initial_fen=initial_fen,
        initial_eval=initial_eval,
        headers=headers,
        summary=summary,
    )

    result = {
        "headers": headers,
        "depth": depth,
        "initial_fen": initial_fen,
        "initial_eval": initial_eval,
        "initial_top_lines": initial_top_lines,
        "moves": moves_out,
        "summary": summary,
        "report": report,
    }
    if len(_PGN_CACHE) >= _PGN_CACHE_MAX:
        _PGN_CACHE.pop(next(iter(_PGN_CACHE)))
    _PGN_CACHE[cache_key] = result
    return result


@app.get("/health")
def health_endpoint(request: Request) -> dict[str, Any]:
    """Health check endpoint for Render / Railway / Fly.io / uptime monitors."""
    eng = getattr(request.app.state, "engine", None)
    return {
        "status": "ok",
        "engine_ready": eng is not None,
        "google_configured": is_google_configured(),
        "storage_mode": get_storage_mode(),
    }


@app.get("/sw.js")
def service_worker_endpoint():
    """Serve the PWA Service Worker at root scope `/` with no-cache headers."""
    sw_file = WEB_DIR / "sw.js"
    if not sw_file.exists():
        raise HTTPException(status_code=404, detail="Service worker not found.")
    return FileResponse(
        str(sw_file),
        media_type="application/javascript",
        headers={
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "Service-Worker-Allowed": "/",
        },
    )


@app.get("/")
def index():
    """Serve the frontend HTML page with no-cache so mobile Safari never serves stale asset versions."""
    index_file = WEB_DIR / "index.html"
    if not index_file.exists():
        return JSONResponse(
            {"message": "Blunderless API is running. Frontend UI not built yet."}
        )
    return FileResponse(
        str(index_file),
        headers={"Cache-Control": "no-cache, no-store, must-revalidate"},
    )


@app.post("/api/analyse-fen")
def analyse_fen_endpoint(payload: FenRequest, request: Request) -> dict[str, Any]:
    """Analyse a single FEN using Layer 1 (engine) and Layer 2 (features)."""
    eng = _get_app_engine(request)
    try:
        engine_data = analyse_position(payload.fen, depth=payload.depth, multipv=3, engine=eng)
        features = extract_features(payload.fen, engine_data=engine_data)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"depth": payload.depth, "engine": engine_data, "features": features}


@app.post("/api/analyse-pgn")
def analyse_pgn_endpoint(payload: PgnRequest, request: Request) -> dict[str, Any]:
    """Parse a PGN and return move-by-move evaluations, reusing DB cache when available."""
    cached = get_cached_analysis_by_pgn(payload.pgn, depth=payload.depth)
    if cached:
        return cached

    eng = _get_app_engine(request)
    try:
        result = parse_and_analyse_pgn(payload.pgn, depth=payload.depth, engine=eng)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    if payload.game_id:
        user = _current_user(request)
        if user:
            g = get_game_by_id(payload.game_id, user_id=user["id"])
            if g:
                save_game_analysis(g["id"], result, g["user_color"])
    return result


@app.post("/api/analyse-pgn/stream")
def analyse_pgn_stream_endpoint(payload: PgnRequest, request: Request) -> StreamingResponse:
    """
    Stream live move-by-move Stockfish analysis progress via Server-Sent Events (SSE).
    Emits `event: progress` frames `{ply, total, pct, san}` and finishes with `event: done`.
    """
    user = _current_user(request)
    eng = _get_app_engine(request)

    def _sse_frame(event_name: str, data_obj: Any) -> str:
        return f"event: {event_name}\ndata: {json.dumps(data_obj)}\n\n"

    def _event_generator():
        cached = get_cached_analysis_by_pgn(payload.pgn, depth=payload.depth)
        if cached:
            total = len(cached.get("moves") or [])
            yield _sse_frame("progress", {"ply": total, "total": total, "pct": 100, "san": "", "cached": True})
            yield _sse_frame("done", cached)
            return

        q: queue.Queue[tuple[str, Any]] = queue.Queue()
        cancel_ev = threading.Event()

        def _on_progress(ply: int, total: int, san: str) -> None:
            pct = int(round((ply / total) * 100)) if total else 0
            q.put(("progress", {"ply": ply, "total": total, "pct": min(99, pct), "san": san}))

        def _worker() -> None:
            try:
                res = parse_and_analyse_pgn(
                    payload.pgn,
                    depth=payload.depth,
                    engine=eng,
                    cancel_event=cancel_ev,
                    progress_cb=_on_progress,
                )
                if payload.game_id and user:
                    g = get_game_by_id(payload.game_id, user_id=user["id"])
                    if g:
                        save_game_analysis(g["id"], res, g["user_color"])
                q.put(("done", res))
            except Exception as exc:
                q.put(("error", {"detail": str(exc)}))

        worker = threading.Thread(target=_worker, daemon=True)
        worker.start()

        try:
            while True:
                try:
                    kind, obj = q.get(timeout=0.5)
                except queue.Empty:
                    yield ": keepalive\n\n"
                    continue
                yield _sse_frame(kind, obj)
                if kind in ("done", "error"):
                    break
        finally:
            cancel_ev.set()

    return StreamingResponse(
        _event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@app.post("/api/explain")
def explain_endpoint(payload: ExplainRequest, request: Request) -> dict[str, Any]:
    """Generate a grounded Chibi Horse Coach explanation for a move or position."""
    eng = _get_app_engine(request)
    try:
        return explain_position(
            fen_before=payload.fen_before,
            played_uci=payload.played_uci,
            played_san=payload.played_san,
            classification=payload.classification,
            eval_after=payload.eval_after,
            eval_change=payload.eval_change,
            best_move=payload.best_move,
            best_move_san=payload.best_move_san,
            engine=eng,
            tone=payload.tone or "instructive",
            mover_name=payload.mover_name,
            is_user_move=True if payload.is_user_move is None else payload.is_user_move,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.get("/api/opening")
def opening_lookup_endpoint(
    fen: str = Query(..., description="FEN string"),
    db: str = Query(default="masters", pattern="^(masters|lichess)$"),
) -> dict[str, Any]:
    """
    Look up opening theory for a FEN.
    Tries Lichess Opening Explorer first, falling back seamlessly to the
    built-in ECO opening book so book moves are always detected.
    """
    local_data = lookup_opening(fen)

    # Skip remote Lichess Explorer requests deep in middlegame/endgame to avoid 1.8s timeouts
    try:
        board = chess.Board(fen)
        if not local_data and (board.fullmove_number > 18 or len(board.piece_map()) < 22):
            return {"white": 0, "draws": 0, "black": 0, "moves": [], "opening": None, "source": "out-of-book"}
    except ValueError:
        pass

    url = f"https://explorer.lichess.org/{db}?fen={urllib.parse.quote(fen)}"
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": "Blunderless/2.1",
            "Accept": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=1.8) as resp:
            remote_data = json.loads(resp.read().decode("utf-8"))
            if remote_data and (remote_data.get("moves") or remote_data.get("opening")):
                if not remote_data.get("opening") and local_data and local_data.get("opening"):
                    remote_data["opening"] = local_data["opening"]
                remote_data["source"] = f"lichess-{db}"
                return remote_data
    except Exception:
        pass

    if local_data:
        return local_data

    return {"white": 0, "draws": 0, "black": 0, "moves": [], "opening": None, "source": "out-of-book"}


def _current_user(request: Request) -> Optional[dict[str, Any]]:
    return resolve_user(request.cookies.get(SESSION_COOKIE))


def _require_user(request: Request) -> dict[str, Any]:
    user = _current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Please sign in first.")
    return user


def _sync_single_account(
    user_id: int,
    platform: str,
    username: str,
    limit: int = 60,
    days: Optional[int] = None,
    max_archives: Optional[int] = 12,
) -> dict[str, Any]:
    """Pull profile, live ratings, ELO history, and recent/all games for Chess.com or Lichess."""
    if platform == "chesscom":
        profile = get_player_profile(username)
        stats = get_player_stats(profile["username"])
        fetch_limit = 0 if limit <= 0 else limit
        fetch_archives = None if limit <= 0 else max_archives
        games = get_recent_games(
            profile["username"],
            limit=fetch_limit,
            days=days,
            max_archives=fetch_archives,
        )
        history = build_rating_history_from_games(profile["username"], games)
        acc = upsert_linked_account(
            user_id=user_id,
            platform="chesscom",
            username=profile["username"],
            avatar_url=profile.get("avatar", ""),
            stats=stats,
            rating_history=history,
        )
        synced = upsert_games(user_id, "chesscom", profile["username"], games)
        return {"account": acc, "synced_games": synced}

    profile, stats = get_lichess_profile_and_stats(username)
    history = get_lichess_rating_history(profile["username"])
    games = get_lichess_games(profile["username"], limit=limit, days=days)
    acc = upsert_linked_account(
        user_id=user_id,
        platform="lichess",
        username=profile["username"],
        avatar_url=profile.get("avatar", ""),
        stats=stats,
        rating_history=history,
    )
    synced = upsert_games(user_id, "lichess", profile["username"], games)
    return {"account": acc, "synced_games": synced}


# ── Auth Endpoints (Google OAuth + Local Profile) ────────────────────────────

def _request_origin(request: Request) -> str:
    """Return `scheme://host[:port]` respecting reverse-proxy headers."""
    headers = getattr(request, "headers", None)
    scheme = "https" if _is_https_request(request) else getattr(request.url, "scheme", "http")
    host = (
        headers.get("x-forwarded-host", "").split(",")[0].strip()
        if headers
        else ""
    ) or getattr(request.url, "netloc", "127.0.0.1:8000")
    return f"{scheme}://{host}"


@app.get("/api/auth/me")
def auth_me_endpoint(request: Request) -> dict[str, Any]:
    user = _current_user(request)
    linked = get_linked_accounts(user["id"]) if user else []
    google_cfg = get_google_config(base_url=_request_origin(request))
    return {
        "authenticated": bool(user),
        "user": user,
        "linked_accounts": linked,
        "preferences": user.get("preferences") if user else None,
        "google_configured": is_google_configured(),
        "google_redirect_uri": google_cfg["redirect_uri"],
        "storage_mode": get_storage_mode(),
    }


@app.post("/api/auth/register")
def auth_register_endpoint(
    payload: RegisterAccountRequest,
    request: Request,
    response: Response,
) -> dict[str, Any]:
    """Create a cross-device password-protected Blunderless account."""
    try:
        user, token = register_password_account(
            identifier=payload.identifier,
            password=payload.password,
            display_name=payload.display_name or "",
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    _set_session_cookie(response, token, request)
    return {
        "user": user,
        "linked_accounts": get_linked_accounts(user["id"]),
        "preferences": user.get("preferences"),
        "storage_mode": get_storage_mode(),
    }


@app.post("/api/auth/login")
def auth_login_endpoint(
    payload: LoginAccountRequest,
    request: Request,
    response: Response,
) -> dict[str, Any]:
    """Sign in from any device with an existing email/username and password."""
    try:
        user, token = login_password_account(
            identifier=payload.identifier,
            password=payload.password,
        )
    except ValueError as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc
    _set_session_cookie(response, token, request)
    return {
        "user": user,
        "linked_accounts": get_linked_accounts(user["id"]),
        "preferences": user.get("preferences"),
        "storage_mode": get_storage_mode(),
    }


@app.post("/api/auth/local")
def auth_local_login_endpoint(payload: LocalLoginRequest, request: Request, response: Response) -> dict[str, Any]:
    user, token = login_local_profile(payload.display_name)
    _set_session_cookie(response, token, request)
    return {
        "user": user,
        "linked_accounts": get_linked_accounts(user["id"]),
        "preferences": user.get("preferences"),
        "storage_mode": get_storage_mode(),
    }


@app.get("/api/user/preferences")
def get_user_preferences_endpoint(request: Request) -> dict[str, Any]:
    user = _require_user(request)
    return {"preferences": get_user_preferences(user["id"])}


@app.put("/api/user/preferences")
def update_user_preferences_endpoint(payload: PreferencesPatchRequest, request: Request) -> dict[str, Any]:
    user = _require_user(request)
    patch = {k: v for k, v in payload.model_dump().items() if v is not None}
    updated = update_user_preferences(user["id"], patch)
    return {"preferences": updated}


@app.post("/api/auth/logout")
def auth_logout_endpoint(request: Request, response: Response) -> dict[str, Any]:
    logout_session(request.cookies.get(SESSION_COOKIE))
    response.delete_cookie(SESSION_COOKIE)
    return {"ok": True}


@app.get("/auth/google/login")
def google_login_redirect(request: Request):
    if not is_google_configured():
        msg = urllib.parse.quote(
            "Google OAuth is not configured yet. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET."
        )
        return RedirectResponse(url=f"/?auth_error={msg}", status_code=302)

    auth_url, oauth_state = create_google_login_url(base_url=_request_origin(request))
    resp = RedirectResponse(url=auth_url, status_code=302)
    resp.set_cookie(
        key=OAUTH_STATE_COOKIE,
        value=oauth_state,
        httponly=True,
        samesite="lax",
        secure=_is_https_request(request),
        max_age=600,
    )
    return resp


@app.get("/auth/google/callback")
def google_oauth_callback(
    request: Request,
    code: Optional[str] = Query(default=None),
    state: Optional[str] = Query(default=None),
    error: Optional[str] = Query(default=None),
    error_description: Optional[str] = Query(default=None),
):
    if error:
        reason = error_description or error
        resp = RedirectResponse(
            url=f"/?auth_error={urllib.parse.quote(f'Google sign-in cancelled or failed: {reason}')}",
            status_code=302,
        )
        resp.delete_cookie(OAUTH_STATE_COOKIE)
        return resp

    if not code or not state:
        resp = RedirectResponse(
            url=f"/?auth_error={urllib.parse.quote('Missing authorization code from Google.')}",
            status_code=302,
        )
        resp.delete_cookie(OAUTH_STATE_COOKIE)
        return resp

    try:
        _, token = verify_and_exchange_google_code(
            code=code,
            state=state,
            expected_state=request.cookies.get(OAUTH_STATE_COOKIE),
            base_url=_request_origin(request),
        )
    except (ValueError, RuntimeError) as exc:
        resp = RedirectResponse(
            url=f"/?auth_error={urllib.parse.quote(str(exc))}",
            status_code=302,
        )
        resp.delete_cookie(OAUTH_STATE_COOKIE)
        return resp

    resp = RedirectResponse(url="/?auth=google_ok", status_code=302)
    resp.delete_cookie(OAUTH_STATE_COOKIE)
    _set_session_cookie(resp, token, request)
    return resp


# ── Linked Accounts (Chess.com + Lichess) & Home Dashboard ───────────────────

@app.post("/api/accounts/link")
def link_account_endpoint(payload: LinkAccountRequest, request: Request, response: Response) -> dict[str, Any]:
    user = _current_user(request)
    if not user:
        # Seamless UX: auto-create a local profile named after their linked chess handle
        user, token = login_local_profile(payload.username)
        _set_session_cookie(response, token, request)
    try:
        res = _sync_single_account(user["id"], payload.platform, payload.username, limit=payload.sync_limit)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return {
        "user": user,
        "account": res["account"],
        "synced_games": res["synced_games"],
        "linked_accounts": get_linked_accounts(user["id"]),
    }


@app.delete("/api/accounts/{platform}")
def unlink_account_endpoint(platform: str, request: Request) -> dict[str, Any]:
    user = _require_user(request)
    delete_linked_account(user["id"], platform.lower())
    return {"ok": True, "linked_accounts": get_linked_accounts(user["id"])}


@app.post("/api/accounts/sync")
def sync_accounts_endpoint(payload: SyncGamesRequest, request: Request) -> dict[str, Any]:
    user = _require_user(request)
    accounts = get_linked_accounts(user["id"])
    if not accounts:
        raise HTTPException(status_code=400, detail="Link a Chess.com or Lichess account first.")

    total_synced = 0
    errors: list[str] = []
    for acc in accounts:
        if payload.platform != "all" and acc["platform"] != payload.platform:
            continue
        try:
            res = _sync_single_account(
                user["id"], acc["platform"], acc["username"], limit=payload.limit, days=payload.days
            )
            total_synced += res["synced_games"]
        except Exception as exc:
            errors.append(f"{acc['platform']}: {exc}")

    return {
        "synced_games": total_synced,
        "errors": errors,
        "linked_accounts": get_linked_accounts(user["id"]),
    }


@app.get("/api/home/dashboard")
def home_dashboard_endpoint(request: Request) -> dict[str, Any]:
    user = _current_user(request)
    if not user:
        return {"authenticated": False, "google_configured": is_google_configured()}

    accounts = get_linked_accounts(user["id"])
    recent = query_games(user["id"], limit=100)
    games = recent["games"]
    total = recent["total"]
    analysed_cnt = recent["analysed_count"]

    wins = sum(1 for g in games if g["user_result"] == "win")
    losses = sum(1 for g in games if g["user_result"] == "loss")
    draws = len(games) - wins - losses
    win_rate = round((wins / len(games)) * 100.0, 1) if games else 0.0

    # Current win/loss streak from newest games
    streak_type = games[0]["user_result"] if games else None
    streak_count = 0
    for g in games:
        if g["user_result"] == streak_type:
            streak_count += 1
        else:
            break

    analysed_list = [g for g in games if g["analysed"] and g["user_accuracy"] is not None]
    avg_acc = round(sum(g["user_accuracy"] for g in analysed_list) / len(analysed_list), 1) if analysed_list else None
    total_brilliants = sum(int(g.get("brilliants") or 0) for g in analysed_list)
    total_blunders = sum(int(g.get("blunders") or 0) for g in analysed_list)

    return {
        "authenticated": True,
        "user": user,
        "google_configured": is_google_configured(),
        "linked_accounts": accounts,
        "metrics": {
            "total_games": total,
            "analysed_games": analysed_cnt,
            "win_rate": win_rate,
            "wins": wins,
            "draws": draws,
            "losses": losses,
            "streak_type": streak_type,
            "streak_count": streak_count,
            "avg_accuracy": avg_acc,
            "total_brilliants": total_brilliants,
            "total_blunders": total_blunders,
        },
        "recent_games": games[:8],
        "saved_reports": list_saved_reports(user["id"], limit=4),
    }


# ── Unified Games Library (50-200+ Games, Filterable & Sortable) ─────────────

@app.get("/api/games")
def list_games_endpoint(
    request: Request,
    platform: str = Query(default="all"),
    time_class: str = Query(default="all"),
    color: str = Query(default="all"),
    result: str = Query(default="all"),
    analysed: str = Query(default="all"),
    opening: str = Query(default=""),
    search: str = Query(default=""),
    sort_by: str = Query(default="newest"),
    days: Optional[int] = Query(default=None),
    limit: int = Query(default=60, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
) -> dict[str, Any]:
    user = _require_user(request)
    return query_games(
        user_id=user["id"],
        platform=platform,
        time_class=time_class,
        color=color,
        result=result,
        analysed=analysed,
        opening=opening,
        search=search,
        sort_by=sort_by,
        days=days,
        limit=limit,
        offset=offset,
    )


@app.get("/api/games/{game_id}")
def get_game_endpoint(game_id: int, request: Request) -> dict[str, Any]:
    user = _require_user(request)
    g = get_game_by_id(game_id, user_id=user["id"])
    if not g:
        raise HTTPException(status_code=404, detail="Game not found.")
    return g


@app.post("/api/games/{game_id}/analyse")
def analyse_library_game_endpoint(
    game_id: int,
    request: Request,
    depth: int = Query(default=10, ge=6, le=18),
) -> dict[str, Any]:
    user = _require_user(request)
    g = get_game_by_id(game_id, user_id=user["id"])
    if not g:
        raise HTTPException(status_code=404, detail="Game not found.")
    if g.get("analysed") and g.get("analysis") and (g.get("depth") or 0) >= depth:
        return {"game": g, "analysis": g["analysis"], "cached": True}

    eng = _get_app_engine(request)
    analysis = parse_and_analyse_pgn(g["pgn"], depth=depth, engine=eng)
    save_game_analysis(g["id"], analysis, g["user_color"])
    updated = get_game_by_id(game_id, user_id=user["id"])
    return {"game": updated, "analysis": analysis, "cached": False}


# ── Background Batch Analysis & Multi-Game Insights Reports ──────────────────

@app.post("/api/insights/analyze")
def start_insights_job_endpoint(payload: InsightsAnalyzeRequest, request: Request) -> dict[str, Any]:
    user = _require_user(request)
    accounts = get_linked_accounts(user["id"])
    if not accounts:
        raise HTTPException(status_code=400, detail="Link a Chess.com or Lichess account first.")

    if payload.sync_first:
        sync_days = payload.period_days if payload.period_days > 0 else None
        # `max_games == 0` means All games -> fetch full archive history
        sync_limit = 0 if payload.max_games == 0 else max(payload.max_games, 80)
        for acc in accounts:
            if payload.platform != "all" and acc["platform"] != payload.platform:
                continue
            try:
                _sync_single_account(
                    user_id=user["id"],
                    platform=acc["platform"],
                    username=acc["username"],
                    limit=sync_limit,
                    days=sync_days,
                )
            except Exception:
                pass

    job = start_batch_analysis_job(
        user_id=user["id"],
        platform=payload.platform,
        time_class=payload.time_class,
        period_days=payload.period_days,
        max_games=payload.max_games,
        depth=payload.depth,
        analyse_fn=parse_and_analyse_pgn,
    )
    return job


@app.get("/api/insights/jobs/{job_id}")
def get_insights_job_endpoint(job_id: str, request: Request) -> dict[str, Any]:
    user = _require_user(request)
    job = get_batch_job(job_id, user["id"])
    if not job:
        raise HTTPException(status_code=404, detail="Batch job not found.")
    return job


@app.post("/api/insights/jobs/{job_id}/cancel")
def cancel_insights_job_endpoint(job_id: str, request: Request) -> dict[str, Any]:
    _require_user(request)
    cancel_batch_job(job_id)
    return {"ok": True}


@app.get("/api/insights/reports")
def list_insights_reports_endpoint(request: Request) -> dict[str, Any]:
    user = _require_user(request)
    return {"reports": list_saved_reports(user["id"], limit=10)}


@app.get("/api/insights/reports/{report_id}")
def get_insights_report_endpoint(report_id: int, request: Request) -> dict[str, Any]:
    user = _require_user(request)
    rep = get_saved_report(report_id, user["id"])
    if not rep:
        raise HTTPException(status_code=404, detail="Report not found.")
    return rep


@app.delete("/api/insights/reports/{report_id}")
def delete_insights_report_endpoint(report_id: int, request: Request) -> dict[str, Any]:
    user = _require_user(request)
    delete_saved_report(report_id, user["id"])
    return {"ok": True}


@app.get("/api/chesscom/{username}")
def chesscom_games_endpoint(username: str, limit: int = Query(default=20, ge=1, le=200)) -> dict[str, Any]:
    """Fetch recent games for a Chess.com username (default 20, supports up to 200)."""
    try:
        games = get_recent_games(username, limit=limit)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return {"username": username, "games": games}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("src.server:app", host="127.0.0.1", port=8000, reload=True)