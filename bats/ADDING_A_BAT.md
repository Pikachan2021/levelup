# 🧩 新しい Bat の増やし方（詰め合わせガイド）

同じ localhost（`http://localhost:8000`）にツール（Bat）を追加する手順です。
**基本は2ステップ**：①フォルダを作る → ②`registry.json` に1ブロック足す。
保存して localhost をリロードすると、新しいカードが出ます。

---

## ステップ1：フォルダを作る

```
bats/<新しいid>/
   index.html      ← その道具の画面（無くてもよい。あれば「ダッシュボード」ボタンで開く）
   data/           ← 出力データを置くなら（任意）
   scripts/        ← 実行する中身（.bat / .py など。任意）
```

`id` は半角英数の短い名前（例: `telegram`, `riku`, `ollama`）。

## ステップ2：`bats/registry.json` に追記

`"bats": [ ... ]` の中に、カンマで区切って1ブロック足すだけです。

### A) 「▶ 実行」ボタン付き（.bat を起動する例）
```json
{
  "id": "telegram",
  "name": "Telegram 投稿bot",
  "emoji": "✈️",
  "summary": "Telegramへ自動投稿する道具",
  "entry": "telegram/index.html",
  "status": "active",
  "tags": ["Telegram"],
  "run": {
    "cwd": "telegram",
    "steps": [
      { "label": "起動", "cmd": ["cmd", "/c", "telegram_start.bat"] }
    ]
  }
}
```

### B) 「▶ 実行」ボタン付き（Python を動かす例）
```json
{
  "id": "myhin",
  "name": "サンプル道具",
  "emoji": "🧪",
  "summary": "Pythonで処理する道具",
  "entry": "myhin/index.html",
  "status": "active",
  "tags": ["sample"],
  "run": {
    "cwd": "myhin",
    "steps": [
      { "label": "処理1", "cmd": ["{python}", "scripts/do_something.py"] }
    ]
  }
}
```

### C) 表示だけ（実行ボタン不要）
`"run"` を**書かない**だけ。カードは「📋 ダッシュボード」ボタンのみになります。

---

## 各項目の意味

| キー | 役割 | 必須 |
|---|---|---|
| `id` | 内部ID（フォルダ名と合わせる） | ✅ |
| `name` | カードに出る名前 | ✅ |
| `emoji` | アイコン絵文字 | 任意 |
| `summary` | 説明文 | 任意 |
| `entry` | 「ダッシュボード」で開くページ（`<id>/index.html`） | ✅ |
| `status` | `active`=稼働中 / `wip`=準備中（バッジ色が変わる） | 任意 |
| `tags` | 検索用の小さなラベル | 任意 |
| `run` | これを書くと「▶ 実行」ボタンが出る | 任意 |

### `run` の中身
- `cwd` … 実行する作業フォルダ（`bats/` からの相対。例 `"telegram"`）
- `steps` … 上から順に実行。各 step は
  - `label` … ログに出る見出し
  - `cmd` … 実行コマンドを単語ごとに配列で書く
    - `"{python}"` は今のPythonに自動で置き換わります
    - `.bat` を動かすなら `["cmd", "/c", "ファイル名.bat"]`

---

## 動作の確認
1. `registry.json` を保存
2. ブラウザで `http://localhost:8000` をリロード（更新）
3. 新しいカードが出る → 「▶ 実行」or「📋 ダッシュボード」

> 💡 `registry.json` はカンマの付け忘れ・余分なカンマでエラーになりがちです。
> 不安なら https://jsonlint.com に貼って「Validate」で確認できます。

---

## メモ
- 実行はすべて **あなたのPC上（localhost）** で動きます。サーバーは `127.0.0.1` のみ公開。
- `.bat` の中で参照しているパスやアプリ（Edge、Python、各種ツール）は、その .bat 側の前提に依存します。
- 困ったら「この .bat をハブに追加して」と言ってもらえれば、中身を読んで適切に登録します。
