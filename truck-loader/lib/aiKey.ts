import { sql } from './neon';
import { decryptSecret } from './crypto';

// ─── AIキー解決（ハイブリッド：テナントBYOK ＋ オーナーお試し）───────────────
// ⚠️ サーバー専用。クライアントコンポーネントから import しないこと。
//    復号した実キーを返す resolveAiKey は API ルートからのみ呼ぶこと。

/** 未設定テナントの「お試し」上限（月あたり） */
export const TRIAL_LIMIT = Number(process.env.AI_TRIAL_LIMIT) || 20;

/** 当月キー 'YYYY-MM' */
export function currentPeriod(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

let tableEnsured = false;
/** company_ai_config テーブルを必要時に作成（マイグレーション不要で動かすため） */
export async function ensureAiConfigTable(): Promise<void> {
  if (tableEnsured) return;
  await sql`
    CREATE TABLE IF NOT EXISTS company_ai_config (
      company_id UUID PRIMARY KEY,
      gemini_key_enc TEXT,
      gemini_key_last4 TEXT,
      trial_period TEXT,
      trial_count INTEGER NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ DEFAULT now()
    )
  `;
  tableEnsured = true;
}

export type AiKeyResolution =
  | { allowed: true; key: string; source: 'tenant' | 'owner'; trialUsed?: number; trialLimit?: number }
  | { allowed: false; reason: 'trial_exhausted' | 'no_key'; trialUsed?: number; trialLimit?: number };

/**
 * テナントのAIキーを解決する。
 * ① テナント自身のキー（あれば無制限） → ② オーナーのお試しキー（月N回まで） → ③ 不可
 */
export async function resolveAiKey(companyId: string): Promise<AiKeyResolution> {
  await ensureAiConfigTable();
  const rows = await sql`
    SELECT gemini_key_enc, trial_period, trial_count
    FROM company_ai_config WHERE company_id = ${companyId} LIMIT 1
  `;
  const row = rows[0];

  // ① テナント自身のキー（無制限）
  if (row?.gemini_key_enc) {
    try {
      return { allowed: true, key: decryptSecret(row.gemini_key_enc as string), source: 'tenant' };
    } catch {
      // 復号失敗（暗号化シークレット変更など）→ お試しにフォールバック
    }
  }

  // ② オーナーのお試しキー（月 TRIAL_LIMIT 回まで）
  const ownerKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (ownerKey) {
    const period = currentPeriod();
    const used = row?.trial_period === period ? Number(row.trial_count) : 0;
    if (used >= TRIAL_LIMIT) {
      return { allowed: false, reason: 'trial_exhausted', trialUsed: used, trialLimit: TRIAL_LIMIT };
    }
    return { allowed: true, key: ownerKey, source: 'owner', trialUsed: used, trialLimit: TRIAL_LIMIT };
  }

  // ③ どちらも無い
  return { allowed: false, reason: 'no_key' };
}

/** お試し利用回数を +1（当月）。オーナーキー利用時のみ呼ぶこと。 */
export async function incrementTrial(companyId: string): Promise<void> {
  await ensureAiConfigTable();
  const period = currentPeriod();
  await sql`
    INSERT INTO company_ai_config (company_id, trial_period, trial_count)
    VALUES (${companyId}, ${period}, 1)
    ON CONFLICT (company_id) DO UPDATE SET
      trial_count = CASE WHEN company_ai_config.trial_period = ${period} THEN company_ai_config.trial_count + 1 ELSE 1 END,
      trial_period = ${period}
  `;
}
