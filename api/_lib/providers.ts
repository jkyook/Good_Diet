// 서버 측 AI 프로바이더 호출 — 키는 process.env 에서만 읽고 클라이언트에 노출되지 않음.
import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenAI } from '@google/genai';
import type { AIProvider, AnalysisMode } from './types.js';
import { FOOD_ANALYSIS_SYSTEM } from './prompt.js';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
// T-038: 'groq' provider 슬롯이 xAI Grok 엔드포인트로 전환됨. 환경변수명 GROQ_API_KEY 는
// 레거시(타입/식별자 변경 비용 회피) — 키 자체는 console.x.ai 발급분. 후속 PR 에서
// AIProvider/PROVIDER_AVAILABLE 의 'groq' → 'xai' 식별자 정리 권장.
const GROQ_API_KEY = process.env.GROQ_API_KEY;

export const PROVIDER_AVAILABLE: Record<AIProvider, boolean> = {
  gemini: !!GEMINI_API_KEY,
  claude: !!ANTHROPIC_API_KEY,
  groq: !!GROQ_API_KEY,
};

const geminiAI = GEMINI_API_KEY ? new GoogleGenAI({ apiKey: GEMINI_API_KEY }) : null;
const claudeAI = ANTHROPIC_API_KEY ? new Anthropic({ apiKey: ANTHROPIC_API_KEY }) : null;

export const PROVIDER_LABELS: Record<AIProvider, string> = {
  groq: 'xAI Grok 2 Vision',
  claude: 'Claude Haiku 4.5',
  gemini: 'Gemini 1.5 Flash',
};

export const FALLBACK_ORDER: AIProvider[] = ['claude', 'gemini', 'groq'];

async function callGemini(
  base64Data: string,
  prompt: string,
  system: string,
  maxOutputTokens: number,
): Promise<string> {
  const response = await geminiAI!.models.generateContent({
    model: 'gemini-1.5-flash',
    contents: [{
      parts: [
        { text: system + '\n\n' + prompt },
        { inlineData: { mimeType: 'image/jpeg', data: base64Data } },
      ],
    }],
    config: { temperature: 0.1, maxOutputTokens },
  });
  return response.text || '';
}

async function callClaude(
  base64Data: string,
  prompt: string,
  system: string,
  maxOutputTokens: number,
): Promise<string> {
  const model = 'claude-haiku-4-5-20251001';
  const response = await claudeAI!.messages.create({
    model,
    max_tokens: maxOutputTokens,
    system,
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: base64Data } },
        { type: 'text', text: prompt },
      ],
    }],
  });
  return response.content[0].type === 'text' ? response.content[0].text : '';
}

// T-038: xAI Grok 엔드포인트 (OpenAI 호환 API). 함수명 callGroq 는 슬롯 식별자
// 'groq' 와 일관성을 위해 유지 — 후속 정리 PR 에서 callXAI 로 변경 예정.
async function callGroq(
  base64Data: string,
  prompt: string,
  system: string,
  maxOutputTokens: number,
): Promise<string> {
  const res = await fetch('https://api.x.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${GROQ_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'grok-4-fast-non-reasoning',
      messages: [
        { role: 'system', content: system },
        {
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${base64Data}` } },
            { type: 'text', text: prompt },
          ],
        },
      ],
      max_tokens: maxOutputTokens,
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

function defaultMaxTokens(mode: AnalysisMode): number {
  return mode === 'quick' ? 1536 : 2048;
}

export async function callProviderWithSystem(
  provider: AIProvider,
  system: string,
  base64Data: string,
  prompt: string,
  mode: AnalysisMode,
  maxOutputTokens?: number,
): Promise<string> {
  if (!PROVIDER_AVAILABLE[provider]) {
    throw new Error(`${provider.toUpperCase()} API 키가 서버에 설정되지 않았습니다.`);
  }
  const tokens = maxOutputTokens ?? defaultMaxTokens(mode);
  switch (provider) {
    case 'gemini': return callGemini(base64Data, prompt, system, tokens);
    case 'claude': return callClaude(base64Data, prompt, system, tokens);
    case 'groq':   return callGroq(base64Data, prompt, system, tokens);
  }
}

export async function callProvider(
  provider: AIProvider,
  base64Data: string,
  prompt: string,
  mode: AnalysisMode,
): Promise<string> {
  return callProviderWithSystem(provider, FOOD_ANALYSIS_SYSTEM, base64Data, prompt, mode);
}

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
