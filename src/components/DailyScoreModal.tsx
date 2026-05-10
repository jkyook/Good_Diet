import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X } from 'lucide-react';
import type { DailyScore } from '../types';

interface Props {
  score: DailyScore;
  onClose: () => void;
}

const GRADE_COLOR: Record<DailyScore['grade'], string> = {
  'A+': 'text-emerald-500',
  'A':  'text-emerald-400',
  'B':  'text-sky-500',
  'C':  'text-amber-500',
  'D':  'text-orange-500',
  'F':  'text-rose-500',
};

const SCORE_ITEMS: { key: keyof DailyScore; label: string; color: string }[] = [
  { key: 'calorieScore',  label: '칼로리',  color: 'bg-orange-400' },
  { key: 'macroScore',    label: '매크로균형', color: 'bg-sky-400' },
  { key: 'timingScore',   label: '식사타이밍', color: 'bg-emerald-400' },
  { key: 'varietyScore',  label: '다양성',   color: 'bg-purple-400' },
];

export default function DailyScoreModal({ score, onClose }: Props) {
  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[150] flex items-center justify-center bg-black/60 p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.9, y: 24 }}
          animate={{ scale: 1, y: 0 }}
          exit={{ scale: 0.9, y: 24 }}
          onClick={e => e.stopPropagation()}
          className="bg-white border-[3px] border-slate-900 shadow-[10px_10px_0px_0px_rgba(15,23,42,1)] w-full max-w-sm"
        >
          {/* 헤더 */}
          <div className="bg-slate-900 text-white px-5 py-4 flex justify-between items-center">
            <div>
              <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">오늘의 식단 점수</p>
              <p className="text-xs font-bold text-slate-300 mt-0.5">{score.mealCount}끼 · {score.totalCalories.toLocaleString()} kcal</p>
            </div>
            <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-6 space-y-5">
            {/* 총점 */}
            <div className="flex items-center justify-center gap-6">
              <div className="relative w-24 h-24">
                <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
                  <circle cx="50" cy="50" r="42" fill="none" stroke="#e2e8f0" strokeWidth="10" />
                  <motion.circle
                    cx="50" cy="50" r="42" fill="none"
                    stroke="#f97316" strokeWidth="10"
                    strokeLinecap="round"
                    strokeDasharray={`${2 * Math.PI * 42}`}
                    initial={{ strokeDashoffset: 2 * Math.PI * 42 }}
                    animate={{ strokeDashoffset: 2 * Math.PI * 42 * (1 - score.totalScore / 100) }}
                    transition={{ duration: 1.2, ease: 'easeOut' }}
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-2xl font-black text-slate-900 leading-none">{score.totalScore}</span>
                  <span className="text-[9px] font-black text-slate-400 uppercase">점</span>
                </div>
              </div>
              <div>
                <p className={`text-5xl font-black ${GRADE_COLOR[score.grade]} leading-none`}>{score.grade}</p>
                <p className="text-[10px] font-black text-slate-400 uppercase mt-1">
                  {score.totalScore >= 85 ? '훌륭해요!' : score.totalScore >= 70 ? '양호합니다' : '개선 필요'}
                </p>
              </div>
            </div>

            {/* 항목별 점수 */}
            <div className="space-y-2.5">
              {SCORE_ITEMS.map(({ key, label, color }) => {
                const val = score[key] as number;
                return (
                  <div key={key}>
                    <div className="flex justify-between mb-1">
                      <span className="text-[10px] font-black uppercase text-slate-500">{label}</span>
                      <span className="text-[10px] font-black text-slate-700">{val}점</span>
                    </div>
                    <div className="h-2 bg-slate-100 border border-slate-200 overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${val}%` }}
                        transition={{ duration: 0.8, delay: 0.2 }}
                        className={`h-full ${color}`}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* 매크로 실제 vs 이상 */}
            <div className="bg-slate-50 border-[2px] border-slate-200 p-3">
              <p className="text-[9px] font-black uppercase text-slate-400 mb-2">매크로 구성</p>
              <div className="flex gap-3 text-center">
                {(['carbs', 'protein', 'fat'] as const).map(key => {
                  const labels = { carbs: '탄수화물', protein: '단백질', fat: '지방' };
                  const ideal  = { carbs: 50, protein: 25, fat: 25 };
                  const actual = score.actualMacro[key];
                  const diff   = actual - ideal[key];
                  return (
                    <div key={key} className="flex-1">
                      <p className="text-xs font-black">{actual}%</p>
                      <p className={`text-[8px] font-bold ${Math.abs(diff) <= 5 ? 'text-emerald-500' : 'text-rose-500'}`}>
                        {diff > 0 ? `+${diff}` : diff}
                      </p>
                      <p className="text-[8px] text-slate-400 font-bold">{labels[key]}</p>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* AI 총평 */}
            {score.aiComment && (
              <div className="bg-orange-50 border-[2px] border-orange-300 p-3">
                <p className="text-[9px] font-black uppercase text-orange-600 mb-1.5">AI 총평</p>
                <p className="text-xs font-bold text-slate-700 leading-relaxed">{score.aiComment}</p>
              </div>
            )}

            <button
              onClick={onClose}
              className="w-full py-3 bg-slate-900 text-white font-black uppercase text-xs border-[3px] border-slate-900 shadow-[4px_4px_0px_0px_rgba(15,23,42,1)] active:shadow-none active:translate-x-1 active:translate-y-1 transition-all"
            >
              닫기
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
