import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { generateText, Output } from 'ai';
import { authOptions } from '@/lib/authOptions';
import { recommendationSchema } from '@/lib/aiSchema';
import { SYSTEM_PROMPT_JA, aiContextPayloadSchema } from '@/lib/aiContext';

export const runtime = 'nodejs';
export const maxDuration = 60;

// AI Gateway 経由のモデル（provider/model 文字列でルーティング）
// 速度/コスト均衡。最強推論が必要なら 'anthropic/claude-opus-4.7' に変更可。
const AI_MODEL = 'anthropic/claude-sonnet-4.6';

export async function POST(req: NextRequest) {
  // 1. 認証ゲート（db.ts の getCompanyId と同じ判定）
  const session = await getServerSession(authOptions);
  if (!session?.user?.companyId) {
    return NextResponse.json({ message: '認証が必要です。' }, { status: 401 });
  }

  // 2. APIキー存在チェック（ローカル開発向け。Vercel 上では OIDC が自動で効く）
  if (!process.env.AI_GATEWAY_API_KEY && !process.env.VERCEL_OIDC_TOKEN) {
    return NextResponse.json(
      { message: 'AI設定エラー: AI_GATEWAY_API_KEY が未設定です。.env.local に設定してください。' },
      { status: 503 },
    );
  }

  // 3. ペイロードの検証（クライアントが buildAiContext で生成した要約）
  let payload;
  try {
    const body = await req.json();
    payload = aiContextPayloadSchema.parse(body);
  } catch {
    return NextResponse.json({ message: 'リクエストの形式が不正です。' }, { status: 400 });
  }

  // 4. モデル呼び出し（構造化出力）
  try {
    const { output } = await generateText({
      model: AI_MODEL,
      output: Output.object({ schema: recommendationSchema }),
      system: SYSTEM_PROMPT_JA,
      prompt: `以下のデータを分析し、トラック選定・積載方法・送り数の見直し・警告を日本語で提案してください:\n${JSON.stringify(payload)}`,
      maxOutputTokens: 4000,
      temperature: 0.2,
    });

    return NextResponse.json({ recommendation: output }, { status: 200 });
  } catch (err: unknown) {
    console.error('[ai-recommendation] error:', err);
    const statusCode = (err as { statusCode?: number })?.statusCode;
    if (statusCode === 429) {
      return NextResponse.json(
        { message: 'AIが混雑しています。しばらくしてから再試行してください。' },
        { status: 429 },
      );
    }
    return NextResponse.json({ message: 'AI推奨の生成に失敗しました。' }, { status: 500 });
  }
}
