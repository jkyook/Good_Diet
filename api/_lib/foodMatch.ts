import type { SupabaseClient } from '@supabase/supabase-js';
import { getServiceClient, isServiceAvailable } from './auth.js';
import type { AIProvider, AnalysisMode } from './types.js';
import type { AnalysisResult } from './parse.js';

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
