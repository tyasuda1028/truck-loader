# トラック積載最適化システム

生産計画から拠点別のトラック積載計画を自動算出・可視化するNext.jsアプリです。

## 機能

- **ダッシュボード** — 今週の出荷計画サマリー（台数・パレット数・拠点別積載率）
- **生産計画入力** — 週間生産数と拠点別配分比率の編集
- **積載計画** — 拠点・号車別のトラック荷台図と積み込み順序
- **マスタ設定** — 製品・拠点マスタの追加・編集・削除

## ローカル開発

```bash
npm install
npm run dev
```

[http://localhost:3000](http://localhost:3000) で起動します。

## Vercelへのデプロイ

### 方法①：Vercel CLI

```bash
npm install -g vercel
vercel
```

### 方法②：Vercelダッシュボード（推奨）

1. [vercel.com](https://vercel.com) にログイン
2. **New Project** → GitHubリポジトリをインポート
3. Framework: **Next.js**（自動検出）
4. **Deploy** ボタンを押すだけ

### 方法③：GitHubなしで直接デプロイ

```bash
npm install -g vercel
vercel --prod
```

## データ永続化

データはブラウザの **localStorage** に保存されます。デフォルトデータにリセットするには「マスタ設定」→「デフォルトにリセット」をご利用ください。

## 技術スタック

- [Next.js 14](https://nextjs.org/) (App Router)
- [TypeScript](https://www.typescriptlang.org/)
- [Tailwind CSS](https://tailwindcss.com/)
- [Zustand](https://zustand-demo.pmnd.rs/) (状態管理 + localStorage永続化)
