/**
 * POST /api/push/test — 自テナントの登録端末へテスト通知を送る（フェーズ6）。
 * body（任意）: { title?: string, body?: string }
 *
 * APNs環境変数（lib/server/apns.ts 参照）が未設定だと送信時に例外になる。
 * 実機での疎通確認用。Cookieセッション認証。
 */
import { NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/server/auth';
import { sql } from '@/lib/neon';
import { sendApns } from '@/lib/server/apns';

export async function POST(req: Request) {
  const auth = await getAuthContext(req);
  const companyId = auth?.companyId;
  if (!companyId) return new NextResponse('Unauthorized', { status: 401 });

  const body = await req.json().catch(() => ({}));

  // device_tokens が無ければ作成（register 未実行でもエラーにしない）
  await sql`
    CREATE TABLE IF NOT EXISTS device_tokens (
      token text PRIMARY KEY,
      company_id uuid NOT NULL,
      platform text NOT NULL DEFAULT 'ios',
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `;
  const rows = await sql`
    SELECT token FROM device_tokens WHERE company_id = ${companyId} AND platform = 'ios'
  `;
  const tokens = rows.map((r) => r.token as string);
  if (!tokens.length) {
    return NextResponse.json({ ok: false, message: '登録済みのiOS端末がありません' });
  }

  try {
    const results = await sendApns(tokens, {
      title: body.title ?? 'スマコウバ積載',
      body: body.body ?? 'テスト通知です 🚚',
    });
    return NextResponse.json({ ok: true, sent: results.filter((r) => r.ok).length, total: tokens.length, results });
  } catch (e) {
    return NextResponse.json({ ok: false, message: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
