import React from 'react';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon } from 'lucide-react';

interface DateNavBarProps {
  selectedDateKey: string;
  onChange: (key: string) => void;
  todayKey: string;
  mealCountByDate: Record<string, number>;
  onCalendarTap?: () => void;
}

const WEEKDAY_KO = ['일', '월', '화', '수', '목', '금', '토'];

function pad(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

function toLocalKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function shiftKey(baseKey: string, offsetDays: number): string {
  const d = new Date(`${baseKey}T12:00:00`);
  d.setDate(d.getDate() + offsetDays);
  return toLocalKey(d);
}

function relLabel(dateKey: string, todayKey: string): string {
  if (dateKey === todayKey) return '오늘';
  if (dateKey === shiftKey(todayKey, -1)) return '어제';
  if (dateKey === shiftKey(todayKey, -2)) return '그제';
  if (dateKey === shiftKey(todayKey, 1)) return '내일';
  return new Date(`${dateKey}T12:00:00`).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' });
}

function fullLabel(dateKey: string): string {
  const d = new Date(`${dateKey}T12:00:00`);
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 ${WEEKDAY_KO[d.getDay()]}요일`;
}

function shortLabel(dateKey: string): string {
  const d = new Date(`${dateKey}T12:00:00`);
  return `${d.getMonth() + 1}월 ${d.getDate()}일 (${WEEKDAY_KO[d.getDay()]})`;
}

export default function DateNavBar({
  selectedDateKey,
  onChange,
  todayKey,
  mealCountByDate,
  onCalendarTap,
}: DateNavBarProps) {
  const prevKey = shiftKey(selectedDateKey, -1);
  const nextKey = shiftKey(selectedDateKey, 1);
  const isFutureBlocked = selectedDateKey === todayKey || selectedDateKey > todayKey;
  const isToday = selectedDateKey === todayKey;
  const mealCount = mealCountByDate[selectedDateKey] ?? 0;

  const centerMain = `${selectedDateKey} (${WEEKDAY_KO[new Date(`${selectedDateKey}T12:00:00`).getDay()]})`;
  const centerSub = `${relLabel(selectedDateKey, todayKey)} · ${mealCount}끼`;
  const centerAria = `${fullLabel(selectedDateKey)}, ${relLabel(selectedDateKey, todayKey)} 식단 ${mealCount}끼. 탭하여 캘린더 열기`;

  return (
    <div
      className="bg-white border-b border-orange-100 px-4 py-3 flex items-center gap-2"
      role="region"
      aria-label="날짜 선택"
    >
      <button
        type="button"
        onClick={() => onChange(prevKey)}
        className="min-w-11 min-h-11 rounded-full bg-white border border-orange-100 flex items-center justify-center text-slate-600 active:scale-95 transition-transform"
        aria-label={`이전 날짜로 이동, ${shortLabel(prevKey)}`}
      >
        <ChevronLeft className="w-6 h-6" />
      </button>

      <button
        type="button"
        onClick={onCalendarTap}
        className="flex-1 text-center px-2 py-1 rounded-xl active:bg-orange-50 transition-colors"
        aria-label={centerAria}
      >
        <p className="text-base font-black text-slate-900 flex items-center justify-center gap-1.5">
          <span>{centerMain}</span>
          <CalendarIcon className="w-4 h-4 text-slate-400" aria-hidden="true" />
        </p>
        <p className="text-xs font-bold text-slate-400 mt-0.5">{centerSub}</p>
      </button>

      {!isToday && (
        <button
          type="button"
          onClick={() => onChange(todayKey)}
          className="text-xs font-black text-orange-500 px-2 py-1 rounded-full bg-orange-50 active:scale-95 transition-transform"
          aria-label="오늘로 돌아가기"
        >
          오늘
        </button>
      )}

      <button
        type="button"
        onClick={() => !isFutureBlocked && onChange(nextKey)}
        disabled={isFutureBlocked}
        aria-disabled={isFutureBlocked}
        className="min-w-11 min-h-11 rounded-full bg-white border border-orange-100 flex items-center justify-center text-slate-600 disabled:opacity-30 disabled:cursor-not-allowed active:scale-95 transition-transform"
        aria-label={isFutureBlocked ? '다음 날짜 없음, 오늘이 마지막' : `다음 날짜로 이동, ${shortLabel(nextKey)}`}
      >
        <ChevronRight className="w-6 h-6" />
      </button>
    </div>
  );
}
