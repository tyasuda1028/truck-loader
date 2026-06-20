/**
 * プッシュ通知のクライアントラッパー（フェーズ6）。
 *
 * - ネイティブ(iOS): @capacitor/push-notifications で権限要求→登録→APNsトークン取得→
 *   サーバー(/api/push/register)へ送信。受信/タップのリスナーも設定。
 * - Web: Notification API による権限要求＋ローカル通知デモ（動作確認用）。
 *
 * 実際のリモート配信には Apple Developer の APNs鍵(.p8) とサーバー実装が必要
 * （app/api/push/* と lib/server/apns.ts、要環境変数）。
 */
import { Capacitor } from '@capacitor/core';

export type PushStatus = 'granted' | 'denied' | 'prompt' | 'unsupported';

export interface EnablePushResult {
  ok: boolean;
  status: PushStatus;
  token?: string;
  source: 'apns' | 'web';
  message?: string;
}

export function isNativePush(): boolean {
  return Capacitor.isNativePlatform();
}

async function sendTokenToServer(token: string, platform: 'ios' | 'web'): Promise<void> {
  try {
    const { getToken } = await import('./auth/token');
    const { syncApiBase, authHeader } = await import('./auth/cloudAuth');
    const authToken = await getToken();
    await fetch(`${syncApiBase()}/api/push/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeader(authToken) },
      credentials: 'include',
      body: JSON.stringify({ token, platform }),
    });
  } catch (e) {
    console.warn('[push] トークン登録に失敗:', e);
  }
}

/** 通知の許可状態を取得（要求はしない） */
export async function getPushStatus(): Promise<PushStatus> {
  if (Capacitor.isNativePlatform()) {
    const { PushNotifications } = await import('@capacitor/push-notifications');
    const p = await PushNotifications.checkPermissions();
    return (p.receive as PushStatus) ?? 'prompt';
  }
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  const p = Notification.permission;
  return p === 'default' ? 'prompt' : (p as PushStatus);
}

/** 権限を要求し、ネイティブならAPNs登録＋トークン送信まで行う */
export async function enablePush(): Promise<EnablePushResult> {
  if (Capacitor.isNativePlatform()) {
    try {
      const { PushNotifications } = await import('@capacitor/push-notifications');
      let perm = await PushNotifications.checkPermissions();
      if (perm.receive !== 'granted') perm = await PushNotifications.requestPermissions();
      if (perm.receive !== 'granted') {
        return { ok: false, status: 'denied', source: 'apns', message: '通知が許可されませんでした' };
      }

      // 登録 → トークンをリスナーで受け取る（タイムアウト付き）
      const token = await new Promise<string>((resolve, reject) => {
        let done = false;
        const timer = setTimeout(() => { if (!done) { done = true; reject(new Error('トークン取得がタイムアウトしました')); } }, 10000);
        PushNotifications.addListener('registration', (t) => {
          if (done) return; done = true; clearTimeout(timer); resolve(t.value);
        });
        PushNotifications.addListener('registrationError', (e) => {
          if (done) return; done = true; clearTimeout(timer); reject(new Error(String(e?.error ?? e)));
        });
        PushNotifications.register();
      });

      await sendTokenToServer(token, 'ios');
      return { ok: true, status: 'granted', token, source: 'apns' };
    } catch (e) {
      return { ok: false, status: 'denied', source: 'apns', message: e instanceof Error ? e.message : String(e) };
    }
  }

  // Web フォールバック
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return { ok: false, status: 'unsupported', source: 'web', message: 'この環境は通知に非対応です' };
  }
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') {
    return { ok: false, status: perm === 'denied' ? 'denied' : 'prompt', source: 'web' };
  }
  // デモ用ローカル通知
  try {
    new Notification('スマコウバ積載', { body: '通知が有効になりました（Web版はローカル通知のデモ）' });
  } catch { /* SW未登録環境では出ないことがある */ }
  return { ok: true, status: 'granted', source: 'web' };
}

/** 受信/タップのリスナーを設定（ネイティブのみ。アプリ起動時に1回） */
export async function initPushListeners(onReceived?: (title: string, body: string) => void): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  const { PushNotifications } = await import('@capacitor/push-notifications');
  await PushNotifications.addListener('pushNotificationReceived', (n) => {
    onReceived?.(n.title ?? '通知', n.body ?? '');
  });
  await PushNotifications.addListener('pushNotificationActionPerformed', (a) => {
    onReceived?.(a.notification.title ?? '通知', a.notification.body ?? '');
  });
}
