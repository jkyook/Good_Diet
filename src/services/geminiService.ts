import { GoogleGenAI } from '@google/genai';
import Anthropic from '@anthropic-ai/sdk';

export type AnalysisMode = 'quick' | 'detailed';
export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';
export type AIProvider = 'gemini' | 'claude' | 'groq';

export interface AnalysisResult {
  date: string;
  foodName: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  mealTip: string;
  markdown: string;
  mode: AnalysisMode;
  provider: AIProvider;
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

// --- 프롬프트 빌더 ---
const buildQuickPrompt = (age: number, gender: string) => `
당신은 AI 영양사입니다. 음식 사진을 보고 핵심만 빠르게 분석해주세요. 답변은 간결하게 작성하세요.

# [음식명] 퀵 리뷰

## ⚡ 핵심 수치
* **칼로리**: [숫자] kcal
* **탄/단/지**: 탄수화물 [g] / 단백질 [g] / 지방 [g]
* **주의**: [나트륨 등 주요 주의사항 한 줄]

## ✅ ${age}세 ${gender === 'male' ? '남성' : '여성'} 한줄 평가
[한 문장으로 이 음식에 대한 평가]

## 💡 바로 실천 팁
[가장 중요한 실천 팁 한 가지]

마지막 줄에 다음 형식으로 데이터를 포함해주세요 (사용자에게 보이지 않도록):
---DATA:{"calories": [숫자], "foodName": "[음식명]", "protein": [숫자], "carbs": [숫자], "fat": [숫자], "mealTip": "[한 줄 실천 팁]"}---
`;

const buildDetailedPrompt = (age: number, gender: string, mealNumber: number) => `
당신은 최고의 AI 영양사 및 운동 전문가입니다. 제공된 음식 사진을 분석하여 사용자의 나이(${age}세)와 성별(${gender === 'male' ? '남성' : '여성'})에 적합한지 분석해주세요.
이번이 오늘 ${mealNumber}번째 식사 분석입니다.

다음 항목들을 포함하여 Markdown 형식으로 작성해주세요:

# [음식 이름] 분석 리포트

## 📊 영양 성분 분석
* **추정 칼로리**: [숫자] kcal
* **탄수화물/단백질/지방**: 탄수화물 [g] / 단백질 [g] / 지방 [g]
* **나트륨 및 기타**: [주의사항]

## 🎯 나이/성별 맞춤 평가
[${age}세 ${gender === 'male' ? '남성' : '여성'}에게 이 음식이 어떤 영향을 주는지, 권장 섭취량 대비 어떤지 상세 분석]

## 🥗 최고의 푸드 페어링 (곁들이면 좋을 음식)
[이 식단에 부족한 영양소를 채워주거나 소화를 도울 수 있는 구체적인 음식 2-3가지 추천]

## 🏃 추천 활동 및 운동
[이 식사의 칼로리를 효과적으로 연소하거나 대사를 돕기 위한 맞춤형 운동 제안. 예: '빠르게 걷기 30분']

## 💡 종합 개선 팁
[더 건강하게 먹기 위한 실천 가능한 한 줄 팁]

마지막 줄에 다음 형식으로 데이터를 포함해주세요 (사용자에게 보이지 않도록):
---DATA:{"calories": [숫자], "foodName": "[음식명]", "protein": [숫자], "carbs": [숫자], "fat": [숫자], "mealTip": "[한 줄 실천 팁]"}---
`;

// --- 파싱 ---
function parseResult(fullText: string, mode: AnalysisMode, provider: AIProvider): AnalysisResult {
  const dataMatch = fullText.match(/---DATA:(\{.*\})---/);
  let base = { calories: 0, foodName: '알 수 없는 음식', protein: 0, carbs: 0, fat: 0, mealTip: '' };
  if (dataMatch) {
    try { base = { ...base, ...JSON.parse(dataMatch[1]) }; } catch { /* keep defaults */ }
  }
  return {
    date: new Date().toISOString(),
    foodName: base.foodName,
    calories: base.calories,
    protein: base.protein,
    carbs: base.carbs,
    fat: base.fat,
    mealTip: base.mealTip,
    markdown: fullText.replace(/---DATA:(\{.*\})---/, '').trim(),
    mode,
    provider,
  };
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

// --- Gemini 호출 ---
async function callGemini(base64Data: string, prompt: string): Promise<string> {
  const response = await geminiAI!.models.generateContent({
    model: 'gemini-2.0-flash',
    contents: [{
      parts: [
        { text: prompt },
        { inlineData: { mimeType: 'image/jpeg', data: base64Data } },
      ],
    }],
  });
  return response.text || '';
}

// --- Claude 호출 ---
async function callClaude(base64Data: string, prompt: string, mode: AnalysisMode): Promise<string> {
  const model = mode === 'quick' ? 'claude-haiku-4-5-20251001' : 'claude-sonnet-4-6';
  const response = await claudeAI!.messages.create({
    model,
    max_tokens: mode === 'quick' ? 1024 : 2048,
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

// --- Groq 호출 (무료 — Llama 4 Scout Vision) ---
async function callGroq(base64Data: string, prompt: string, mode: AnalysisMode): Promise<string> {
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${GROQ_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'meta-llama/llama-4-scout-17b-16e-instruct',
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image_url',
            image_url: { url: `data:image/jpeg;base64,${base64Data}` },
          },
          { type: 'text', text: prompt },
        ],
      }],
      max_tokens: mode === 'quick' ? 1024 : 2048,
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

// --- 단일 프로바이더 호출 (내부) ---
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
  gemini: 'Gemini 2.0 Flash',
  claude: 'Claude (Haiku/Sonnet)',
  groq:   'Groq Llama 4 Scout',
};

export const PROVIDER_AVAILABLE: Record<AIProvider, boolean> = {
  gemini: GEMINI_AVAILABLE,
  claude: CLAUDE_AVAILABLE,
  groq:   GROQ_AVAILABLE,
};

// 폴백 순서 (groq는 항상 마지막 보험)
export const FALLBACK_ORDER: AIProvider[] = ['gemini', 'claude', 'groq'];

// --- 메인 분석 함수 ---
export const analyzeFood = async (
  imageData: string,
  age: number,
  gender: 'male' | 'female',
  existingMealsCount: number = 0,
  mode: AnalysisMode = 'detailed',
  provider: AIProvider = 'gemini',
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

  const totalSteps = mode === 'quick' ? 3 : 6;
  let simStep = 0;
  const stepTimer = setInterval(() => {
    if (simStep < totalSteps - 2) {
      simStep++;
      onEvent?.({ type: 'step', index: simStep, detail: '' });
    }
  }, 1800);

  try {
    const text = await callProvider(provider, base64Data, prompt, mode);
    const result = parseResult(text, mode, provider);

    onEvent?.({ type: 'step', index: 1, detail: `"${result.foodName}" 감지됨` });
    if (mode === 'detailed') {
      onEvent?.({ type: 'step', index: 2, detail: `${result.calories} kcal 산출됨` });
      onEvent?.({ type: 'step', index: 3, detail: `${age}세 ${gender === 'male' ? '남성' : '여성'} 맞춤 평가 완료` });
      onEvent?.({ type: 'step', index: 4, detail: '운동 · 페어링 추천 완성' });
      onEvent?.({ type: 'step', index: 5, detail: '리포트 완성' });
    } else {
      onEvent?.({ type: 'step', index: 2, detail: `${result.calories} kcal 산출됨` });
    }

    onEvent?.({ type: 'done', result });
    return result;
  } catch (error) {
    console.error(`[FlavorGuard] ${provider} API Error:`, error);
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
