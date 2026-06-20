import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Capacitor 設定（フェーズ1）
 *
 * フロントの配信方式は段階的に切り替える:
 *   - フェーズ1（現在）: webDir 'www' のプレースホルダを表示してアプリ起動を確認。
 *                        実運用の暫定として server.url に本番Vercel URLを指定し、
 *                        WebViewで既存Webアプリを表示することも可能（下記コメント参照）。
 *   - フェーズ2: フロントを静的ビルドして www に出力し、アプリ内同梱（オフライン表示）。
 *
 * appId は Apple Developer の Bundle ID と一致させる必要がある。
 * 仮の値を入れてあるので、自社ドメインに合わせて変更すること。
 */
const config: CapacitorConfig = {
  appId: 'com.tetsuyayasuda.truckloader', // 自社/個人のユニークなBundle ID。XcodeのBundle Identifierと一致させること
  appName: 'スマコウバ積載',
  webDir: 'www',

  // ── フェーズ1の暫定: 既存WebアプリをWebViewで表示したい場合は以下を有効化 ──
  // ※ この方式はオフライン不可。フェーズ2で静的同梱に切り替えると本来のオフラインになる。
  // server: {
  //   url: 'https://tyasuda1028-truck-loader.vercel.app', // TODO: 実際の本番URLを確認して設定
  //   cleartext: false,
  // },
};

export default config;
