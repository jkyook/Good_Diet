// 서버 측 JSON 추출/파싱. 클라이언트와 동일한 알고리즘.
import type { AIProvider, AnalysisMode } from './types.js';

export type FoodCategory = '고기' | '야채' | '면' | '기타';

/** Gemini 표준 bbox: [ymin, xmin, ymax, xmax], 0~1000 정규화 */
export type NormalizedBBox = [number, number, number, number];

export interface IngredientDetail {
  name: string;
  parentFood: string;
  ratio: number;
  weightGrams: number;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  region?: NormalizedBBox;
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

export interface ExternalNutritionCandidate {
  provider: string;
  externalId: string;
  sourceUrl: string;
  name: string;
  brand: string | null;
  score: number;
  calories: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
  servingGrams: number | null;
  basis: 'serving' | '100g';
}

/** 2단계 분석: 접시/음식 단위 사진 오버레이 */
export interface FoodSegment {
  name: string;
  region: NormalizedBBox;
  calories: number;
  weightGrams: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface DetectedFoodItem {
  name: string;
  region: NormalizedBBox;
}

export interface FoodDetectionResult {
  sceneType: 'single_dish' | 'multi_dish' | 'package_label';
  items: DetectedFoodItem[];
}

export interface AnalysisResult {
  date: string;
  foodName: string;
  barcode?: string;
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
  externalCandidates?: ExternalNutritionCandidate[];
  isAmbiguous: boolean;
  detectedFoods?: string[];
  foodSegments?: FoodSegment[];
  ingredients?: IngredientDetail[];
  portionEstimate?: PortionEstimate;
  totals?: NutritionTotals;
  mealScore?: MealScore;
  improvements?: string[];
  warnings?: string[];
  analysisSource?: 'visual_estimate' | 'package_label' | 'nutrition_label' | 'external_source';
  confidence?: '높음' | '중간' | '낮음';
  /** 분석에 사용된 정규화 이미지 픽셀 크기 (오버레이 1:1 매핑) */
  imageWidth?: number;
  imageHeight?: number;
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
  const sourceSection = data.analysisSource && data.analysisSource !== 'visual_estimate'
    ? `\n> 분석 기준: ${sourceLabel(data.analysisSource)}`
    : '';

