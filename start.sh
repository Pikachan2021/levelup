#!/usr/bin/env bash
# Bat Hub 起動 (macOS / Linux)
# 実行: ./start.sh   (初回のみ: chmod +x start.sh)
cd "$(dirname "$0")" || exit 1
if command -v python3 >/dev/null 2>&1; then
  exec python3 serve.py "$@"
elif command -v python >/dev/null 2>&1; then
  exec python serve.py "$@"
else
  echo "[!] Python が見つかりません。https://www.python.org/downloads/ からインストールしてください。"
  exit 1
fi
