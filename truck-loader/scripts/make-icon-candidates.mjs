// スマコウバ積載 アイコン候補を複数生成（1024・α無し）。
import puppeteer from 'puppeteer-core';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, '..', 'screenshots');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

// 共通: 1024四方、フルブリード背景、中央コンテンツ
const page = (bg, inner) => `
<div style="width:1024px;height:1024px;${bg};display:flex;align-items:center;justify-content:center;overflow:hidden">${inner}</div>`;

const JP = `'Hiragino Sans','Hiragino Kaku Gothic ProN','Noto Sans JP',sans-serif`;

// 線トラック(0 0 24 24)
const truck = (stroke, sw = 1.6) => `
<svg viewBox="0 0 24 24" fill="none" stroke="${stroke}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round">
  <rect x="1" y="3" width="15" height="13" rx="1.2"></rect>
  <path d="M16 8h4l3 3v5h-7V8z"></path>
  <circle cx="5.5" cy="18.5" r="2.5"></circle><circle cx="18.5" cy="18.5" r="2.5"></circle>
</svg>`;

const CANDS = {
  // A) モノグラム「ス」＋小トラック（最もオリジナル・ブランド統一しやすい）
  A_mono_su: page(
    'background:linear-gradient(135deg,#6366f1 0%,#3b82f6 50%,#06b6d4 100%)',
    `<div style="position:relative;width:1024px;height:1024px">
      <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center">
        <span style="font-family:${JP};font-weight:900;font-size:600px;color:#fff;line-height:1;margin-top:-30px;letter-spacing:-10px">ス</span>
      </div>
      <div style="position:absolute;right:120px;bottom:130px;width:230px;height:230px">${truck('rgba(255,255,255,0.92)', 1.8)}</div>
    </div>`
  ),

  // B) スマート工場(ノコギリ屋根)＋トラック
  B_factory_truck: page(
    'background:linear-gradient(135deg,#1e3a8a 0%,#2563eb 100%)',
    `<svg viewBox="0 0 100 100" width="1024" height="1024">
      <!-- ノコギリ屋根(工場) -->
      <g fill="none" stroke="#ffffff" stroke-width="4.2" stroke-linejoin="round" stroke-linecap="round">
        <path d="M20 40 V26 L31 33 V26 L42 33 V26 L53 33 V40"/>
        <!-- トラック -->
        <g transform="translate(20,46)">
          <rect x="0" y="6" width="36" height="26" rx="3"/>
          <path d="M36 14 h10 l8 8 v10 h-18 z"/>
          <circle cx="12" cy="36" r="6"/><circle cx="44" cy="36" r="6"/>
        </g>
      </g>
    </svg>`
  ),

  // C) 積み荷キューブ＋前進矢印（積載のダイナミズム / ティール系で差別化）
  C_cargo: page(
    'background:linear-gradient(135deg,#0ea5e9 0%,#2563eb 100%)',
    `<svg viewBox="0 0 100 100" width="1024" height="1024">
      <g fill="#ffffff">
        <!-- 段ボール3個(パレット) -->
        <rect x="24" y="50" width="22" height="20" rx="2"/>
        <rect x="48" y="50" width="22" height="20" rx="2"/>
        <rect x="36" y="28" width="22" height="20" rx="2"/>
      </g>
      <g fill="none" stroke="#ffffff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round">
        <rect x="22" y="48" width="50" height="24" rx="3" fill="none"/>
        <!-- 前進矢印 -->
        <path d="M20 80 h54"/><path d="M66 74 l10 6 -10 6"/>
      </g>
    </svg>`
  ),

  // D) 「スマ」2文字＋下線トラック（文字ブランド強め）
  D_suma: page(
    'background:linear-gradient(135deg,#4338ca 0%,#0891b2 100%)',
    `<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px">
      <span style="font-family:${JP};font-weight:900;font-size:360px;color:#fff;line-height:1;letter-spacing:-6px">スマ</span>
      <div style="width:520px;height:140px">${truck('rgba(255,255,255,0.95)', 1.8)}</div>
    </div>`
  ),
};

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'shell',
  args: ['--no-sandbox', '--force-device-scale-factor=1'],
  defaultViewport: { width: 1024, height: 1024, deviceScaleFactor: 1 },
});
for (const [name, html] of Object.entries(CANDS)) {
  const p = await browser.newPage();
  await p.setContent(`<!doctype html><html><head><meta charset=utf-8><style>html,body{margin:0;padding:0}</style></head><body>${html}</body></html>`, { waitUntil: 'networkidle0' });
  const el = await p.$('div');
  await el.screenshot({ path: join(OUT, `icon_${name}.png`), omitBackground: false });
  await p.close();
  console.log('SHOT', name);
}
await browser.close();
console.log('DONE');
