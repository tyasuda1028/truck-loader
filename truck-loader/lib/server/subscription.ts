/**
 * 会社単位のエンタイトルメント（無料トライアル / 法人契約）。
 *   active = is_pro（契約済み） または トライアル期限内
 * トライアルは登録時に trial_ends_at = now + 30日 を付与（app/api/register）。
 */
import { sql } from '../neon';

export const TRIAL_DAYS = 30;

export interface Entitlement {
  active: boolean;
  isPro: boolean;
  trialEndsAt: string | null; // ISO
  trialDaysLeft: number | null;
}

/** active(契約 or トライアル期限内) でなければ例外。サーバ側でのトライアル強制に使う。 */
export class TrialExpiredError extends Error {
  code = 'TRIAL_EXPIRED';
  constructor() { super('無料トライアルが終了しました。継続利用にはご契約が必要です。'); }
}
export async function assertActiveCompany(companyId: string): Promise<void> {
  const ent = await getCompanyEntitlement(companyId);
  if (!ent.active) throw new TrialExpiredError();
}

export async function getCompanyEntitlement(companyId: string): Promise<Entitlement> {
  const rows = await sql`SELECT is_pro, trial_ends_at FROM companies WHERE id = ${companyId}`;
  const r = rows[0];
  if (!r) return { active: false, isPro: false, trialEndsAt: null, trialDaysLeft: null };
  const isPro = Boolean(r.is_pro);
  const ends = r.trial_ends_at ? new Date(r.trial_ends_at) : null;
  const now = Date.now();
  const trialActive = ends ? ends.getTime() > now : false;
  const trialDaysLeft = ends ? Math.max(0, Math.ceil((ends.getTime() - now) / 86_400_000)) : null;
  return {
    active: isPro || trialActive,
    isPro,
    trialEndsAt: ends ? ends.toISOString() : null,
    trialDaysLeft,
  };
}
