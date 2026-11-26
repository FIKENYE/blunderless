"""
Layer 1: Engine layer.

Wraps Stockfish via python-chess to provide clean, structured analysis
(best move, evaluation, top 3 lines, and move evaluation delta).
"""

from contextlib import contextmanager
import os
from pathlib import Path
import shutil
import threading
from typing import Any, Iterator, Optional

import chess
import chess.engine

DEFAULT_ENGINE_PATH = Path("engine") / "stockfish.exe"

# Re-entrant lock serializes concurrent FastAPI worker threads sharing one Stockfish
# UCI process while allowing nested calls (e.g. evaluate_move -> analyse_position).
_ENGINE_LOCK = threading.RLock()


def resolve_engine_path(path: Optional[str | Path] = None) -> Path:
    """
    Find the Stockfish binary across Windows and Linux deployments.

    Priority:
    1. Explicit non-default path passed by caller
    2. `STOCKFISH_PATH` environment variable
    3. Local repo binaries (`engine/stockfish.exe` or `engine/stockfish`)
    4. System PATH (`shutil.which("stockfish")`) or standard Linux paths
    """
    candidates: list[Path] = []
    if path is not None and Path(path) != DEFAULT_ENGINE_PATH:
        candidates.append(Path(path))

    env_path = os.environ.get("STOCKFISH_PATH", "").strip()
    if env_path:
        candidates.append(Path(env_path))

    candidates.extend([
        Path("engine") / "stockfish.exe",
        Path("engine") / "stockfish",
    ])

    which_path = shutil.which("stockfish")
    if which_path:
        candidates.append(Path(which_path))

    candidates.extend([
        Path("/usr/games/stockfish"),
        Path("/usr/bin/stockfish"),
    ])

    for candidate in candidates:
        if candidate.is_file():
            return candidate

    raise FileNotFoundError(
        "Stockfish binary not found. Place it in 'engine/stockfish.exe' (Windows), "
        "install system 'stockfish' (Linux), or set STOCKFISH_PATH."
    )


def get_engine(path: str | Path = DEFAULT_ENGINE_PATH) -> chess.engine.SimpleEngine:
    """Start and return a deterministic single-threaded Stockfish UCI engine."""
    engine_path = resolve_engine_path(path)
    eng = chess.engine.SimpleEngine.popen_uci(str(engine_path))
    try:
        opts: dict[str, Any] = {}
        if "Threads" in eng.options:
            opts["Threads"] = 1
        if "Hash" in eng.options:
            opts["Hash"] = 64
        if opts:
            eng.configure(opts)
    except Exception:
        pass
    return eng


def reset_engine_hash(engine: Optional[chess.engine.SimpleEngine]) -> None:
    """Clear Stockfish's transposition table so repeated analyses are deterministic."""
    if engine is None:
        return
    with _ENGINE_LOCK:
        try:
            if "Clear Hash" in engine.options:
                engine.configure({"Clear Hash": True})
        except Exception:
            pass


@contextmanager
def _engine_session(
    engine: Optional[chess.engine.SimpleEngine] = None,
    path: str | Path = DEFAULT_ENGINE_PATH,
) -> Iterator[chess.engine.SimpleEngine]:
    """
    Yield an existing engine if provided, otherwise open a temporary one
    and ensure it quits when done.
    """
    if engine is not None:
        yield engine
        return

    managed_engine = get_engine(path)
    try:
        yield managed_engine
    finally:
        managed_engine.quit()


def _format_score(pov_score: chess.engine.PovScore) -> dict[str, Any]:
    """
    Convert a python-chess PovScore into a plain dictionary normalized to
    White's perspective.

    Why White's perspective? Because `board.turn` flips after every move.
    Keeping all scores from White's POV lets us compare eval_before and
    eval_after directly without sign-flipping bugs.
    """
    white_score = pov_score.white()
    if white_score.is_mate():
        return {"type": "mate", "value": white_score.mate()}
    return {"type": "cp", "value": white_score.score()}


def _score_to_cp(score: dict[str, Any], board_turn: chess.Color) -> int:
    """
    Convert a score dict to a numeric centipawn value (from White's POV)
    so mate scores and centipawn scores can be compared numerically.
    """
    if score["type"] == "cp":
        return int(score["value"])

    mate_in = int(score["value"])
    if mate_in > 0:
        return 10000 - mate_in * 100
    if mate_in < 0:
        return -10000 - mate_in * 100

    # mate_in == 0 means the side currently to move is already checkmated.
    return 10000 if board_turn == chess.BLACK else -10000


