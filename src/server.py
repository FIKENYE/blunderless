"""
FastAPI backend for Blunderless.

Serves the web UI and exposes endpoints for:
- Analysing a single FEN (Layer 1 + Layer 2)
- Parsing and evaluating a full PGN game move-by-move
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


def parse_and_analyse_pgn(
    pgn_text: str,
    depth: int = 10,
    engine: Optional[Any] = None,
) -> dict[str, Any]:
    """
    Parse a PGN string and evaluate each move sequentially.

    Optimization: instead of running Stockfish twice per move (before + after),
    we reuse the 'after' evaluation of move N as the 'before' evaluation of move N+1.
    This cuts total engine calls in half.
    """
    if not pgn_text or not pgn_text.strip():
        raise ValueError("PGN text cannot be empty.")

    game = chess.pgn.read_game(io.StringIO(pgn_text))
    if game is None:
        raise ValueError("Could not parse PGN.")

    mainline = list(game.mainline_moves())
    if not mainline:
        raise ValueError("PGN contains no moves.")

    board = game.board()
    initial_fen = board.fen()
    prev_info = analyse_position(initial_fen, depth=depth, multipv=1, engine=engine)
    initial_eval = prev_info["score"]

    moves_out: list[dict[str, Any]] = []
    for ply_idx, move in enumerate(mainline, start=1):
        mover_color = board.turn
        move_uci = move.uci()
        move_san = board.san(move)

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
                "best_move": prev_info["best_move"],
                "best_move_san": prev_info["best_move_san"],
                "eval_after": after_info["score"],
                "eval_change": eval_change,
                "classification": classification,
            }
        )
        prev_info = after_info

    headers = {
        "event": game.headers.get("Event", ""),
        "white": game.headers.get("White", "White"),
        "black": game.headers.get("Black", "Black"),
        "result": game.headers.get("Result", "*"),
        "date": game.headers.get("Date", ""),
    }

    return {
        "headers": headers,
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
            {"message": "Blunderless API is running. Frontend UI (Stage 2) not built yet."}
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
    return {"engine": engine_data, "features": features}


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
