@echo off
title Blunderless Local Server
cd /d "%~dp0"

echo ===================================================
echo Starting Blunderless Chess Server...
echo URL: http://127.0.0.1:8000
echo ===================================================

:: Check if virtual environment exists and use it if available
if exist ".venv\Scripts\python.exe" (
    start http://127.0.0.1:8000
    ".venv\Scripts\python.exe" -m uvicorn src.server:app --reload --port 8000
    goto end
)

:: Otherwise fall back to global python
start http://127.0.0.1:8000
python -m uvicorn src.server:app --reload --port 8000

:end
pause
