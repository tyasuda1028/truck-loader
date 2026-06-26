/**
 * POST /api/stripe-webhook — Stripe 署名検証して companies.is_pro を自動更新。
 * App Router では req.text() で生ボディが取れる（署名検証に使用）。CORS不要・middleware除外。
 */
import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { applySubscriptionToCompany } from '@/lib/server/stripe';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// 署名検証は webhook secret のみで完結（API呼び出しなし）→ キー未設定でも検証可
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_webhook_verify_only');
const ACTIVE = new Set(['active', 'trialing']);

function productIdOf(sub: Stripe.Subscription): string | null {
  const p = sub.items?.data?.[0]?.price?.product;
  if (!p) return null;
  return typeof p === 'string' ? p : p.id;
}

export async function POST(req: Request) {
  const sig = req.headers.get('stripe-signature') || '';
  const secret = process.env.STRIPE_WEBHOOK_SECRET || '';
  let event: Stripe.Event;
  try {
    const body = await req.text();
    event = stripe.webhooks.constructEvent(body, sig, secret);
  } catch (e) {
    return new NextResponse(`Webhook signature error: ${(e as Error).message}`, { status: 400 });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const o = event.data.object as Stripe.Checkout.Session;
        await applySubscriptionToCompany({
          companyId: o.client_reference_id || (o.metadata?.companyId ?? null),
          customerId: typeof o.customer === 'string' ? o.customer : o.customer?.id ?? null,
          isPro: true,
        });
        break;
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const o = event.data.object as Stripe.Subscription;
        await applySubscriptionToCompany({
          customerId: typeof o.customer === 'string' ? o.customer : o.customer.id,
          companyId: o.metadata?.companyId ?? null,
          isPro: ACTIVE.has(o.status),
          productId: productIdOf(o),
          expiresAt: o.current_period_end ?? null,
        });
        break;
      }
      case 'customer.subscription.deleted': {
        const o = event.data.object as Stripe.Subscription;
        await applySubscriptionToCompany({
          customerId: typeof o.customer === 'string' ? o.customer : o.customer.id,
          isPro: false,
          expiresAt: o.current_period_end ?? null,
        });
        break;
      }
      default:
        break;
    }
    return NextResponse.json({ received: true });
  } catch (e) {
    return new NextResponse(`handler error: ${(e as Error).message}`, { status: 500 });
  }
}
