#!/bin/bash
echo "Starting Graphide Backend Service..."

# 1. Start Docker (Joern)
echo "[1/3] Starting Joern Container..."
if ! docker info > /dev/null 2>&1; then
    echo "Error: Docker is not running. Please start Docker Desktop."
    exit 1
fi

cd "$(dirname "$0")" || exit

docker-compose up -d
if [ $? -ne 0 ]; then
    echo "Error: Failed to start Docker containers."
    exit 1
fi

echo "Joern started on port 8080."

# 2. Check Python Environment (Assuming it's ready or using system python)
# Ideally we should activate a venv if one exists
if [ -d "venv" ]; then
    source venv/bin/activate
fi

# 3. Start Uvicorn
echo "[2/3] Starting Backend API..."

# Check if port 8000 is in use and kill it
PID_8000=$(lsof -t -i:8000)
if [ ! -z "$PID_8000" ]; then
    echo "Port 8000 is in use by PID(s) $PID_8000. Killing them..."
    kill -9 $PID_8000
    sleep 1
fi

uvicorn main:app --host 127.0.0.1 --port 8000 --reload
