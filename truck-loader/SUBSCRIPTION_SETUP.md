# サブスク（アプリ内課金）セットアップ手順

スマコウバ積載は **フリーミアム + サブスク**（月額/年額）で、課金は **RevenueCat** 経由の Apple アプリ内課金(IAP)です。
購入は iOS アプリ内で行い、サーバ経由で Web 版もロック解除されます。

## 無料 / Pro の境界（実装済み）
- **無料**: 生産数・在庫の手入力、**1拠点**の積載計算・荷台レイアウト閲覧、基本ダッシュボード
- **Pro**: 複数拠点、CSV インポート/エクスポート、PDF 出力、クラウド同期、バーコード積込照合

ゲート箇所（コード）:
- PDF / バーコード: [app/loading-plan/LoadingPlanInner.tsx](./app/loading-plan/LoadingPlanInner.tsx)
- CSV インポート: [app/production/page.tsx](./app/production/page.tsx)
- 複数拠点: [app/settings/page.tsx](./app/settings/page.tsx)（2拠点目以降をブロック）
- クラウド同期: [lib/sync/remote.ts](./lib/sync/remote.ts)（Proのみ実同期）
- 判定: [lib/entitlement.tsx](./lib/entitlement.tsx) / ペイウォール [components/UpgradeModal.tsx](./components/UpgradeModal.tsx)

## アーキテクチャ
- RevenueCat の **appUserID = companyId**（会社単位のサブスク）
- iOS: RevenueCat SDK の `pro` エンタイトルメントで即時判定（[lib/revenuecat.ts](./lib/revenuecat.ts)）
- サーバ: RevenueCat Webhook → `companies` テーブル更新（[lib/server/subscription.ts](./lib/server/subscription.ts)、列は [migrations/0003_subscription.sql](./migrations/0003_subscription.sql) で追加済み）
- Web: `GET /api/subscription/status` で会社の Pro 状態を参照

---

## 必要な設定（加入・アプリ作成後に実施）

### 1. App Store Connect でサブスク商品を作成
1. （前提）Apple Developer Program 加入＋アプリ作成（Bundle ID `com.tetsuyayasuda.truckloader`）
2. 「契約・税金・口座情報」で **有料App契約**に同意し、銀行・税務情報を入力（IAPに必須）
3. アプリ → 「サブスクリプション」→ サブスクリプショングループを作成（例: `pro`）
4. 商品を2つ作成（例）:
   - 月額: product id 例 `pro_monthly`（自動更新）
   - 年額: product id 例 `pro_annual`（自動更新・割安）
   - 価格・無料トライアル（任意）を設定
5. 各商品の審査用情報・スクリーンショットを登録

### 2. RevenueCat を設定
1. https://www.revenuecat.com でアカウント作成 → Project 作成
2. **App を追加**（Apple App Store）。App Store Connect の **App-Specific Shared Secret** と **In-App Purchase Key(API Key)** を登録
3. **Entitlement** を作成: identifier = `pro`
4. **Products** に ASC の product id（`pro_monthly` / `pro_annual`）を登録し、`pro` entitlement に紐付け
5. **Offering**（current）を作成し、Monthly / Annual パッケージに上記productを割当
6. **API keys** → Apple の **public key**（`appl_...`）を控える → 環境変数へ（下記）
7. **Integrations → Webhooks** を追加:
   - URL: `https://smakouba.vercel.app/api/webhooks/revenuecat`
   - Authorization header: 任意の長い文字列（= 環境変数 `RC_WEBHOOK_AUTH` と一致させる）

### 3. 環境変数
| 変数 | 場所 | 値 |
|---|---|---|
| `NEXT_PUBLIC_RC_IOS_API_KEY` | iOSビルド時（`npm run build:ios` の前に export）＋ Vercel | RevenueCat Apple **public** key（`appl_...`） |
| `RC_WEBHOOK_AUTH` | **Vercel のみ** | RevenueCat Webhook の Authorization と同じ長い文字列 |

iOSビルド例:
```bash
NEXT_PUBLIC_RC_IOS_API_KEY=appl_xxx \
NEXT_PUBLIC_SYNC_API=https://smakouba.vercel.app \
npm run build:ios
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer npx cap sync ios
```

### 4. サンドボックスでテスト
1. App Store Connect → ユーザーとアクセス → **Sandbox テスター**を作成
2. 実機の 設定 → App Store → サンドボックスアカウントでサインイン
3. アプリで「プロにアップグレード」→ サンドボックス購入 → Pro 機能解放を確認
4. RevenueCat ダッシュボードにイベントが届き、`companies.is_pro` が更新され、Web でも解放されることを確認

### 5. 審査用メモ（App Store Connect）
- デモアカウント（メール/パスワード）に加え、**サンドボックスでの購入手順**を記載
- サブスクの価格・期間・自動更新の説明、復元ボタンの場所（設定→プラン）を明記

---

## 注意
- `NEXT_PUBLIC_RC_IOS_API_KEY` 未設定でもアプリは動作（購入機能のみ無効・警告ログ）。
- Web には購入導線を置かない（Apple規約）。Web は「iOSアプリから購読」と表示。
- 解約は iOS 設定 → Apple ID → サブスクリプション。
