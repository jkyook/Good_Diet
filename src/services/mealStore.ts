import { AnalysisResult, MealType } from './geminiService';

export interface MealRecord {
  id: string;
  image: string;
  mealType: MealType;
  analysis: AnalysisResult;
  createdAt: string; // ISO string
  date: string;      // YYYY-MM-DD
}

export interface DayLog {
  date: string; // YYYY-MM-DD
  meals: MealRecord[];
}

const STORAGE_KEY = 'mummukji_meals';

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function load(): MealRecord[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
  } catch {
    return [];
  }
}

function save(records: MealRecord[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
}

// --- CRUD ---

export function addMeal(
  image: string,
  mealType: MealType,
  analysis: AnalysisResult,
  date: string = today(),
): MealRecord {
  const record: MealRecord = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    image,
    mealType,
    analysis,
    createdAt: new Date().toISOString(),
    date,
  };
  const all = load();
  all.push(record);
  save(all);
  return record;
}

export function updateMeal(id: string, patch: Partial<Pick<MealRecord, 'mealType' | 'analysis'>>): MealRecord | null {
  const all = load();
  const idx = all.findIndex(r => r.id === id);
  if (idx === -1) return null;
  all[idx] = { ...all[idx], ...patch };
  save(all);
  return all[idx];
}

export function deleteMeal(id: string): boolean {
  const all = load();
  const filtered = all.filter(r => r.id !== id);
  if (filtered.length === all.length) return false;
  save(filtered);
  return true;
}

export function getMealsByDate(date: string = today()): MealRecord[] {
  return load().filter(r => r.date === date);
}

export function getMealsByDateRange(from: string, to: string): MealRecord[] {
  return load().filter(r => r.date >= from && r.date <= to);
}

export function getAllDates(): string[] {
  const dates = new Set(load().map(r => r.date));
  return [...dates].sort().reverse();
}

export function clearDay(date: string = today()): void {
  const all = load().filter(r => r.date !== date);
  save(all);
}

// --- 집계 ---

export interface DaySummary {
  date: string;
  totalCalories: number;
  totalProtein: number;
  totalCarbs: number;
  totalFat: number;
  mealCount: number;
  byType: Record<MealType, MealRecord[]>;
}

export function getDaySummary(date: string = today()): DaySummary {
  const meals = getMealsByDate(date);
  const byType: Record<MealType, MealRecord[]> = {
    breakfast: [],
    lunch: [],
    dinner: [],
    snack: [],
  };
  let totalCalories = 0, totalProtein = 0, totalCarbs = 0, totalFat = 0;

  for (const m of meals) {
    byType[m.mealType].push(m);
    totalCalories += m.analysis.calories;
    totalProtein  += m.analysis.protein;
    totalCarbs    += m.analysis.carbs;
    totalFat      += m.analysis.fat;
  }

  return { date, totalCalories, totalProtein, totalCarbs, totalFat, mealCount: meals.length, byType };
}
