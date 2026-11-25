"""
FastAPI backend for Blunderless.

Serves the web UI and exposes endpoints for:
- Analysing a single FEN (Layer 1 + Layer 2)
- Parsing and evaluating a full PGN game move-by-move (including clocks & headers)
- Fetching the last 5 games for a Chess.com username
"""

from contextlib import asynccontextmanager
import io
from pathlib import Path
from typing import Any, Optional

import chess
import chess.pgn
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from src.chesscom import get_recent_games
from src.engine import (
    _classify_eval_change,
    _score_to_cp,
    analyse_position,
    get_engine,
)
from src.features import extract_features

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


def parse_and_analyse_pgn(
    pgn_text: str,
    depth: int = 10,
    engine: Optional[Any] = None,
) -> dict[str, Any]:
    """
    Parse a PGN string and evaluate each move sequentially, extracting
    [%clk] timestamps, ratings, and opening tags.
    """
    if not pgn_text or not pgn_text.strip():
        raise ValueError("PGN text cannot be empty.")

    game = chess.pgn.read_game(io.StringIO(pgn_text))
    if game is None:
        raise ValueError("Could not parse PGN.")

    nodes = list(game.mainline())
    if not nodes:
        raise ValueError("PGN contains no moves.")

    board = game.board()
    initial_fen = board.fen()
    prev_info = analyse_position(initial_fen, depth=depth, multipv=1, engine=engine)
    initial_eval = prev_info["score"]

    moves_out: list[dict[str, Any]] = []
    for ply_idx, node in enumerate(nodes, start=1):
        move = node.move
        mover_color = board.turn
        move_uci = move.uci()
        move_san = board.san(move)
        clk_seconds = node.clock()

        board.push(move)
        after_fen = board.fen()
        after_info = analyse_position(after_fen, depth=depth, multipv=1, engine=engine)

        cp_before = _score_to_cp(prev_info["score"], mover_color)
        cp_after = _score_to_cp(after_info["score"], board.turn)
        eval_change = (cp_after - cp_before) if mover_color == chess.WHITE else (cp_before - cp_after)

        is_best = move_uci == prev_info["best_move"]
        classification = _classify_eval_change(eval_change, is_best)

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
                "classification": classification,
            }
        )
        prev_info = after_info

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

    return {
        "headers": headers,
        "depth": depth,
        "initial_fen": initial_fen,
        "initial_eval": initial_eval,
        "moves": moves_out,
    }


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