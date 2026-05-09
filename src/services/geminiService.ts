import { GoogleGenAI } from '@google/genai';
import Anthropic from '@anthropic-ai/sdk';

export type AnalysisMode = 'quick' | 'detailed';
export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';
export type AIProvider = 'gemini' | 'claude' | 'groq';
export type FoodCategory = '고기' | '야채' | '면' | '기타';

// --- 확장 인터페이스 ---

export interface IngredientDetail {
  name: string;
  parentFood: string;
  ratio: number;       // %
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
  // CoT 확장 필드
  detectedFoods?: string[];
  ingredients?: IngredientDetail[];
  portionEstimate?: PortionEstimate;
  totals?: NutritionTotals;
  mealScore?: MealScore;
  improvements?: string[];
  warnings?: string[];
  confidence?: '높음' | '중간' | '낮음';
}

export interface StepEvent {
  type: 'step';
  index: number;
  detail: string;
}

export type StreamEvent =
  | StepEvent
  | { type: 'done'; result: AnalysisResult }
  | { type: 'error'; message: string };

// --- API 키 ---
const GEMINI_API_KEY    = process.env.GEMINI_API_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const GROQ_API_KEY      = process.env.GROQ_API_KEY;

export const GEMINI_AVAILABLE = !!GEMINI_API_KEY;
export const CLAUDE_AVAILABLE = !!ANTHROPIC_API_KEY;
export const GROQ_AVAILABLE   = !!GROQ_API_KEY;

// --- 클라이언트 ---
const geminiAI = GEMINI_API_KEY
  ? new GoogleGenAI({ apiKey: GEMINI_API_KEY }) : null;

const claudeAI = ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: ANTHROPIC_API_KEY, dangerouslyAllowBrowser: true }) : null;

// --- CoT 5단계 프롬프트 ---
const FOOD_ANALYSIS_SYSTEM = `당신은 정밀 음식 분석 전문가입니다. 아래 5단계로 순서대로 분석하세요.

[한국 표준 용기 기준]
- 밥공기: 210g | 국그릇: 350ml | 뚝배기: 400ml
- 반찬 소접시: 50~80g | 라면 그릇: 550ml | 식판 1칸: 100~150g

[Step 1 - 음식 감지]
사진에 있는 모든 음식 항목을 나열하세요.

[Step 2 - 재료 분석]
각 음식의 주재료, 조리법, 소스, 재료별 비율(%)을 추정하세요.

[Step 3 - 양 추정]
위 표준 용기 기준과 사진의 그릇/참조물을 보고 각 음식의 총량(g)을 추정하세요.
추정 근거(어떤 용기 기준인지)를 명시하세요.

[Step 4 - 영양 계산]
재료별 무게(총량 × 비율) × 100g당 영양소로 합산 계산하세요.

[Step 5 - 신뢰도 평가]
각 추정값의 신뢰도(높음/중간/낮음)와 불확실 요인을 명시하세요.

중요: 사고 과정을 텍스트로 출력하지 마세요. 반드시 아래 JSON 형식으로만 출력하세요. 모든 문자열 값은 한국어로 작성하세요.
{
  "isAmbiguous": false,
  "detectedFoods": ["음식명1", "음식명2"],
  "ingredients": [
    {
      "name": "재료명",
      "parentFood": "속한 음식명",
      "ratio": 40,
      "weightGrams": 84,
      "calories": 120,
      "protein": 5,
      "carbs": 18,
      "fat": 3
    }
  ],
  "portionEstimate": {
    "method": "밥공기 기준",
    "referenceObject": "밥공기(210g)",
    "totalWeightGrams": 520,
    "confidence": "중간"
  },
  "totals": {
    "calories": 0,
    "protein": 0,
    "carbs": 0,
    "fat": 0,
    "sodium": 0
  },
  "mealScore": {
    "balance": "양호",
    "proteinSufficiency": "부족",
    "vegetableRatio": "적정"
  },
  "improvements": ["개선 제안 1", "개선 제안 2"],
  "warnings": ["주의사항"],
  "confidence": "중간",
  "foodName": "대표 음식명",
  "category": "고기|야채|면|기타",
  "cookingMethod": "조리법",
  "sauce": "소스",
  "weightGrams": 520,
  "mealTip": "한 줄 팁",
  "markdown": ""
}`;

