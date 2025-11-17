#!/bin/bash

# Kill any existing pondpilot-desktop processes
echo "Checking for existing PondPilot processes..."
EXISTING_PIDS=$(pgrep -f "pondpilot-desktop" | grep -v $$)

if [ ! -z "$EXISTING_PIDS" ]; then
    echo "Found existing PondPilot processes:"
    ps aux | grep -E "$(echo $EXISTING_PIDS | tr ' ' '|')" | grep -v grep

    echo ""
    echo "Killing existing processes..."
    kill $EXISTING_PIDS 2>/dev/null

    # Give processes time to exit cleanly
    sleep 1

    # Force kill if still running
    for pid in $EXISTING_PIDS; do
        if kill -0 $pid 2>/dev/null; then
            echo "Force killing process $pid"
            kill -9 $pid 2>/dev/null
        fi
    done
fi

# Start tauri dev (will run Vite on port 5174 via dev:tauri script)
echo "Starting Tauri development server..."
echo "  - Vite dev server will run on port 5174"
echo "  - Standalone Vite (yarn dev) runs on port 5173"
yarn tauri dev