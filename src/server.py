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
from pathlib import Path
from typing import Any, Optional
import urllib.parse
import urllib.request

import chess
import chess.pgn
from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from src.chesscom import get_recent_games
from src.engine import (
    _score_to_cp,
    analyse_position,
    get_engine,
    reset_engine_hash,
)
from src.features import extract_features
from src.openings import is_book_position, lookup_opening

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


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Keep one Stockfish engine process alive for the lifetime of the server."""
    engine = get_engine()
    app.state.engine = engine
    try:
        yield
    finally:
        engine.quit()


app = FastAPI(title="Blunderless", lifespan=lifespan)

if WEB_DIR.exists():
    app.mount("/static", StaticFiles(directory=str(WEB_DIR)), name="static")


def _get_app_engine(request: Request) -> Optional[Any]:
    return getattr(request.app.state, "engine", None)


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


def _compute_game_summary(moves_out: list[dict[str, Any]]) -> dict[str, Any]:
    """
    Compute authentic Lichess/CAPS2 EPL accuracy % (arithmetic + harmonic mean),
    Average Centipawn Loss (ACPL), and ACPL-calibrated Game Rating.
    """
    def side_metrics(color: str) -> tuple[Optional[float], Optional[int], Optional[int]]:
        side_moves = [m for m in moves_out if m["color"] == color]
        if not side_moves:
            return None, None, None

        # Win% loss on 0..100 scale
        move_accs: list[float] = []
        cpl_list: list[int] = []
        for m in side_moves:
            win_loss = float(m.get("epl", 0.0)) * 100.0
            acc = max(1.0, min(100.0, 103.1668 * math.exp(-0.04354 * win_loss) - 3.1669))
            move_accs.append(acc)

            # Cap per-move CPL at 1000 cp so mate swings don't skew ACPL to infinity
            cpl = min(1000, max(0, -int(m.get("eval_change", 0))))
            cpl_list.append(cpl)

        arith_mean = sum(move_accs) / len(move_accs)
        harmonic_mean = len(move_accs) / sum(1.0 / a for a in move_accs)
        accuracy = round((arith_mean + harmonic_mean) / 2.0, 1)

        acpl = int(round(sum(cpl_list) / len(cpl_list)))

        # Standard ACPL-to-Elo relationship (e.g. ~100 ACPL -> ~550, ~60 ACPL -> ~1000, ~25 ACPL -> ~1750)
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
) -> dict[str, Any]:
    """
    Parse a PGN string and evaluate each move sequentially, extracting
    [%clk] timestamps, ratings, opening tags, and 10-tier EPL classifications.
    """
    if not pgn_text or not pgn_text.strip():
        raise ValueError("PGN text cannot be empty.")

    cache_key = (hashlib.sha256(pgn_text.strip().encode("utf-8")).hexdigest(), depth)
    if cache_key in _PGN_CACHE:
        return _PGN_CACHE[cache_key]

    game = chess.pgn.read_game(io.StringIO(pgn_text))
    if game is None:
        raise ValueError("Could not parse PGN.")

    nodes = list(game.mainline())
    if not nodes:
        raise ValueError("PGN contains no moves.")

    reset_engine_hash(engine)

    board = game.board()
    initial_fen = board.fen()
    prev_info = analyse_position(initial_fen, depth=depth, multipv=2, engine=engine)
    initial_eval = prev_info["score"]
    still_in_book = is_book_position(initial_fen)
    prev_move: Optional[chess.Move] = None

    moves_out: list[dict[str, Any]] = []
    for ply_idx, node in enumerate(nodes, start=1):
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
            }
        )
        prev_info = after_info
        prev_move = move

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
        "date": game.headers.get("Date", ""),
        "eco": game.headers.get("ECO", ""),
        "opening": game.headers.get("Opening", ""),
        "time_control": tc,
        "initial_clock": initial_clock,
    }

    result = {
        "headers": headers,
        "depth": depth,
        "initial_fen": initial_fen,
        "initial_eval": initial_eval,
        "moves": moves_out,
        "summary": _compute_game_summary(moves_out),
    }
    if len(_PGN_CACHE) >= _PGN_CACHE_MAX:
        _PGN_CACHE.pop(next(iter(_PGN_CACHE)))
    _PGN_CACHE[cache_key] = result
    return result


@app.get("/")
def index():
    """Serve the frontend HTML page."""
    index_file = WEB_DIR / "index.html"
    if not index_file.exists():
        return JSONResponse(
            {"message": "Blunderless API is running. Frontend UI not built yet."}
        )
    return FileResponse(str(index_file))


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
    """Parse a PGN and return move-by-move evaluations and classifications."""
    eng = _get_app_engine(request)
    try:
        return parse_and_analyse_pgn(payload.pgn, depth=payload.depth, engine=eng)
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


@app.get("/api/chesscom/{username}")
def chesscom_games_endpoint(username: str) -> dict[str, Any]:
    """Fetch the last 5 games for a Chess.com username."""
    try:
        games = get_recent_games(username, limit=5)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return {"username": username, "games": games}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("src.server:app", host="127.0.0.1", port=8000, reload=True)