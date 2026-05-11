import React, { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import type { MealRecord, MealType } from '../../types';

const MEAL_TYPE_OPTIONS: { value: MealType; emoji: string; label: string }[] = [
  { value: 'breakfast', emoji: '🍳', label: '아침' },
  { value: 'lunch',     emoji: '🥗', label: '점심' },
  { value: 'dinner',    emoji: '🍝', label: '저녁' },
  { value: 'snack',     emoji: '🍪', label: '간식' },
  { value: 'dessert',   emoji: '🍰', label: '후식' },
];

function pad(n: number): string { return n < 10 ? `0${n}` : `${n}`; }
function toDateInputValue(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function fromDateInputValue(value: string, originalIso: string): string {
  // 기존 시각(시/분/초)을 유지하면서 날짜만 교체.
  const orig = new Date(originalIso);
  const [y, m, d] = value.split('-').map(Number);
  if (!y || !m || !d) return originalIso;
  const next = new Date(orig);
  next.setFullYear(y, m - 1, d);
  return next.toISOString();
}
function relDateLabel(iso: string, todayKey: string): string {
  const dateKey = toDateInputValue(iso);
  if (!dateKey) return '';
  if (dateKey === todayKey) return '오늘';
  const yKey = (() => {
    const t = new Date(`${todayKey}T12:00:00`); t.setDate(t.getDate() - 1);
    return toDateInputValue(t.toISOString());
  })();
  if (dateKey === yKey) return '어제';
  return new Date(`${dateKey}T12:00:00`).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' });
}
function mealTypeLabel(mt: MealType): string {
  return MEAL_TYPE_OPTIONS.find(o => o.value === mt)?.label ?? mt;
}

interface MealEditModalProps {
  open: boolean;
  meal: MealRecord | null;
  todayKey: string;
  onSave: (patch: { mealType?: MealType; date?: string }) => void | Promise<void>;
  onClose: () => void;
}

export default function MealEditModal({ open, meal, todayKey, onSave, onClose }: MealEditModalProps) {
  const [mealType, setMealType] = useState<MealType>(meal?.mealType ?? 'lunch');
  const [dateInput, setDateInput] = useState<string>(toDateInputValue(meal?.date ?? new Date().toISOString()));
  const [submitting, setSubmitting] = useState(false);

  // 모달 열릴 때 초기값 동기화 (meal 바뀌면 리셋)
  React.useEffect(() => {
    if (open && meal) {
      setMealType(meal.mealType);
      setDateInput(toDateInputValue(meal.date));
    }
  }, [open, meal]);

  const changed = useMemo(() => {
    if (!meal) return false;
    if (mealType !== meal.mealType) return true;
    if (dateInput !== toDateInputValue(meal.date)) return true;
    return false;
  }, [meal, mealType, dateInput]);

  const diffText = useMemo(() => {
    if (!meal || !changed) return '변경 없음';
    const fromDate = relDateLabel(meal.date, todayKey);
    const toDate   = relDateLabel(fromDateInputValue(dateInput, meal.date), todayKey);
    const fromMt   = mealTypeLabel(meal.mealType);
    const toMt     = mealTypeLabel(mealType);
    return `${fromDate} ${fromMt} → ${toDate} ${toMt}`;
  }, [meal, changed, dateInput, mealType, todayKey]);

  const handleSave = async () => {
    if (!meal || submitting || !changed) return;
    setSubmitting(true);
    const patch: { mealType?: MealType; date?: string } = {};
    if (mealType !== meal.mealType) patch.mealType = mealType;
    const nextIso = fromDateInputValue(dateInput, meal.date);
    if (nextIso !== meal.date) patch.date = nextIso;
    try {
      await onSave(patch);
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    if (changed) {
      // eslint-disable-next-line no-alert
      if (!window.confirm('변경사항이 사라져요. 정말 닫을까요?')) return;
    }
    onClose();
  };

  return (
    <AnimatePresence>
      {open && meal && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[150] flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="mealEditTitle"
          onClick={handleClose}
        >
          <motion.div
            initial={{ scale: 0.95, y: 12 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.95, y: 12 }}
            className="bg-white rounded-3xl p-6 w-full max-w-sm space-y-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 id="mealEditTitle" className="text-base font-black text-slate-900">식사 편집</h2>
              <button
                type="button"
                onClick={handleClose}
                aria-label="닫기"
                className="text-xs font-black text-slate-400"
              >
                닫기
              </button>
            </div>

            {/* 컨텍스트 — 편집 불가 */}
            <div className="bg-slate-50 rounded-2xl px-3 py-2">
              <p className="text-sm font-black text-slate-800 truncate">{meal.foodName}</p>
              <p className="text-[11px] font-bold text-slate-500 mt-0.5">
                현재: {relDateLabel(meal.date, todayKey)} {mealTypeLabel(meal.mealType)} · {meal.calories.toLocaleString()} kcal
              </p>
            </div>

            {/* 식사 종류 */}
            <div>
              <p className="text-xs font-black text-slate-500 mb-2">식사 종류</p>
              <div role="radiogroup" aria-label="식사 종류" className="grid grid-cols-5 gap-1.5">
                {MEAL_TYPE_OPTIONS.map(opt => {
                  const active = opt.value === mealType;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => setMealType(opt.value)}
                      className={`py-2.5 rounded-xl border-2 text-[11px] font-black transition-colors ${active ? 'border-orange-500 bg-orange-500 text-white' : 'border-slate-200 bg-white text-slate-600'}`}
                    >
                      <span className="block text-base leading-none" aria-hidden="true">{opt.emoji}</span>
                      <span className="block mt-0.5">{opt.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 날짜 */}
            <div>
              <p className="text-xs font-black text-slate-500 mb-2">날짜</p>
              <input
                type="date"
                value={dateInput}
                max={todayKey}
                onChange={(e) => setDateInput(e.target.value)}
                className="w-full border-2 border-slate-200 rounded-xl px-3 py-2.5 text-sm font-bold focus:border-orange-500 focus:outline-none"
              />
            </div>

            {/* 변경 미리보기 */}
            <div className="border-t border-slate-100 pt-3">
              <p className="text-xs font-black text-slate-500 mb-1">📝 변경 사항</p>
              <p
                className={`text-xs font-bold ${changed ? 'text-orange-600' : 'text-slate-400'}`}
                aria-live="polite"
              >
                {diffText}
              </p>
            </div>

            {/* 액션 */}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={handleClose}
                className="py-3 rounded-2xl bg-white border-2 border-slate-200 text-slate-600 text-sm font-black active:scale-[0.98]"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={!changed || submitting}
                className="py-3 rounded-2xl bg-orange-500 text-white text-sm font-black shadow-[0_6px_14px_rgba(249,115,22,0.28)] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? '저장 중…' : '저장'}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
