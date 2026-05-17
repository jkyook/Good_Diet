/**
 * 1.5단계: 1차 감지 bbox를 원본 사진 좌표계(0~1000) 기준으로 재정렬
 */
import type { AIProvider, AnalysisMode } from './types.js';
import { callProviderWithSystem } from './providers.js';
import { FOOD_REFINE_SYSTEM, buildFoodRefineUser } from './prompt.js';
import { parseFoodDetection, type DetectedFoodItem } from './parse.js';
import { stabilizeFoodRegions } from './foodBbox.js';

export function mergeRefinedItems(
  original: DetectedFoodItem[],
  refined: DetectedFoodItem[],
): DetectedFoodItem[] {
  if (refined.length === 0) return original;

  const used = new Set<number>();

  const pickMatch = (orig: DetectedFoodItem, index: number): DetectedFoodItem['region'] | undefined => {
    const norm = (s: string) => s.trim().toLowerCase();
    if (refined.length === original.length && refined[index]) {
      used.add(index);
      return refined[index].region;
    }
    const idx = refined.findIndex((r, i) => !used.has(i) && (
      norm(r.name) === norm(orig.name)
      || (norm(orig.name).length >= 2 && norm(r.name).includes(norm(orig.name)))
      || (norm(r.name).length >= 2 && norm(orig.name).includes(norm(r.name)))
    ));
    if (idx >= 0) {
      used.add(idx);
      return refined[idx].region;
    }
    if (refined.length === 1 && original.length > 1) {
      return undefined;
    }
    return undefined;
  };

  const merged = original.map((orig, index) => {
    const region = pickMatch(orig, index);
    return region ? { name: orig.name, region } : orig;
  });

  return stabilizeFoodRegions(original, merged);
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
