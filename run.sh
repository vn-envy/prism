#!/bin/bash
# PRISM — One-command demo launcher
# Usage: ./run.sh [--live]

set -e

echo "============================================================"
echo "  PRISM — Process Reliability Index for Supplier Models"
echo "  Six Sigma Process Capability for LLM Selection"
echo "============================================================"
echo ""

# Check for live mode
if [ "$1" = "--live" ]; then
    echo "[MODE] Live — using real API keys from .env"
    if [ ! -f .env ]; then
        echo "[ERROR] .env file not found. Copy .env.example to .env and add your keys."
        exit 1
    fi
    export PRISM_DEMO_MODE=false
else
    echo "[MODE] Demo — using simulated measurements"
    export PRISM_DEMO_MODE=true
fi

echo ""

# Install Python deps if needed
if ! python3 -c "import fastapi" 2>/dev/null; then
    echo "[SETUP] Installing Python dependencies..."
    pip3 install -r requirements.txt -q
fi

# Install frontend deps if needed
if [ ! -d frontend/node_modules ]; then
    echo "[SETUP] Installing frontend dependencies..."
    (cd frontend && npm install --silent)
fi

echo ""
echo "[START] Launching backend on :8000..."
python3 -m uvicorn app.main:app --host 0.0.0.0 --port 8000 &
BACKEND_PID=$!

echo "[START] Launching frontend on :3000..."
(cd frontend && npm run dev -- -p 3000) &
FRONTEND_PID=$!

echo ""
echo "============================================================"
echo "  Backend:  http://localhost:8000"
echo "  Frontend: http://localhost:3000"
echo "  API docs: http://localhost:8000/docs"
echo "  Admin:    http://localhost:3000/admin"
echo "============================================================"
echo ""
echo "  Press Ctrl+C to stop both servers"
echo ""

# Cleanup on exit
cleanup() {
    echo ""
    echo "[STOP] Shutting down..."
    kill $BACKEND_PID 2>/dev/null
    kill $FRONTEND_PID 2>/dev/null
    wait $BACKEND_PID 2>/dev/null
    wait $FRONTEND_PID 2>/dev/null
    echo "[DONE] Servers stopped."
}
trap cleanup EXIT INT TERM

# Wait for either process to exit
wait
