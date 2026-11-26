FROM python:3.12-slim

# Install Linux Stockfish binary so the engine layer works out of the box
RUN apt-get update \
    && apt-get install -y --no-install-recommends stockfish \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY src ./src
COPY web ./web

ENV STOCKFISH_PATH=/usr/games/stockfish
ENV PORT=8000

EXPOSE 8000

CMD ["sh", "-c", "uvicorn src.server:app --host 0.0.0.0 --port ${PORT:-8000}"]
