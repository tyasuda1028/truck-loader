#!/usr/bin/env node
/**
 * migrate-to-neon.mjs
 *
 * Neon にスキーマを作成し、Supabase から生成した seed データを投入する。
 *
 * 使い方:
 *   node scripts/migrate-to-neon.mjs
 *
 * DATABASE_URL は .env.local から自動で読み込みます。
 */

import { readFileSync, existsSync } from 'fs';
import { neon } from '@neondatabase/serverless';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dir = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dir, '..');

// .env.local から DATABASE_URL を読み込む
function loadEnv() {
  const envPath = join(projectRoot, '.env.local');
  if (!existsSync(envPath)) return;
  const content = readFileSync(envPath, 'utf-8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.startsWith('#') || !trimmed.includes('=')) continue;
    const eq = trimmed.indexOf('=');
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

loadEnv();

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL || DATABASE_URL.includes('user:password@xxx')) {
  console.error('❌ DATABASE_URL が設定されていません。');
  console.error('   .env.local の DATABASE_URL を Neon の接続文字列に書き換えてください。');
  console.error('   例: postgresql://user:pass@xxx-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require');
  process.exit(1);
}

const masked = DATABASE_URL.replace(/:\/\/[^@]+@/, '://***@');
console.log(`📦 接続先: ${masked}`);

const sql = neon(DATABASE_URL);

// SQL ファイルをセミコロンで分割して個別実行
function splitStatements(sqlText) {
  return sqlText
    .split('\n')
    .filter(line => !line.trim().startsWith('--') && line.trim() !== '')
    .join('\n')
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0);
}

async function runFile(label, filePath) {
  console.log(`\n${label}`);
  const fullPath = join(projectRoot, filePath);
  if (!existsSync(fullPath)) {
    console.error(`  ❌ ファイルが見つかりません: ${filePath}`);
    process.exit(1);
  }
  const content = readFileSync(fullPath, 'utf-8');
  const statements = splitStatements(content);
  console.log(`  ${statements.length} ステートメントを実行中...`);
  let done = 0;
  for (const stmt of statements) {
    try {
      await sql(stmt);
      done++;
      if (done % 100 === 0) process.stdout.write(`  ${done}/${statements.length}...\r`);
    } catch (err) {
      console.error(`\n  ❌ エラー: ${err.message}`);
      console.error(`  SQL: ${stmt.slice(0, 120)}...`);
      process.exit(1);
    }
  }
  console.log(`  ✅ ${done} ステートメント完了`);
}

async function checkCounts() {
  console.log('\n3️⃣  件数確認...');
  const tables = [
    'factories','products','warehouses','truck_types','pallet_types',
    'production_plan','distribution_ratios','inventory_stock',
    'location_stock','weekly_shipping_schedule',
  ];
  for (const t of tables) {
    const [{ count }] = await sql(`SELECT COUNT(*) as count FROM ${t}`);
    console.log(`  ${t.padEnd(28)} ${count} 件`);
  }
}

(async () => {
  try {
    await runFile('1️⃣  スキーマ作成中...', 'neon-schema.sql');
    await runFile('2️⃣  データ投入中...', 'neon-seed-data.sql');
    await checkCounts();
    console.log('\n🎉 Neon への移行が完了しました！');
    console.log('\n次のステップ:');
    console.log('  npm run dev  →  動作確認');
    console.log('  vercel env add DATABASE_URL  →  Vercel に本番用 DATABASE_URL を登録');
  } catch (err) {
    console.error('\n❌ 移行中にエラーが発生しました:', err.message);
    process.exit(1);
  }
})();
