import type { SupabaseClient } from '@supabase/supabase-js';
import { getServiceClient, isServiceAvailable } from './auth.js';
import type { AIProvider, AnalysisMode } from './types.js';
import type { AnalysisResult } from './parse.js';
import { resolveExternalNutrition, type ExternalNutritionMatch } from './externalNutrition.js';

export interface DbMatch {
  food_id: string;
  name: string;
  category: string | null;
  brand: string | null;
  similarity: number;
  matched_via: 'name' | 'alias';
}

export type AnalysisResultWithDbMatch = AnalysisResult & { dbMatch?: DbMatch };

interface TopFoodMatch {
  food_id: string;
  name: string;
  category: string | null;
  calories: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
  serving_grams: number | null;
  brand: string | null;
  matched_via: 'name' | 'alias';
  similarity: number;
}

interface ApplyFoodDbMatchOptions {
  userId?: string | null;
  provider: AIProvider;
  mode: AnalysisMode;
  logPrefix: string;
}

const AUTO_MATCH_THRESHOLD = 0.7;

export async function applyFoodDbMatch(
  result: AnalysisResult,
  opts: ApplyFoodDbMatchOptions,
): Promise<{ result: AnalysisResultWithDbMatch; dbMatch?: DbMatch }> {
  if (!isServiceAvailable()) return { result };

  const supabase = getServiceClient();
  try {
    const { data: matches } = await supabase.rpc('match_food_with_aliases', {
      p_query: result.foodName,
      p_limit: 1,
      p_min_similarity: 0.5,
    });
    const top = Array.isArray(matches) && matches.length > 0
      ? matches[0] as TopFoodMatch
      : null;

    if (!top || top.similarity <= AUTO_MATCH_THRESHOLD) {
      const external = await tryExternalNutrition(result, opts);
      if (external) return external;
      await logFoodMatchMiss(supabase, result.foodName, top, opts);
      return { result };
    }

    const dbMatch: DbMatch = {
      food_id: top.food_id,
      name: top.name,
      category: top.category,
      brand: top.brand,
      similarity: top.similarity,
      matched_via: top.matched_via,
    };
    const preserveLabelNutrition =
      result.analysisSource === 'nutrition_label' ||
      result.analysisSource === 'package_label';
    return {
      dbMatch,
      result: {
        ...result,
        dbMatch,
        calories: preserveLabelNutrition ? result.calories : top.calories ?? result.calories,
        protein: preserveLabelNutrition ? result.protein : top.protein ?? result.protein,
        carbs: preserveLabelNutrition ? result.carbs : top.carbs ?? result.carbs,
        fat: preserveLabelNutrition ? result.fat : top.fat ?? result.fat,
        weightGrams: preserveLabelNutrition ? result.weightGrams : top.serving_grams ?? result.weightGrams,
      },
    };
  } catch (e) {
    console.warn(`[${opts.logPrefix}] DB match skipped:`, e instanceof Error ? e.message : String(e));
    return { result };
  }
}

async function tryExternalNutrition(
  result: AnalysisResult,
  opts: ApplyFoodDbMatchOptions,
): Promise<{ result: AnalysisResultWithDbMatch } | null> {
  if (result.analysisSource === 'nutrition_label' || result.analysisSource === 'package_label') {
    return null;
  }

  try {
    const external = await resolveExternalNutrition(result.foodName);
    if (!external) return null;
    await logExternalNutritionSource(result.foodName, external, opts);
    return {
      result: {
        ...result,
        analysisSource: 'external_source',
        foodName: external.name || result.foodName,
        calories: external.calories ?? result.calories,
        protein: external.protein ?? result.protein,
        carbs: external.carbs ?? result.carbs,
        fat: external.fat ?? result.fat,
        weightGrams: external.servingGrams ?? (external.basis === '100g' ? 100 : result.weightGrams),
        totals: {
          calories: external.calories ?? result.totals?.calories ?? result.calories,
          protein: external.protein ?? result.totals?.protein ?? result.protein,
          carbs: external.carbs ?? result.totals?.carbs ?? result.carbs,
          fat: external.fat ?? result.totals?.fat ?? result.fat,
          sodium: external.sodium ?? result.totals?.sodium ?? 0,
        },
        warnings: [
          ...(result.warnings ?? []),
          `외부 공개 데이터(${external.provider}) 기준으로 보정했습니다.`,
        ],
      },
    };
  } catch (e) {
    console.warn(`[${opts.logPrefix}] external nutrition skipped:`, e instanceof Error ? e.message : String(e));
    return null;
  }
}

async function logFoodMatchMiss(
  supabase: SupabaseClient,
  query: string,
  top: TopFoodMatch | null,
  opts: ApplyFoodDbMatchOptions,
) {
  try {
    const { error } = await supabase.from('food_match_misses').insert({
      user_id: opts.userId ?? null,
      query,
      top_food_id: top?.food_id ?? null,
      top_name: top?.name ?? null,
      top_brand: top?.brand ?? null,
      top_similarity: top?.similarity ?? null,
      provider: opts.provider,
      mode: opts.mode,
    });
    if (error && error.code !== '42P01') {
      console.warn(`[${opts.logPrefix}] match miss log failed:`, error.message);
    }
  } catch (e) {
    console.warn(`[${opts.logPrefix}] match miss log skipped:`, e instanceof Error ? e.message : String(e));
  }
}

async function logExternalNutritionSource(
  query: string,
  external: ExternalNutritionMatch,
  opts: ApplyFoodDbMatchOptions,
) {
  try {
    const supabase = getServiceClient();
    const { error } = await supabase.from('external_nutrition_sources').insert({
      user_id: opts.userId ?? null,
      query,
      provider: external.provider,
      external_id: external.externalId,
      source_url: external.sourceUrl,
      name: external.name,
      brand: external.brand,
      score: external.score,
      basis: external.basis,
      calories: external.calories,
      protein: external.protein,
      carbs: external.carbs,
      fat: external.fat,
      sodium: external.sodium,
      serving_grams: external.servingGrams,
      mode: opts.mode,
      ai_provider: opts.provider,
    });
    if (error && error.code !== '42P01') {
      console.warn(`[${opts.logPrefix}] external nutrition log failed:`, error.message);
    }
  } catch (e) {
    console.warn(`[${opts.logPrefix}] external nutrition log skipped:`, e instanceof Error ? e.message : String(e));
  }
}
