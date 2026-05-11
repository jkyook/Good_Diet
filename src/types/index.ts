import type { AnalysisMode, AIProvider, MealType, AnalysisResult } from '../services/geminiService';

export type { AnalysisMode, AIProvider, MealType, AnalysisResult };

export interface MealRecord extends AnalysisResult {
  id: string;
  image: string;
  mealType: MealType;
  /** T-067 (3): 인분 메타데이터 (기본 1). 분석 결과 자체는 환산하지 않음 — 참고 표시용. */
  portionCount?: number;
  /** T-072: DB 매칭된 foods.id (similarity > 0.7) — supabase 영속. history 카드에서도 인지 가능. */
  matchedFoodId?: string | null;
  /** T-072: 매칭 유사도 (0~1) — supabase 영속. */
  matchSimilarity?: number | null;
}

export interface DailyScore {
  date: string;
  totalCalories: number;
  targetCalories: number;
  calorieScore: number;
  macroScore: number;
  timingScore: number;
  varietyScore: number;
  totalScore: number;
  grade: 'A+' | 'A' | 'B' | 'C' | 'D' | 'F';
  calorieRatio: number;
  actualMacro: { carbs: number; protein: number; fat: number };
  mealCount: number;
  aiComment: string;
}

export type Gender = 'male' | 'female';
export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'active';
