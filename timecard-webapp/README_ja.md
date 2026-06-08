# ワンタップ作業ログ Web アプリ（スロット方式）

スタッフが **自分専用 URL を PC で開いて作業ボタンをクリックするだけ**で、
対象シートの **今日の行の「次の空きスロット（列）」に〔作業名＋現在時刻〕** が入ります。
実シートと同じ「**1日＝2行（上段＝作業／下段＝時刻）・左から順に埋める**」レイアウトに対応。

- 画面・ボタンは**英語**（スタッフ向け）
- 人ごとに別 URL（Eemeli / Tuomas / Markus / Matti / Juhani / Dea）
- 押し間違いは「↩ Undo last entry」で直前のスロットを取り消し
- セルは直接いじらない

> ⚠️ **本番シートはまだ変更しません。** まずは【テスト用コピー】で
> `testToday()` を実行 → 検出位置を確認 → ボタンで試す、の順で進めてください。

---

## ファイル構成
| ファイル | 役割 |
|---|---|
| `Code.gs` | 画面表示・打刻（次の空きスロットに作業＋時刻）・取り消し・設定確認 |
| `Index.html` | PC 向けの作業ボタン画面（英語） |
| `appsscript.json` | タイムゾーン・公開設定 |
| `preview.html` | デプロイ不要の確認用（ブラウザで開くだけ） |

---

## 記録の動き（画像通り）
```
[ 作業ボタンをクリック ]
        │
        ▼
今日の行（作業行）を探す ──► その行の左から最初の「空きスロット列」を探す
        │
        ├─ 作業行・その列        → 作業名（例 Picking）
        └─ 作業行+1・その列      → 現在時刻（例 09:39:32）
```
次にクリックすると、その右隣の空きスロットに入る（左から順に埋まる）。

---

## セットアップ手順

### 0. テスト用コピーで試す（必須）
本番を触る前にコピーで検証します（既に作成済みのコピーを利用）。

### 1. コードを貼り付ける
コピーを開き **拡張機能 → Apps Script**。
`Code.gs` を貼り付け、HTML ファイル `Index` を作って `Index.html` を貼り付け。
（任意で `appsscript.json` も反映。最低限タイムゾーンは合わせる）

### 2. 設定（CONFIG）を合わせる
`Code.gs` 冒頭の `CONFIG` を実シートに合わせます。

| 項目 | 既定 | 説明 |
|---|---|---|
| `TOKEN` | `'CHANGE_ME_1234'` | **必ず変更**。URL の `&token=` と一致が必要 |
| `TIME_ZONE` | `'Europe/Helsinki'` | 記録時刻のタイムゾーン |
| `TIME_FORMAT` | `'HH:mm:ss'` | 時刻の書式（例 `09:39:32`） |
| `DATE_COL` | `1` | 日付が入っている列（A=1） |
| `FIRST_SLOT_COL` | `3` | 最初のスロット列（C=3） |
| `LAST_SLOT_COL` | `40` | スロットを探す右端（多めでOK） |
| `TIME_ROW_OFFSET` | `1` | 時刻を書く行＝作業行＋この値（下の行なら 1） |
| `TASKS` | 下記 | ボタンに出す作業項目 |
| `STAFF` | 下記 | スタッフ → 表示名・書き込み先シート名 |

作業項目（ボタン）：
- **WORK**：morning meeting / Order printing / Picking / Packing / Labeling / Scanning / Company work / other work
- **BREAK / OTHER**：Teaching / meeting / Registering / cleaning / shelving / trash / Lounas / Tauko

スタッフ → シート名（実タブに対応。各スタッフの「名前」シート＝スロット式の方に書き込む）：
| staff キー | 表示名 | 書き込み先シート |
|---|---|---|
| `emeli` | Eemeli | `Emeli` |
| `tuomas` | Tuomas | `Tuomas` |
| `markus` | Markus | `Markus` |
| `matti` | Matti | `Matti` |
| `juhani` | Juhani | `Juhani` |
| `dea` | Dea | `Dea` |

> 日付セルは Date 型でも `6/8(月)` `6月8日` のような文字列でも今日を判定します。

### 3. 検出位置を確認する（testToday）
Apps Script エディタで関数 **`testToday`** を選んで実行 → **実行ログ**を確認。
```
sheet=Emeli todayTaskRow=◯ timeRow=◯ nextSlotCol=◯
```
- `todayTaskRow` が今日の行、`nextSlotCol` が次に埋まる列。
- 想定とズレていたら `DATE_COL` / `FIRST_SLOT_COL` / `TIME_ROW_OFFSET` を調整。

### 4. デプロイする
**デプロイ → 新しいデプロイ → ウェブアプリ**
（実行：自分／アクセス：全員）→ 初回は権限を承認。
表示される **ウェブアプリ URL** を控える。

### 5. スタッフ別 URL を配布
```
Eemeli : .../exec?staff=emeli&token=xxxx
Tuomas : .../exec?staff=tuomas&token=xxxx
Markus : .../exec?staff=markus&token=xxxx
Matti  : .../exec?staff=matti&token=xxxx
Juhani : .../exec?staff=juhani&token=xxxx
Dea    : .../exec?staff=dea&token=xxxx
```
各自 PC でブックマークして使用。

---

## 使い方（スタッフ向け）
1. 自分の URL を開く。
2. 始める作業のボタンをクリック → 今日の行の次のスロットに作業＋現在時刻が入る。
3. 押し間違えたら **↩ Undo last entry**。

---

## 注意・調整
- **「Could not find today's date row」** → `DATE_COL` か日付の形式を確認。今日の日付の行が必要。
- **入る列がズレる** → `FIRST_SLOT_COL`、時刻が別行になる → `TIME_ROW_OFFSET` を調整（`testToday` で確認）。
- **プルダウン（入力規則）** → 書き込む作業名がプルダウンの候補と一致していれば問題なし。規則が「無効な入力を拒否」になっている場合は候補名と完全一致させること。
- **時刻を文字列でなく時刻値で入れたい** 等の要望があれば調整します。
- コード修正後は **デプロイ → デプロイを管理 → 編集 → 新バージョン → デプロイ** で反映（URL は不変）。
