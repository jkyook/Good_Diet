import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import type { MealRecord } from '../types';
import { buildCalendarGrid, type DayData } from '../utils/calendar';

interface Props {
  history: MealRecord[];
  dailyTarget: number;
  onMealClick: (meal: MealRecord) => void;
}

const WEEK_DAYS = ['일', '월', '화', '수', '목', '금', '토'];

const STATUS_BG: Record<string, string> = {
  empty:     '',
  under:     'bg-blue-100',
  ok:        'bg-emerald-100',
  over:      'bg-orange-100',
  'way-over':'bg-rose-100',
};
const STATUS_DOT: Record<string, string> = {
  under:     'bg-blue-400',
  ok:        'bg-emerald-500',
  over:      'bg-orange-400',
  'way-over':'bg-rose-500',
};

const MEAL_TYPE_EMOJI: Record<string, string> = {
  breakfast: '🌅',
  lunch:     '☀️',
  dinner:    '🌙',
  snack:     '🍎',
};

function DaySheet({
  day,
  dailyTarget,
  onClose,
  onMealClick,
}: {
  day: DayData;
  dailyTarget: number;
  onClose: () => void;
  onMealClick: (m: MealRecord) => void;
}) {
  const pct = Math.min(100, Math.round((day.totalCalories / dailyTarget) * 100));
  const dateLabel = day.date.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' });

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[120] flex items-end justify-center bg-black/50"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        onClick={e => e.stopPropagation()}
        className="bg-white border-t-[3px] border-x-[3px] border-slate-900 w-full max-w-lg max-h-[80vh] overflow-y-auto"
      >
        {/* 핸들 */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 bg-slate-300 rounded-full" />
        </div>

        {/* 날짜 헤더 */}
        <div className="px-5 py-3 flex justify-between items-start border-b-[2px] border-slate-200">
          <div>
            <p className="font-black text-slate-900">{dateLabel}</p>
            <p className="text-[10px] font-bold text-slate-400 mt-0.5">
              {day.meals.length}끼 · {day.totalCalories.toLocaleString()} kcal
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 칼로리 프로그레스 */}
        <div className="px-5 py-3 border-b-[2px] border-slate-100">
          <div className="flex justify-between mb-1">
            <span className="text-[10px] font-black uppercase text-slate-400">일일 목표 달성도</span>
            <span className={`text-[10px] font-black ${pct > 105 ? 'text-rose-500' : 'text-emerald-600'}`}>{pct}%</span>
          </div>
          <div className="h-2.5 bg-slate-100 border-[2px] border-slate-300 overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${Math.min(100, pct)}%` }}
              transition={{ duration: 0.6 }}
              className={`h-full ${pct > 105 ? 'bg-rose-500' : 'bg-emerald-500'}`}
            />
          </div>
        </div>

        {/* 식사 목록 */}
        {day.meals.length === 0 ? (
          <div className="text-center py-12 text-slate-400">
            <p className="font-black text-sm">기록된 식사가 없습니다</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {day.meals
              .slice()
              .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
              .map(meal => (
                <button
                  key={meal.id}
                  onClick={() => { onMealClick(meal); onClose(); }}
                  className="w-full flex items-center gap-3 px-5 py-3.5 hover:bg-slate-50 active:bg-slate-100 transition-colors text-left"
                >
                  <img src={meal.image} className="w-12 h-12 object-cover shrink-0 border-2 border-slate-200" alt="" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-black truncate flex items-center gap-1">
                      <span>{MEAL_TYPE_EMOJI[meal.mealType] ?? '🍽️'} {meal.foodName}</span>
                      {meal.matchedFoodId && (
                        <span className="text-[10px] bg-emerald-50 text-emerald-700 px-1 rounded-full font-black shrink-0" title="DB 매칭됨" aria-label="DB 매칭됨">📚</span>
                      )}
                    </p>
                    <p className="text-[10px] text-slate-400 font-bold mt-0.5">
                      {new Date(meal.date).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
                      {' · '}{meal.calories} kcal
                      {meal.protein > 0 ? ` · 단백질 ${meal.protein}g` : ''}
                    </p>
                  </div>
                  <span className="text-slate-300 shrink-0">›</span>
                </button>
              ))}
          </div>
        )}
        <div className="h-safe-area-bottom pb-4" />
      </motion.div>
    </motion.div>
  );
}

