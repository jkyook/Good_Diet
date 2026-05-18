import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { MapPin, Users, Wine, StickyNote, Store } from 'lucide-react';
import type { MealRecord, MealMemo } from '../../types';

interface Props {
  open: boolean;
  meal: MealRecord | null;
  onSave: (id: string, memo: MealMemo) => void;
  onClose: () => void;
}

export default function MealMemoModal({ open, meal, onSave, onClose }: Props) {
  const [withWho, setWithWho]     = useState('');
  const [place, setPlace]         = useState('');
  const [alcohol, setAlcohol]     = useState('');
  const [note, setNote]           = useState('');

  useEffect(() => {
    if (!open || !meal) return;
    setWithWho(meal.memo?.with    ?? '');
    setPlace(meal.memo?.place     ?? '');
    setAlcohol(meal.memo?.alcohol ?? '');
    setNote(meal.memo?.note       ?? '');
  }, [open, meal]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!meal) return null;

  const handleSave = () => {
    const memo: MealMemo = {};
    if (withWho.trim())  memo.with    = withWho.trim();
    if (place.trim())    memo.place   = place.trim();
    if (alcohol.trim())  memo.alcohol = alcohol.trim();
    if (note.trim())     memo.note    = note.trim();
    onSave(meal.id, memo);
    onClose();
  };

  const hasMemo = !!(withWho || place || alcohol || note);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[160] flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="memoModalTitle"
          onClick={onClose}
        >
          <motion.div
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            className="bg-white w-full sm:max-w-md sm:mx-4 rounded-t-3xl sm:rounded-3xl flex flex-col max-h-[88vh]"
            style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* 헤더 */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
              <div>
                <h2 id="memoModalTitle" className="text-base font-black text-slate-900">식사 메모</h2>
                <p className="text-[11px] font-bold text-slate-400 mt-0.5 truncate max-w-[220px]">{meal.foodName}</p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="min-h-11 min-w-11 text-xs font-black text-slate-400 px-2 py-1 rounded-full bg-slate-50"
              >
                닫기
              </button>
            </div>

            {/* 본문 */}
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">

              {/* 위치 (read-only, 분석 시 자동 수집) */}
              {meal.locationDong && (
                <div className="flex items-center gap-2 bg-slate-50 rounded-xl px-3 py-2.5">
                  <MapPin className="w-4 h-4 text-slate-400 shrink-0" />
                  <div>
                    <p className="text-[10px] font-black text-slate-400">분석 시 위치</p>
                    <p className="text-sm font-bold text-slate-700">{meal.locationDong}</p>
                  </div>
                </div>
              )}

              {/* 누구랑 */}
              <div>
                <label className="flex items-center gap-1.5 text-xs font-black text-slate-500 mb-1.5">
                  <Users className="w-3.5 h-3.5" /> 누구랑
                </label>
                <input
                  type="text"
                  value={withWho}
                  onChange={(e) => setWithWho(e.target.value)}
                  placeholder="혼자 / 가족 / 친구 이름 / 동료…"
                  maxLength={50}
                  className="w-full border-2 border-slate-200 focus:border-orange-500 rounded-xl px-3 py-2.5 text-sm font-bold focus:outline-none"
                />
              </div>

              {/* 어디서 */}
              <div>
                <label className="flex items-center gap-1.5 text-xs font-black text-slate-500 mb-1.5">
                  <Store className="w-3.5 h-3.5" /> 어디서
                </label>
                <input
                  type="text"
                  value={place}
                  onChange={(e) => setPlace(e.target.value)}
                  placeholder="집 / 식당 이름 / 회사…"
                  maxLength={80}
                  className="w-full border-2 border-slate-200 focus:border-orange-500 rounded-xl px-3 py-2.5 text-sm font-bold focus:outline-none"
                />
              </div>

              {/* 주류 */}
              <div>
                <label className="flex items-center gap-1.5 text-xs font-black text-slate-500 mb-1.5">
                  <Wine className="w-3.5 h-3.5" /> 주류
                </label>
                <input
                  type="text"
                  value={alcohol}
                  onChange={(e) => setAlcohol(e.target.value)}
                  placeholder="맥주 1캔 / 소주 반 병 / 와인 1잔 / 없음…"
                  maxLength={80}
                  className="w-full border-2 border-slate-200 focus:border-orange-500 rounded-xl px-3 py-2.5 text-sm font-bold focus:outline-none"
                />
              </div>

              {/* 메모 */}
              <div>
                <label className="flex items-center gap-1.5 text-xs font-black text-slate-500 mb-1.5">
                  <StickyNote className="w-3.5 h-3.5" /> 메모
                </label>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="이 식사에 대한 기억, 감상, 특이사항…"
                  maxLength={300}
                  rows={3}
                  className="w-full border-2 border-slate-200 focus:border-orange-500 rounded-xl px-3 py-2.5 text-sm font-bold focus:outline-none resize-none"
                />
                <p className="text-right text-[10px] text-slate-300 font-bold mt-0.5">{note.length}/300</p>
              </div>

            </div>

            {/* 하단 버튼 */}
            <div className="px-6 py-3 border-t border-slate-100 space-y-2 shrink-0 bg-white">
              <button
                type="button"
                onClick={handleSave}
                className="w-full py-3 rounded-2xl bg-orange-500 text-white text-sm font-black shadow-[0_6px_14px_rgba(249,115,22,0.28)] active:scale-[0.98] transition-transform"
              >
                {hasMemo ? '저장' : '빈 메모로 저장'}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