  return `# ${data.foodName}
${foods}
${sourceSection}

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
    barcode: parseBarcode(raw.barcode),
    ingredients: parseIngredients(raw.ingredients),
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
    analysisSource: parseAnalysisSource(raw.analysisSource),
    confidence: raw.confidence as '높음' | '중간' | '낮음' | undefined,
  };
  result.markdown = buildMarkdown(result);
  return result;
}

function parseBarcode(value: unknown): string | undefined {
  const digits = typeof value === 'string' || typeof value === 'number'
    ? String(value).replace(/\D/g, '')
    : '';
  return digits.length >= 8 && digits.length <= 14 ? digits : undefined;
}

function parseNormalizedBBox(value: unknown): NormalizedBBox | undefined {
  let nums: number[];

  if (Array.isArray(value) && value.length === 4) {
    nums = value.map(v => Number(v));
  } else if (value && typeof value === 'object') {
    const o = value as Record<string, unknown>;
    nums = [
      o.ymin ?? o.y_min ?? o.top,
      o.xmin ?? o.x_min ?? o.left,
      o.ymax ?? o.y_max ?? o.bottom,
      o.xmax ?? o.x_max ?? o.right,
    ].map(v => Number(v));
  } else {
    return undefined;
  }

  if (nums.some(n => !Number.isFinite(n))) return undefined;

  let [y0, x0, y1, x1] = nums;
  if (nums.every(n => n >= 0 && n <= 1)) {
    y0 *= 1000;
    x0 *= 1000;
    y1 *= 1000;
    x1 *= 1000;
  } else {
    const max = Math.max(y0, x0, y1, x1);
    const area = Math.max(0, y1 - y0) * Math.max(0, x1 - x0);
    // 0~100 퍼센트 스케일 (전부 100 이하·면적이 작게 잡힌 경우)
    if (max <= 100 && nums.every(n => n >= 0 && n <= 100) && area > 0 && area < 12_000) {
      y0 *= 10;
      x0 *= 10;
      y1 *= 10;
      x1 *= 10;
    }
  }

  const clamp = (n: number) => Math.max(0, Math.min(1000, Math.round(n)));
  y0 = clamp(y0);
  x0 = clamp(x0);
  y1 = clamp(y1);
  x1 = clamp(x1);

  if (y1 <= y0 || x1 <= x0) return undefined;

  const minSpan = 12;
  const expand = (a: number, b: number) => {
    if (b - a >= minSpan) return [a, b] as const;
    const c = (a + b) / 2;
    return [Math.max(0, c - minSpan / 2), Math.min(1000, c + minSpan / 2)] as const;
  };
  [y0, y1] = expand(y0, y1);
  [x0, x1] = expand(x0, x1);
  return [Math.round(y0), Math.round(x0), Math.round(y1), Math.round(x1)];
}

function parseIngredients(raw: unknown): IngredientDetail[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const items = raw
    .map(item => {
      if (!item || typeof item !== 'object') return null;
      const o = item as Record<string, unknown>;
      const name = String(o.name ?? '').trim();
      if (!name) return null;
      return {
        name,
        parentFood: String(o.parentFood ?? o.parent_food ?? ''),
        ratio: Number(o.ratio) || 0,
        weightGrams: Number(o.weightGrams ?? o.weight_grams) || 0,
        calories: Number(o.calories) || 0,
        protein: Number(o.protein) || 0,
        carbs: Number(o.carbs) || 0,
        fat: Number(o.fat) || 0,
        region: parseNormalizedBBox(o.region ?? o.bbox ?? o.box),
      } as IngredientDetail;
    })
    .filter((x): x is IngredientDetail => x != null);
  return items.length > 0 ? items : undefined;
}

function parseAnalysisSource(value: unknown): AnalysisResult['analysisSource'] {
  if (
    value === 'nutrition_label' ||
    value === 'package_label' ||
    value === 'visual_estimate' ||
    value === 'external_source'
  ) {
    return value;
  }
  return undefined;
}

function sourceLabel(source: NonNullable<AnalysisResult['analysisSource']>): string {
  switch (source) {
    case 'nutrition_label': return '영양성분표/포장 라벨';
    case 'package_label': return '포장지 상품 정보';
    case 'external_source': return '외부 공개 식품 데이터';
    case 'visual_estimate': return '사진 추정';
  }
}

export function parseFoodDetection(jsonText: string): FoodDetectionResult {
  const cleaned = extractJSON(jsonText);
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(cleaned);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new JSONParseError(`음식 영역 감지 JSON 파싱 실패: ${detail}`);
  }

  const sceneRaw = raw.sceneType ?? raw.scene_type;
  const sceneType: FoodDetectionResult['sceneType'] =
    sceneRaw === 'package_label' ? 'package_label'
      : sceneRaw === 'multi_dish' ? 'multi_dish'
        : 'single_dish';

  const arr = (raw.foodItems ?? raw.food_items ?? raw.items) as unknown;
  const items: DetectedFoodItem[] = [];
  if (Array.isArray(arr)) {
    for (const entry of arr) {
      if (!entry || typeof entry !== 'object') continue;
      const o = entry as Record<string, unknown>;
      const name = String(o.name ?? o.foodName ?? '').trim();
      const region = parseNormalizedBBox(o.region ?? o.bbox ?? o.box);
      if (!name || !region) continue;
      items.push({ name, region });
    }
  }

  return { sceneType, items };
}

const CONF_RANK: Record<string, number> = { '낮음': 0, '중간': 1, '높음': 2 };

export function mergeSegmentResults(
  segments: Array<{ item: DetectedFoodItem; result: AnalysisResult }>,
  mode: AnalysisMode,
  provider: AIProvider,
): AnalysisResult {
  const first = segments[0].result;
  const names = segments.map(s => s.item.name);
  const foodSegments: FoodSegment[] = segments.map(({ item, result }) => {
    const t = result.totals;
    return {
      name: item.name,
      region: item.region,
      calories: t?.calories ?? result.calories,
      weightGrams: result.weightGrams,
      protein: t?.protein ?? result.protein,
      carbs: t?.carbs ?? result.carbs,
      fat: t?.fat ?? result.fat,
    };
  });

  const ingredients = segments.flatMap(({ item, result }) =>
    (result.ingredients ?? []).map(ing => ({
      ...ing,
      parentFood: item.name,
      region: undefined,
    })),
  );

  const totalCal = foodSegments.reduce((a, s) => a + s.calories, 0);
  const totalProtein = foodSegments.reduce((a, s) => a + s.protein, 0);
  const totalCarbs = foodSegments.reduce((a, s) => a + s.carbs, 0);
  const totalFat = foodSegments.reduce((a, s) => a + s.fat, 0);
  const totalWeight = foodSegments.reduce((a, s) => a + s.weightGrams, 0);
  const totalSodium = segments.reduce(
    (a, s) => a + (s.result.totals?.sodium ?? 0),
    0,
  );

  const improvements = [...new Set(segments.flatMap(s => s.result.improvements ?? []))];
  const warnings = [...new Set(segments.flatMap(s => s.result.warnings ?? []))];

  let lowestConf: '높음' | '중간' | '낮음' = '높음';
  for (const { result } of segments) {
    const c = result.confidence ?? result.portionEstimate?.confidence ?? '중간';
    if ((CONF_RANK[c] ?? 1) < (CONF_RANK[lowestConf] ?? 2)) lowestConf = c;
  }

  const merged: AnalysisResult = {
    date: new Date().toISOString(),
    foodName: names.join(' · '),
    category: first.category,
    cookingMethod: segments.length > 1 ? '복합 식사' : first.cookingMethod,
    sauce: first.sauce,
    weightGrams: Math.round(totalWeight * 10) / 10,
    calories: Math.round(totalCal),
    protein: Math.round(totalProtein * 10) / 10,
    carbs: Math.round(totalCarbs * 10) / 10,
    fat: Math.round(totalFat * 10) / 10,
    mealTip: segments.map(s => s.result.mealTip).filter(Boolean).join(' '),
    markdown: '',
    mode,
    provider,
    isAmbiguous: false,
    detectedFoods: names,
    foodSegments,
    ingredients: ingredients.length > 0 ? ingredients : undefined,
    totals: {
      calories: Math.round(totalCal),
      protein: Math.round(totalProtein * 10) / 10,
      carbs: Math.round(totalCarbs * 10) / 10,
      fat: Math.round(totalFat * 10) / 10,
      sodium: Math.round(totalSodium),
    },
    mealScore: first.mealScore,
    improvements: improvements.length ? improvements : undefined,
    warnings: warnings.length ? warnings : undefined,
    analysisSource: 'visual_estimate',
    confidence: lowestConf,
    portionEstimate: {
      method: '2단계 영역별 분석 합산',
      referenceObject: names.join(', '),
      totalWeightGrams: Math.round(totalWeight),
      confidence: lowestConf,
    },
  };

  merged.markdown = buildMarkdown(merged);
  return merged;
}