export default function CalendarView({ history, dailyTarget, onMealClick }: Props) {
  const today = new Date();
  const [year, setYear]   = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [selectedDay, setSelectedDay] = useState<DayData | null>(null);

  const grid = useMemo(
    () => buildCalendarGrid(year, month, history, dailyTarget),
    [year, month, history, dailyTarget],
  );

  const prevMonth = () => {
    if (month === 0) { setYear(y => y - 1); setMonth(11); }
    else setMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (month === 11) { setYear(y => y + 1); setMonth(0); }
    else setMonth(m => m + 1);
  };

  return (
    <>
      <div className="p-4">
        {/* 월 네비게이션 */}
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={prevMonth}
            className="w-9 h-9 flex items-center justify-center border-[2px] border-slate-900 bg-white shadow-[2px_2px_0_0_rgba(15,23,42,1)] active:shadow-none active:translate-x-0.5 active:translate-y-0.5 transition-all"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <p className="font-black text-slate-900">{year}년 {month + 1}월</p>
          <button
            onClick={nextMonth}
            className="w-9 h-9 flex items-center justify-center border-[2px] border-slate-900 bg-white shadow-[2px_2px_0_0_rgba(15,23,42,1)] active:shadow-none active:translate-x-0.5 active:translate-y-0.5 transition-all"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* 요일 헤더 */}
        <div className="grid grid-cols-7 mb-1">
          {WEEK_DAYS.map((d, i) => (
            <div key={d} className={`text-center text-[10px] font-black py-1 ${i === 0 ? 'text-rose-500' : i === 6 ? 'text-blue-500' : 'text-slate-400'}`}>
              {d}
            </div>
          ))}
        </div>

        {/* 달력 그리드 */}
        <div className="border-[3px] border-slate-900 shadow-[6px_6px_0_0_rgba(15,23,42,1)] overflow-hidden bg-white">
          {grid.map((week, wi) => (
            <div key={wi} className={`grid grid-cols-7 ${wi < grid.length - 1 ? 'border-b-[2px] border-slate-200' : ''}`}>
              {week.map((day, di) => {
                const isWeekend = di === 0 || di === 6;
                return (
                  <button
                    key={day.dateStr}
                    onClick={() => day.meals.length > 0 && setSelectedDay(day)}
                    disabled={!day.isCurrentMonth}
                    className={[
                      'relative aspect-square flex flex-col items-center justify-start pt-1 pb-0.5 transition-colors',
                      di < 6 ? 'border-r-[1px] border-slate-100' : '',
                      !day.isCurrentMonth ? 'opacity-25 cursor-default' : '',
                      day.meals.length > 0 ? 'cursor-pointer active:opacity-70' : 'cursor-default',
                      STATUS_BG[day.status] || '',
                      day.isToday ? 'ring-2 ring-inset ring-orange-500' : '',
                    ].join(' ')}
                  >
                    <span className={[
                      'text-[11px] font-black leading-none',
                      day.isToday ? 'text-orange-500' : isWeekend ? (di === 0 ? 'text-rose-500' : 'text-blue-500') : 'text-slate-700',
                      !day.isCurrentMonth ? 'text-slate-400' : '',
                    ].join(' ')}>
                      {day.date.getDate()}
                    </span>
                    {/* 식사 도트 */}
                    {day.meals.length > 0 && (
                      <div className="flex gap-0.5 mt-0.5 flex-wrap justify-center px-0.5">
                        {Array.from({ length: Math.min(day.meals.length, 4) }).map((_, i) => (
                          <div
                            key={i}
                            className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[day.status] || 'bg-slate-400'}`}
                          />
                        ))}
                      </div>
                    )}
                    {day.meals.length > 0 && (
                      <span className="text-[8px] font-bold text-slate-400 leading-none mt-auto">
                        {day.totalCalories >= 1000
                          ? `${(day.totalCalories / 1000).toFixed(1)}k`
                          : day.totalCalories}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        {/* 범례 */}
        <div className="flex gap-3 flex-wrap mt-3">
          {[
            ['bg-emerald-400', '목표 달성'],
            ['bg-orange-400', '목표 초과'],
            ['bg-blue-400', '섭취 부족'],
            ['bg-rose-500', '과다 섭취'],
          ].map(([bg, label]) => (
            <div key={label} className="flex items-center gap-1">
              <div className={`w-2.5 h-2.5 rounded-full ${bg}`} />
              <span className="text-[9px] font-black uppercase text-slate-400">{label}</span>
            </div>
          ))}
        </div>
      </div>

      <AnimatePresence>
        {selectedDay && (
          <DaySheet
            day={selectedDay}
            dailyTarget={dailyTarget}
            onClose={() => setSelectedDay(null)}
            onMealClick={onMealClick}
          />
        )}
      </AnimatePresence>
    </>
  );
}
