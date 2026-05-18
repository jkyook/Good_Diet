// 간식 추천 — 정적 룰. 칼로리 여유 + 영양 부족 시만 추천 (서연 [T-055a] §2.3).
// 과일/채소(fiber/vitamin 태그)는 현재 출하 성수기 품목을 우선 추천.
import { SNACK_DATA, type SnackItem } from '../data/snackData';
import type { MealRecord } from '../types';

export interface SnackRec {
  id: string;
  name: string;
  emoji: string;
  serving: string;
  kcal: number;
  mainNutrient: string;
  /** 제철 여부 */
  isSeasonal?: boolean;
}

// 한국인 RDA (성인 평균, 서연 §3)
const RDA = {
  protein: 50,  // g/일
  fiber: 25,    // g/일
  calcium: 700, // mg/일
};

export function recommendSnack(opts: {
  todayKcalConsumed: number;
  dailyKcalTarget: number;
  todayMeals: MealRecord[];
}): { snacks: SnackRec[]; missing: string[] } {
  const remaining = opts.dailyKcalTarget - opts.todayKcalConsumed;
  if (remaining <= 0) return { snacks: [], missing: [] };

  const currentMonth = new Date().getMonth() + 1; // 1–12

  /** 현재 달이 seasonalMonths에 포함되어 있는지 여부 */
  function isInSeason(item: SnackItem): boolean {
    if (!item.seasonalMonths) return true; // 연중 품목
    return item.seasonalMonths.includes(currentMonth);
  }

  const totalProtein = opts.todayMeals.reduce((s, m) => s + (m.protein ?? 0), 0);
  const missing: string[] = [];
  if (totalProtein < RDA.protein) missing.push('단백질');

  const used = new Set<string>();
  const picked: Array<SnackItem & { seasonal: boolean }> = [];
  const capKcal = Math.floor(remaining * 0.8);
  let budget = capKcal;

  function pickBy(tags: string[]): boolean {
    // 1순위: 제철 + 태그 일치
    for (const tag of tags) {
      const cand = SNACK_DATA.find(
        s => !used.has(s.id) && s.tags.includes(tag as never) && s.kcal <= budget && isInSeason(s),
      );
      if (cand) {
        picked.push({ ...cand, seasonal: !!cand.seasonalMonths });
        used.add(cand.id);
        budget -= cand.kcal;
        return true;
      }
    }
    // 2순위: 태그만 일치 (비제철 포함)
    for (const tag of tags) {
      const cand = SNACK_DATA.find(
        s => !used.has(s.id) && s.tags.includes(tag as never) && s.kcal <= budget,
      );
      if (cand) {
        picked.push({ ...cand, seasonal: false });
        used.add(cand.id);
        budget -= cand.kcal;
        return true;
      }
    }
    return false;
  }

  // 1) 단백질 부족 우선
  if (missing.includes('단백질')) pickBy(['protein']);

  // 2) 제철 과일/채소 우선
  if (budget >= 50) pickBy(['fiber', 'vitamin']);
  if (budget >= 30) pickBy(['very_low_kcal']);

  const reasonByTag = (s: SnackItem): string => {
    if (s.tags.includes('protein'))       return '단백질 보충';
    if (s.tags.includes('fiber'))         return '식이섬유 보충';
    if (s.tags.includes('calcium'))       return '칼슘 보충';
    if (s.tags.includes('vitamin'))       return '비타민';
    if (s.tags.includes('very_low_kcal')) return '저칼로리 간식';
    return '추천 간식';
  };

  const snacks: SnackRec[] = picked.slice(0, 3).map(s => ({
    id: s.id,
    name: s.name,
    emoji: s.emoji,
    serving: s.serving,
    kcal: s.kcal,
    mainNutrient: reasonByTag(s),
    isSeasonal: s.seasonal,
  }));

  return { snacks, missing };
}
