import React from "react";

// ── ブランドロゴ（スマコウバ積載）──────────────────────────────
// アイコンと同じ意匠：青グラデの角丸に白い「ス」＋右下に小さなトラック。
// 計画＝工場 / 負荷＝工場 と同コンセプト（各アプリのモチーフ違い）。
// インラインSVGなので画面・印刷の両方で表示される。
export default function BrandLogo({
  size = 40,
  rounded = 22,
  className = "",
  style,
}: {
  size?: number;
  rounded?: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      className={className}
      role="img"
      aria-label="スマコウバ積載"
      style={{ WebkitPrintColorAdjust: "exact", printColorAdjust: "exact", ...style }}
    >
      <defs>
        <linearGradient id="smkb-load-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#6366f1" />
          <stop offset="0.5" stopColor="#3b82f6" />
          <stop offset="1" stopColor="#06b6d4" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="100" height="100" rx={rounded} fill="url(#smkb-load-grad)" />
      <text
        x="47"
        y="72"
        textAnchor="middle"
        fill="#ffffff"
        fontFamily="'Hiragino Sans','Hiragino Kaku Gothic ProN','Noto Sans JP',sans-serif"
        fontSize="68"
        fontWeight="900"
      >
        ス
      </text>
      {/* 右下：トラックの線画 */}
      <g
        transform="translate(62 61) scale(1.35)"
        fill="none"
        stroke="#ffffff"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M1 3h13v10H1z" />
        <path d="M14 7h4l3 3v3h-7z" />
        <circle cx="5.5" cy="17" r="2" />
        <circle cx="17.5" cy="17" r="2" />
      </g>
    </svg>
  );
}