def _classify_eval_change(eval_change: int, is_best_move: bool) -> str:
    """
    Classify a move based on how many centipawns the player lost.
    eval_change is from the moving player's perspective (negative = worse).
    """
    if is_best_move or eval_change >= 0:
        return "best"
    loss = -eval_change
    if loss <= 25:
        return "good"
    if loss <= 80:
        return "inaccuracy"
    if loss <= 200:
        return "mistake"
    return "blunder"


def _pv_to_san(board: chess.Board, pv: list[chess.Move]) -> list[str]:
    """Convert a list of UCI moves (principal variation) into SAN strings."""
    temp_board = board.copy()
    san_moves = []
    for move in pv:
        san_moves.append(temp_board.san(move))
        temp_board.push(move)
    return san_moves


def analyse_position(
    fen: str,
    depth: int = 15,
    multipv: int = 3,
    engine: Optional[chess.engine.SimpleEngine] = None,
) -> dict[str, Any]:
    """
    Analyse a FEN position and return best move, White-POV score, and top lines.
    """
    board = chess.Board(fen)  # Raises ValueError if FEN syntax is invalid.
    if not board.is_valid():
        raise ValueError(f"Invalid chess position (illegal board state): '{fen}'")

    # Handle terminal positions directly since there are no legal moves to search.
    if board.is_checkmate():
        return {
            "fen": fen,
            "best_move": None,
            "best_move_san": None,
            "score": {"type": "mate", "value": 0},
            "top_lines": [],
        }
    if board.is_stalemate() or board.is_insufficient_material():
        return {
            "fen": fen,
            "best_move": None,
            "best_move_san": None,
            "score": {"type": "cp", "value": 0},
            "top_lines": [],
        }

    with _ENGINE_LOCK:
        with _engine_session(engine) as eng:
            raw_lines = eng.analyse(
                board,
                chess.engine.Limit(depth=depth),
                multipv=multipv,
            )

    top_lines = []
    for idx, info in enumerate(raw_lines, start=1):
        pv = info.get("pv", [])
        if not pv:
            continue
        first_move = pv[0]
        top_lines.append(
            {
                "rank": idx,
                "move": first_move.uci(),
                "move_san": board.san(first_move),
                "score": _format_score(info["score"]),
                "pv": [m.uci() for m in pv],
                "pv_san": _pv_to_san(board, pv),
            }
        )

    best_line = top_lines[0] if top_lines else None
    return {
        "fen": fen,
        "best_move": best_line["move"] if best_line else None,
        "best_move_san": best_line["move_san"] if best_line else None,
        "score": best_line["score"] if best_line else {"type": "cp", "value": 0},
        "top_lines": top_lines,
    }


def evaluate_move(
    fen_before: str,
    move_uci: str,
    depth: int = 15,
    engine: Optional[chess.engine.SimpleEngine] = None,
) -> dict[str, Any]:
    """
    Evaluate a played move by comparing the position before and after the move.
    Returns eval_change from the moving player's perspective (negative = lost eval).
    """
    board = chess.Board(fen_before)
    move = chess.Move.from_uci(move_uci)
    if move not in board.legal_moves:
        raise ValueError(f"Illegal move '{move_uci}' for position '{fen_before}'")

    mover_color = board.turn
    played_move_san = board.san(move)

    with _engine_session(engine) as eng:
        before_info = analyse_position(fen_before, depth=depth, multipv=1, engine=eng)
        board.push(move)
        after_info = analyse_position(board.fen(), depth=depth, multipv=1, engine=eng)

    cp_before = _score_to_cp(before_info["score"], mover_color)
    cp_after = _score_to_cp(after_info["score"], board.turn)

    # Calculate change from the moving player's perspective.
    if mover_color == chess.WHITE:
        eval_change = cp_after - cp_before
    else:
        eval_change = cp_before - cp_after

    is_best = move_uci == before_info["best_move"]
    classification = _classify_eval_change(eval_change, is_best)

    return {
        "played_move": move_uci,
        "played_move_san": played_move_san,
        "best_move": before_info["best_move"],
        "best_move_san": before_info["best_move_san"],
        "eval_before": before_info["score"],
        "eval_after": after_info["score"],
        "eval_change": eval_change,
        "classification": classification,
    }


if __name__ == "__main__":
    # Quick runnable example for Layer 1
    with get_engine() as sf:
        print("Starting position:", analyse_position(chess.STARTING_FEN, depth=10, engine=sf))
        print("Playing 1. e4:", evaluate_move(chess.STARTING_FEN, "e2e4", depth=10, engine=sf))
