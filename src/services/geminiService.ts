import { GoogleGenAI } from '@google/genai';
import Anthropic from '@anthropic-ai/sdk';

export type AnalysisMode = 'quick' | 'detailed';
export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';
export type AIProvider = 'gemini' | 'claude' | 'groq';
export type FoodCategory = '고기' | '야채' | '면' | '기타';

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
  confidence: number; // 0~1
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
  candidates?: FoodCandidate[]; // 불확실할 때 상위 3개
  isAmbiguous: boolean;
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

export const GEMINI_AVAILABLE    = !!GEMINI_API_KEY;
export const CLAUDE_AVAILABLE    = !!ANTHROPIC_API_KEY;
export const GROQ_AVAILABLE      = !!GROQ_API_KEY;

// --- 클라이언트 ---
const geminiAI = GEMINI_API_KEY
  ? new GoogleGenAI({ apiKey: GEMINI_API_KEY }) : null;

const claudeAI = ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: ANTHROPIC_API_KEY, dangerouslyAllowBrowser: true }) : null;

// --- 프롬프트 ---
// 구조화된 음식 분석: 음식명/카테고리/조리법/소스/무게 포함
// 불확실할 때는 상위 3개 후보를 JSON 배열로 반환
const FOOD_ANALYSIS_SYSTEM = `당신은 정밀 음식 분석 AI입니다.
음식 사진을 보고 아래 JSON 형식으로만 응답하세요. JSON 외 텍스트는 금지입니다.

확실한 경우:
{
  "isAmbiguous": false,
  "foodName": "음식명",
  "category": "고기|야채|면|기타 중 하나",
  "cookingMethod": "볶음|구이|튀김|찜|날것|기타",
  "sauce": "소스명 또는 없음",
  "weightGrams": 숫자,
  "calories": 숫자,
  "protein": 숫자,
  "carbs": 숫자,
  "fat": 숫자,
  "mealTip": "한 줄 영양 팁"
}

불확실한 경우(여러 음식이 섞이거나 판별이 어려운 경우):
{
  "isAmbiguous": true,
  "candidates": [
    {
      "foodName": "후보1",
      "category": "고기|야채|면|기타",
      "cookingMethod": "조리법",
      "sauce": "소스",
      "weightGrams": 숫자,
      "calories": 숫자,
      "protein": 숫자,
      "carbs": 숫자,
      "fat": 숫자,
      "confidence": 0~1
    }
  ]
}
candidates는 최대 3개, confidence 내림차순 정렬.`;

const buildQuickPrompt = (age: number, gender: string) =>
  `사용자: ${age}세 ${gender === 'male' ? '남성' : '여성'}. 이 음식을 분석해주세요.`;

const buildDetailedPrompt = (age: number, gender: string, mealNumber: number) =>
  `사용자: ${age}세 ${gender === 'male' ? '남성' : '여성'}, 오늘 ${mealNumber}번째 식사. 이 음식을 상세 분석해주세요.`;

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

  return `# ${data.foodName}

## 영양 정보
- 카테고리: **${data.category}** | 조리법: ${data.cookingMethod} | 소스: ${data.sauce}
- 무게: **${data.weightGrams}g** | 칼로리: **${data.calories} kcal**
- 탄수화물: ${data.carbs}g / 단백질: ${data.protein}g / 지방: ${data.fat}g

## 💡 영양 팁
${data.mealTip}`;
};

// --- 파싱 ---
function parseResult(jsonText: string, mode: AnalysisMode, provider: AIProvider): AnalysisResult {
  const cleaned = jsonText.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
  let raw: Record<string, unknown> = {};
  try {
    raw = JSON.parse(cleaned);
  } catch {
    // JSON 파싱 실패 시 기본값 사용
    raw = { isAmbiguous: false, foodName: '알 수 없는 음식', calories: 0 };
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

  const result: AnalysisResult = {
    date: new Date().toISOString(),
    foodName: (raw.foodName as string) ?? '알 수 없는 음식',
    category: (raw.category as FoodCategory) ?? '기타',
    cookingMethod: (raw.cookingMethod as string) ?? '',
    sauce: (raw.sauce as string) ?? '없음',
    weightGrams: (raw.weightGrams as number) ?? 0,
    calories: (raw.calories as number) ?? 0,
    protein: (raw.protein as number) ?? 0,
    carbs: (raw.carbs as number) ?? 0,
    fat: (raw.fat as number) ?? 0,
    mealTip: (raw.mealTip as string) ?? '',
    markdown: '',
    mode,
    provider,
    isAmbiguous: false,
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
      maxOutputTokens: 1024,
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
    max_tokens: 1024,
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
      max_tokens: 1024,
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

  const totalSteps = mode === 'quick' ? 3 : 5;
  let simStep = 0;
  const stepTimer = setInterval(() => {
    if (simStep < totalSteps - 2) {
      simStep++;
      onEvent?.({ type: 'step', index: simStep, detail: '' });
    }
  }, 1500);

  try {
    const text = await callProvider(provider, base64Data, prompt, mode);
    const result = parseResult(text, mode, provider);

    onEvent?.({ type: 'step', index: 1, detail: `"${result.foodName}" 감지됨` });
    onEvent?.({ type: 'step', index: 2, detail: `${result.calories} kcal | ${result.weightGrams}g 산출됨` });
    if (!result.isAmbiguous) {
      onEvent?.({ type: 'step', index: 3, detail: `${result.category} / ${result.cookingMethod} 분류 완료` });
    } else {
      onEvent?.({ type: 'step', index: 3, detail: `후보 ${result.candidates?.length}개 도출됨` });
    }

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
