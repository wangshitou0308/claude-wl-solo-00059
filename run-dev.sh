#!/usr/bin/env bash
# 一键启动后端（FastAPI, 端口 8765）与前端（Vite, 端口 5173）。
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"

cd "$ROOT/backend"
if [ ! -d ".venv" ]; then
  python3 -m venv .venv
  .venv/bin/pip install -q --upgrade pip
  .venv/bin/pip install -q -r requirements.txt
fi

.venv/bin/python -m uvicorn app.main:app --port 8765 &
API_PID=$!

cleanup() { kill "$API_PID" "$VITE_PID" 2>/dev/null || true; }
trap cleanup EXIT

cd "$ROOT/frontend"
if [ ! -d "node_modules" ]; then
  npm install --silent
fi
npm run dev &
VITE_PID=$!

echo ""
echo "  前端页面: http://localhost:5173"
echo "  后端接口: http://localhost:8765/api/map  （文档 /docs）"
echo "  按 Ctrl+C 停止"
wait
