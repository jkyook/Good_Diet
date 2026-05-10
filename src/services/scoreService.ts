import type { MealRecord, DailyScore } from '../types';

const IDEAL_MACRO = { carbs: 50, protein: 25, fat: 25 };
const WEIGHTS = { calorie: 0.4, macro: 0.3, timing: 0.15, variety: 0.15 };

function calcCalorieScore(ratio: number): number {
  if (ratio >= 0.85 && ratio <= 1.05) return 100;
  if (ratio < 0.85) return Math.max(0, Math.round(100 - (0.85 - ratio) * 300));
  return Math.max(0, Math.round(100 - (ratio - 1.05) * 250));
}

function calcMacroRatio(meals: MealRecord[]) {
  const t = { carbs: 0, protein: 0, fat: 0 };
  meals.forEach(m => {
    t.carbs   += m.carbs   || 0;
    t.protein += m.protein || 0;
    t.fat     += m.fat     || 0;
  });
  const sum = t.carbs + t.protein + t.fat || 1;
  return {
    carbs:   Math.round((t.carbs   / sum) * 100),
    protein: Math.round((t.protein / sum) * 100),
    fat:     Math.round((t.fat     / sum) * 100),
  };
}

function calcMacroScore(actual: ReturnType<typeof calcMacroRatio>): number {
  const diff =
    Math.abs(actual.carbs   - IDEAL_MACRO.carbs) +
    Math.abs(actual.protein - IDEAL_MACRO.protein) +
    Math.abs(actual.fat     - IDEAL_MACRO.fat);
  return Math.max(0, Math.round(100 - diff * 1.2));
}

function calcIntervalMinutes(meals: MealRecord[]): number[] {
  const sorted = [...meals].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
  );
  return sorted.slice(1).map((m, i) =>
    Math.round((new Date(m.date).getTime() - new Date(sorted[i].date).getTime()) / 60000),
  );
}

function calcTimingScore(meals: MealRecord[]): number {
  if (meals.length < 2) return 70;
  const intervals = calcIntervalMinutes(meals);
  const avg = intervals.reduce((s, v) => s + v, 0) / intervals.length;
  if (avg >= 180 && avg <= 300) return 100;
  if (avg < 180) return Math.max(0, Math.round(100 - (180 - avg) * 0.4));
  return Math.max(0, Math.round(100 - (avg - 300) * 0.3));
}

function calcVarietyScore(meals: MealRecord[]): number {
  if (meals.length === 0) return 0;
  return Math.round((new Set(meals.map(m => m.foodName)).size / meals.length) * 100);
}

function scoreToGrade(score: number): DailyScore['grade'] {
  if (score >= 95) return 'A+';
  if (score >= 85) return 'A';
  if (score >= 75) return 'B';
  if (score >= 60) return 'C';
  if (score >= 45) return 'D';
  return 'F';
}

export function calcDailyScore(
  meals: MealRecord[],
  targetCalories: number,
): Omit<DailyScore, 'aiComment'> {
  const totalCalories = meals.reduce((s, m) => s + (m.calories || 0), 0);
  const ratio = totalCalories / (targetCalories || 1);

  const calorieScore  = calcCalorieScore(ratio);
  const actualMacro   = calcMacroRatio(meals);
  const macroScore    = calcMacroScore(actualMacro);
  const timingScore   = calcTimingScore(meals);
  const varietyScore  = calcVarietyScore(meals);

  const totalScore = Math.round(
    calorieScore  * WEIGHTS.calorie +
    macroScore    * WEIGHTS.macro +
    timingScore   * WEIGHTS.timing +
    varietyScore  * WEIGHTS.variety,
  );

  return {
    date: new Date().toISOString(),
    totalCalories,
    targetCalories,
    calorieScore,
    macroScore,
    timingScore,
    varietyScore,
    totalScore,
    grade: scoreToGrade(totalScore),
    calorieRatio: ratio,
    actualMacro,
    mealCount: meals.length,
  };
}

export function buildScoreCommentPrompt(score: Omit<DailyScore, 'aiComment'>): string {
  return `당신은 AI 영양사입니다. 오늘의 식단 점수를 보고 친근하고 따뜻한 어조로 2문장 총평을 작성해주세요.

데이터:
- 종합 점수: ${score.totalScore}점 (${score.grade}등급)
- 칼로리: ${score.totalCalories} / ${score.targetCalories} kcal (${Math.round(score.calorieRatio * 100)}%)
- 매크로: 탄${score.actualMacro.carbs}% 단${score.actualMacro.protein}% 지${score.actualMacro.fat}%
- 식사 횟수: ${score.mealCount}끼

칭찬과 개선점을 한 문장씩. 2문장만. 마크다운 없이 순수 텍스트로.`;
}
