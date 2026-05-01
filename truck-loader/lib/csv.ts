import type { Product, PalletType, Warehouse, ProductionPlan, InventoryStock, LocationStock, DailyProductionPlan, PlannedSales, DistributionRatios, InTransitStock } from './types';

// ─── CSV パース共通 ───────────────────────────────────────────────────

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

/**
 * 製品コードを正規化する：
 *   - NFKC 正規化（全角数字/英字 → 半角）
 *   - 前後空白除去・先頭BOM除去
 *   - 科学記法（例：1.06E+09）が安全な整数に復元できれば整数文字列に戻す
 *
 * CSVとマスタの突合せ時は両側に通すことで、Excelによる自動変換やコピペ時の
 * 文字種ゆれを吸収する。
 */
function normalizeProductCode(s: string): string {
  if (!s) return '';
  let v = s.normalize('NFKC').trim().replace(/^﻿/, '');
  if (/^-?\d+(\.\d+)?[eE][+-]?\d+$/.test(v)) {
    const n = Number(v);
    if (Number.isInteger(n) && Math.abs(n) < Number.MAX_SAFE_INTEGER) {
      v = String(n);
    }
  }
  return v;
}

/**
 * 日付文字列を YYYY-MM-DD に正規化。非日付なら null。
 *
 * 受け付ける形式：
 *   - YYYY-MM-DD / YYYY-M-D   (例: 2026-04-01, 2026-4-1)
 *   - YYYY/MM/DD / YYYY/M/D   (例: 2026/04/11, 2026/4/11)
 *   - YYYY年M月D日             (例: 2026年4月1日)
 *   - M/D / M/D/YY / M/D/YYYY (例: 4/1, 4/1/26, 4/1/2026)
 *
 * 全角数字・全角スラッシュは NFKC で半角に正規化されてから判定される。
 */
function normalizeDate(raw: string, defaultYear?: number): string | null {
  const s = raw.normalize('NFKC').trim();
  // YYYY年M月D日 (漢字形式)
  const jp = s.match(/^(\d{4})年(\d{1,2})月(\d{1,2})日?$/);
  if (jp) {
    return `${jp[1]}-${jp[2].padStart(2, '0')}-${jp[3].padStart(2, '0')}`;
  }
  // YYYY-MM-DD / YYYY-M-D (年先頭・ハイフン)
  const dash = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (dash) {
    return `${dash[1]}-${dash[2].padStart(2, '0')}-${dash[3].padStart(2, '0')}`;
  }
  // YYYY/MM/DD / YYYY/M/D (年先頭・スラッシュ)
  const slashY = s.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
  if (slashY) {
    return `${slashY[1]}-${slashY[2].padStart(2, '0')}-${slashY[3].padStart(2, '0')}`;
  }
  // M/D / M/D/YY / M/D/YYYY (月先頭・スラッシュ)
  const m = s.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/);
  if (m) {
    const mo = m[1].padStart(2, '0');
    const dy = m[2].padStart(2, '0');
    let yr = defaultYear ?? new Date().getFullYear();
    if (m[3]) {
      yr = parseInt(m[3]);
      if (yr < 100) yr += 2000;
    }
    return `${yr}-${mo}-${dy}`;
  }
  return null;
}

// ─── 生産計画 CSV ─────────────────────────────────────────────────────

/** DailyProductionPlan を浅クローン（製品ごとの日付マップを別オブジェクト化） */
function cloneDailyPlan(src: DailyProductionPlan): DailyProductionPlan {
  const out: DailyProductionPlan = {};
  for (const code of Object.keys(src)) out[code] = { ...src[code] };
  return out;
}

/**
 * 生産計画 CSV を解析する。
 *
 * 対応フォーマット（1行目ヘッダ）:
 *   製品コード, YYYY-MM-DD, YYYY-MM-DD, ...
 *   製品コード, 製品名, YYYY-MM-DD, YYYY-MM-DD, ...
 *
 * 各行: 製品コード, [製品名,] 日別数量...
 *
 * マージ動作：CSVに含まれない日付（既存の他月データ等）と
 * CSVに含まれない製品行は既存値を保持する。
 */
