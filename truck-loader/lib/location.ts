import type { Location, Factory, Warehouse } from './types';

/** 場所マスターから「生産元」ビュー（Factory[]）を派生 */
export function locationsToFactories(locations: Location[]): Factory[] {
  return locations
    .filter((l) => l.role === 'factory' || l.role === 'both')
    .map((l) => ({ code: l.code, name: l.name }));
}

/** 場所マスターから「出荷先」ビュー（Warehouse[]）を派生 */
export function locationsToWarehouses(locations: Location[]): Warehouse[] {
  return locations
    .filter((l) => l.role === 'warehouse' || l.role === 'both')
    .map((l) => ({
      code: l.code,
      name: l.name,
      truckType: l.truckType ?? '',
      priority: l.priority,
      leadTimeDays: l.leadTimeDays,
    }));
}

/**
 * 旧 factories[] / warehouses[] を場所マスター（Location[]）へ冪等移行する。
 * - 既に locations があればそのまま返す（再移行しない）
 * - 同一コードが工場・拠点の両方にあれば role='both'（工場側の名前を優先）
 * - code はそのまま保持＝在庫など warehouseCode/factoryCode キーは不変
 */
export function migrateToLocations(
  factories: Factory[],
  warehouses: Warehouse[],
  existing?: Location[] | null,
): Location[] {
  if (existing && existing.length > 0) return existing;
  const map = new Map<string, Location>();
  for (const f of factories) {
    map.set(f.code, { code: f.code, name: f.name, role: 'factory' });
  }
  for (const w of warehouses) {
    const ex = map.get(w.code);
    if (ex) {
      ex.role = 'both';
      ex.truckType = w.truckType;
      ex.priority = w.priority;
      ex.leadTimeDays = w.leadTimeDays;
    } else {
      map.set(w.code, {
        code: w.code,
        name: w.name,
        role: 'warehouse',
        truckType: w.truckType,
        priority: w.priority,
        leadTimeDays: w.leadTimeDays,
      });
    }
  }
  return [...map.values()];
}
