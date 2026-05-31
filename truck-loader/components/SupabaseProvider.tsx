'use client';

import { useEffect } from 'react';
import { useAppStore } from '@/lib/store';
import * as db from '@/lib/db';
import type {
  Factory, Product, Warehouse, TruckType, PalletType,
  ProductionPlan, DailyProductionPlan,
  InventoryStock, LocationStock, WeeklyShippingSchedule,
} from '@/lib/types';

/** 旧 localStorage (truck-loader-store) の型 */
interface LegacyStore {
  state?: {
    factories?: Factory[];
    products?: Product[];
    warehouses?: Warehouse[];
    truckTypes?: TruckType[];
    palletTypes?: PalletType[];
    productionPlan?: ProductionPlan;
    dailyProductionPlan?: DailyProductionPlan;
    inventoryStock?: InventoryStock;
    locationStock?: LocationStock;
    weeklyShippingSchedule?: WeeklyShippingSchedule;
  };
}

/**
 * 旧 localStorage データを DB に移行する。
 * 移行済みフラグ（truck-loader-migrated）があればスキップ。
 */
async function migrateLegacyDataIfExists(): Promise<boolean> {
  try {
    const raw = localStorage.getItem('truck-loader-store');
    if (!raw) return false;

    const migrated = localStorage.getItem('truck-loader-migrated');
    if (migrated) return false;

    const legacy: LegacyStore = JSON.parse(raw);
    const s = legacy?.state;
    if (!s) return false;

    console.log('[Migration] 旧 localStorage データを DB に移行中...');

    const tasks: Promise<void>[] = [];

    if (s.factories?.length) {
      tasks.push(...s.factories.map((f) => db.upsertFactory(f)));
    }
    if (s.products?.length) {
      tasks.push(db.upsertProducts(s.products));
    }
    if (s.warehouses?.length) {
      tasks.push(...s.warehouses.map((w) => db.upsertWarehouse(w)));
    }
    if (s.palletTypes?.length) {
      tasks.push(...s.palletTypes.map((p) => db.upsertPalletType(p)));
    }
    if (s.productionPlan) {
      tasks.push(
        ...Object.entries(s.productionPlan).map(([code, qty]) =>
          db.upsertProductionQty(code, qty)
        )
      );
    }
    if (s.dailyProductionPlan) {
      tasks.push(db.replaceAllDailyProductionPlan(s.dailyProductionPlan));
    }
    if (s.inventoryStock) {
      tasks.push(
        ...Object.entries(s.inventoryStock).map(([code, qty]) =>
          db.upsertInventoryStock(code, qty)
        )
      );
    }
    if (s.locationStock) {
      for (const [pc, whs] of Object.entries(s.locationStock)) {
        for (const [wc, qty] of Object.entries(whs)) {
          tasks.push(db.upsertLocationStock(pc, wc, qty));
        }
      }
    }
    if (s.weeklyShippingSchedule) {
      for (const [fc, whs] of Object.entries(s.weeklyShippingSchedule)) {
        for (const [wc, days] of Object.entries(whs)) {
          tasks.push(db.upsertShippingSchedule(fc, wc, days));
        }
      }
    }

    await Promise.all(tasks);
    localStorage.setItem('truck-loader-migrated', '1');
    console.log('[Migration] 移行完了');
    return true;
  } catch (e) {
    console.warn('[Migration] 移行エラー:', e);
    return false;
  }
}

/**
 * アプリ起動時に DB からデータをロードする。
 * 旧 localStorage データがあれば先に移行する。
 */
export function SupabaseProvider({ children }: { children: React.ReactNode }) {
  const loadFromDB = useAppStore((s) => s.loadFromDB);
  const isLoaded = useAppStore((s) => s.isLoaded);

  useEffect(() => {
    (async () => {
      // 旧データの移行（初回のみ）
      await migrateLegacyDataIfExists();
      // DB からロード
      await loadFromDB();
    })();
  }, [loadFromDB]);

  if (!isLoaded) {
    return (
      <div className="flex items-center justify-center h-screen text-slate-400 text-sm gap-2">
        <svg
          className="animate-spin h-5 w-5 text-brand-600"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
        </svg>
        データを読み込み中...
      </div>
    );
  }

  return <>{children}</>;
}
