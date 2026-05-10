// 클라이언트 측 분석 서비스. AI SDK 직접 호출은 보안 문제로 제거되었고,
// 이제 모든 호출은 /api/analyze, /api/analyze-batch, /api/health 프록시를 거친다.
// 키는 서버(Vercel 함수 환경변수)에만 존재.
import { maskText, maskArray, findMatches } from '../utils/contentFilter';

export type AnalysisMode = 'quick' | 'detailed';
export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';
export type AIProvider = 'gemini' | 'claude' | 'groq';
export type FoodCategory = '고기' | '야채' | '면' | '기타';

// --- 도메인 타입 ---
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

export interface ExerciseRec {
  name: string;
  duration: string;
  burnCalories: number;
}

export interface Recommendations {
  nextMeals: string[];
  exercises: ExerciseRec[];
  desserts: string[];
  avoidFoods: string[];
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
  recommendations?: Recommendations;
}

export interface StepEvent {
  type: 'step';
  index: number;
  detail: string;
}

export type StreamEvent =
  | StepEvent
  | { type: 'done'; result: AnalysisResult }
  | { type: 'error'; message: string }
  | { type: 'provider-fallback'; from: AIProvider; reason: 'parse' | 'quota' };

// --- API base ---
// 웹: 빈 문자열 (상대 경로 → vite proxy/Vercel 라우팅)
// 모바일(Capacitor): 절대 URL (.env.mobile 의 VITE_API_BASE)
const API_BASE = ((import.meta as ImportMeta & { env?: Record<string, string> }).env?.VITE_API_BASE) ?? '';

// --- 프로바이더 메타 (런타임 상수) ---
export const PROVIDER_LABELS: Record<AIProvider, string> = {
  groq: 'xAI Grok 2 Vision',
  claude: 'Claude Haiku 4.5',
  gemini: 'Gemini 1.5 Flash',
};

export const FALLBACK_ORDER: AIProvider[] = ['claude', 'gemini', 'groq'];

// --- 헬스 체크로 채우는 가용성 정보 ---
// 키는 서버에만 있으므로 클라이언트는 /api/health 응답으로만 가용성 판별.
export const PROVIDER_AVAILABLE: Record<AIProvider, boolean> = {
  gemini: false,
  claude: false,
  groq: false,
};

export interface ProviderHealth {
  gemini: boolean;
  claude: boolean;
  groq: boolean;
}

let healthFetched = false;
export async function fetchHealth(): Promise<ProviderHealth> {
  const res = await fetch(`${API_BASE}/api/health`);
  if (!res.ok) throw new Error(`health check 실패: ${res.status}`);
  const data = await res.json();
  const p = data.providers ?? {};
  PROVIDER_AVAILABLE.gemini = !!p.gemini;
  PROVIDER_AVAILABLE.claude = !!p.claude;
  PROVIDER_AVAILABLE.groq = !!p.groq;
  healthFetched = true;
  return { ...PROVIDER_AVAILABLE };
}

export function isHealthFetched() {
  return healthFetched;
}

// --- JSON 파싱 실패 (서버에서 throw 후 클라이언트로 전파됨) ---
export class JSONParseError extends Error {
  constructor(message = 'AI 응답 JSON 파싱 실패') {
    super(message);
    this.name = 'JSONParseError';
  }
}

// 네트워크/할당량 오류 판별 (UI 메시지 분기용으로 호환 유지)
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

// --- SSE 파싱 ---
async function consumeSSE(
  res: Response,
  onEvent: (e: unknown) => void,
): Promise<void> {
  if (!res.body) throw new Error('응답 본문이 비어있습니다.');
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let idx;
    while ((idx = buffer.indexOf('\n\n')) >= 0) {
      const block = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      for (const line of block.split('\n')) {
        if (!line.startsWith('data:')) continue;
        const payload = line.slice(5).trim();
        if (!payload) continue;
        try { onEvent(JSON.parse(payload)); }
        catch { /* malformed event 무시 */ }
      }
    }
  }
}

