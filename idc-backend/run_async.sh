#!/bin/bash
# Async Flask startup script using uvicorn ASGI server

cd "$(dirname "$0")"

# Load environment variables
if [ -f .env ]; then
    export $(cat .env | grep -v '^#' | xargs)
fi

# Run with uvicorn for async support
echo "Starting async Flask server with uvicorn..."
uvicorn app:app --host 0.0.0.0 --port 5001 --reload
