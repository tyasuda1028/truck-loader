/**
 * 計算オプション（配分方式・基準在庫モード・安全在庫日数 等）の保管。
 *
 * 取引データ（生産/在庫/計画）と違い、会社全体の「計算の方針」設定なので、
 * 同期チェーン全体を改修せず localStorage に保管する（端末ごと・低リスク）。
 * 計算関数はピュアに保つため、値は呼び出し側(クライアントページ)で読んで渡す。
 */
import { DEFAULT_CALC_SETTINGS, type CalcSettings } from './types';

const KEY = 'truckloader.calcSettings';

export function getCalcSettings(): CalcSettings {
  if (typeof window === 'undefined') return { ...DEFAULT_CALC_SETTINGS };
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_CALC_SETTINGS };
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_CALC_SETTINGS, ...parsed };
  } catch {
    return { ...DEFAULT_CALC_SETTINGS };
  }
}

export function saveCalcSettings(s: CalcSettings): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(s));
    // 同一タブの購読者に通知（別タブは storage イベントで拾える）
    window.dispatchEvent(new CustomEvent('truckloader:calcSettings'));
  } catch {
    /* ignore */
  }
}
