export type AnalysisMode = 'quick' | 'detailed';

export interface AnalysisResult {
  date: string;
  foodName: string;
  calories: number;
  markdown: string;
  mode: AnalysisMode;
}

export const analyzeFood = async (
  imageData: string,
  age: number,
  gender: 'male' | 'female',
  existingMealsCount: number = 0,
  mode: AnalysisMode = 'detailed'
): Promise<AnalysisResult> => {
  const response = await fetch('/api/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imageData, age, gender, existingMealsCount, mode }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: '음식 분석 중 오류가 발생했습니다.' }));
    throw new Error(err.error || '음식 분석 중 오류가 발생했습니다.');
  }

  return response.json();
};
