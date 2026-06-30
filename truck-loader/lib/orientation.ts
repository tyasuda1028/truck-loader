/**
 * 画面向き（ネイティブのみ）。
 *
 * 方針: 自由回転（縦／横どちらも可）。iOSは Info.plist の
 * UISupportedInterfaceOrientations で全方向を許可し、起動時に ScreenOrientation の
 * ロックを解除しておく（旧バージョンで横向き固定していた名残を念のため解除）。
 * Web/ブラウザでは何もしない。
 */
import { Capacitor } from '@capacitor/core';

/** 画面向きのロックを解除して自由回転にする */
export async function unlockOrientation(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const { ScreenOrientation } = await import('@capacitor/screen-orientation');
    await ScreenOrientation.unlock();
  } catch {
    /* プラグイン未導入/未対応端末では何もしない */
  }
}
