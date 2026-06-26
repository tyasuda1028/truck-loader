/**
 * Stripe（Web課金）。Standard プランのみ自己決済（上位はお問い合わせ）。
 * 契約状態は companies.is_pro / subscription_* に反映し、既存の getCompanyEntitlement が判定する。
 */
import Stripe from 'stripe';
import { sql } from '../neon';

let _stripe: Stripe | null = null;
export function getStripe(): Stripe {
  if (!_stripe) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error('STRIPE_SECRET_KEY が未設定です');
    _stripe = new Stripe(key);
  }
  return _stripe;
}

export const APP_URL = process.env.APP_URL || 'https://sumakouba-truck-loader.vercel.app';
export const PRICES: Record<string, string | undefined> = {
  standard_monthly: process.env.STRIPE_PRICE_STANDARD_MONTHLY,
  standard_yearly: process.env.STRIPE_PRICE_STANDARD_YEARLY,
};

let _columnReady = false;
async function ensureStripeColumn(): Promise<void> {
  if (_columnReady) return;
  await sql`ALTER TABLE companies ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT`;
  _columnReady = true;
}

/** company に対応する Stripe 顧客を取得（無ければ作成して保存） */
export async function getOrCreateCustomer(companyId: string, companyName?: string): Promise<string> {
  await ensureStripeColumn();
  const rows = await sql`SELECT stripe_customer_id, name FROM companies WHERE id = ${companyId}`;
  const existing = rows[0]?.stripe_customer_id as string | undefined;
  if (existing) return existing;
  const customer = await getStripe().customers.create({
    name: companyName || (rows[0]?.name as string | undefined) || undefined,
    metadata: { companyId },
  });
  await sql`UPDATE companies SET stripe_customer_id = ${customer.id} WHERE id = ${companyId}`;
  return customer.id;
}

interface ApplyOpts {
  companyId?: string | null;
  customerId?: string | null;
  isPro: boolean;
  productId?: string | null;
  expiresAt?: number | null; // unix seconds
}

/** Webhook から契約状態を会社へ反映（companyId か customerId で対象特定） */
export async function applySubscriptionToCompany(opts: ApplyOpts): Promise<void> {
  await ensureStripeColumn();
  const expires = opts.expiresAt ? new Date(opts.expiresAt * 1000).toISOString() : null;
  if (opts.companyId) {
    await sql`
      UPDATE companies SET
        is_pro = ${opts.isPro},
        subscription_store = 'stripe',
        subscription_product_id = ${opts.productId ?? null},
        subscription_expires_at = ${expires},
        subscription_updated_at = NOW(),
        stripe_customer_id = COALESCE(${opts.customerId ?? null}, stripe_customer_id)
      WHERE id = ${opts.companyId}`;
  } else if (opts.customerId) {
    await sql`
      UPDATE companies SET
        is_pro = ${opts.isPro},
        subscription_store = 'stripe',
        subscription_product_id = ${opts.productId ?? null},
        subscription_expires_at = ${expires},
        subscription_updated_at = NOW()
      WHERE stripe_customer_id = ${opts.customerId}`;
  }
}
