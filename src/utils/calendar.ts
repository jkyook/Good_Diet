import type { MealRecord } from '../types';

export type DayStatus = 'empty' | 'under' | 'ok' | 'over' | 'way-over';

export interface DayData {
  date: Date;
  dateStr: string;
  meals: MealRecord[];
  totalCalories: number;
  status: DayStatus;
  isToday: boolean;
  isCurrentMonth: boolean;
}

export function buildCalendarGrid(
  year: number,
  month: number,
  history: MealRecord[],
  dailyTarget: number,
): DayData[][] {
  const mealMap = new Map<string, MealRecord[]>();
  history.forEach(m => {
    const key = new Date(m.date).toISOString().split('T')[0];
    if (!mealMap.has(key)) mealMap.set(key, []);
    mealMap.get(key)!.push(m);
  });

  const firstDayOfWeek = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayStr = new Date().toISOString().split('T')[0];

  const cells: DayData[] = [];

  for (let i = 0; i < firstDayOfWeek; i++) {
    const d = new Date(year, month, i - firstDayOfWeek + 1);
    cells.push(makeDay(d, false, mealMap, dailyTarget, todayStr));
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(makeDay(new Date(year, month, d), true, mealMap, dailyTarget, todayStr));
  }
  let extra = 1;
  while (cells.length < 42) {
    cells.push(makeDay(new Date(year, month + 1, extra++), false, mealMap, dailyTarget, todayStr));
  }

  return Array.from({ length: 6 }, (_, i) => cells.slice(i * 7, i * 7 + 7));
}

function makeDay(
  date: Date,
  isCurrentMonth: boolean,
  mealMap: Map<string, MealRecord[]>,
  dailyTarget: number,
  todayStr: string,
): DayData {
  const dateStr = date.toISOString().split('T')[0];
  const meals = mealMap.get(dateStr) ?? [];
  const totalCalories = meals.reduce((s, m) => s + (m.calories || 0), 0);
  const ratio = totalCalories / (dailyTarget || 1);

  let status: DayStatus = 'empty';
  if (meals.length > 0) {
    if (ratio <= 0.7)       status = 'under';
    else if (ratio <= 1.05) status = 'ok';
    else if (ratio <= 1.2)  status = 'over';
    else                    status = 'way-over';
  }

  return { date, dateStr, meals, totalCalories, status, isToday: dateStr === todayStr, isCurrentMonth };
}
