#!/usr/bin/env python3
"""
Bat Hub ローカルサーバー（実行対応版）。
標準ライブラリのみ（追加インストール不要）。

- 静的配信: このフォルダを http://localhost:8000 で配信
- 実行API : POST /api/run?bat=<id>
            registry.json の bat["run"] に書かれた手順を順に実行し、
            出力をブラウザにそのまま（ストリーミングで）返します。

使い方:
    python serve.py            # ポート 8000
    python serve.py 9000       # ポート指定
"""
import http.server
import socketserver
import json
import os
import sys
import subprocess
import threading
import webbrowser
from urllib.parse import urlparse, parse_qs

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
ROOT = os.path.dirname(os.path.abspath(__file__))
REGISTRY = os.path.join(ROOT, "bats", "registry.json")


def load_registry():
    with open(REGISTRY, encoding="utf-8") as f:
        return json.load(f)


class Handler(http.server.SimpleHTTPRequestHandler):
    # HTTP/1.0 = レスポンスは接続クローズで終端。ストリーミングが簡単。
    protocol_version = "HTTP/1.0"

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, fmt, *args):
        pass

    # ---- 実行API ----
    def do_POST(self):
        parsed = urlparse(self.path)
        if parsed.path == "/api/run":
            bat_id = parse_qs(parsed.query).get("bat", [""])[0]
            self.run_bat(bat_id)
        else:
            self.send_error(404, "Not Found")

    def _emit(self, text):
        try:
            self.wfile.write(text.encode("utf-8"))
            self.wfile.flush()
        except (BrokenPipeError, ConnectionResetError):
            pass

    def run_bat(self, bat_id):
        try:
            reg = load_registry()
        except Exception as e:
            self.send_error(500, "Cannot read registry.json")
            return

        bat = next((b for b in reg.get("bats", []) if b.get("id") == bat_id), None)
        if not bat:
            self.send_error(404, "Unknown bat id")
            return
        run = bat.get("run")
        if not run or not run.get("steps"):
            self.send_error(400, "No run config for this bat")
            return

        self.send_response(200)
        self.send_header("Content-Type", "text/plain; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.end_headers()

        cwd = os.path.normpath(os.path.join(ROOT, "bats", run.get("cwd", ".")))
        py = sys.executable or "python"

        self._emit(f"▶ {bat.get('name', bat_id)} を実行します\n")
        self._emit(f"  作業フォルダ: {cwd}\n")

        ok = True
        for step in run["steps"]:
            cmd = [py if c == "{python}" else c for c in step.get("cmd", [])]
            self._emit(f"\n=== {step.get('label', '')} ===\n$ {' '.join(cmd)}\n\n")
            try:
                proc = subprocess.Popen(
                    cmd, cwd=cwd,
                    stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                    text=True, bufsize=1,
                )
                for line in proc.stdout:
                    self._emit(line)
                proc.wait()
                self._emit(f"\n[終了コード {proc.returncode}]\n")
                if proc.returncode != 0:
                    ok = False
                    self._emit("\n⚠ このステップが失敗したため中断します。\n")
                    break
            except FileNotFoundError as e:
                ok = False
                self._emit(
                    f"\n⚠ 実行できませんでした: {e}\n"
                    "  Python や依存ライブラリが無い可能性があります。\n"
                    "  Windowsで一度だけ:  pip install playwright pymupdf && playwright install\n"
                    "  詳細: bats/fedex/scripts/README.md\n"
                )
                break
            except Exception as e:
                ok = False
                self._emit(f"\n⚠ エラー: {e}\n")
                break

        self._emit("\n=== ✅ 完了 ===\n" if ok else "\n=== ❌ 失敗で終了 ===\n")


def main():
    os.chdir(ROOT)
    url = f"http://localhost:{PORT}/"
    print("=" * 52)
    print("  🦇 Bat Hub をローカルで起動します（実行対応）")
    print(f"  URL : {url}")
    print(f"  Root: {ROOT}")
    print("  停止: Ctrl + C")
    print("=" * 52)
    threading.Timer(0.8, lambda: webbrowser.open(url)).start()
    try:
        socketserver.ThreadingTCPServer.allow_reuse_address = True
        with socketserver.ThreadingTCPServer(("127.0.0.1", PORT), Handler) as httpd:
            httpd.serve_forever()
    except OSError as e:
        print(f"\n[エラー] ポート {PORT} を使用できません: {e}")
        print(f"        別のポートで:  python serve.py {PORT + 1}")
        sys.exit(1)
    except KeyboardInterrupt:
        print("\n停止しました。")


if __name__ == "__main__":
    main()
