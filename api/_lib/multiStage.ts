/**
 * 0단계(클라이언트): 분석용 이미지 정규화 + 크기 메타
 * 1단계: 음식 영역 감지 → 1.5 bbox 보정 → 2 영역별 영양 분석
 */
import type { AIProvider, AnalysisMode } from './types.js';
import { callProviderWithSystem } from './providers.js';
import {
  FOOD_DETECT_SYSTEM,
  buildFoodDetectUser,
  FOOD_ANALYSIS_SYSTEM,
  buildSegmentAnalysisPrompt,
} from './prompt.js';
import {
  parseResult,
  parseFoodDetection,
  mergeSegmentResults,
  JSONParseError,
  type AnalysisResult,
  type DetectedFoodItem,
} from './parse.js';
import { refineFoodRegions } from './bboxRefine.js';

export const MAX_FOOD_SEGMENTS = 6;

export interface StagedAnalysisParams {
  age: number;
  gender: 'male' | 'female';
  existingMealsCount: number;
  imageWidth: number;
  imageHeight: number;
}

async function detectAndRefine(
  provider: AIProvider,
  base64Data: string,
  mode: AnalysisMode,
  imageWidth: number,
  imageHeight: number,
  onProgress?: (detail: string) => void,
) {
  const detectText = await callProviderWithSystem(
    provider,
    FOOD_DETECT_SYSTEM,
    base64Data,
    buildFoodDetectUser(imageWidth, imageHeight),
    mode,
    768,
  );
  const detection = parseFoodDetection(detectText);
  let items = detection.items.slice(0, MAX_FOOD_SEGMENTS);

  if (items.length > 0) {
    onProgress?.('음식 영역 위치 보정 중…');
    items = await refineFoodRegions(provider, base64Data, items, mode, imageWidth, imageHeight);
  }

  return { detection, items };
}

function attachImageMeta(result: AnalysisResult, width: number, height: number): AnalysisResult {
  return { ...result, imageWidth: width, imageHeight: height };
}

export async function runStagedAnalysis(
  provider: AIProvider,
  base64Data: string,
  userPrompt: string,
  mode: AnalysisMode,
  profile: StagedAnalysisParams,
  onProgress?: (detail: string) => void,
): Promise<AnalysisResult> {
  const { imageWidth, imageHeight } = profile;

  onProgress?.(`분석용 ${imageWidth}×${imageHeight}px — 음식 영역 감지`);
  let detection;
  let items: DetectedFoodItem[];
  try {
    ({ detection, items } = await detectAndRefine(
      provider, base64Data, mode, imageWidth, imageHeight, onProgress,
    ));
  } catch (err) {
    console.warn('[multiStage] 1단계 감지 실패, 단일 분석으로 폴백:', err);
    return attachImageMeta(
      await runSingleAnalysis(provider, base64Data, userPrompt, mode),
      imageWidth,
      imageHeight,
    );
  }

  if (detection.sceneType === 'package_label' || items.length === 0) {
    onProgress?.(items.length === 0 ? '영역 미감지 — 전체 분석' : '포장/라벨 — 전체 분석');
    const single = attachImageMeta(
      await runSingleAnalysis(provider, base64Data, userPrompt, mode),
      imageWidth,
      imageHeight,
    );
    if (items.length === 1 && items[0].region) {
      single.foodSegments = [segmentFromItem(items[0], single)];
      single.detectedFoods = items.map(i => i.name);
    }
    return single;
  }

  if (items.length === 1) {
    onProgress?.(`"${items[0].name}" 상세 분석`);
    const segPrompt = buildSegmentAnalysisPrompt(
      items[0].name,
      items[0].region,
      profile.age,
      profile.gender,
      mode,
      profile.existingMealsCount + 1,
    );
    const text = await callProviderWithSystem(
      provider,
      FOOD_ANALYSIS_SYSTEM,
      base64Data,
      segPrompt,
      mode,
    );
    const parsed = attachImageMeta(parseResult(text, mode, provider), imageWidth, imageHeight);
    parsed.foodSegments = [segmentFromItem(items[0], parsed)];
    parsed.detectedFoods = [items[0].name];
    return parsed;
  }

  onProgress?.(`${items.length}개 음식 개별 분석 중…`);
  const segments: Array<{ item: DetectedFoodItem; result: AnalysisResult }> = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    onProgress?.(`(${i + 1}/${items.length}) ${item.name} 분석…`);
    const segPrompt = buildSegmentAnalysisPrompt(
      item.name,
      item.region,
      profile.age,
      profile.gender,
      mode,
      profile.existingMealsCount + 1 + i,
    );
    try {
      const text = await callProviderWithSystem(
        provider,
        FOOD_ANALYSIS_SYSTEM,
        base64Data,
        segPrompt,
        mode,
      );
      segments.push({ item, result: parseResult(text, mode, provider) });
    } catch (err) {
      console.error(`[multiStage] "${item.name}" 분석 실패:`, err);
    }
    if (i < items.length - 1) {
      await new Promise(r => setTimeout(r, 200));
    }
  }

  if (segments.length === 0) {
    throw new JSONParseError('모든 음식 영역 분석에 실패했습니다.');
  }

  return attachImageMeta(mergeSegmentResults(segments, mode, provider), imageWidth, imageHeight);
}

async function runSingleAnalysis(
  provider: AIProvider,
  base64Data: string,
  userPrompt: string,
  mode: AnalysisMode,
): Promise<AnalysisResult> {
  const text = await callProviderWithSystem(
    provider,
    FOOD_ANALYSIS_SYSTEM,
    base64Data,
    userPrompt,
    mode,
  );
  return parseResult(text, mode, provider);
}

function segmentFromItem(
  item: DetectedFoodItem,
  result: AnalysisResult,
) {
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
}
