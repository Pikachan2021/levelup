@echo off
REM ============================================================
REM  Bat Hub 起動用バッチ (Windows)
REM  ダブルクリックで http://localhost:8000 が開きます。
REM  追加インストール不要 (Python の標準機能のみ)。
REM ============================================================
cd /d "%~dp0"

where python >nul 2>nul
if %errorlevel%==0 (
    python serve.py
    goto :eof
)

where py >nul 2>nul
if %errorlevel%==0 (
    py serve.py
    goto :eof
)

echo.
echo [!] Python が見つかりませんでした。
echo     https://www.python.org/downloads/ からインストールしてください。
echo     ( インストール時に "Add Python to PATH" にチェック )
echo.
pause
