// 간식 추천 — 정적 룰. 칼로리 여유 + 영양 부족 시만 추천 (서연 [T-055a] §2.3).
import { SNACK_DATA, type SnackItem } from '../data/snackData';
import type { MealRecord } from '../types';

export interface SnackRec {
  id: string;
  name: string;
  emoji: string;
  serving: string;
  kcal: number;
  mainNutrient: string;
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

  const totalProtein = opts.todayMeals.reduce((s, m) => s + (m.protein ?? 0), 0);
  // fiber는 AnalysisResult 표준 필드 아님 — 향후 보강
  const missing: string[] = [];
  if (totalProtein < RDA.protein) missing.push('단백질');
  // 식이섬유 부족은 분석 데이터 부재로 본 1차 룰에서는 단백질만 검사

  const used = new Set<string>();
  const picked: SnackItem[] = [];
  const capKcal = Math.floor(remaining * 0.8);
  let budget = capKcal;

  function pickBy(tagPriority: string[], reason: string): void {
    for (const tag of tagPriority) {
      const cand = SNACK_DATA.find(s => !used.has(s.id) && s.tags.includes(tag as never) && s.kcal <= budget);
      if (cand) {
        picked.push(cand);
        used.add(cand.id);
        budget -= cand.kcal;
        return;
      }
    }
    void reason;
  }

  // 1) 단백질 부족 우선
  if (missing.includes('단백질')) pickBy(['protein'], '단백질');

  // 2) 남은 여유 안에서 칼로리 구간별
  if (budget >= 50) pickBy(['fiber', 'vitamin'], '식이섬유/비타민');
  if (budget >= 30) pickBy(['very_low_kcal'], '저칼로리');

  const reasonByTag = (s: SnackItem): string => {
    if (s.tags.includes('protein')) return '단백질 보충';
    if (s.tags.includes('fiber')) return '식이섬유 보충';
    if (s.tags.includes('calcium')) return '칼슘 보충';
    if (s.tags.includes('vitamin')) return '비타민';
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
  }));

  return { snacks, missing };
}