async function readErrorBody(res: Response): Promise<string> {
  try {
    const j = await res.json();
    return j?.error ?? j?.message ?? `HTTP ${res.status}`;
  } catch {
    return `HTTP ${res.status} ${res.statusText}`;
  }
}

// --- 단일 분석 (서버 SSE 호출) ---
export const analyzeFood = async (
  imageData: string,
  age: number,
  gender: 'male' | 'female',
  existingMealsCount: number = 0,
  mode: AnalysisMode = 'detailed',
  provider: AIProvider = 'groq',
  onEvent?: (event: StreamEvent) => void,
): Promise<AnalysisResult> => {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/api/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageData, age, gender, existingMealsCount, mode, provider }),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    onEvent?.({ type: 'error', message });
    throw new Error(message);
  }

  if (!res.ok) {
    const message = await readErrorBody(res);
    onEvent?.({ type: 'error', message });
    throw new Error(message);
  }

  let result: AnalysisResult | null = null;
  let errMsg: string | null = null;

  await consumeSSE(res, (e) => {
    const ev = e as StreamEvent;
    if (ev.type === 'step') onEvent?.(ev);
    else if (ev.type === 'provider-fallback') onEvent?.(ev);
    else if (ev.type === 'done') { result = ev.result; onEvent?.(ev); }
    else if (ev.type === 'error') { errMsg = ev.message; onEvent?.(ev); }
  });

  if (errMsg) throw new Error(errMsg);
  if (!result) throw new Error('서버에서 결과를 받지 못했습니다.');
  return sanitizeResult(result);
};

// 의료 표현 2차 방어선: 서버 프롬프트 가드를 모델이 우회한 경우를 잡는다.
// improvements / warnings / mealTip / markdown 텍스트 필드에 마스킹 적용.
function sanitizeResult(result: AnalysisResult): AnalysisResult {
  const matches = [
    ...findMatches(result.markdown ?? ''),
    ...findMatches(result.mealTip ?? ''),
    ...(result.improvements ?? []).flatMap(s => findMatches(s)),
    ...(result.warnings ?? []).flatMap(s => findMatches(s)),
  ];
  if (matches.length > 0) {
    console.warn('[contentFilter] 의료 표현 마스킹:', matches.map(m => `${m.term}(${m.category})`).join(', '));
  }
  return {
    ...result,
    markdown: maskText(result.markdown ?? ''),
    mealTip: maskText(result.mealTip ?? ''),
    improvements: maskArray(result.improvements),
    warnings: maskArray(result.warnings),
  };
}

// --- 다중 이미지 일괄 분석 (서버 SSE 호출) ---
export const analyzeFoodBatch = async (
  images: string[],
  age: number,
  gender: 'male' | 'female',
  mode: AnalysisMode = 'quick',
  provider: AIProvider = 'groq',
  onProgress?: (completed: number, total: number, result?: AnalysisResult) => void,
): Promise<AnalysisResult[]> => {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/api/analyze-batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ images, age, gender, mode, provider }),
    });
  } catch (err) {
    throw new Error(err instanceof Error ? err.message : String(err));
  }

  if (!res.ok) throw new Error(await readErrorBody(res));

  const results: AnalysisResult[] = [];

  await consumeSSE(res, (e) => {
    const ev = e as
      | { type: 'item'; index: number; result?: AnalysisResult; error?: string }
      | { type: 'progress'; completed: number; total: number }
      | { type: 'done' }
      | { type: 'error'; message: string };

    if (ev.type === 'item') {
      const sanitized = ev.result ? sanitizeResult(ev.result) : undefined;
      if (sanitized) results.push(sanitized);
      onProgress?.(ev.index + 1, images.length, sanitized);
    } else if (ev.type === 'progress') {
      // progress 이벤트는 onProgress 가 item 에서 이미 호출됨
    } else if (ev.type === 'error') {
      console.error('[analyzeFoodBatch] server error:', ev.message);
    }
  });

  return results;
};
