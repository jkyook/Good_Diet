// 현재 시각 기반 식사 종류 자동 추론.
// 사용자 결정 구간 (2026-05-11):
//   04~10시 → breakfast
//   10~15시 → lunch
//   15~22시 → dinner
//   22~04시 → snack (야식)
import type { MealType } from '../services/geminiService';

export function inferMealTypeByTime(date: Date = new Date()): MealType {
  const h = date.getHours();
  if (h >= 4  && h < 10) return 'breakfast';
  if (h >= 10 && h < 15) return 'lunch';
  if (h >= 15 && h < 22) return 'dinner';
  return 'snack'; // 22~04시
}