export function parseProductionCSV(
  text: string,
  products: Product[],
  existingDailyPlan: DailyProductionPlan = {},
  existingProductionPlan: ProductionPlan = {},
): {
  dailyPlan: DailyProductionPlan;
  productionPlan: ProductionPlan;
  dates: string[];
  rows: { code: string; name: string; dailyQty: number[]; total: number; found: boolean }[];
  warnings: string[];
} {
  const productMap = Object.fromEntries(products.map((p) => [normalizeProductCode(p.code), p]));
  const lines = text.split(/\r?\n/).filter((l) => l.trim());

  const warnings: string[] = [];
  if (lines.length < 2) {
    warnings.push('データが不足しています（ヘッダ行 + 1行以上のデータが必要です）');
    return {
      dailyPlan: cloneDailyPlan(existingDailyPlan),
      productionPlan: { ...existingProductionPlan },
      dates: [],
      rows: [],
      warnings,
    };
  }

  const headers = parseCSVLine(lines[0]);

  // 2列目が日付かどうかで「製品名列あり」を判定
  let dateStartIdx = 1;
  if (headers.length > 1 && normalizeDate(headers[1]) === null) {
    dateStartIdx = 2; // 製品コード, 製品名, 日付...
  }

  // ヘッダから日付を収集
  const dates: string[] = [];
  for (let i = dateStartIdx; i < headers.length; i++) {
    const d = normalizeDate(headers[i]);
    if (d) {
      dates.push(d);
    } else if (headers[i]) {
      warnings.push(`ヘッダ「${headers[i]}」は日付として認識できませんでした`);
      dates.push(headers[i]); // そのまま保持
    }
  }

  if (dates.length === 0) {
    warnings.push('日付列が見つかりませんでした');
    return {
      dailyPlan: cloneDailyPlan(existingDailyPlan),
      productionPlan: { ...existingProductionPlan },
      dates: [],
      rows: [],
      warnings,
    };
  }

  // 既存値からスタート（CSVに含まれない製品・日付を保持）
  const dailyPlan: DailyProductionPlan = cloneDailyPlan(existingDailyPlan);
  const productionPlan: ProductionPlan = { ...existingProductionPlan };
  const rows: { code: string; name: string; dailyQty: number[]; total: number; found: boolean }[] = [];

  for (let r = 1; r < lines.length; r++) {
    const cells = parseCSVLine(lines[r]);
    const code = normalizeProductCode(cells[0] ?? '');
    if (!code) continue;

    const found = !!productMap[code];
    if (!found) {
      warnings.push(`行${r + 1}: 製品コード「${code}」はマスタに存在しません（インポートはされます）`);
    }

    // この製品の日付マップを既存値ベースで初期化
    dailyPlan[code] = { ...(dailyPlan[code] ?? {}) };
    let csvSum = 0;
    const dailyQty: number[] = [];

    for (let c = 0; c < dates.length; c++) {
      const val = parseInt(cells[dateStartIdx + c] ?? '', 10) || 0;
      dailyPlan[code][dates[c]] = val;
      dailyQty.push(val);
      csvSum += val;
    }

    // 週間生産数：CSVに含まれる日付の合計で更新（旧来の挙動を踏襲）
    productionPlan[code] = csvSum;
    const name = dateStartIdx === 2 ? (cells[1]?.trim() ?? '') : (productMap[code]?.name ?? code);
    rows.push({ code, name, dailyQty, total: csvSum, found });
  }

  return { dailyPlan, productionPlan, dates, rows, warnings };
}

// ─── 在庫数 CSV ───────────────────────────────────────────────────────

/**
 * 在庫数 CSV を解析する。
 *
 * 対応フォーマット（1行目ヘッダ）:
 *   製品コード, 在庫数
 *   製品コード, 製品名, 在庫数
 */
export function parseInventoryCSV(
  text: string,
  products: Product[],
): {
  inventoryStock: InventoryStock;
  rows: { code: string; name: string; qty: number; found: boolean }[];
  warnings: string[];
} {
  const productMap = Object.fromEntries(products.map((p) => [normalizeProductCode(p.code), p]));
  const lines = text.split(/\r?\n/).filter((l) => l.trim());

  const warnings: string[] = [];
  if (lines.length < 2) {
    warnings.push('データが不足しています（ヘッダ行 + 1行以上のデータが必要です）');
    return { inventoryStock: {}, rows: [], warnings };
  }

  const headers = parseCSVLine(lines[0]);
  // 列数が3以上なら 製品コード, 製品名, 在庫数 と判断
  const qtyIdx = headers.length >= 3 ? 2 : 1;

  const inventoryStock: InventoryStock = {};
  const rows: { code: string; name: string; qty: number; found: boolean }[] = [];

  for (let r = 1; r < lines.length; r++) {
    const cells = parseCSVLine(lines[r]);
    const code = normalizeProductCode(cells[0] ?? '');
    if (!code) continue;

    const found = !!productMap[code];
    if (!found) {
      warnings.push(`行${r + 1}: 製品コード「${code}」はマスタに存在しません（インポートはされます）`);
    }

    const qty = parseInt(cells[qtyIdx] ?? '', 10) || 0;
    inventoryStock[code] = qty;
    const name = qtyIdx === 2 ? (cells[1]?.trim() ?? '') : (productMap[code]?.name ?? code);
    rows.push({ code, name, qty, found });
  }

  return { inventoryStock, rows, warnings };
}

// ─── テンプレート生成 ─────────────────────────────────────────────────

/**
 * 生産計画 CSV テンプレートを生成（指定年月の全日付を列に展開）。
 * 既存の dailyPlan を渡すと、その月の現在値が初期値として出力される（ラウンドトリップ可能）。
 */
