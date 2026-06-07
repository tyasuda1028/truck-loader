import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { generateText, Output } from 'ai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { authOptions } from '@/lib/authOptions';
import { recommendationSchema } from '@/lib/aiSchema';
import { SYSTEM_PROMPT_JA, aiContextPayloadSchema } from '@/lib/aiContext';
import { resolveAiKey, incrementTrial } from '@/lib/aiKey';

export const runtime = 'nodejs';
export const maxDuration = 60;

// Google Gemini（無料枠あり）。'gemini-2.0-flash' / より賢くしたい場合は 'gemini-2.5-flash'。
const MODEL_ID = 'gemini-2.0-flash';

export async function POST(req: NextRequest) {
  // 1. 認証ゲート
  const session = await getServerSession(authOptions);
  const companyId = session?.user?.companyId;
  if (!companyId) {
    return NextResponse.json({ message: '認証が必要です。' }, { status: 401 });
  }

  // 2. キー解決（テナント自身のキー優先 → オーナーのお試しキー → 不可）
  const resolved = await resolveAiKey(companyId);
  if (!resolved.allowed) {
    if (resolved.reason === 'trial_exhausted') {
      return NextResponse.json(
        { message: `今月のお試し回数（${resolved.trialLimit}回）を使い切りました。設定画面でご自身のGeminiキーを登録すると無制限で使えます（無料キーは aistudio.google.com で取得）。` },
        { status: 429 },
      );
    }
    return NextResponse.json(
      { message: 'AIキーが未設定です。設定画面（マスタ設定）でご自身のGeminiキーを登録してください（無料キーは aistudio.google.com で取得）。' },
      { status: 503 },
    );
  }

  // 3. ペイロード検証（クライアントが buildAiContext で生成した要約）
  let payload;
  try {
    const body = await req.json();
    payload = aiContextPayloadSchema.parse(body);
  } catch {
    return NextResponse.json({ message: 'リクエストの形式が不正です。' }, { status: 400 });
  }

  // 4. モデル呼び出し（解決したキーで都度プロバイダを生成）
  try {
    const provider = createGoogleGenerativeAI({ apiKey: resolved.key });
    const { output } = await generateText({
      model: provider(MODEL_ID),
      output: Output.object({ schema: recommendationSchema }),
      system: SYSTEM_PROMPT_JA,
      prompt: `以下のデータを分析し、トラック選定・積載方法・送り数の見直し・警告を日本語で提案してください:\n${JSON.stringify(payload)}`,
      maxOutputTokens: 4000,
      temperature: 0.2,
    });

    // お試しキー利用時のみ回数を加算
    if (resolved.source === 'owner') {
      await incrementTrial(companyId).catch((e) => console.error('[ai-recommendation] trial increment failed:', e));
    }

    return NextResponse.json({ recommendation: output }, { status: 200 });
  } catch (err: unknown) {
    console.error('[ai-recommendation] error:', err);
    const statusCode = (err as { statusCode?: number })?.statusCode;
    if (statusCode === 429) {
      return NextResponse.json(
        { message: 'AIが混雑しています（無料枠のレート上限の可能性）。しばらくしてから再試行してください。' },
        { status: 429 },
      );
    }
    return NextResponse.json({ message: 'AI推奨の生成に失敗しました。キーが有効か確認してください。' }, { status: 500 });
  }
}
