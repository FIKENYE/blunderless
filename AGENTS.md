# Blunderless

A chess analysis bot built as a personal project to show how structured
engine data affects the quality of LLM move explanations.

## Architecture (three layers, built in order)
1. **Engine layer** (`src/engine.py`): Stockfish via python-chess. Given a FEN,
   return best move, eval (centipawns or mate), top 3 lines, and eval change
   after a played move.
2. **Feature layer** (`src/features.py`): turns a position and engine output
   into structured themes (material balance, king safety, pawn structure,
   piece activity, tactical threats, initiative). Returns a plain dict/JSON.
3. **Explainer layer** (`src/explain.py`): an LLM explains a move using ONLY
   the data from layers 1 and 2.

Build and test one layer before starting the next.

## Tech
- Python 3.12, virtual environment in `.venv`
- `python-chess` (import name `chess`), Stockfish binary in `engine/`
- Windows, run scripts from the project root with `py`

## Code rules
- Keep code simple, readable and commented. I am learning, so explain
  non-obvious choices briefly.
- Ask before adding a new dependency, and say why it's needed.
- One function does one job. Small modules, no large rewrites.
- Add a runnable test or example for each function.
- Never commit `.venv/`, `engine/` or API keys. Keys go in environment variables.

## Chess rules (important)
- Never state a chess fact (eval, threat, tactic) that did not come from
  Stockfish or the feature layer. If the data doesn't support a claim, say so.
- Explanations must cite the line or eval they rely on.

## Evaluation (core of the project)
- Keep a small test set of positions with known tactics in `tests/positions.json`.
- Measure whether explanations are correct, comparing raw-engine-output input
  vs structured-feature input.

## Workflow
- Before changing multiple files, outline the plan and wait for approval.
- Don't touch `engine/` or `.gitignore` unless asked.