const buildQuickPrompt = (age: number, gender: string) =>
  `사용자: ${age}세 ${gender === 'male' ? '남성' : '여성'}. 이 음식을 분석해주세요.`;

const buildDetailedPrompt = (age: number, gender: string, mealNumber: number) =>
  `사용자: ${age}세 ${gender === 'male' ? '남성' : '여성'}, 오늘 ${mealNumber}번째 식사. 이 음식을 상세 분석해주세요.`;

// --- 마크다운 생성 ---
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

// --- JSON 추출 (CoT 사고 과정 텍스트 제거) ---
// 문자열 리터럴을 인지하면서 균형 잡힌 최상위 { } 블록을 스캔, 마지막 완전한 블록 반환.
// 이전의 lastIndexOf 방식은 CoT 안에 단독 '}' 문자가 섞이면 잘못된 슬라이스를 만들었다.
function extractJSON(text: string): string {
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

// --- mealScore 영문 값 → 한국어 정규화 ---
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

// --- JSON 파싱 실패 전용 오류 (호출부에서 프로바이더 폴백 트리거) ---
export class JSONParseError extends Error {
  constructor(message = 'AI 응답 JSON 파싱 실패') {
    super(message);
    this.name = 'JSONParseError';
  }
}

// --- 파싱 ---
function parseResult(jsonText: string, mode: AnalysisMode, provider: AIProvider): AnalysisResult {
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

// --- 할당량/인증 오류 판별 ---
export function isQuotaError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes('quota') ||
    lower.includes('credit') ||
    lower.includes('rate limit') ||
    lower.includes('rate_limit') ||
    lower.includes('too low') ||
    lower.includes('billing') ||
    lower.includes('exceeded') ||
    lower.includes('resource_exhausted') ||
    lower.includes('429') ||
    lower.includes('insufficient')
  );
}

// --- Gemini 1.5 Flash 호출 ---
async function callGemini(base64Data: string, prompt: string): Promise<string> {
  const response = await geminiAI!.models.generateContent({
    model: 'gemini-1.5-flash',
    contents: [{
      parts: [
        { text: FOOD_ANALYSIS_SYSTEM + '\n\n' + prompt },
        { inlineData: { mimeType: 'image/jpeg', data: base64Data } },
      ],
    }],
    config: {
      temperature: 0.1,
      maxOutputTokens: 2048,
    },
  });
  return response.text || '';
}

// --- Claude 호출 ---
// 경량 모델 우선 정책 — Sonnet 미사용
async function callClaude(base64Data: string, prompt: string, _mode: AnalysisMode): Promise<string> {
  const model = 'claude-haiku-4-5-20251001';
  const response = await claudeAI!.messages.create({
    model,
    max_tokens: 2048,
    system: FOOD_ANALYSIS_SYSTEM,
    messages: [{
      role: 'user',
      content: [
        {
          type: 'image',
          source: { type: 'base64', media_type: 'image/jpeg', data: base64Data },
        },
        { type: 'text', text: prompt },
      ],
    }],
  });
  return response.content[0].type === 'text' ? response.content[0].text : '';
}

// --- Groq 호출 ---
async function callGroq(base64Data: string, prompt: string, mode: AnalysisMode): Promise<string> {
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${GROQ_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'meta-llama/llama-4-scout-17b-16e-instruct',
      messages: [
        { role: 'system', content: FOOD_ANALYSIS_SYSTEM },
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: { url: `data:image/jpeg;base64,${base64Data}` },
            },
            { type: 'text', text: prompt },
          ],
        },
      ],
      max_tokens: mode === 'quick' ? 1536 : 2048,
      temperature: 0.1,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: { message: res.statusText } }));
    throw new Error(err?.error?.message || JSON.stringify(err));
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
}

async function callProvider(
  provider: AIProvider,
  base64Data: string,
  prompt: string,
  mode: AnalysisMode,
): Promise<string> {
  switch (provider) {
    case 'gemini': return callGemini(base64Data, prompt);
    case 'claude': return callClaude(base64Data, prompt, mode);
    case 'groq':   return callGroq(base64Data, prompt, mode);
  }
}

