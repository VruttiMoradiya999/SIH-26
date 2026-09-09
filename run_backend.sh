#!/usr/bin/env bash
# Script to launch FastAPI backend using the correct Miniconda Python environment

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/backend" || exit 1

# Try conda python, fallback to python3 / python
if [ -f "/opt/anaconda3/bin/python" ]; then
    PYTHON_CMD="/opt/anaconda3/bin/python"
elif [ -f "/opt/miniconda3/bin/python3" ]; then
    PYTHON_CMD="/opt/miniconda3/bin/python3"
elif [ -f "$HOME/miniconda3/bin/python3" ]; then
    PYTHON_CMD="$HOME/miniconda3/bin/python3"
elif [ -f "$HOME/anaconda3/bin/python3" ]; then
    PYTHON_CMD="$HOME/anaconda3/bin/python3"
elif command -v conda &> /dev/null; then
    PYTHON_CMD="python"
else
    PYTHON_CMD="python3"
fi

echo "🚀 Starting backend with: $PYTHON_CMD"
"$PYTHON_CMD" -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload
