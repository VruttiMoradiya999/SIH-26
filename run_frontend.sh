#!/usr/bin/env bash
# Script to launch Vite frontend

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/frontend" || exit 1

echo "✨ Starting Vite Frontend at http://localhost:5173"
npm run dev
