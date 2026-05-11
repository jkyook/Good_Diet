import { createClient } from '@supabase/supabase-js';
import { AnalysisMode, AIProvider, MealType } from './geminiService';
import type { MealRecord } from '../types';

// ── 타입 정의 ──────────────────────────────────────────────────────────────────

export interface SupabaseUser {
  id: string;
  email: string;
}

export type { MealRecord };

// ── 환경변수 & 가용성 ──────────────────────────────────────────────────────────

const SUPABASE_URL      = process.env.VITE_SUPABASE_URL  as string | undefined;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const SUPABASE_AVAILABLE = !!(SUPABASE_URL && SUPABASE_ANON_KEY);

// ── 클라이언트 초기화 ──────────────────────────────────────────────────────────

const supabase = SUPABASE_AVAILABLE
  ? createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!)
  : null;

// ── 에러 메시지 한국어 변환 ────────────────────────────────────────────────────

function localizeAuthError(message: string): string {
  if (message.includes('Invalid login credentials')) {
    return '이메일 또는 비밀번호가 올바르지 않습니다.';
  }
  if (message.includes('User already registered')) {
    return '이미 등록된 이메일입니다.';
  }
  if (message.includes('Password should be at least 6 characters')) {
    return '비밀번호는 6자 이상이어야 합니다.';
  }
  return message;
}

// ── 인증 함수 ──────────────────────────────────────────────────────────────────

export async function signUp(
  email: string,
  password: string,
): Promise<{ user: SupabaseUser | null; error: string | null }> {
  if (!supabase) return { user: null, error: 'Supabase가 설정되지 않았습니다.' };

  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) return { user: null, error: localizeAuthError(error.message) };

  const u = data.user;
  if (!u) return { user: null, error: '회원가입에 실패했습니다.' };

  return { user: { id: u.id, email: u.email ?? email }, error: null };
}

export async function signIn(
  email: string,
  password: string,
): Promise<{ user: SupabaseUser | null; error: string | null }> {
  if (!supabase) return { user: null, error: 'Supabase가 설정되지 않았습니다.' };

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { user: null, error: localizeAuthError(error.message) };

  const u = data.user;
  if (!u) return { user: null, error: '로그인에 실패했습니다.' };

  return { user: { id: u.id, email: u.email ?? email }, error: null };
}

export async function signOut(): Promise<void> {
  if (!supabase) return;
  await supabase.auth.signOut();
}

export async function getSession(): Promise<SupabaseUser | null> {
  if (!supabase) return null;

  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session?.user) return null;

  const u = data.session.user;
  return { id: u.id, email: u.email ?? '' };
}

export async function getAccessToken(): Promise<string | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session?.access_token) return null;
  return data.session.access_token;
}

export function onAuthChange(
  callback: (user: SupabaseUser | null) => void,
): () => void {
  if (!supabase) return () => {};

  const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
    if (session?.user) {
      callback({ id: session.user.id, email: session.user.email ?? '' });
    } else {
      callback(null);
    }
  });

  return () => subscription.subscription.unsubscribe();
}

// ── DB 헬퍼: MealRecord → DB 행 ───────────────────────────────────────────────

function toRow(meal: MealRecord, userId: string) {
  return {
    id:               meal.id,
    user_id:          userId,
    food_name:        meal.foodName,
    calories:         meal.calories,
    protein:          meal.protein,
    carbs:            meal.carbs,
    fat:              meal.fat,
    meal_tip:         meal.mealTip,
    markdown:         meal.markdown,
    mode:             meal.mode,
    provider:         meal.provider,
    meal_type:        meal.mealType,
    image:            meal.image,
    analyzed_at:      meal.date,
    portion_count:    meal.portionCount ?? 1,
    matched_food_id:  meal.matchedFoodId ?? null,
    match_similarity: meal.matchSimilarity ?? null,
    category:         meal.category,
    cooking_method:   meal.cookingMethod,
    sauce:            meal.sauce,
    weight_grams:     meal.weightGrams,
    is_ambiguous:     meal.isAmbiguous,
    candidates:       meal.candidates ?? null,
    ingredients:      meal.ingredients ?? null,
    portion_estimate: meal.portionEstimate ?? null,
    totals:           meal.totals ?? null,
    meal_score:       meal.mealScore ?? null,
    improvements:     meal.improvements ?? null,
    warnings:         meal.warnings ?? null,
    detected_foods:   meal.detectedFoods ?? null,
    confidence:       meal.confidence ?? null,
    recommendations:  meal.recommendations ?? null,
  };
}

