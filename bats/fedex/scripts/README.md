# FEDEX スクリプト（データ収集 bat）

> ⚠️ これらは **参照用コピー** です。元は PC デスクトップの `fedex/` フォルダにあります。
> **Windows + Microsoft Edge + Playwright** 前提で、このリポジトリのローカルサーバー（Linux/Mac）では動きません。
> ダッシュボード表示だけなら実行不要です（`../data/` の JSON を読むだけ）。

## パイプライン

```
1) fetch_fedex_invoices.py   Gmail から請求番号を収集・支払済みと照合
                              → fedex_gmail_result.json  { all_gmail, paid, unpaid }

2) fetch_fedex_amounts_v4.py  未払い請求の PDF を Gmail からDL → PDFから金額抽出
                              → fedex_unpaid_amounts.json  [{ invoice, amount }]
   （別ルート） fetch_fedex_billing.py  FedEx Billing Centre から金額取得
                              → fedex_billing_result.json

3) 上記 JSON を ../data/ に置く  →  ダッシュボード(../index.html)が自動表示
```

## Windows での実行例

```bat
pip install playwright pymupdf
playwright install
python fetch_fedex_invoices.py
python fetch_fedex_amounts_v4.py
```

実行後にできた `fedex_unpaid_amounts.json` / `fedex_gmail_result.json` を
`bats/fedex/data/` にコピーすると、ローカルのダッシュボードに反映されます。

## メモ
- 請求番号は `517` で始まる9桁（例: `517145052`）。
- Gmail 検索の送信元は `nordicinvhelp`。
- スクリプト内のパス（`C:/Users/Anu/...`、Edge のパス）は実行環境に合わせて調整してください。
- パスワード等の秘密情報は含まれていません（ログイン済みの Edge プロファイルを利用）。
