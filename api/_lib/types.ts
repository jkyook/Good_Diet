// Vercel Node.js runtime 함수의 req/res 타입.
// @vercel/node 의존성을 추가하지 않기 위해 직접 정의.
import type { IncomingMessage, ServerResponse } from 'http';

export type ApiReq = IncomingMessage & {
  body?: unknown;
  query?: Record<string, string | string[]>;
  method?: string;
};

export type ApiRes = ServerResponse;

export type AnalysisMode = 'quick' | 'detailed';
export type AIProvider = 'gemini' | 'claude' | 'groq';

export interface AnalyzeRequest {
  imageData: string;
  /** normalizeForAnalysis() 후 canvas.width — AI bbox와 표시 픽셀 그리드 일치용 */
  imageWidth?: number;
  imageHeight?: number;
  age: number;
  gender: 'male' | 'female';
  existingMealsCount?: number;
  mode?: AnalysisMode;
  provider?: AIProvider;
}
