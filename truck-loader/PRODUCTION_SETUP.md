# 本番セットアップ手順書 — スマコウバ積載（Web + iOS）

最終更新: 2026-06-15

このドキュメントは、**Webアプリ（Vercel）と iOSアプリ（Capacitor）を本番稼働**させ、
オフライン動作・クラウド同期・カメラ/バーコード・プッシュ通知をすべて有効にするための
一気通貫の手順です。設計の詳細は [IOS_MIGRATION_PLAN.md](./IOS_MIGRATION_PLAN.md) を参照。

---

## 0. 全体像と前提

```
[iPhoneアプリ (Capacitor)]                 [Vercel (Next.js)]            [Neon Postgres]
  - オフラインUI(同梱www)        ── HTTPS ──>  /api/auth/token            companies/users
  - ローカルDB(IndexedDB)                      /api/sync/pull|push  ─────> 正規化テーブル(products等)
  - カメラ/プッシュ/自動回転                    /api/push/register|test     sync_meta / device_tokens
  - Bearerトークン認証                          /api/ai-recommendation
        │                                            │
        └──────── APNs(プッシュ) <── api.push.apple.com (.p8で署名)
```

**必要なアカウント/ツール**
- Vercel アカウント（既存プロジェクト: `tyasuda1028-truck-loader`）
- Neon Postgres（`DATABASE_URL`）
- Apple Developer Program（年99ドル／プッシュ通知・実機配布に必須）
- Mac + **フルXcode**（Command Line Toolsのみでは不可）+ CocoaPods

**このリポジトリの場所**: `truck-loader/truck-loader`

---

## 1. データベース（Neon）

### 1-1. スキーマ適用
Neon Dashboard → SQL Editor で、**この順**に実行:
1. [`neon-schema.sql`](./neon-schema.sql)（ベーステーブル）
2. [`neon-auth-schema.sql`](./neon-auth-schema.sql)（マルチテナント化＝`company_id` 追加。※既存データはクリアされます）

> `sync_meta`・`device_tokens` テーブルはAPI初回アクセス時に自動作成されます（手動不要）。

### 1-2. 最初の会社アカウント作成
デプロイ後、Web版の `/register` から会社名・メール・パスワードで登録（マルチテナントの最初のテナント）。
このアカウントが iOS の「クラウド同期ログイン」でも使えます。

---

## 2. Vercel デプロイ + 環境変数

### 2-1. 環境変数（Vercel → Project → Settings → Environment Variables）

| 変数 | 必須 | 用途・例 |
|---|---|---|
| `DATABASE_URL` | ✅ | Neon接続文字列 `postgresql://...sslmode=require` |
| `NEXTAUTH_SECRET` | ✅ | セッション＋**トークン認証の署名鍵**。`openssl rand -base64 32` |
| `NEXTAUTH_URL` | ✅ | 本番URL（例 `https://tyasuda1028-truck-loader.vercel.app`） |
| `APNS_KEY` | ✅(プッシュ) | .p8鍵の全文（PKCS8 PEM、改行込み）。§5参照 |
| `APNS_KEY_ID` | ✅(プッシュ) | Key ID（10文字） |
| `APNS_TEAM_ID` | ✅(プッシュ) | Team ID（10文字） |
| `APNS_BUNDLE_ID` | ✅(プッシュ) | アプリのBundle ID（=`§4`のIDと一致） |
| `APNS_PRODUCTION` | 任意 | `1`=本番APNs / 未設定=sandbox(開発ビルド)。**TestFlight/審査配布は`1`** |

> `NEXTAUTH_SECRET` は **Web と iOSトークン認証で同一**の鍵を使います（変更すると既存トークンが無効化）。

### 2-2. デプロイ
```bash
cd truck-loader/truck-loader
npx vercel --prod        # または GitHub連携でmainにpush
```
完了後、本番URL（例 `https://tyasuda1028-truck-loader.vercel.app`）を控える。**これを §6 の `NEXT_PUBLIC_SYNC_API` に使う。**

---

## 3. Web版の動作確認
1. 本番URLにアクセス → `/register` で会社アカウント作成 → ログイン
2. ダッシュボードで「サンプルで始める」→ 積載計画が表示されればOK

---

## 4. iOS：事前準備とBundle ID/署名

