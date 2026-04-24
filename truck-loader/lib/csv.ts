import type { Product, PalletType, Warehouse, ProductionPlan, InventoryStock, LocationStock, DailyProductionPlan, PlannedSales, DistributionRatios } from './types';

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

/** 日付文字列を YYYY-MM-DD に正規化。非日付なら null */
function normalizeDate(raw: string, defaultYear?: number): string | null {
  const s = raw.trim();
  // 既に YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  // M/D, M/D/YY, M/D/YYYY
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

/**
 * 生産計画 CSV を解析する。
 *
 * 対応フォーマット（1行目ヘッダ）:
 *   製品コード, YYYY-MM-DD, YYYY-MM-DD, ...
 *   製品コード, 製品名, YYYY-MM-DD, YYYY-MM-DD, ...
 *
 * 各行: 製品コード, [製品名,] 日別数量...
 */
export function parseProductionCSV(
  text: string,
  products: Product[],
): {
  dailyPlan: DailyProductionPlan;
  productionPlan: ProductionPlan;
  dates: string[];
  rows: { code: string; name: string; dailyQty: number[]; total: number; found: boolean }[];
  warnings: string[];
} {
  const productMap = Object.fromEntries(products.map((p) => [p.code, p]));
  const lines = text.split(/\r?\n/).filter((l) => l.trim());

  const warnings: string[] = [];
  if (lines.length < 2) {
    warnings.push('データが不足しています（ヘッダ行 + 1行以上のデータが必要です）');
    return { dailyPlan: {}, productionPlan: {}, dates: [], rows: [], warnings };
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
    return { dailyPlan: {}, productionPlan: {}, dates: [], rows: [], warnings };
  }

  const dailyPlan: DailyProductionPlan = {};
  const productionPlan: ProductionPlan = {};
  const rows: { code: string; name: string; dailyQty: number[]; total: number; found: boolean }[] = [];

  for (let r = 1; r < lines.length; r++) {
    const cells = parseCSVLine(lines[r]);
    const code = cells[0]?.trim();
    if (!code) continue;

    const found = !!productMap[code];
    if (!found) {
      warnings.push(`行${r + 1}: 製品コード「${code}」はマスタに存在しません（インポートはされます）`);
    }

    dailyPlan[code] = {};
    let total = 0;
    const dailyQty: number[] = [];

    for (let c = 0; c < dates.length; c++) {
      const val = parseInt(cells[dateStartIdx + c] ?? '', 10) || 0;
      dailyPlan[code][dates[c]] = val;
      dailyQty.push(val);
      total += val;
    }

    productionPlan[code] = total;
    const name = dateStartIdx === 2 ? (cells[1]?.trim() ?? '') : (productMap[code]?.name ?? code);
    rows.push({ code, name, dailyQty, total, found });
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
  const productMap = Object.fromEntries(products.map((p) => [p.code, p]));
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
    const code = cells[0]?.trim();
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

/** 生産計画 CSV テンプレートを生成（指定年月の全日付を列に展開） */
export function generateProductionTemplate(
  products: Product[],
  year: number,
  month: number,
): string {
  const daysInMonth = new Date(year, month, 0).getDate();
  const dates: string[] = [];
  for (let d = 1; d <= daysInMonth; d++) {
    dates.push(`${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
  }
  const header = ['製品コード', '製品名', ...dates].join(',');
  const rows = products.map((p) =>
    [p.code, `"${p.name}"`, ...dates.map(() => '0')].join(','),
  );
  return '\uFEFF' + [header, ...rows].join('\r\n'); // BOM付きでExcel対応
}

// ─── 製品マスタ CSV ───────────────────────────────────────────────────

const DEFAULT_COLORS = [
  '#4A90D9','#2ECC71','#E67E22','#9B59B6',
  '#E74C3C','#1ABC9C','#F39C12','#C0392B',
  '#3498DB','#27AE60','#D35400','#8E44AD',
];

/**
 * 製品マスタ CSV を解析する。
 *
 * フォーマット（1行目ヘッダ）:
 *   製品コード, 製品名, 個/枚, パレット型, カラー(hex)
 *
 * カラー列は省略可（省略時はデフォルト色を自動割り当て）。
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
  const existingMap = Object.fromEntries(existingProducts.map((p) => [p.code, p]));
  const lines = text.split(/\r?\n/).filter((l) => l.trim());

  const warnings: string[] = [];
  if (lines.length < 2) {
    warnings.push('データが不足しています（ヘッダ行 + 1行以上のデータが必要です）');
    return { products: [], rows: [], warnings };
  }

  const headers = parseCSVLine(lines[0]);
  // カラー列があるか（5列以上ならあり）
  const hasColor = headers.length >= 5;

  const products: Product[] = [];
  const rows: { product: Product; isNew: boolean; warnings: string[] }[] = [];
  let colorIdx = 0;

  for (let r = 1; r < lines.length; r++) {
    const cells = parseCSVLine(lines[r]);
    const code = cells[0]?.trim();
    if (!code) continue;

    const rowWarnings: string[] = [];
    const name = cells[1]?.trim() ?? '';
    if (!name) rowWarnings.push('製品名が空です');

    const capacity = parseInt(cells[2] ?? '', 10);
    if (!capacity || capacity <= 0) rowWarnings.push('個/枚 は 1 以上の整数を指定してください');

    const palletType = cells[3]?.trim() ?? '';
    if (!palletCodes.has(palletType)) {
      rowWarnings.push(`パレット型「${palletType}」はマスタに存在しません`);
    }

    let color = hasColor ? cells[4]?.trim() : '';
    if (!color || !/^#[0-9A-Fa-f]{6}$/.test(color)) {
      // 既存製品の色を引き継ぐか、デフォルト色を順番に割り当て
      color = existingMap[code]?.color ?? DEFAULT_COLORS[colorIdx % DEFAULT_COLORS.length];
      colorIdx++;
    }

    const product: Product = {
      code,
      name: name || code,
      capacityPerPallet: capacity || 1,
      palletType: palletType || 'P03',
      color,
    };

    products.push(product);
    rows.push({ product, isNew: !existingMap[code], warnings: rowWarnings });
    if (rowWarnings.length > 0) {
      warnings.push(`行${r + 1}（${code}）: ${rowWarnings.join(' / ')}`);
    }
  }

  return { products, rows, warnings };
}

/** 製品マスタ CSV テンプレートを生成 */
export function generateProductsTemplate(products: Product[]): string {
  const header = ['製品コード', '製品名', '個/枚', 'パレット型', 'カラー(hex)'].join(',');
  const rows = products.map((p) =>
    [p.code, `"${p.name}"`, p.capacityPerPallet, p.palletType, p.color].join(','),
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

/**
 * 拠点別在庫 CSV を解析する（ワイド形式）。
 *
 * フォーマット（1行目ヘッダ）:
 *   製品コード, 製品名, 拠点コード1, 拠点コード2, ...
 *
 * 拠点名列は省略可（2列目が拠点コードに一致しなければ製品名として扱う）
 */
export function parseLocationStockCSV(
  text: string,
  products: Product[],
  warehouses: Warehouse[],
): {
  locationStock: LocationStock;
  rows: { code: string; name: string; whQty: Record<string, number>; found: boolean }[];
  warnings: string[];
} {
  const productMap = Object.fromEntries(products.map((p) => [p.code, p]));
  const warehouseCodes = new Set(warehouses.map((w) => w.code));
  const lines = text.split(/\r?\n/).filter((l) => l.trim());

  const warnings: string[] = [];
  if (lines.length < 2) {
    warnings.push('データが不足しています（ヘッダ行 + 1行以上のデータが必要です）');
    return { locationStock: {}, rows: [], warnings };
  }

  const headers = parseCSVLine(lines[0]);

  // 2列目が拠点コードかどうかで「製品名列あり」を判定
  let whStartIdx = 1;
  if (headers.length > 1 && !warehouseCodes.has(headers[1])) {
    whStartIdx = 2; // 製品コード, 製品名, 拠点1, 拠点2...
  }

  // ヘッダから拠点コードを収集
  const headerWarehouses: string[] = [];
  for (let i = whStartIdx; i < headers.length; i++) {
    const wc = headers[i]?.trim();
    if (!wc) continue;
    if (!warehouseCodes.has(wc)) {
      warnings.push(`ヘッダ「${wc}」は拠点コードとして認識できませんでした（スキップ）`);
    }
    headerWarehouses.push(wc);
  }

  if (headerWarehouses.length === 0) {
    warnings.push('拠点コード列が見つかりませんでした');
    return { locationStock: {}, rows: [], warnings };
  }

  const locationStock: LocationStock = {};
  const rows: { code: string; name: string; whQty: Record<string, number>; found: boolean }[] = [];

  for (let r = 1; r < lines.length; r++) {
    const cells = parseCSVLine(lines[r]);
    const code = cells[0]?.trim();
    if (!code) continue;

    const found = !!productMap[code];
    if (!found) {
      warnings.push(`行${r + 1}: 製品コード「${code}」はマスタに存在しません（インポートはされます）`);
    }

    locationStock[code] = locationStock[code] ?? {};
    const whQty: Record<string, number> = {};

    for (let c = 0; c < headerWarehouses.length; c++) {
      const wc = headerWarehouses[c];
      const qty = parseInt(cells[whStartIdx + c] ?? '', 10) || 0;
      locationStock[code][wc] = qty;
      whQty[wc] = qty;
    }

    const name = whStartIdx === 2 ? (cells[1]?.trim() ?? '') : (productMap[code]?.name ?? code);
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
 * フォーマット（1行目ヘッダ）:
 *   製品コード, 製品名, 拠点コード1, 拠点コード2, ...
 */
export function parsePlannedSalesCSV(
  text: string,
  products: Product[],
  warehouses: Warehouse[],
): {
  plannedSales: PlannedSales;
  rows: { code: string; name: string; whQty: Record<string, number>; found: boolean }[];
  warnings: string[];
} {
  const productMap = Object.fromEntries(products.map((p) => [p.code, p]));
  const warehouseCodes = new Set(warehouses.map((w) => w.code));
  const lines = text.split(/\r?\n/).filter((l) => l.trim());

  const warnings: string[] = [];
  if (lines.length < 2) {
    warnings.push('データが不足しています（ヘッダ行 + 1行以上のデータが必要です）');
    return { plannedSales: {}, rows: [], warnings };
  }

  const headers = parseCSVLine(lines[0]);
  let whStartIdx = 1;
  if (headers.length > 1 && !warehouseCodes.has(headers[1])) {
    whStartIdx = 2;
  }

  const headerWarehouses: string[] = [];
  for (let i = whStartIdx; i < headers.length; i++) {
    const wc = headers[i]?.trim();
    if (!wc) continue;
    if (!warehouseCodes.has(wc)) {
      warnings.push(`ヘッダ「${wc}」は拠点コードとして認識できませんでした（スキップ）`);
    }
    headerWarehouses.push(wc);
  }

  if (headerWarehouses.length === 0) {
    warnings.push('拠点コード列が見つかりませんでした');
    return { plannedSales: {}, rows: [], warnings };
  }

  const plannedSales: PlannedSales = {};
  const rows: { code: string; name: string; whQty: Record<string, number>; found: boolean }[] = [];

  for (let r = 1; r < lines.length; r++) {
    const cells = parseCSVLine(lines[r]);
    const code = cells[0]?.trim();
    if (!code) continue;

    const found = !!productMap[code];
    if (!found) {
      warnings.push(`行${r + 1}: 製品コード「${code}」はマスタに存在しません（インポートはされます）`);
    }

    plannedSales[code] = plannedSales[code] ?? {};
    const whQty: Record<string, number> = {};

    for (let c = 0; c < headerWarehouses.length; c++) {
      const wc = headerWarehouses[c];
      const qty = parseInt(cells[whStartIdx + c] ?? '', 10) || 0;
      plannedSales[code][wc] = qty;
      whQty[wc] = qty;
    }

    const name = whStartIdx === 2 ? (cells[1]?.trim() ?? '') : (productMap[code]?.name ?? code);
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

/** 配分比率 CSV を解析（製品 × 拠点のマトリクス形式） */
export function parseDistributionRatiosCSV(
  text: string,
  products: Product[],
  warehouses: Warehouse[],
): { ratios: DistributionRatios; rows: { code: string; name: string; found: boolean; whRatio: Record<string, number> }[]; warnings: string[] } {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter(Boolean);
  if (lines.length < 2) return { ratios: {}, rows: [], warnings: ['データが空です'] };

  const headers = lines[0].split(',').map((h) => h.trim().replace(/^"|"$/g, ''));
  const whCodes = headers.slice(2);
  const productMap = Object.fromEntries(products.map((p) => [p.code, p]));
  const warehouseSet = new Set(warehouses.map((w) => w.code));

  const warnings: string[] = [];
  const rows: { code: string; name: string; found: boolean; whRatio: Record<string, number> }[] = [];
  const ratios: DistributionRatios = {};

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
    const code = cols[0];
    if (!code) continue;
    const found = !!productMap[code];
    if (!found) warnings.push(`行${i + 1}: 製品コード "${code}" はマスタに存在しません`);

    const whRatio: Record<string, number> = {};
    whCodes.forEach((wc, idx) => {
      if (!warehouseSet.has(wc)) return;
      const val = parseInt(cols[idx + 2] ?? '0', 10);
      whRatio[wc] = isNaN(val) ? 0 : val;
    });

    rows.push({ code, name: productMap[code]?.name ?? code, found, whRatio });
    if (found) ratios[code] = whRatio;
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
