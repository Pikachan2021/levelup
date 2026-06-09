# 📦 FEDEX ワークフロー (Bat)

Ayumu Oy の **FedEx 未払い請求（maksamattomat laskut）** を確認するためのツールです。

## 中身

| ファイル | 役割 |
|---|---|
| `index.html` | ダッシュボード（動的）。`data/` の JSON を読んで一覧・合計・件数を表示。Bat Hub から開く入口。 |
| `fedex_maksamattomat.html` | 元の静的版（デスクトップにあった `fedex_maksamattomat.html` をそのまま保存）。 |
| `data/fedex_unpaid_amounts.json` | 未払い請求 27 件と金額。`amount` が `EI LADATTU`＝金額未取得。 |
| `data/fedex_gmail_result.json` | 支払済み / 未払いの請求番号リスト。 |
| `scripts/` | 金額を集める Python（Windows + Edge + Playwright 用、参照コピー）。 |

## 開き方

リポジトリ直下で `start.bat`（Windows）/ `./start.sh`（Mac/Linux）を実行 →
ブラウザで Bat Hub が開く → **FEDEX ワークフロー** のカードをクリック。

直接開くなら: `http://localhost:8000/bats/fedex/index.html`

## 金額を最新にするには

1. Windows 側で `scripts/` の Python を実行（手順は `scripts/README.md`）。
2. 生成された `fedex_unpaid_amounts.json` / `fedex_gmail_result.json` を
   この `data/` フォルダに上書きコピー。
3. ダッシュボードを再読み込み（自動反映）。

> このツールは `data/` の JSON を **読むだけ**。Gmail・Drive・FedEx 等の元データには一切書き込みません。
