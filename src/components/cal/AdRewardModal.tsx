import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';

interface AdRewardModalProps {
  open: boolean;
  onComplete: () => void;
  onSkip?: () => void;
  onError?: (err: string) => void;
  onClose: () => void;
  /** 모바일 한정 SDK 활성. 웹에서는 dummy 카운트다운 동작. */
  isNativeSdkAvailable?: boolean;
}

const DUMMY_AD_DURATION = 5; // 초

export default function AdRewardModal({
  open, onComplete, onSkip, onClose, isNativeSdkAvailable = false,
}: AdRewardModalProps) {
  const [countdown, setCountdown] = useState(DUMMY_AD_DURATION);
  const [finished, setFinished] = useState(false);

  useEffect(() => {
    if (!open) {
      setCountdown(DUMMY_AD_DURATION);
      setFinished(false);
      return;
    }
    // dummy 카운트다운 — 실 SDK 통합(T-048)에서 SDK 자체 카운트다운으로 교체.
    if (isNativeSdkAvailable) return; // 실 SDK 활성 시 dummy 카운트다운 비활성
    if (countdown <= 0) {
      setFinished(true);
      return;
    }
    const t = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [open, countdown, isNativeSdkAvailable]);

  const handleComplete = () => {
    onComplete();
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[150] flex items-center justify-center bg-black/70 p-4"
          role="dialog"
          aria-label="광고 시청"
        >
          <motion.div
            initial={{ scale: 0.95, y: 12 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.95, y: 12 }}
            className="bg-white rounded-3xl p-6 w-full max-w-sm mx-4 space-y-4"
          >
            <h2 className="text-sm font-black text-slate-900 text-center">
              광고 끝나면 +🌰 1 cal
            </h2>

            <div className="bg-slate-100 rounded-2xl min-h-[200px] flex flex-col items-center justify-center text-slate-400">
              {isNativeSdkAvailable ? (
                <span className="text-xs font-bold">[ 광고 SDK 컨테이너 ]</span>
              ) : (
                <>
                  <span className="text-[10px] font-black uppercase">DUMMY 광고</span>
                  <span className="mt-2 text-3xl font-black text-slate-600" aria-live="polite">
                    {countdown}
                  </span>
                  <span className="text-[10px] font-bold mt-1">초 남음</span>
                </>
              )}
            </div>

            {!isNativeSdkAvailable && finished && (
              <button
                type="button"
                onClick={handleComplete}
                className="w-full py-3 rounded-2xl bg-orange-500 text-white text-sm font-black active:scale-[0.98] transition-transform"
              >
                🌰 +1 cal 받기
              </button>
            )}

            <div className="flex items-center justify-between text-[11px] font-black">
              {onSkip && (
                <button
                  type="button"
                  onClick={onSkip}
                  className="text-slate-400"
                  disabled={!finished && !isNativeSdkAvailable}
                >
                  건너뛰기
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                className="ml-auto text-slate-400"
                aria-label="광고 닫기"
              >
                닫기
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
