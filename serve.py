#!/usr/bin/env python3
"""
Bat Hub ローカルサーバー。
標準ライブラリのみ（追加インストール不要）。
このフォルダを http://localhost:8000 で配信し、ブラウザを自動で開きます。

使い方:
    python serve.py            # ポート 8000 で起動
    python serve.py 9000       # ポートを指定
"""
import http.server
import socketserver
import os
import sys
import threading
import webbrowser

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
ROOT = os.path.dirname(os.path.abspath(__file__))


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def end_headers(self):
        # ローカル開発用にキャッシュ無効化（データ更新がすぐ反映される）
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, fmt, *args):
        pass  # 静かに


def main():
    os.chdir(ROOT)
    url = f"http://localhost:{PORT}/"
    print("=" * 52)
    print("  🦇 Bat Hub をローカルで起動します")
    print(f"  URL : {url}")
    print(f"  Root: {ROOT}")
    print("  停止: Ctrl + C")
    print("=" * 52)
    threading.Timer(0.8, lambda: webbrowser.open(url)).start()
    try:
        with socketserver.ThreadingTCPServer(("127.0.0.1", PORT), Handler) as httpd:
            httpd.serve_forever()
    except OSError as e:
        print(f"\n[エラー] ポート {PORT} を使用できません: {e}")
        print(f"        別のポートで試してください:  python serve.py {PORT + 1}")
        sys.exit(1)
    except KeyboardInterrupt:
        print("\n停止しました。")


if __name__ == "__main__":
    main()