### 4-1. ツール（未導入の場合）
```bash
# フルXcodeをApp Storeから導入後:
sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
sudo xcodebuild -license accept
brew install cocoapods            # 既に導入済みなら不要
# iOSシミュレータ実行も試すなら（実機のみなら不要・約8.5GB）:
# xcodebuild -downloadPlatform iOS
```
> 補足: `xcode-select` を切り替えずに使う場合は、各ビルドコマンドの前に
> `export DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer` を付けても可。

### 4-2. Bundle ID を自社のものに変更
1. Apple Developer → Certificates, IDs & Profiles → Identifiers で App ID を作成
   （例 `jp.co.<自社>.truckloader`）。**Push Notifications を有効**にする。
2. [`capacitor.config.ts`](./capacitor.config.ts) の `appId` を同じIDに変更。
3. 反映: `npm run cap:sync`
4. Xcodeでも Target → General → Bundle Identifier が一致しているか確認。

### 4-3. 署名（Xcode）
- `npm run cap:open` → Xcode で **App ターゲット → Signing & Capabilities**
- **Team** を選択（実機テストは無料Apple IDでも可。配布はApple Developer Program必須）
- 「Automatically manage signing」推奨

---

## 5. iOS：プッシュ通知（APNs）

### 5-1. APNs鍵(.p8)の発行
Apple Developer → Keys → **+** → 「Apple Push Notifications service (APNs)」を有効化して作成。
- ダウンロードした `AuthKey_XXXXXXXXXX.p8`（**再DL不可・厳重保管**）
- **Key ID**（ファイル名の10文字）と **Team ID**（メンバーシップ画面）を控える

### 5-2. Vercelに登録（§2-1のAPNS_*）
- `APNS_KEY` … .p8の中身を**全文**（`-----BEGIN PRIVATE KEY-----` ～ `-----END PRIVATE KEY-----`）。
  Vercelの環境変数に改行込みで貼り付け（1変数に複数行可）。
- `APNS_KEY_ID` / `APNS_TEAM_ID` / `APNS_BUNDLE_ID`（=§4のID）/ `APNS_PRODUCTION`（配布時`1`）

### 5-3. Xcodeで Push Notifications capability
- Signing & Capabilities → **+ Capability → Push Notifications** を追加
  （`aps-environment` entitlement が自動で付与される）
- `Info.plist` の `UIBackgroundModes: remote-notification` は設定済み。

---

## 6. iOS：ネイティブビルド設定（同期APIの向き先）

ネイティブアプリは別オリジン（Vercel）を叩くため、**APIベースURLをビルドに埋め込む**必要があります。

`.env.local`（または `.env.production`）に追加:
```bash
NEXT_PUBLIC_SYNC_API="https://tyasuda1028-truck-loader.vercel.app"   # §2の本番URL
```
> これが未設定だと、iOSの同期/プッシュ登録/ログインが相対URLになり失敗します。Web版（同一オリジン）は空でOK。

---

## 7. iOS：ビルド & 配布

### 7-1. フロント静的ビルド → ネイティブ反映
```bash
cd truck-loader/truck-loader
npm run build:ios     # www/ に静的フロント出力（NEXT_PUBLIC_CAPACITOR=1 で local + sync 既定）
npm run cap:sync      # www → ios 反映 + pod install（5プラグイン）
npm run cap:open      # Xcode で App.xcworkspace を開く
```

### 7-2. 実機で実行（開発確認）
- Xcodeで iPhone(実機)を接続して選択 → ▶ Run
- 初回はデバイスの「設定 → 一般 → VPNとデバイス管理」で開発者を信頼

### 7-3. TestFlight 配布（推奨）
1. Xcode → 実機/「Any iOS Device」を選択 → Product → **Archive**
2. Organizer → **Distribute App → App Store Connect → Upload**
3. App Store Connect → TestFlight → 内部テスターを追加 → 招待
   - ※ TestFlight/配布ビルドは APNs **本番**ゲートウェイを使うため `APNS_PRODUCTION=1` に
   - ※ MLKit(バーコード)は実機=arm64で問題なし（シミュレータarm64は非対応）

---

## 8. 実機 疎通確認チェックリスト

