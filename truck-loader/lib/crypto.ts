import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'crypto';

// ─── APIキー等の機密文字列を暗号化して保存するためのユーティリティ ──────────
// AES-256-GCM。鍵は環境変数 AI_KEY_ENCRYPTION_SECRET から SHA-256 で導出（32byte）。
// 保存形式: base64( iv(12) | authTag(16) | ciphertext )
//
// サーバー専用。クライアントから import しないこと。

function deriveKey(): Buffer {
  const secret = process.env.AI_KEY_ENCRYPTION_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error('AI_KEY_ENCRYPTION_SECRET が未設定（または短すぎ）です。16文字以上のランダム文字列を設定してください。');
  }
  return createHash('sha256').update(secret).digest();
}

/** 暗号化キーが利用可能か（設定UIの可否判定用、例外を投げない） */
export function isEncryptionConfigured(): boolean {
  const s = process.env.AI_KEY_ENCRYPTION_SECRET;
  return !!s && s.length >= 16;
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', deriveKey(), iv);
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ct]).toString('base64');
}

export function decryptSecret(enc: string): string {
  const buf = Buffer.from(enc, 'base64');
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const ct = buf.subarray(28);
  const decipher = createDecipheriv('aes-256-gcm', deriveKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
}
