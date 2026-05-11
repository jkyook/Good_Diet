import React from 'react';
import { motion, AnimatePresence } from 'motion/react';

interface CalLimitModalProps {
  open: boolean;
  calBalance: number;
  dailyUsageCount: number;
  dailyLimit: number;
  adAvailable?: boolean;
  onWatchAd: () => void;
  onCharge: () => void;
  onClose: () => void;
}

export default function CalLimitModal({
  open, calBalance, dailyUsageCount, dailyLimit, adAvailable = true,
  onWatchAd, onCharge, onClose,
}: CalLimitModalProps) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[150] flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="calLimitTitle"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.95, y: 12 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.95, y: 12 }}
            className="bg-white rounded-3xl p-6 w-full max-w-sm mx-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="calLimitTitle" className="text-base font-black text-slate-900">
              🌰 cal이 부족해요
            </h2>
            <p className="mt-2 text-sm font-bold text-slate-600 leading-relaxed">
              오늘 무료 분석 {dailyLimit}회를 다 사용했어요. 추가 분석에는 cal이 필요해요.
            </p>
            <div className="mt-3 text-xs font-bold text-slate-500">
              현재 잔액: 🌰 {calBalance} cal · 오늘 사용 {dailyUsageCount}/{dailyLimit}
            </div>

            <div className="mt-5 space-y-2">
              <button
                type="button"
                onClick={onWatchAd}
                disabled={!adAvailable}
                className="w-full py-3 rounded-2xl bg-slate-900 text-white text-sm font-black active:scale-[0.98] transition-transform disabled:opacity-40 disabled:cursor-not-allowed"
              >
                📺 광고 보고 +🌰 1 cal 받기
              </button>
              {!adAvailable && (
                <p className="text-[11px] font-bold text-slate-400 text-center">광고 준비 중</p>
              )}
              <button
                type="button"
                onClick={onCharge}
                className="w-full py-3 rounded-2xl bg-orange-500 text-white text-sm font-black shadow-[0_6px_14px_rgba(249,115,22,0.28)] active:scale-[0.98] transition-transform"
              >
                💳 충전하기
              </button>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="mt-3 w-full py-2 text-xs font-black text-slate-400 active:text-slate-600"
            >
              나중에
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