- [ ] アプリ起動 → ダッシュボード表示（機内モードでも表示＝オフラインOK）
- [ ] 「サンプルで始める」→ 積載計算が出る（ローカルDB＋計算）
- [ ] 端末を横にすると横表示になる（自動回転）
- [ ] 設定 →「☁️ クラウド同期」→ 会社アカウントでログイン →「✓ ログイン済み（同期有効）」
- [ ] ヘッダー右上の同期ステータスが「同期済み hh:mm」になる
- [ ] Web版で製品を編集 → アプリで同期 → 反映される（逆も）＝**データ統一の確認**
- [ ] 積載計画 →「📷 積込スキャン」→ 製品バーコードを読むと ✓/⚠️ 表示
- [ ] 設定 →「🔔 プッシュ通知」→ 有効化（許可ダイアログ）
- [ ] `POST /api/push/test`（ログイン状態）でテスト通知が端末に届く

テスト通知の送り方（ログイン済み端末がある状態で、ブラウザのコンソール等から）:
```js
fetch('https://<本番URL>/api/push/test', {
  method:'POST', headers:{'Content-Type':'application/json','Authorization':'Bearer <端末トークン>'},
  body: JSON.stringify({ title:'テスト', body:'届きましたか？' })
}).then(r=>r.json()).then(console.log)
```

---

## 9. トラブルシューティング

| 症状 | 原因 / 対処 |
|---|---|
| 同期が「同期エラー」 | `NEXT_PUBLIC_SYNC_API` 未設定/誤り、または未ログイン。§6・設定のログインを確認 |
| ログイン失敗(401) | メール/パスワード誤り、または `NEXTAUTH_SECRET` がWeb/トークンで不一致 |
| プッシュが届かない | `APNS_*` 未設定、`APNS_PRODUCTION` の本番/sandbox不一致、Push capability未追加、実機未許可 |
| `xcodebuild: requires Xcode` | `sudo xcode-select -s /Applications/Xcode.app/Contents/Developer`（または `DEVELOPER_DIR` を付与） |
| シミュレータにインストール不可(arch) | MLKitがarm64シミュレータ非対応。**実機**推奨。シミュレータで動かすなら下記「シミュレータ実行」参照 |
| `module 'Capacitor' has a minimum deployment target` | プラグイン間のiOS最低版不一致。`ios/App/Podfile` を `platform :ios, '15.6'`＋post_installで全pod統一、Appターゲットの `IPHONEOS_DEPLOYMENT_TARGET` も 15.6 に（本リポジトリは設定済み） |
| アプリは起動するが画面が黒い | 起動直後の読み込み中であることが多い。数秒待つ。続く場合は `public/index.html` 同梱と `capacitor.config.json` を確認 |

### シミュレータ実行（MLKitを外してarm64ネイティブで動かす）
MLKitは Apple Silicon の arm64シミュレータ非対応のため、シミュレータで動かす場合だけバーコード機能を外してビルドします（シミュレータにカメラは無いので機能損失なし）。`ios/App/Podfile` は `NO_MLKIT` 環境変数で除外できるよう設定済み:
```bash
export DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer
cd ios/App
NO_MLKIT=1 pod install
NO_MLKIT=1 xcodebuild -workspace App.xcworkspace -scheme App -sdk iphonesimulator \
  -destination 'generic/platform=iOS Simulator' -derivedDataPath /tmp/tl-dd ARCHS=arm64 \
  ONLY_ACTIVE_ARCH=YES CODE_SIGNING_ALLOWED=NO build
xcrun simctl boot "iPhone 17"; open -a Simulator
xcrun simctl install booted /tmp/tl-dd/Build/Products/Debug-iphonesimulator/App.app
xcrun simctl launch booted com.tetsuyayasuda.truckloader
# 実機/配布ビルドに戻すときは MLKitを復元: pod install （NO_MLKITなし）
```
> 実機/TestFlight用ビルドでは必ず `pod install`（NO_MLKITなし）で MLKit を含めること。
| Web↔ネイティブでデータがずれる | 稀な同時編集時のLWW。Web書込時の `sync_meta` 更新は今後の高度化（IOS_MIGRATION_PLAN 参照） |
| `cap sync` でpod失敗 | CocoaPods未導入 or Xcode未選択。§4-1を実施 |

