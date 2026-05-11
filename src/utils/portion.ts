// T-068: N인분 사진을 1인분 기준으로 환산.
// AnalysisResult 안의 양/영양 numeric 필드만 1/N로 나눔.
// 비율(ratio)·등급(confidence 'high'/'medium')·텍스트·분류는 변경 없음.
import type { AnalysisResult } from '../services/geminiService';

function divNum(n: number | undefined | null, by: number): number {
  if (typeof n !== 'number' || !Number.isFinite(n)) return (n as number) ?? 0;
  return Math.round((n / by) * 10) / 10;
}

/**
 * portionCount > 1일 때만 환산. portionCount === 1이면 원본 그대로 반환.
 * - calories/protein/carbs/fat/weightGrams (총합)
 * - ingredients[].weightGrams/calories/protein/carbs/fat
 * - candidates[].weightGrams/calories/protein/carbs/fat (후보별도 1인분 기준으로 일관)
 * - totals.calories/protein/carbs/fat/sodium
 * - portionEstimate.totalWeightGrams
 */
export function divideByPortion(result: AnalysisResult, portionCount: number): AnalysisResult {
  if (!Number.isFinite(portionCount) || portionCount <= 1) return result;
  const N = portionCount;
  return {
    ...result,
    weightGrams: divNum(result.weightGrams, N),
    calories:    divNum(result.calories,    N),
    protein:     divNum(result.protein,     N),
    carbs:       divNum(result.carbs,       N),
    fat:         divNum(result.fat,         N),
    ingredients: result.ingredients?.map(ing => ({
      ...ing,
      weightGrams: divNum(ing.weightGrams, N),
      calories:    divNum(ing.calories,    N),
      protein:     divNum(ing.protein,     N),
      carbs:       divNum(ing.carbs,       N),
      fat:         divNum(ing.fat,         N),
      // ratio는 비율이라 환산 안 함
    })),
    candidates: result.candidates?.map(c => ({
      ...c,
      weightGrams: divNum(c.weightGrams, N),
      calories:    divNum(c.calories,    N),
      protein:     divNum(c.protein,     N),
      carbs:       divNum(c.carbs,       N),
      fat:         divNum(c.fat,         N),
      // confidence(0~1 점수)는 환산 안 함
    })),
    totals: result.totals ? {
      ...result.totals,
      calories: divNum(result.totals.calories, N),
      protein:  divNum(result.totals.protein,  N),
      carbs:    divNum(result.totals.carbs,    N),
      fat:      divNum(result.totals.fat,      N),
      sodium:   divNum(result.totals.sodium,   N),
    } : result.totals,
    portionEstimate: result.portionEstimate ? {
      ...result.portionEstimate,
      totalWeightGrams: divNum(result.portionEstimate.totalWeightGrams, N),
    } : result.portionEstimate,
    // mealScore (텍스트 등급), improvements/warnings (배열), recommendations, mealTip, markdown,
    // detectedFoods, foodName/category/cookingMethod/sauce, mode/provider, isAmbiguous, confidence: 환산 X
  };
}
