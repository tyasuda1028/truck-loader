import { api, G, APP_ID } from './asc-lib.mjs';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const versions = await G(`/v1/apps/${APP_ID}/appStoreVersions?limit=5`);
const ver = (versions.data || []).find(v => v.attributes.versionString === '1.0') || versions.data[0];

// 0) 説明文からバーコード関連の行を削除
const vls = await G(`/v1/appStoreVersions/${ver.id}/appStoreVersionLocalizations`);
const ja = (vls.data || []).find(l => l.attributes.locale === 'ja') || vls.data[0];
const desc = ja.attributes.description || '';
if (desc.includes('バーコード')) {
  const cleaned = desc.split('\n').filter(line => !line.includes('バーコード')).join('\n');
  await api('PATCH', `/v1/appStoreVersionLocalizations/${ja.id}`, { data: { type: 'appStoreVersionLocalizations', id: ja.id, attributes: { description: cleaned } } });
  console.log('✅ 説明文からバーコード行を削除');
} else {
  console.log('説明文にバーコード記載なし（スキップ）');
}

// 1) build4 VALID 待ち
let build = null;
for (let i = 0; i < 50; i++) {
  const bs = await G(`/v1/builds?filter[app]=${APP_ID}&filter[version]=4&limit=1`);
  build = bs.data?.[0];
  const st = build?.attributes?.processingState;
  console.log(`build4 processing: ${st || '未表示'} (try ${i + 1})`);
  if (st === 'VALID') break;
  if (st === 'INVALID' || st === 'FAILED') { console.log('❌ build4 無効'); process.exit(1); }
  await sleep(15000);
}
if (build?.attributes?.processingState !== 'VALID') { console.log('build4 まだVALIDでない'); process.exit(1); }
console.log('✅ build4 VALID:', build.id);

// 2) 暗号化
await api('PATCH', `/v1/builds/${build.id}`, { data: { type: 'builds', id: build.id, attributes: { usesNonExemptEncryption: false } } });
console.log('✅ 暗号化=No');

// 3) 紐付け
await api('PATCH', `/v1/appStoreVersions/${ver.id}/relationships/build`, { data: { type: 'builds', id: build.id } });
console.log('✅ build4 紐付け');

// 4) 審査メモ更新（ビジネスモデル＝2.1(b)/3.1.1/2.1(a) 対応）
const NOTES = `本アプリは中小製造業/物流向けのトラック積載計画ツールです（無料・アプリ内課金なし）。

[ビジネスモデル / 3.1.1・2.1(b)] 本アプリはB2B（法人向け）の業務ツールです。アプリ内に有料購入・サブスクリプション・外部決済への導線はありません。ログイン後は全機能を制限なくご利用いただけます。料金/お問い合わせ等の外部課金ページはネイティブでは表示しません。商取引は当社と顧客企業との法人契約（アプリ外）で、個人消費者向け・家族向けの販売はありません。

[2.1(a) ログイン] 前回のログイン時ネットワークエラーはサーバ側CORS設定の不備が原因で、修正済みです。本ビルドではログイン/新規登録が正常に動作します（インターネット接続が必要）。

審査用デモアカウント: appreview@example.com / appreview
※ログイン画面の「ログインせずにデモを見る」でもサンプルデータで全機能を確認できます。画面は横向き固定です。`;
try {
  const rd = await G(`/v1/appStoreVersions/${ver.id}/appStoreReviewDetail`);
  if (rd.data) { await api('PATCH', `/v1/appStoreReviewDetails/${rd.data.id}`, { data: { type: 'appStoreReviewDetails', id: rd.data.id, attributes: { notes: NOTES } } }); console.log('✅ 審査メモ更新'); }
} catch (e) { console.log('審査メモ更新スキップ:', String(e.message).split('\n')[0]); }

// 5) 旧提出キャンセル
const subs = await G(`/v1/reviewSubmissions?filter[app]=${APP_ID}&limit=20`);
for (const s of subs.data || []) {
  if (['UNRESOLVED_ISSUES', 'READY_FOR_REVIEW', 'WAITING_FOR_REVIEW'].includes(s.attributes.state)) {
    try { await api('PATCH', `/v1/reviewSubmissions/${s.id}`, { data: { type: 'reviewSubmissions', id: s.id, attributes: { canceled: true } } }); console.log('旧提出キャンセル:', s.id, s.attributes.state); }
    catch (e) { console.log('キャンセル不可:', s.id, String(e.message).split('\n')[0]); }
  }
}
await sleep(5000);

// 6) 新規提出（item追加は状態遷移直後だと弾かれるのでリトライ）
const created = await api('POST', '/v1/reviewSubmissions', { data: { type: 'reviewSubmissions', attributes: { platform: 'IOS' }, relationships: { app: { data: { type: 'apps', id: APP_ID } } } } });
const sub = created.data;
console.log('✅ 新規submission:', sub.id);
let added = false;
for (let i = 0; i < 8; i++) {
  try {
    await api('POST', '/v1/reviewSubmissionItems', { data: { type: 'reviewSubmissionItems', relationships: { reviewSubmission: { data: { type: 'reviewSubmissions', id: sub.id } }, appStoreVersion: { data: { type: 'appStoreVersions', id: ver.id } } } } });
    added = true; break;
  } catch (e) { console.log(`item追加リトライ${i + 1}:`, String(e.message).split('\n')[1] || ''); await sleep(15000); }
}
if (!added) { console.log('❌ item追加できず。版状態の安定後に asc-submit.mjs を実行'); process.exit(1); }
console.log('✅ バージョン項目追加');
const res = await api('PATCH', `/v1/reviewSubmissions/${sub.id}`, { data: { type: 'reviewSubmissions', id: sub.id, attributes: { submitted: true } } });
console.log('🎉 提出 state:', res.data?.attributes?.state);
