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
    id:          meal.id,
    user_id:     userId,
    food_name:   meal.foodName,
    calories:    meal.calories,
    protein:     meal.protein,
    carbs:       meal.carbs,
    fat:         meal.fat,
    meal_tip:    meal.mealTip,
    markdown:    meal.markdown,
    mode:        meal.mode,
    provider:    meal.provider,
    meal_type:   meal.mealType,
    image:       meal.image,
    analyzed_at: meal.date,
  };
}

// ── DB 헬퍼: DB 행 → MealRecord ───────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fromRow(row: Record<string, any>): MealRecord {
  return {
    id:           row.id,
    date:         row.analyzed_at,
    foodName:     row.food_name,
    calories:     row.calories,
    protein:      row.protein,
    carbs:        row.carbs,
    fat:          row.fat,
    mealTip:      row.meal_tip,
    markdown:     row.markdown,
    mode:         row.mode as AnalysisMode,
    provider:     row.provider as AIProvider,
    mealType:     row.meal_type as MealType,
    image:        row.image,
    category:     row.category ?? '기타',
    cookingMethod: row.cooking_method ?? '',
    sauce:        row.sauce ?? '없음',
    weightGrams:  row.weight_grams ?? 0,
    isAmbiguous:  row.is_ambiguous ?? false,
    candidates:   row.candidates ?? undefined,
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