export const PROVIDER_LABELS: Record<AIProvider, string> = {
  groq:   'Groq Llama 4 Scout',
  claude: 'Claude Haiku 4.5',
  gemini: 'Gemini 1.5 Flash',
};

export const PROVIDER_AVAILABLE: Record<AIProvider, boolean> = {
  gemini: GEMINI_AVAILABLE,
  claude: CLAUDE_AVAILABLE,
  groq:   GROQ_AVAILABLE,
};

export const FALLBACK_ORDER: AIProvider[] = ['groq', 'claude', 'gemini'];

// --- 단일 이미지 분석 ---
export const analyzeFood = async (
  imageData: string,
  age: number,
  gender: 'male' | 'female',
  existingMealsCount: number = 0,
  mode: AnalysisMode = 'detailed',
  provider: AIProvider = 'groq',
  onEvent?: (event: StreamEvent) => void,
): Promise<AnalysisResult> => {
  if (!PROVIDER_AVAILABLE[provider]) {
    const msg = `${provider.toUpperCase()} API 키가 .env에 없습니다.`;
    onEvent?.({ type: 'error', message: msg });
    throw new Error(msg);
  }

  const prompt = mode === 'quick'
    ? buildQuickPrompt(age, gender)
    : buildDetailedPrompt(age, gender, existingMealsCount + 1);
  const base64Data = imageData.split(',')[1] || imageData;

  onEvent?.({ type: 'step', index: 0, detail: `${PROVIDER_LABELS[provider]} 연결 완료` });

  const totalSteps = 5;
  let simStep = 0;
  const stepLabels = ['음식 감지 중', '재료 분석 중', '양 추정 중', '영양 계산 중'];
  const stepTimer = setInterval(() => {
    if (simStep < totalSteps - 2) {
      simStep++;
      onEvent?.({ type: 'step', index: simStep, detail: stepLabels[simStep - 1] ?? '' });
    }
  }, 1500);

  try {
    const text = await callProvider(provider, base64Data, prompt, mode);
    const result = parseResult(text, mode, provider);

    onEvent?.({ type: 'step', index: 1, detail: `"${result.foodName}" 감지됨` });
    onEvent?.({ type: 'step', index: 2, detail: `${result.calories} kcal | ${result.weightGrams}g 산출됨` });
    onEvent?.({ type: 'step', index: 3, detail: result.portionEstimate ? `${result.portionEstimate.referenceObject} 기준 추정` : '분류 완료' });
    onEvent?.({ type: 'step', index: 4, detail: `신뢰도: ${result.confidence ?? '중간'}` });

    onEvent?.({ type: 'done', result });
    return result;
  } catch (error) {
    console.error(`[머먹지] ${provider} API Error:`, error);
    let message = error instanceof Error ? error.message : String(error);
    try {
      const parsed = JSON.parse(message);
      message = parsed?.error?.message ?? parsed?.message ?? message;
    } catch { /* not JSON */ }
    onEvent?.({ type: 'error', message });
    // JSONParseError는 호출부에서 instanceof 검사로 폴백을 결정하므로 타입 보존
    if (error instanceof JSONParseError) throw error;
    throw new Error(message);
  } finally {
    clearInterval(stepTimer);
  }
};

// --- 다중 이미지 일괄 분석 ---
export const analyzeFoodBatch = async (
  images: string[],
  age: number,
  gender: 'male' | 'female',
  mode: AnalysisMode = 'quick',
  provider: AIProvider = 'groq',
  onProgress?: (completed: number, total: number, result?: AnalysisResult) => void,
): Promise<AnalysisResult[]> => {
  const results: AnalysisResult[] = [];

  for (let i = 0; i < images.length; i++) {
    try {
      const result = await analyzeFood(images[i], age, gender, i, mode, provider);
      results.push(result);
      onProgress?.(i + 1, images.length, result);
    } catch (err) {
      console.error(`[머먹지] 배치 분석 실패 (${i + 1}/${images.length}):`, err);
      onProgress?.(i + 1, images.length);
    }
    // API 레이트 리밋 대비 짧은 간격
    if (i < images.length - 1) await new Promise(r => setTimeout(r, 300));
  }

  return results;
};
