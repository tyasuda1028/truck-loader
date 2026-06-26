/**
 * POST /api/checkout — Standard プランの Stripe Checkout セッションを作成し URL を返す。
 * 認証は getAuthContext（Cookie/Bearer両対応）。Standard以外はオンライン決済不可（お問い合わせ）。
 */
import { NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/server/auth';
import { getStripe, getOrCreateCustomer, APP_URL, PRICES } from '@/lib/server/stripe';
import { withCors, preflight } from '@/lib/cors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function OPTIONS(req: Request) { return preflight(req); }
export async function POST(req: Request) { return withCors(req, await handle(req)); }

async function handle(req: Request): Promise<Response> {
  const ctx = await getAuthContext(req);
  if (!ctx) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let plan = 'standard_monthly';
  try { const b = await req.json(); if (b?.plan) plan = String(b.plan); } catch { /* default */ }
  const price = PRICES[plan];
  if (!price) return NextResponse.json({ error: 'このプランはオンライン決済の対象外です。お問い合わせください。' }, { status: 503 });

  try {
    const customer = await getOrCreateCustomer(ctx.companyId, ctx.companyName);
    const session = await getStripe().checkout.sessions.create({
      mode: 'subscription',
      customer,
      client_reference_id: ctx.companyId,
      line_items: [{ price, quantity: 1 }],
      success_url: `${APP_URL}/?checkout=success`,
      cancel_url: `${APP_URL}/pricing?checkout=cancel`,
      metadata: { companyId: ctx.companyId },
      subscription_data: { metadata: { companyId: ctx.companyId } },
      allow_promotion_codes: true,
    });
    return NextResponse.json({ url: session.url });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
