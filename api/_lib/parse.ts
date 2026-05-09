// 서버 측 JSON 추출/파싱. 클라이언트와 동일한 알고리즘.
import type { AIProvider, AnalysisMode } from './types';

export type FoodCategory = '고기' | '야채' | '면' | '기타';

export interface IngredientDetail {
  name: string;
  parentFood: string;
  ratio: number;
  weightGrams: number;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface PortionEstimate {
  method: string;
  referenceObject: string;
  totalWeightGrams: number;
  confidence: '높음' | '중간' | '낮음';
}

export interface NutritionTotals {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  sodium: number;
}

export interface MealScore {
  balance: string;
  proteinSufficiency: string;
  vegetableRatio: string;
}

export interface FoodCandidate {
  foodName: string;
  category: FoodCategory;
  cookingMethod: string;
  sauce: string;
  weightGrams: number;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  confidence: number;
}

export interface AnalysisResult {
  date: string;
  foodName: string;
  category: FoodCategory;
  cookingMethod: string;
  sauce: string;
  weightGrams: number;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  mealTip: string;
  markdown: string;
  mode: AnalysisMode;
  provider: AIProvider;
  candidates?: FoodCandidate[];
  isAmbiguous: boolean;
  detectedFoods?: string[];
  ingredients?: IngredientDetail[];
  portionEstimate?: PortionEstimate;
  totals?: NutritionTotals;
  mealScore?: MealScore;
  improvements?: string[];
  warnings?: string[];
  confidence?: '높음' | '중간' | '낮음';
}

export class JSONParseError extends Error {
  constructor(message = 'AI 응답 JSON 파싱 실패') {
    super(message);
    this.name = 'JSONParseError';
  }
}

// 문자열 리터럴 인지 + brace-count balanced matching, 마지막 완전한 블록 반환.
export function extractJSON(text: string): string {
  const codeBlock = text.match(/```json\s*([\s\S]*?)```/);
  if (codeBlock) return codeBlock[1].trim();

  let depth = 0;
  let start = -1;
  let inString = false;
  let escape = false;
  let lastValid: string | null = null;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (escape) { escape = false; continue; }
    if (inString) {
      if (ch === '\\') escape = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') { inString = true; continue; }
    if (ch === '{') {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === '}') {
      if (depth === 0) continue;
      depth--;
      if (depth === 0 && start !== -1) {
        lastValid = text.slice(start, i + 1);
        start = -1;
      }
    }
  }

  return lastValid ?? text;
}

const MEAL_SCORE_MAP: Record<string, string> = {
  good: '양호', great: '양호', excellent: '양호', balanced: '양호',
  sufficient: '충분', enough: '충분', adequate: '충분',
  insufficient: '부족', low: '부족', lacking: '부족', poor: '부족',
  moderate: '적정', normal: '적정', appropriate: '적정', optimal: '적정',
  high: '과다', excessive: '과다', too_high: '과다', too_much: '과다',
  unbalanced: '불균형', imbalanced: '불균형',
};

function normalizeMealScoreVal(val: string): string {
  if (!val) return '-';
  const mapped = MEAL_SCORE_MAP[val.toLowerCase().replace(/\s+/g, '_')];
  return mapped ?? val;
}

const buildMarkdown = (data: AnalysisResult): string => {
  if (data.isAmbiguous && data.candidates?.length) {
    const top = data.candidates[0];
    return `# 🤔 음식 판별 불확실

## 후보 분석
${data.candidates.map((c, i) =>
  `**${i + 1}. ${c.foodName}** (신뢰도: ${Math.round(c.confidence * 100)}%)
- 카테고리: ${c.category} / 조리법: ${c.cookingMethod} / 소스: ${c.sauce}
- 무게: ${c.weightGrams}g | 칼로리: ${c.calories}kcal
- 탄/단/지: ${c.carbs}g / ${c.protein}g / ${c.fat}g`
).join('\n\n')}

> 가장 유력한 후보인 **${top.foodName}** 기준으로 기록됩니다.`;
  }

  const foods = data.detectedFoods?.length
    ? `\n**감지된 음식**: ${data.detectedFoods.join(', ')}`
    : '';

  const ingredientsTable = data.ingredients?.length ? `
## 재료별 분석
| 재료 | 속한 음식 | 무게 | 칼로리 | 탄/단/지 |
|------|---------|------|-------|---------|
${data.ingredients.map(i =>
  `| ${i.name} | ${i.parentFood} | ${i.weightGrams}g | ${i.calories}kcal | ${i.carbs}/${i.protein}/${i.fat}g |`
).join('\n')}` : '';

  const scoreSection = data.mealScore ? `
## 식사 평가
- 균형: **${data.mealScore.balance}**
- 단백질: **${data.mealScore.proteinSufficiency}**
- 채소 비율: **${data.mealScore.vegetableRatio}**` : '';

  const improvementsSection = data.improvements?.length
    ? `\n## 개선 제안\n${data.improvements.map(i => `- ${i}`).join('\n')}`
    : '';

  const warningsSection = data.warnings?.length
    ? `\n## ⚠️ 주의사항\n${data.warnings.map(w => `- ${w}`).join('\n')}`
    : '';

  return `# ${data.foodName}
${foods}

## 영양 정보
- 카테고리: **${data.category}** | 조리법: ${data.cookingMethod} | 소스: ${data.sauce}
- 무게: **${data.weightGrams}g** | 칼로리: **${data.calories} kcal**
- 탄수화물: ${data.carbs}g / 단백질: ${data.protein}g / 지방: ${data.fat}g${data.totals?.sodium ? ` / 나트륨: ${data.totals.sodium}mg` : ''}
${ingredientsTable}
${scoreSection}
${improvementsSection}
${warningsSection}

## 💡 영양 팁
${data.mealTip}`;
};

export function parseResult(jsonText: string, mode: AnalysisMode, provider: AIProvider): AnalysisResult {
  const cleaned = extractJSON(jsonText);
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(cleaned);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new JSONParseError(`AI 응답 JSON 파싱 실패 (${provider}): ${detail}`);
  }

