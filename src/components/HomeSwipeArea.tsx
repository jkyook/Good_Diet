import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';

interface HomeSwipeAreaProps {
  onShiftDate: (offsetDays: -1 | 1) => void;
  canShiftNext: boolean;
  onBlockedNext?: () => void;
  children: React.ReactNode;
}

const SWIPE_HINT_KEY = 'swipeHintDismissed';

export default function HomeSwipeArea({
  onShiftDate,
  canShiftNext,
  onBlockedNext,
  children,
}: HomeSwipeAreaProps) {
  const [showHint, setShowHint] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const dismissed = window.localStorage.getItem(SWIPE_HINT_KEY) === '1';
    if (dismissed) return;
    const timer = window.setTimeout(() => setShowHint(true), 1500);
    return () => window.clearTimeout(timer);
  }, []);

  const dismissHint = () => {
    setShowHint(false);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(SWIPE_HINT_KEY, '1');
    }
  };

  return (
    <motion.div
      role="region"
      aria-label="식단 콘텐츠, 좌우 스와이프로 날짜 변경 가능"
      drag="x"
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={0.2}
      onDragEnd={(_, info) => {
        const exceedsDistance = Math.abs(info.offset.x) > 80;
        const exceedsVelocity = Math.abs(info.velocity.x) > 300;
        if (!exceedsDistance && !exceedsVelocity) return;
        const direction: -1 | 1 = info.offset.x > 0 ? -1 : 1;
        if (direction === 1 && !canShiftNext) {
          onBlockedNext?.();
          return;
        }
        onShiftDate(direction);
      }}
    >
      {children}
      <AnimatePresence>
        {showHint && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            transition={{ duration: 0.2 }}
            className="fixed bottom-[160px] left-1/2 -translate-x-1/2 z-40 px-4 py-2.5 rounded-full bg-slate-900/90 text-white text-xs font-bold shadow-lg flex items-center gap-2"
            role="status"
          >
            <span>← → 스와이프로 날짜 이동</span>
            <button
              type="button"
              onClick={dismissHint}
              className="text-slate-300 hover:text-white text-[11px] font-black"
              aria-label="안내 닫기"
            >
              ×
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
