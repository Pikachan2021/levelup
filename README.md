# 🦇 Bat Hub

業務ツール（**Bat**）を **ローカルホスト** で開くための詰め合わせハブです。
第1弾として **FEDEX ワークフロー**（FedEx 未払い請求ダッシュボード）を収録しています。
将来いろいろな Bat を足していけるよう、追加が簡単な作りにしてあります。

> 🔒 **既存の仕組みは壊しません。** これは完全に新規・独立のローカル専用アプリです。
> Gmail / Google Drive / FedEx / PC の元データには一切書き込まず、`bats/<id>/data/` に
> 置かれたファイルを **読むだけ** です。

---

## 使い方（ローカルホストで開く）

追加インストール不要（Python 標準機能のみ）。

### Windows
`start.bat` を **ダブルクリック** → ブラウザで `http://localhost:8000` が開きます。

### Mac / Linux
```bash
./start.sh          # 初回のみ:  chmod +x start.sh
```

### どちらでも（直接）
```bash
python serve.py          # ポート8000
python serve.py 9000     # ポート変更
```

開いた画面（Bat Hub）から **FEDEX ワークフロー** のカードをクリックしてください。

---

## フォルダ構成

```
levelup/
├─ index.html            … Bat Hub（ランチャー）。registry.json を読んで一覧表示
├─ serve.py              … ローカルサーバー（標準ライブラリのみ）
├─ start.bat / start.sh  … 起動用
└─ bats/
   ├─ registry.json      … Bat の一覧（ここに追記すると増える）
   └─ fedex/             … 📦 FEDEX ワークフロー
      ├─ index.html         … ダッシュボード（動的）
      ├─ fedex_maksamattomat.html … 元の静的版（そのまま保存）
      ├─ data/*.json        … 請求データ
      ├─ scripts/*.py       … 金額収集 Python（Windows用・参照）
      └─ README.md
```

---

## 新しい Bat を足すには（将来の「詰め合わせ」）

1. `bats/<新id>/index.html` を作る（その Bat の画面）。
2. `bats/registry.json` の `bats` 配列に1ブロック追加:
   ```json
   {
     "id": "myhin",
     "name": "新しいツール",
     "emoji": "🧩",
     "summary": "このツールの説明",
     "entry": "myhin/index.html",
     "status": "active",
     "tags": ["タグ"]
   }
   ```
3. Bat Hub を再読み込み → カードが増えています。

---

## FEDEX ワークフローについて

FedEx の未払い請求（フィンランド語で *maksamattomat laskut*）を一覧表示します。
金額データは Windows 側の Python（`bats/fedex/scripts/`）が Gmail / PDF / FedEx Billing Centre
から集めて JSON を作ります。詳細は `bats/fedex/README.md` を参照してください。