// ── DB 헬퍼: DB 행 → MealRecord ───────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fromRow(row: Record<string, any>): MealRecord {
  return {
    id:              row.id,
    date:            row.analyzed_at,
    foodName:        row.food_name,
    calories:        row.calories,
    protein:         row.protein,
    carbs:           row.carbs,
    fat:             row.fat,
    mealTip:         row.meal_tip,
    markdown:        row.markdown,
    mode:            row.mode as AnalysisMode,
    provider:        row.provider as AIProvider,
    mealType:        row.meal_type as MealType,
    image:           row.image,
    portionCount:    row.portion_count ?? 1,
    matchedFoodId:   row.matched_food_id ?? null,
    matchSimilarity: row.match_similarity ?? null,
    category:        row.category ?? '기타',
    cookingMethod:   row.cooking_method ?? '',
    sauce:           row.sauce ?? '없음',
    weightGrams:     row.weight_grams ?? 0,
    isAmbiguous:     row.is_ambiguous ?? false,
    candidates:      row.candidates ?? undefined,
    ingredients:     row.ingredients ?? undefined,
    portionEstimate: row.portion_estimate ?? undefined,
    totals:          row.totals ?? undefined,
    mealScore:       row.meal_score ?? undefined,
    improvements:    row.improvements ?? undefined,
    warnings:        row.warnings ?? undefined,
    detectedFoods:   row.detected_foods ?? undefined,
    confidence:      row.confidence ?? undefined,
    recommendations: row.recommendations ?? undefined,
  };
}

// ── DB 함수 ────────────────────────────────────────────────────────────────────

export async function saveMeal(
  meal: MealRecord,
  userId: string,
): Promise<{ error: string | null }> {
  if (!supabase) return { error: 'Supabase가 설정되지 않았습니다.' };

  const { error } = await supabase
    .from('meal_history')
    .upsert(toRow(meal, userId));

  return { error: error ? error.message : null };
}

export async function loadHistory(userId: string): Promise<MealRecord[]> {
  if (!supabase) return [];

  const { data, error } = await supabase
    .from('meal_history')
    .select('*')
    .eq('user_id', userId)
    .order('analyzed_at', { ascending: false });

  if (error || !data) return [];

  return data.map(fromRow);
}

// T-073 DB 매칭 정정 신고 — food_match_corrections INSERT.
// RLS INSERT WITH CHECK (user_id = auth.uid()) — anon 클라가 JWT 가진 상태에서 호출. 비로그인은 거부.
export async function reportMatchCorrection(input: {
  meal_history_id?: string | null;
  ai_result_food_name: string;
  matched_food_id?: string | null;
  user_correction: string;
  reason?: string | null;
}): Promise<{ error: string | null }> {
  if (!supabase) return { error: 'Supabase가 설정되지 않았습니다.' };

  // 현재 세션의 user.id를 직접 채워 RLS WITH CHECK 통과 보장.
  const { data: session } = await supabase.auth.getSession();
  const userId = session?.session?.user?.id;
  if (!userId) return { error: '로그인이 필요합니다.' };

  const { error } = await supabase.from('food_match_corrections').insert({
    user_id: userId,
    meal_history_id: input.meal_history_id ?? null,
    ai_result_food_name: input.ai_result_food_name,
    matched_food_id: input.matched_food_id ?? null,
    user_correction: input.user_correction,
    // reason은 metadata에 보관 (스키마 단순화 — 컬럼 없이 jsonb 미사용)
    // 단 본 스키마는 reason 컬럼 없음 → user_correction에 prefix로 포함 (단순화)
    ...(input.reason ? { user_correction: `[${input.reason}] ${input.user_correction}` } : {}),
    status: 'pending',
  });

  return { error: error ? error.message : null };
}

// 계정 정보 (age/gender) 업데이트 — T-061.
// RLS UPDATE policy (users_update_own_safe)로 자기 행만 가능.
// REVOKE는 role/cal_balance/daily_usage_* 한정이라 age/gender는 자유 update OK.
export async function updateAccount(
  userId: string,
  patch: { age?: number | null; gender?: 'male' | 'female' | null },
): Promise<{ error: string | null }> {
  if (!supabase) return { error: 'Supabase가 설정되지 않았습니다.' };

  const row: Record<string, unknown> = {};
  if (patch.age !== undefined) row.age = patch.age;
  if (patch.gender !== undefined) row.gender = patch.gender;

  if (Object.keys(row).length === 0) return { error: null };

  const { error } = await supabase
    .from('users')
    .update(row)
    .eq('id', userId);

  return { error: error ? error.message : null };
}

// 식사 분류 편집 — mealType / date만 (RLS + GRANT로 컬럼 화이트리스트 보호).
// 다른 컬럼은 patch에 넣어도 무시됨.
export async function updateMealClassification(
  mealId: string,
  patch: { mealType?: MealType; date?: string },
): Promise<{ error: string | null }> {
  if (!supabase) return { error: 'Supabase가 설정되지 않았습니다.' };

  const row: Record<string, unknown> = {};
  if (patch.mealType !== undefined) row.meal_type = patch.mealType;
  if (patch.date !== undefined) row.analyzed_at = patch.date;

  if (Object.keys(row).length === 0) return { error: null };

  const { error } = await supabase
    .from('meal_history')
    .update(row)
    .eq('id', mealId);

  return { error: error ? error.message : null };
}

export async function deleteMeal(
  mealId: string,
): Promise<{ error: string | null }> {
  if (!supabase) return { error: 'Supabase가 설정되지 않았습니다.' };

  const { error } = await supabase
    .from('meal_history')
    .delete()
    .eq('id', mealId);

  return { error: error ? error.message : null };
}

export async function clearHistory(
  userId: string,
): Promise<{ error: string | null }> {
  if (!supabase) return { error: 'Supabase가 설정되지 않았습니다.' };

  const { error } = await supabase
    .from('meal_history')
    .delete()
    .eq('user_id', userId);

  return { error: error ? error.message : null };
}
