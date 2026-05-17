/**
 * 1.5단계: 1차 감지 bbox를 원본 사진 좌표계(0~1000) 기준으로 재정렬
 */
import type { AIProvider, AnalysisMode } from './types.js';
import { callProviderWithSystem } from './providers.js';
import { FOOD_REFINE_SYSTEM, buildFoodRefineUser } from './prompt.js';
import { parseFoodDetection, type DetectedFoodItem } from './parse.js';

export function mergeRefinedItems(
  original: DetectedFoodItem[],
  refined: DetectedFoodItem[],
): DetectedFoodItem[] {
  if (refined.length === 0) return original;

  return original.map(orig => {
    const norm = (s: string) => s.trim().toLowerCase();
    const match = refined.find(r =>
      norm(r.name) === norm(orig.name)
      || norm(r.name).includes(norm(orig.name))
      || norm(orig.name).includes(norm(r.name)),
    );
    return match ? { name: orig.name, region: match.region } : orig;
  });
}

export async function refineFoodRegions(
  provider: AIProvider,
  base64Data: string,
  items: DetectedFoodItem[],
  mode: AnalysisMode,
  imageWidth: number,
  imageHeight: number,
): Promise<DetectedFoodItem[]> {
  if (items.length === 0) return items;

  try {
    const text = await callProviderWithSystem(
      provider,
      FOOD_REFINE_SYSTEM,
      base64Data,
      buildFoodRefineUser(items, imageWidth, imageHeight),
      mode,
      512,
    );
    const parsed = parseFoodDetection(text);
    if (parsed.items.length === 0) return items;
    return mergeRefinedItems(items, parsed.items);
  } catch (err) {
    console.warn('[bboxRefine] 보정 단계 실패, 1차 감지 좌표 유지:', err);
    return items;
  }
}