  const isAmbiguous = !!raw.isAmbiguous;

  if (isAmbiguous && Array.isArray(raw.candidates) && raw.candidates.length > 0) {
    const candidates = (raw.candidates as FoodCandidate[]).slice(0, 3);
    const top = candidates[0];
    const result: AnalysisResult = {
      date: new Date().toISOString(),
      foodName: top.foodName,
      category: top.category ?? '기타',
      cookingMethod: top.cookingMethod ?? '',
      sauce: top.sauce ?? '없음',
      weightGrams: top.weightGrams ?? 0,
      calories: top.calories ?? 0,
      protein: top.protein ?? 0,
      carbs: top.carbs ?? 0,
      fat: top.fat ?? 0,
      mealTip: '',
      markdown: '',
      mode,
      provider,
      candidates,
      isAmbiguous: true,
    };
    result.markdown = buildMarkdown(result);
    return result;
  }

  const totalsRaw = raw.totals as Record<string, number> | undefined;
  const portionRaw = raw.portionEstimate as Record<string, unknown> | undefined;
  const scoreRaw = raw.mealScore as Record<string, string> | undefined;

  const result: AnalysisResult = {
    date: new Date().toISOString(),
    foodName: (raw.foodName as string) ?? '알 수 없는 음식',
    category: (raw.category as FoodCategory) ?? '기타',
    cookingMethod: (raw.cookingMethod as string) ?? '',
    sauce: (raw.sauce as string) ?? '없음',
    weightGrams: (raw.weightGrams as number) ?? portionRaw?.totalWeightGrams as number ?? 0,
    calories: totalsRaw?.calories ?? (raw.calories as number) ?? 0,
    protein: totalsRaw?.protein ?? (raw.protein as number) ?? 0,
    carbs: totalsRaw?.carbs ?? (raw.carbs as number) ?? 0,
    fat: totalsRaw?.fat ?? (raw.fat as number) ?? 0,
    mealTip: (raw.mealTip as string) ?? '',
    markdown: '',
    mode,
    provider,
    isAmbiguous: false,
    detectedFoods: Array.isArray(raw.detectedFoods) ? raw.detectedFoods as string[] : undefined,
    ingredients: Array.isArray(raw.ingredients) ? raw.ingredients as IngredientDetail[] : undefined,
    portionEstimate: portionRaw ? {
      method: portionRaw.method as string ?? '',
      referenceObject: portionRaw.referenceObject as string ?? '',
      totalWeightGrams: portionRaw.totalWeightGrams as number ?? 0,
      confidence: portionRaw.confidence as '높음' | '중간' | '낮음' ?? '중간',
    } : undefined,
    totals: totalsRaw ? {
      calories: totalsRaw.calories ?? 0,
      protein: totalsRaw.protein ?? 0,
      carbs: totalsRaw.carbs ?? 0,
      fat: totalsRaw.fat ?? 0,
      sodium: totalsRaw.sodium ?? 0,
    } : undefined,
    mealScore: scoreRaw ? {
      balance: normalizeMealScoreVal(scoreRaw.balance ?? ''),
      proteinSufficiency: normalizeMealScoreVal(scoreRaw.proteinSufficiency ?? ''),
      vegetableRatio: normalizeMealScoreVal(scoreRaw.vegetableRatio ?? ''),
    } : undefined,
    improvements: Array.isArray(raw.improvements) ? raw.improvements as string[] : undefined,
    warnings: Array.isArray(raw.warnings) ? raw.warnings as string[] : undefined,
    confidence: raw.confidence as '높음' | '중간' | '낮음' | undefined,
  };
  result.markdown = buildMarkdown(result);
  return result;
}
