'use client';

import { useEffect, useState } from 'react';
import { getCalcSettings } from './appSettings';
import type { CalcSettings } from './types';

/**
 * 計算オプション(配分方式/基準在庫モード/安全在庫日数)をリアクティブに読む。
 * 設定保存時(saveCalcSettings)の CustomEvent と、別タブの storage イベントで再取得する。
 */
export function useCalcSettings(): CalcSettings {
  const [settings, setSettings] = useState<CalcSettings>(() => getCalcSettings());
  useEffect(() => {
    const refresh = () => setSettings(getCalcSettings());
    refresh(); // マウント後にlocalStorageの実値へ同期（SSR既定値→確定）
    window.addEventListener('truckloader:calcSettings', refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener('truckloader:calcSettings', refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);
  return settings;
}