export function generateProductionTemplate(
  products: Product[],
  year: number,
  month: number,
  dailyPlan: DailyProductionPlan = {},
): string {
  const daysInMonth = new Date(year, month, 0).getDate();
  const dates: string[] = [];
  for (let d = 1; d <= daysInMonth; d++) {
    dates.push(`${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
  }
  const header = ['製品コード', '製品名', ...dates].join(',');
  const rows = products.map((p) =>
    [p.code, `"${p.name}"`, ...dates.map((d) => dailyPlan[p.code]?.[d] ?? 0)].join(','),
  );
  return '\uFEFF' + [header, ...rows].join('\r\n'); // BOM付きでExcel対応
}

// ─── 製品マスタ CSV ───────────────────────────────────────────────────

const DEFAULT_COLORS = [
  '#4A90D9','#2ECC71','#E67E22','#9B59B6',
  '#E74C3C','#1ABC9C','#F39C12','#C0392B',
  '#3498DB','#27AE60','#D35400','#8E44AD',
];

/** ポジ列の値を真偽値に正規化（○/true/1/yes を true として扱う、大文字小文字無視） */
function parsePoji(raw: string | undefined): boolean {
  const s = (raw ?? '').trim().toLowerCase();
  return s === '○' || s === 'true' || s === '1' || s === 'yes';
}

/** ヘッダー文字列を正規化（先頭BOM除去 + 前後空白除去） */
function normalizeHeader(raw: string): string {
  return raw.replace(/^﻿/, '').trim();
}

/** 製品マスタ CSV のキャノニカル列キー */
type ProductColKey =
  | 'code'
  | 'name'
  | 'capacity'
  | 'palletType'
  | 'color'
  | 'factoryCode'
  | 'equipmentCategory'
  | 'equipmentName'
  | 'poji'
  | 'destination'
  | 'productionMethod';

/** ヘッダー名 → キャノニカルキーへのマッピング（カラーは別名「カラー」も許容） */
const PRODUCT_HEADER_MAP: Record<string, ProductColKey> = {
  '製品コード': 'code',
  '製品名': 'name',
  '個/枚': 'capacity',
  'パレット型': 'palletType',
  'カラー(hex)': 'color',
  'カラー': 'color',
  '製造工場': 'factoryCode',
  '器具区分': 'equipmentCategory',
  '器具名': 'equipmentName',
  'ポジ': 'poji',
  '仕向け': 'destination',
  '生産方式': 'productionMethod',
};

/**
 * 製品マスタ CSV を解析する。
 *
 * 1行目ヘッダで列を判定する（列順は問わない・不要な列は省略可）。
 * 認識できる列名：
 *   製品コード, 製品名, 個/枚, パレット型, カラー(hex)（または カラー）,
 *   製造工場, 器具区分, 器具名, ポジ, 仕向け, 生産方式
 *
 * CSVに含まれない列は既存値を保持する（マージ動作）。
 * 認識できないヘッダーは無視される（警告は出すが取り込みは継続）。
 */
export function parseProductsCSV(
  text: string,
  palletTypes: PalletType[],
  existingProducts: Product[],
): {
  products: Product[];
  rows: { product: Product; isNew: boolean; warnings: string[] }[];
  warnings: string[];
} {
  const palletCodes = new Set(palletTypes.map((p) => p.code));
  const existingMap = Object.fromEntries(existingProducts.map((p) => [normalizeProductCode(p.code), p]));
  const lines = text.split(/\r?\n/).filter((l) => l.trim());

  const warnings: string[] = [];
  if (lines.length < 2) {
    warnings.push('データが不足しています（ヘッダ行 + 1行以上のデータが必要です）');
    return { products: [], rows: [], warnings };
  }

  // ヘッダ行を読み、列名 → カラム位置のマップを作る
  const headers = parseCSVLine(lines[0]);
  const colIdx: Partial<Record<ProductColKey, number>> = {};
  for (let i = 0; i < headers.length; i++) {
    const norm = normalizeHeader(headers[i]);
    if (!norm) continue;
    const key = PRODUCT_HEADER_MAP[norm];
    if (key) {
      colIdx[key] = i;
    } else {
      warnings.push(`ヘッダ「${norm}」は認識できませんでした（無視されます）`);
    }
  }

  if (colIdx.code === undefined) {
    warnings.push('「製品コード」列が見つかりませんでした');
    return { products: [], rows: [], warnings };
  }

  const getCell = (cells: string[], key: ProductColKey): string | undefined => {
    const i = colIdx[key];
    return i !== undefined ? cells[i]?.trim() : undefined;
  };

  const products: Product[] = [];
  const rows: { product: Product; isNew: boolean; warnings: string[] }[] = [];
  let colorIdx = 0;

  for (let r = 1; r < lines.length; r++) {
    const cells = parseCSVLine(lines[r]);
    const code = normalizeProductCode(getCell(cells, 'code') ?? '');
    if (!code) continue;

    const existing = existingMap[code];
    const rowWarnings: string[] = [];

    // 必須・準必須フィールド：列があれば値を読む。空なら既存値、それも無ければデフォルト
    const nameRaw = getCell(cells, 'name');
    if (colIdx.name !== undefined && !nameRaw && !existing) {
      rowWarnings.push('製品名が空です');
    }
    const name = nameRaw || existing?.name || code;

    const capacityRaw = getCell(cells, 'capacity');
    const capacityParsed = capacityRaw ? parseInt(capacityRaw, 10) : NaN;
    if (colIdx.capacity !== undefined && capacityRaw !== undefined && capacityRaw !== '' &&
        (!Number.isFinite(capacityParsed) || capacityParsed <= 0)) {
      rowWarnings.push('個/枚 は 1 以上の整数を指定してください');
    }
    const capacityPerPallet =
      Number.isFinite(capacityParsed) && capacityParsed > 0
        ? capacityParsed
        : existing?.capacityPerPallet || 1;

    const palletTypeRaw = getCell(cells, 'palletType') ?? '';
    if (colIdx.palletType !== undefined && palletTypeRaw && !palletCodes.has(palletTypeRaw)) {
      rowWarnings.push(`パレット型「${palletTypeRaw}」はマスタに存在しません`);
    }
    const palletType = palletTypeRaw || existing?.palletType || 'P03';

    let color = getCell(cells, 'color') ?? '';
    if (!color || !/^#[0-9A-Fa-f]{6}$/.test(color)) {
      color = existing?.color ?? DEFAULT_COLORS[colorIdx % DEFAULT_COLORS.length];
      colorIdx++;
    }

    // オプショナル列：CSVに列があれば値を採用（空セルはクリア）、無ければ既存値を保持
    const factoryCode = colIdx.factoryCode !== undefined
      ? (getCell(cells, 'factoryCode') || existing?.factoryCode || 'F001')
      : (existing?.factoryCode ?? 'F001');
    const equipmentCategory = colIdx.equipmentCategory !== undefined
      ? (getCell(cells, 'equipmentCategory') ?? '')
      : (existing?.equipmentCategory ?? '');
    const equipmentName = colIdx.equipmentName !== undefined
      ? (getCell(cells, 'equipmentName') ?? '')
      : (existing?.equipmentName ?? '');
    const poji = colIdx.poji !== undefined
      ? parsePoji(getCell(cells, 'poji'))
      : (existing?.poji ?? false);
    const destination = colIdx.destination !== undefined
      ? (getCell(cells, 'destination') ?? '')
      : (existing?.destination ?? '');
    const productionMethod = colIdx.productionMethod !== undefined
      ? (getCell(cells, 'productionMethod') ?? '')
      : (existing?.productionMethod ?? '');

    const product: Product = {
      code,
      name,
      capacityPerPallet,
      palletType,
      color,
      factoryCode,
      equipmentCategory,
      equipmentName,
      poji,
      destination,
      productionMethod,
    };

    products.push(product);
    rows.push({ product, isNew: !existing, warnings: rowWarnings });
    if (rowWarnings.length > 0) {
      warnings.push(`行${r + 1}（${code}）: ${rowWarnings.join(' / ')}`);
    }
  }

  return { products, rows, warnings };
}

/** 製品マスタ CSV テンプレートを生成（全11列） */
export function generateProductsTemplate(products: Product[]): string {
  const header = [
    '製品コード', '製品名', '個/枚', 'パレット型', 'カラー(hex)',
    '製造工場', '器具区分', '器具名', 'ポジ', '仕向け', '生産方式',
  ].join(',');
  const rows = products.map((p) =>
    [
      p.code,
      `"${p.name}"`,
      p.capacityPerPallet,
      p.palletType,
      p.color,
      p.factoryCode ?? 'F001',
      `"${p.equipmentCategory ?? ''}"`,
      `"${p.equipmentName ?? ''}"`,
      p.poji ? '○' : '',
      `"${p.destination ?? ''}"`,
      `"${p.productionMethod ?? ''}"`,
    ].join(','),
  );
  return '\uFEFF' + [header, ...rows].join('\r\n');
}

/** 在庫数 CSV テンプレートを生成 */
export function generateInventoryTemplate(products: Product[]): string {
  const header = ['製品コード', '製品名', '在庫数'].join(',');
  const rows = products.map((p) => [p.code, `"${p.name}"`, '0'].join(','));
  return '\uFEFF' + [header, ...rows].join('\r\n');
}

// ─── 拠点別在庫 CSV ───────────────────────────────────────────────────

/** 製品×拠点マトリクス型の状態を浅クローン */
function cloneMatrixStock<T extends Record<string, Record<string, number>>>(src: T): T {
  const out = {} as T;
  for (const code of Object.keys(src)) {
    (out as Record<string, Record<string, number>>)[code] = { ...src[code] };
  }
  return out;
}

/**
 * ワイド形式CSV（製品コード/製品名 + 拠点列）のヘッダ行を解析し、
 * 各列のキャノニカルな意味を特定する。
 *
 * 拠点列は以下の順で照合：
 *   1. 拠点コード（大文字小文字区別なし）
 *   2. 拠点名
 *
 * 認識できない列は無視され、警告として記録される（phantomデータは作らない）。
 */
function findWarehouseColumns(
  headers: string[],
  warehouses: Warehouse[],
): {
  codeColIdx: number;       // -1 = 「製品コード」ヘッダが見つからない
  nameColIdx: number;       // -1 = 製品名列なし
  validWarehouses: { wc: string; colIdx: number }[];
  warnings: string[];
} {
  const wcByCodeUpper = new Map<string, string>();
  const wcByName = new Map<string, string>();
  for (const wh of warehouses) {
    wcByCodeUpper.set(wh.code.toUpperCase(), wh.code);
    wcByName.set(wh.name, wh.code);
  }

  let codeColIdx = -1;
  let nameColIdx = -1;
  const validWarehouses: { wc: string; colIdx: number }[] = [];
  const warnings: string[] = [];

  for (let i = 0; i < headers.length; i++) {
    const norm = normalizeHeader(headers[i]);
    if (!norm) continue;
    if (norm === '製品コード') {
      codeColIdx = i;
      continue;
    }
    if (norm === '製品名') {
      nameColIdx = i;
      continue;
    }
    const wc = wcByCodeUpper.get(norm.toUpperCase()) ?? wcByName.get(norm);
    if (wc) {
      validWarehouses.push({ wc, colIdx: i });
    } else {
      warnings.push(`ヘッダ「${norm}」は拠点コード/拠点名として認識できませんでした（無視されます）`);
    }
  }

  return { codeColIdx, nameColIdx, validWarehouses, warnings };
}

/**
 * 拠点別在庫 CSV を解析する（ワイド形式）。
 *
 * 1行目ヘッダで列を判定する（列順は問わない）：
 *   - 「製品コード」「製品名」をヘッダ名で検出
 *   - 残りの列を拠点コード（大小無視）または拠点名でマッチ
 *
 * 認識できない列は無視され警告のみ。
 * マージ動作：CSVに含まれない拠点列・製品行は既存値を保持する。
 */
export function parseLocationStockCSV(
  text: string,
  products: Product[],
  warehouses: Warehouse[],
  existingStock: LocationStock = {},
): {
  locationStock: LocationStock;
  rows: { code: string; name: string; whQty: Record<string, number>; found: boolean }[];
  warnings: string[];
} {
  const productMap = Object.fromEntries(products.map((p) => [normalizeProductCode(p.code), p]));
  const lines = text.split(/\r?\n/).filter((l) => l.trim());

  const warnings: string[] = [];
  if (lines.length < 2) {
    warnings.push('データが不足しています（ヘッダ行 + 1行以上のデータが必要です）');
    return { locationStock: cloneMatrixStock(existingStock), rows: [], warnings };
  }

  const headers = parseCSVLine(lines[0]);
  const { codeColIdx, nameColIdx, validWarehouses, warnings: headerWarnings } =
    findWarehouseColumns(headers, warehouses);
  warnings.push(...headerWarnings);

  if (codeColIdx === -1) {
    warnings.push('「製品コード」列が見つかりませんでした');
    return { locationStock: cloneMatrixStock(existingStock), rows: [], warnings };
  }
  if (validWarehouses.length === 0) {
    warnings.push('拠点コード/拠点名の列が見つかりませんでした');
    return { locationStock: cloneMatrixStock(existingStock), rows: [], warnings };
  }

  // 既存値からスタート（CSVに含まれない製品・拠点を保持）
  const locationStock: LocationStock = cloneMatrixStock(existingStock);
  const rows: { code: string; name: string; whQty: Record<string, number>; found: boolean }[] = [];

  for (let r = 1; r < lines.length; r++) {
    const cells = parseCSVLine(lines[r]);
    const code = normalizeProductCode(cells[codeColIdx] ?? '');
    if (!code) continue;

    const found = !!productMap[code];
    if (!found) {
      warnings.push(`行${r + 1}: 製品コード「${code}」はマスタに存在しません（インポートはされます）`);
    }

    // 既存の拠点値を引き継ぎつつ CSV にある拠点列を上書き
    locationStock[code] = { ...(locationStock[code] ?? {}) };
    const whQty: Record<string, number> = {};

    for (const { wc, colIdx } of validWarehouses) {
      const qty = parseInt(cells[colIdx] ?? '', 10) || 0;
      locationStock[code][wc] = qty;
      whQty[wc] = qty;
    }

    const name = nameColIdx !== -1
      ? (cells[nameColIdx]?.trim() ?? '')
      : (productMap[code]?.name ?? code);
    rows.push({ code, name, whQty, found });
  }

  return { locationStock, rows, warnings };
}

/** 拠点別在庫 CSV テンプレートを生成（製品 × 拠点のマトリクス） */
export function generateLocationStockTemplate(
  products: Product[],
  warehouses: Warehouse[],
  currentStock: LocationStock = {},
): string {
  const whCodes = warehouses.map((w) => w.code);
  const header = ['製品コード', '製品名', ...whCodes].join(',');
  const rows = products.map((p) => {
    const qtys = whCodes.map((wc) => currentStock[p.code]?.[wc] ?? 0);
    return [p.code, `"${p.name}"`, ...qtys].join(',');
  });
  return '\uFEFF' + [header, ...rows].join('\r\n');
}

// ─── 予定出荷数 CSV ───────────────────────────────────────────────────

/**
 * 予定出荷数 CSV を解析する（location stock と同形式のワイド形式）。
 *
 * 1行目ヘッダで列を判定（列順は問わない）。
 * 拠点列は拠点コード（大小無視）または拠点名でマッチ。
 * マージ動作：CSVに含まれない拠点列・製品行は既存値を保持する。
 */
export function parsePlannedSalesCSV(
  text: string,
  products: Product[],
  warehouses: Warehouse[],
  existingSales: PlannedSales = {},
): {
  plannedSales: PlannedSales;
  rows: { code: string; name: string; whQty: Record<string, number>; found: boolean }[];
  warnings: string[];
} {
  const productMap = Object.fromEntries(products.map((p) => [normalizeProductCode(p.code), p]));
  const lines = text.split(/\r?\n/).filter((l) => l.trim());

  const warnings: string[] = [];
  if (lines.length < 2) {
    warnings.push('データが不足しています（ヘッダ行 + 1行以上のデータが必要です）');
    return { plannedSales: cloneMatrixStock(existingSales), rows: [], warnings };
  }

  const headers = parseCSVLine(lines[0]);
  const { codeColIdx, nameColIdx, validWarehouses, warnings: headerWarnings } =
    findWarehouseColumns(headers, warehouses);
  warnings.push(...headerWarnings);

  if (codeColIdx === -1) {
    warnings.push('「製品コード」列が見つかりませんでした');
    return { plannedSales: cloneMatrixStock(existingSales), rows: [], warnings };
  }
  if (validWarehouses.length === 0) {
    warnings.push('拠点コード/拠点名の列が見つかりませんでした');
    return { plannedSales: cloneMatrixStock(existingSales), rows: [], warnings };
  }

  // 既存値からスタート（CSVに含まれない製品・拠点を保持）
  const plannedSales: PlannedSales = cloneMatrixStock(existingSales);
  const rows: { code: string; name: string; whQty: Record<string, number>; found: boolean }[] = [];

  for (let r = 1; r < lines.length; r++) {
    const cells = parseCSVLine(lines[r]);
    const code = normalizeProductCode(cells[codeColIdx] ?? '');
    if (!code) continue;

    const found = !!productMap[code];
    if (!found) {
      warnings.push(`行${r + 1}: 製品コード「${code}」はマスタに存在しません（インポートはされます）`);
    }

    plannedSales[code] = { ...(plannedSales[code] ?? {}) };
    const whQty: Record<string, number> = {};

    for (const { wc, colIdx } of validWarehouses) {
      const qty = parseInt(cells[colIdx] ?? '', 10) || 0;
      plannedSales[code][wc] = qty;
      whQty[wc] = qty;
    }

    const name = nameColIdx !== -1
      ? (cells[nameColIdx]?.trim() ?? '')
      : (productMap[code]?.name ?? code);
    rows.push({ code, name, whQty, found });
  }

  return { plannedSales, rows, warnings };
}

/** 予定出荷数 CSV テンプレートを生成（製品 × 拠点のマトリクス） */
export function generatePlannedSalesTemplate(
  products: Product[],
  warehouses: Warehouse[],
  currentSales: PlannedSales = {},
): string {
  const whCodes = warehouses.map((w) => w.code);
  const header = ['製品コード', '製品名', ...whCodes].join(',');
  const rows = products.map((p) => {
    const qtys = whCodes.map((wc) => currentSales[p.code]?.[wc] ?? 0);
    return [p.code, `"${p.name}"`, ...qtys].join(',');
  });
  return '\uFEFF' + [header, ...rows].join('\r\n');
}

/**
 * 輸送中在庫 CSV を解析（製品 × 拠点のマトリクス形式）。
 *
 * 1行目ヘッダで列を判定（列順は問わない）。
 * 拠点列は拠点コード（大小無視）または拠点名でマッチ。
 * マージ動作：CSVに含まれない拠点列・製品行は既存値を保持する。
 */
export function parseInTransitStockCSV(
  text: string,
  products: Product[],
  warehouses: Warehouse[],
  existingStock: InTransitStock = {},
): {
  inTransitStock: InTransitStock;
  rows: { code: string; name: string; whQty: Record<string, number>; found: boolean }[];
  warnings: string[];
} {
  const productMap = Object.fromEntries(products.map((p) => [normalizeProductCode(p.code), p]));
  const lines = text.split(/\r?\n/).filter((l) => l.trim());

  const warnings: string[] = [];
  if (lines.length < 2) {
    warnings.push('データが不足しています（ヘッダ行 + 1行以上のデータが必要です）');
    return { inTransitStock: cloneMatrixStock(existingStock), rows: [], warnings };
  }

  const headers = parseCSVLine(lines[0]);
  const { codeColIdx, nameColIdx, validWarehouses, warnings: headerWarnings } =
    findWarehouseColumns(headers, warehouses);
  warnings.push(...headerWarnings);

  if (codeColIdx === -1) {
    warnings.push('「製品コード」列が見つかりませんでした');
    return { inTransitStock: cloneMatrixStock(existingStock), rows: [], warnings };
  }
  if (validWarehouses.length === 0) {
    warnings.push('拠点コード/拠点名の列が見つかりませんでした');
    return { inTransitStock: cloneMatrixStock(existingStock), rows: [], warnings };
  }

  const inTransitStock: InTransitStock = cloneMatrixStock(existingStock);
  const rows: { code: string; name: string; whQty: Record<string, number>; found: boolean }[] = [];

  for (let r = 1; r < lines.length; r++) {
    const cells = parseCSVLine(lines[r]);
    const code = normalizeProductCode(cells[codeColIdx] ?? '');
    if (!code) continue;

    const found = !!productMap[code];
    if (!found) {
      warnings.push(`行${r + 1}: 製品コード「${code}」はマスタに存在しません（インポートはされます）`);
    }

    inTransitStock[code] = { ...(inTransitStock[code] ?? {}) };
    const whQty: Record<string, number> = {};

    for (const { wc, colIdx } of validWarehouses) {
      const qty = parseInt(cells[colIdx] ?? '', 10) || 0;
      inTransitStock[code][wc] = qty;
      whQty[wc] = qty;
    }

    const name = nameColIdx !== -1
      ? (cells[nameColIdx]?.trim() ?? '')
      : (productMap[code]?.name ?? code);
    rows.push({ code, name, whQty, found });
  }

  return { inTransitStock, rows, warnings };
}

/** 輸送中在庫 CSV テンプレートを生成（製品 × 拠点のマトリクス） */
export function generateInTransitStockTemplate(
  products: Product[],
  warehouses: Warehouse[],
  currentStock: InTransitStock = {},
): string {
  const whCodes = warehouses.map((w) => w.code);
  const header = ['製品コード', '製品名', ...whCodes].join(',');
  const rows = products.map((p) => {
    const qtys = whCodes.map((wc) => currentStock[p.code]?.[wc] ?? 0);
    return [p.code, `"${p.name}"`, ...qtys].join(',');
  });
  return '\uFEFF' + [header, ...rows].join('\r\n');
}

/**
 * 配分比率 CSV を解析（製品 × 拠点のマトリクス形式）。
 *
 * 1行目ヘッダで列を判定（列順は問わない）。
 * 拠点列は拠点コード（大小無視）または拠点名でマッチ。
 * マージ動作：CSVに含まれない拠点列・製品行は既存値を保持する。
 * 値は 0〜100 の整数（%）。
 */
export function parseDistributionRatiosCSV(
  text: string,
  products: Product[],
  warehouses: Warehouse[],
  existingRatios: DistributionRatios = {},
): {
  ratios: DistributionRatios;
  rows: { code: string; name: string; whRatio: Record<string, number>; found: boolean }[];
  warnings: string[];
} {
  const productMap = Object.fromEntries(products.map((p) => [normalizeProductCode(p.code), p]));
  const lines = text.split(/\r?\n/).filter((l) => l.trim());

  const warnings: string[] = [];
  if (lines.length < 2) {
    warnings.push('データが不足しています（ヘッダ行 + 1行以上のデータが必要です）');
    return { ratios: cloneMatrixStock(existingRatios), rows: [], warnings };
  }

  const headers = parseCSVLine(lines[0]);
  const { codeColIdx, nameColIdx, validWarehouses, warnings: headerWarnings } =
    findWarehouseColumns(headers, warehouses);
  warnings.push(...headerWarnings);

  if (codeColIdx === -1) {
    warnings.push('「製品コード」列が見つかりませんでした');
    return { ratios: cloneMatrixStock(existingRatios), rows: [], warnings };
  }
  if (validWarehouses.length === 0) {
    warnings.push('拠点コード/拠点名の列が見つかりませんでした');
    return { ratios: cloneMatrixStock(existingRatios), rows: [], warnings };
  }

  const ratios: DistributionRatios = cloneMatrixStock(existingRatios);
  const rows: { code: string; name: string; whRatio: Record<string, number>; found: boolean }[] = [];

  for (let r = 1; r < lines.length; r++) {
    const cells = parseCSVLine(lines[r]);
    const code = normalizeProductCode(cells[codeColIdx] ?? '');
    if (!code) continue;

    const found = !!productMap[code];
    if (!found) {
      warnings.push(`行${r + 1}: 製品コード「${code}」はマスタに存在しません（インポートはされます）`);
    }

    ratios[code] = { ...(ratios[code] ?? {}) };
    const whRatio: Record<string, number> = {};

    for (const { wc, colIdx } of validWarehouses) {
      const val = parseInt(cells[colIdx] ?? '', 10) || 0;
      ratios[code][wc] = val;
      whRatio[wc] = val;
    }

    const name = nameColIdx !== -1
      ? (cells[nameColIdx]?.trim() ?? '')
      : (productMap[code]?.name ?? code);
    rows.push({ code, name, whRatio, found });
  }

  return { ratios, rows, warnings };
}

/** 配分比率 CSV テンプレートを生成（製品 × 拠点のマトリクス） */
export function generateDistributionRatiosTemplate(
  products: Product[],
  warehouses: Warehouse[],
  currentRatios: DistributionRatios = {},
): string {
  const whCodes = warehouses.map((w) => w.code);
  const header = ['製品コード', '製品名', ...whCodes].join(',');
  const rows = products.map((p) => {
    const ratioVals = whCodes.map((wc) => currentRatios[p.code]?.[wc] ?? 0);
    return [p.code, `"${p.name}"`, ...ratioVals].join(',');
  });
  return '\uFEFF' + [header, ...rows].join('\r\n');
}

// ─── 送り数 CSV ──────────────────────────────────────────────────────

/**
 * 送り数 CSV を解析する（拠点別在庫と同じワイド形式）。
 * インポート結果は sendQtyManual に上書き格納する。
 */
export function parseSendQtyCSV(
  text: string,
  products: Product[],
  warehouses: Warehouse[],
  existing: Record<string, Record<string, number>> = {},
): {
  sendQty: Record<string, Record<string, number>>;
  rows: { code: string; name: string; whQty: Record<string, number>; found: boolean }[];
  warnings: string[];
} {
  const productMap = Object.fromEntries(products.map((p) => [normalizeProductCode(p.code), p]));
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  const warnings: string[] = [];

  if (lines.length < 2) {
    warnings.push('データが不足しています（ヘッダ行 + 1行以上のデータが必要です）');
    return { sendQty: cloneMatrixStock(existing), rows: [], warnings };
  }

  const headers = parseCSVLine(lines[0]);
  const { codeColIdx, nameColIdx, validWarehouses, warnings: hw } =
    findWarehouseColumns(headers, warehouses);
  warnings.push(...hw);

  if (codeColIdx === -1) {
    warnings.push('「製品コード」列が見つかりませんでした');
    return { sendQty: cloneMatrixStock(existing), rows: [], warnings };
  }
  if (validWarehouses.length === 0) {
    warnings.push('拠点コード/拠点名の列が見つかりませんでした');
    return { sendQty: cloneMatrixStock(existing), rows: [], warnings };
  }

  const sendQty: Record<string, Record<string, number>> = cloneMatrixStock(existing);
  const rows: { code: string; name: string; whQty: Record<string, number>; found: boolean }[] = [];

  for (let r = 1; r < lines.length; r++) {
    const cells = parseCSVLine(lines[r]);
    const code = normalizeProductCode(cells[codeColIdx] ?? '');
    if (!code) continue;
    const found = !!productMap[code];
    if (!found) warnings.push(`行${r + 1}: 製品コード「${code}」はマスタに存在しません`);

    sendQty[code] = { ...(sendQty[code] ?? {}) };
    const whQty: Record<string, number> = {};
    for (const { wc, colIdx } of validWarehouses) {
      const qty = parseInt(cells[colIdx] ?? '', 10) || 0;
      sendQty[code][wc] = qty;
      whQty[wc] = qty;
    }
    const name = nameColIdx !== -1
      ? (cells[nameColIdx]?.trim() ?? '')
      : (productMap[code]?.name ?? code);
    rows.push({ code, name, whQty, found });
  }

  return { sendQty, rows, warnings };
}

/**
 * 送り数 CSV を生成する。
 * manual が設定されているセルは手動値、未設定は自動計算値を出力する。
 */
export function generateSendQtyCSV(
  products: Product[],
  warehouses: Warehouse[],
  calcQty: Record<string, Record<string, number>>,
  manual: Record<string, Record<string, number>> = {},
): string {
  const whCodes = warehouses.map((w) => w.code);
  const header = ['製品コード', '製品名', ...whCodes].join(',');
  const rows = products.map((p) => {
    const qtys = whCodes.map((wc) => {
      const m = manual[p.code]?.[wc];
      return m !== undefined && m > 0 ? m : (calcQty[p.code]?.[wc] ?? 0);
    });
    return [p.code, `"${p.name}"`, ...qtys].join(',');
  });
  return '﻿' + [header, ...rows].join('\r\n');
}

/** CSV テキストをファイルとしてダウンロード */
export function downloadCSV(content: string, filename: string): void {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
