import chess, chess.engine

engine = chess.engine.SimpleEngine.popen_uci(r"engine\stockfish.exe")
board = chess.Board()
info = engine.analyse(board, chess.engine.Limit(time=0.1))
print(info["score"])
engine.quit()