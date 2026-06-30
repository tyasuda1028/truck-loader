'use client';

/**
 * 起動時に画面向きのロックを解除して自由回転にする（ネイティブのみ）。layout に1つ置く。
 * Web では何もしない。
 */
import { useEffect } from 'react';
import { unlockOrientation } from '@/lib/orientation';

export function OrientationController() {
  useEffect(() => {
    unlockOrientation();
  }, []);
  return null;
}
