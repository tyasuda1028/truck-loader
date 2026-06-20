'use client';

/**
 * アップグレード（ペイウォール）モーダル。
 * - ネイティブ(iOS): RevenueCat の月額/年額パッケージを購入ボタンで表示＋購入復元
 * - Web: 購入は不可（Apple規約）。「iOSアプリから購読してください」を表示
 */
import type { UpgradePackage } from '@/lib/revenuecat';

const PRO_FEATURES = [
  { icon: '🏭', text: '複数拠点の積載計画（無料は1拠点まで）' },
  { icon: '📥', text: 'CSV インポート / エクスポート' },
  { icon: '🖨', text: 'PDF 出力（ドライバー配布資料）' },
  { icon: '☁️', text: 'クラウド同期（複数端末・バックアップ）' },
  { icon: '📷', text: 'バーコード積込照合' },
];

export function UpgradeModal({
  open, feature, native, packages, busy, onPurchase, onRestore, onClose,
}: {
  open: boolean;
  feature: string;
  native: boolean;
  packages: UpgradePackage[];
  busy: boolean;
  onPurchase: (pkg: UpgradePackage) => void;
  onRestore: () => void;
  onClose: () => void;
}) {
  if (!open) return null;

  const planLabel = (p: UpgradePackage) =>
    p.plan === 'annual' ? '年額プラン' : p.plan === 'monthly' ? '月額プラン' : 'プラン';

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-2xl shadow-xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ヘッダー */}
        <div className="px-5 pt-5 pb-4 bg-gradient-to-br from-blue-500 to-blue-700 text-white">
          <div className="flex items-start justify-between">
            <div>
              <div className="text-xs font-semibold opacity-80">スマコウバ積載 Pro</div>
              <h2 className="text-lg font-bold mt-0.5">プロにアップグレード</h2>
            </div>
            <button onClick={onClose} className="text-white/80 hover:text-white text-xl leading-none" aria-label="閉じる">×</button>
          </div>
          {feature && (
            <p className="text-sm mt-2 bg-white/15 rounded-lg px-3 py-2">
              「{feature}」はプロ機能です。アップグレードで利用できます。
            </p>
          )}
        </div>

        {/* 特典一覧 */}
        <div className="px-5 py-4">
          <ul className="space-y-2.5">
            {PRO_FEATURES.map((f) => (
              <li key={f.text} className="flex items-center gap-3 text-sm text-gray-700">
                <span className="text-base shrink-0">{f.icon}</span>
                <span>{f.text}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* 購入エリア */}
        <div className="px-5 pb-5">
          {native ? (
            packages.length > 0 ? (
              <div className="flex flex-col gap-2">
                {packages.map((p) => (
                  <button
                    key={p.identifier}
                    onClick={() => onPurchase(p)}
                    disabled={busy}
                    className="w-full flex items-center justify-between rounded-xl border-2 border-blue-600 px-4 py-3 text-sm font-bold text-blue-700 hover:bg-blue-50 disabled:opacity-50"
                  >
                    <span>{planLabel(p)}</span>
                    <span>{p.priceString}</span>
                  </button>
                ))}
                <button
                  onClick={onRestore}
                  disabled={busy}
                  className="mt-1 text-xs text-gray-500 hover:text-gray-700 underline disabled:opacity-50"
                >
                  購入を復元する
                </button>
                <p className="text-[11px] text-gray-400 mt-1 leading-relaxed">
                  サブスクは自動更新されます。期間終了の24時間前までに解約しない限り更新されます。解約は iOS の設定 →
                  Apple ID → サブスクリプションから行えます。
                </p>
              </div>
            ) : (
              <p className="text-sm text-gray-500 text-center py-4">{busy ? '読み込み中…' : 'プランを読み込めませんでした。時間をおいて再度お試しください。'}</p>
            )
          ) : (
            <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
              プロのご購読は <strong>iOS アプリ</strong>から行えます。iOS で購読すると、この Web 版でも自動的にプロ機能が使えるようになります。
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
