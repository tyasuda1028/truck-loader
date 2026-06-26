/**
 * POST /api/customer-portal — Stripe カスタマーポータル（解約・変更）の URL を返す。
 */
import { NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/server/auth';
import { getStripe, getOrCreateCustomer, APP_URL } from '@/lib/server/stripe';
import { withCors, preflight } from '@/lib/cors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function OPTIONS(req: Request) { return preflight(req); }
export async function POST(req: Request) { return withCors(req, await handle(req)); }

async function handle(req: Request): Promise<Response> {
  const ctx = await getAuthContext(req);
  if (!ctx) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  try {
    const customer = await getOrCreateCustomer(ctx.companyId, ctx.companyName);
    const session = await getStripe().billingPortal.sessions.create({ customer, return_url: `${APP_URL}/` });
    return NextResponse.json({ url: session.url });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