---

## 10. 環境変数 早見表

**Vercel（サーバー）**
```
DATABASE_URL, NEXTAUTH_SECRET, NEXTAUTH_URL                             # 必須
APNS_KEY, APNS_KEY_ID, APNS_TEAM_ID, APNS_BUNDLE_ID, APNS_PRODUCTION    # プッシュ
```

**iOSビルド（.env.local / .env.production）**
```
NEXT_PUBLIC_SYNC_API   # 本番URL（ネイティブの同期/認証/プッシュ登録の向き先）
# NEXT_PUBLIC_CAPACITOR=1 は build:ios が自動付与（手動設定不要）
```

---

## 11. リリース後の更新フロー
- **Web**: 通常どおり Vercel にデプロイ（`vercel --prod` / GitHub）
- **iOS フロント変更**: `npm run build:ios && npm run cap:sync` → Xcodeで再Archive → TestFlight/審査
  （ネイティブプラグイン追加時のみ `cap sync` が pod を更新）

---

## 12. App Store 申請手順

### 12-0. 前提
- **Apple Developer Program 加入**（年 99 USD／約¥15,000）。**無料Personal Teamでは申請不可**。
  - 法人公開 → Organization（D-U-N-S番号が必要）／個人公開 → Individual。
- フルXcode（導入済み）。

### 12-1. App ID・Bundle ID（Apple Developer）
1. developer.apple.com → Certificates, IDs & Profiles → Identifiers で **Bundle ID を登録**
   （例 `com.<会社>.truckloader`。現状の `com.tetsuyayasuda.truckloader` は個人用なので会社で出すなら取り直す）
2. プッシュを使うなら **Push Notifications を有効**化（§5の.p8もこのIDで発行）
3. `capacitor.config.ts` の `appId` と XcodeのBundle Identifier を同じIDに揃える → `npm run cap:sync`

### 12-2. App Store Connect でアプリ作成
appstoreconnect.apple.com → App → ＋ → 新規App：プラットフォーム iOS／名前（スマコウバ積載）／主要言語 日本語／Bundle ID 選択／SKU 任意。

### 12-3. リリースビルド作成（※ App Store版は実機arm64・MLKit込み）
```bash
export DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer
cd truck-loader/truck-loader
npm run build:ios && npm run cap:sync     # ← NO_MLKITは使わない（フル）
npm run cap:open
```
Xcode で：
- General：Version（例 1.0.0）/ Build（例 1）、**App Icon を全サイズ設定**（1024px含む。未設定だと審査不可）
- Signing & Capabilities：有料アカウントのTeam、Bundle ID、（使うなら）Push Notifications capability
- 実行先を **Any iOS Device**、スキームを **Release**
- **Product → Archive** → Organizer → **Distribute App → App Store Connect → Upload**

### 12-4. メタデータ入力（App Store Connect）
- **スクリーンショット**（必須）：本アプリは横向き固定なので**横向き**で。6.7インチ等の必須サイズ
- 説明文・キーワード・サポートURL・**プライバシーポリシーURL（必須）**
- **App Privacy（データ収集）**アンケート：カメラ（バーコード読取）、アカウント情報（メール＝クラウド同期する場合）など正直に申告
- 年齢レーティング、カテゴリ（ビジネス／仕事効率化）

### 12-5. 審査で詰まりやすい点（このアプリ固有）
- ✅ カメラ利用説明（`NSCameraUsageDescription`）設定済み
- **アカウント機能（クラウド同期ログイン）を有効にして出す場合**、Appleは「**アカウント削除導線**」を要求（Guideline 5.1.1(v)）。同期を使うなら退会/削除機能の追加が必要。**オフライン専用で出すなら不要**
- ログインが要る機能があるなら**審査用デモアカウント**を提出
- アプリ説明文・メタ情報に残る「AIが提案」の旧表現は実機能と不一致なので**申請前に修正**推奨

### 12-6. 提出 → 審査（通常1〜3日）→ 承認 → 公開

### 配布形態の選択
- **一般公開**：App Store（上記フル手順）
- **社内のみ**：**TestFlight**（審査が軽く最大1万人に配布、まず推奨）／ **Apple Business Manager のカスタムApp**（社内限定で確実に配布）
