import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowLeft } from 'lucide-react';
import type { MealRecord } from '../../types';
import AnalysisResultCard from '../AnalysisResultCard';

interface MealPreviewModalProps {
  open: boolean;
  meal: MealRecord | null;
  dailyCalorieTarget: number;
  dailyCalorieConsumed: number;
  onClose: () => void;
}

export default function MealPreviewModal({
  open, meal, dailyCalorieTarget, dailyCalorieConsumed, onClose,
}: MealPreviewModalProps) {
  // ESC 닫기
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && meal && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[150] bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-label="식사 상세"
          onClick={onClose}
        >
          <motion.div
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="bg-[#f7f3ed] w-full sm:max-w-md sm:mx-4 rounded-t-3xl sm:rounded-3xl max-h-[92vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 헤더 */}
            <div className="sticky top-0 z-10 bg-[#f7f3ed]/95 backdrop-blur flex items-center justify-between px-4 py-3 border-b border-orange-100">
              <button
                type="button"
                onClick={onClose}
                aria-label="뒤로가기"
                className="min-h-11 min-w-11 flex items-center gap-1 text-sm font-black text-slate-700 active:scale-95 transition-transform"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>뒤로</span>
              </button>
              <p className="text-xs font-black text-slate-500">식사 상세</p>
              <div className="min-w-11" aria-hidden="true" />
            </div>

            {/* 본문 — AnalysisResultCard 그대로 재사용 (재료별 분석 포함 모든 섹션) */}
            <div className="p-4">
              <AnalysisResultCard
                meal={meal}
                dailyCalorieTarget={dailyCalorieTarget}
                dailyCalorieConsumed={dailyCalorieConsumed}
                onBack={onClose}
              />
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
