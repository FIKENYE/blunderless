"""
Launcher script for Blunderless.
Runs the FastAPI server and automatically opens the browser.
"""

import webbrowser
import threading
import time
import uvicorn


def open_browser():
    time.sleep(1.2)
    webbrowser.open("http://127.0.0.1:8000")


if __name__ == "__main__":
    print("Starting Blunderless on http://127.0.0.1:8000 ...")
    threading.Thread(target=open_browser, daemon=True).start()
    uvicorn.run("src.server:app", host="127.0.0.1", port=8000, reload=True)
