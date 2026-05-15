import { diceSimilarity, normalizeFoodText, tokenOverlap } from './nutritionText.js';

export interface ExternalNutritionMatch {
  provider: 'openfoodfacts';
  externalId: string;
  sourceUrl: string;
  name: string;
  brand: string | null;
  score: number;
  calories: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
  sodium: number | null;
  servingGrams: number | null;
  basis: 'serving' | '100g';
}

interface OpenFoodFactsProduct {
  code?: string;
  product_name?: string;
  product_name_en?: string;
  product_name_ko?: string;
  brands?: string;
  quantity?: string;
  serving_size?: string;
  serving_quantity?: string | number;
  nutrition_data_per?: string;
  nutriments?: Record<string, number | string | undefined>;
}

interface OpenFoodFactsSearchResponse {
  products?: OpenFoodFactsProduct[];
}

interface OpenFoodFactsProductResponse {
  status?: number;
  product?: OpenFoodFactsProduct;
}

const OFF_SEARCH_URL = 'https://world.openfoodfacts.org/cgi/search.pl';
const OFF_PRODUCT_URL = 'https://world.openfoodfacts.org/api/v2/product';
const USER_AGENT = 'GoodDietFlavorGuard/1.0 (https://good-diet.vercel.app)';
const MIN_EXTERNAL_SCORE = 0.82;

export async function resolveExternalNutrition(query: string): Promise<ExternalNutritionMatch | null> {
  const cleanQuery = normalizeFoodText(query);
  if (cleanQuery.length < 2) return null;

  const url = new URL(OFF_SEARCH_URL);
  url.searchParams.set('search_terms', cleanQuery);
  url.searchParams.set('search_simple', '1');
  url.searchParams.set('action', 'process');
  url.searchParams.set('json', '1');
  url.searchParams.set('page_size', '10');
  url.searchParams.set('fields', [
    'code',
    'product_name',
    'product_name_en',
    'product_name_ko',
    'brands',
    'quantity',
    'serving_size',
    'serving_quantity',
    'nutrition_data_per',
    'nutriments',
  ].join(','));

  const res = await fetchWithRetry(url);
  if (!res.ok) throw new Error(`Open Food Facts search failed: HTTP ${res.status}`);

  const data = await res.json() as OpenFoodFactsSearchResponse;
  const candidates = (data.products ?? [])
    .map(p => toExternalMatch(query, p))
    .filter((m): m is ExternalNutritionMatch => !!m)
    .sort((a, b) => b.score - a.score);

  const best = candidates[0] ?? null;
  return best && best.score >= MIN_EXTERNAL_SCORE ? best : null;
}

export async function resolveExternalNutritionByBarcode(barcode: string): Promise<ExternalNutritionMatch | null> {
  const code = barcode.replace(/\D/g, '');
  if (code.length < 8 || code.length > 14) return null;

  const url = new URL(`${OFF_PRODUCT_URL}/${encodeURIComponent(code)}.json`);
  url.searchParams.set('fields', [
    'code',
    'product_name',
    'product_name_en',
    'product_name_ko',
    'brands',
    'quantity',
    'serving_size',
    'serving_quantity',
    'nutrition_data_per',
    'nutriments',
  ].join(','));

  const res = await fetchWithRetry(url);
  if (!res.ok) return null;

  const data = await res.json() as OpenFoodFactsProductResponse;
  if (data.status === 0 || !data.product) return null;
  return toExternalMatch('', data.product, 1);
}

async function fetchWithRetry(url: URL, attempts = 2): Promise<Response> {
  let last: Response | null = null;
  for (let i = 0; i < attempts; i++) {
    const res = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': USER_AGENT,
      },
    });
    if (res.ok || (res.status !== 429 && res.status < 500)) return res;
    last = res;
    await new Promise(r => setTimeout(r, 500 * (i + 1)));
  }
  return last!;
}

export async function searchExternalNutritionCandidates(query: string, pageSize = 10): Promise<ExternalNutritionMatch[]> {
  const cleanQuery = normalizeFoodText(query);
  if (cleanQuery.length < 2) return [];

  const url = new URL(OFF_SEARCH_URL);
  url.searchParams.set('search_terms', cleanQuery);
  url.searchParams.set('search_simple', '1');
  url.searchParams.set('action', 'process');
  url.searchParams.set('json', '1');
  url.searchParams.set('page_size', String(pageSize));
  url.searchParams.set('fields', [
    'code',
    'product_name',
    'product_name_en',
    'product_name_ko',
    'brands',
    'quantity',
    'serving_size',
    'serving_quantity',
    'nutrition_data_per',
    'nutriments',
  ].join(','));

  const res = await fetchWithRetry(url);
  if (!res.ok) return [];
  const data = await res.json() as OpenFoodFactsSearchResponse;
  return (data.products ?? [])
    .map(p => toExternalMatch(query, p))
    .filter((m): m is ExternalNutritionMatch => !!m)
    .sort((a, b) => b.score - a.score);
}

function toExternalMatch(query: string, product: OpenFoodFactsProduct, scoreOverride?: number): ExternalNutritionMatch | null {
  const name = pickProductName(product);
  const code = product.code;
  if (!name || !code) return null;

  const nutriments = product.nutriments ?? {};
  const perServing = hasServingNutrition(nutriments);
  const calories = pickNumber(nutriments, perServing ? ['energy-kcal_serving'] : ['energy-kcal_100g', 'energy-kcal']);
  const protein = pickNumber(nutriments, perServing ? ['proteins_serving'] : ['proteins_100g', 'proteins']);
  const carbs = pickNumber(nutriments, perServing ? ['carbohydrates_serving'] : ['carbohydrates_100g', 'carbohydrates']);
  const fat = pickNumber(nutriments, perServing ? ['fat_serving'] : ['fat_100g', 'fat']);
  const sodium = pickNumber(nutriments, perServing ? ['sodium_serving'] : ['sodium_100g', 'sodium']);
  if (calories == null && protein == null && carbs == null && fat == null) return null;

  const brand = firstBrand(product.brands);
  const score = scoreOverride ?? scoreProduct(query, name, brand);
  return {
    provider: 'openfoodfacts',
    externalId: code,
    sourceUrl: `https://world.openfoodfacts.org/product/${encodeURIComponent(code)}`,
    name,
    brand,
    score,
    calories,
    protein,
    carbs,
    fat,
    sodium: sodium == null ? null : Math.round(sodium * 1000), // OFF sodium is usually grams.
    servingGrams: parseServingGrams(product.serving_quantity ?? product.serving_size ?? product.quantity),
    basis: perServing ? 'serving' : '100g',
  };
}

function pickProductName(product: OpenFoodFactsProduct): string {
  return product.product_name_ko || product.product_name || product.product_name_en || '';
}

function firstBrand(brands: string | undefined): string | null {
  const brand = (brands ?? '').split(',').map(s => s.trim()).find(Boolean);
  return brand || null;
}

function hasServingNutrition(nutriments: Record<string, number | string | undefined>): boolean {
  return pickNumber(nutriments, ['energy-kcal_serving']) != null;
}

function pickNumber(obj: Record<string, number | string | undefined>, keys: string[]): number | null {
  for (const key of keys) {
    const raw = obj[key];
    const n = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : NaN;
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function parseServingGrams(value: string | number | undefined): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.round(value);
  if (!value) return null;
  const text = String(value).toLowerCase();
  const match = text.match(/(\d+(?:\.\d+)?)\s*(g|그램|ml|mL|밀리리터)?/i);
  if (!match) return null;
  const n = Number(match[1]);
  return Number.isFinite(n) ? Math.round(n) : null;
}

function scoreProduct(query: string, name: string, brand: string | null): number {
  const candidate = brand ? `${brand} ${name}` : name;
  const nameScore = diceSimilarity(query, name);
  const fullScore = diceSimilarity(query, candidate);
  const tokenScore = tokenOverlap(query, candidate);
  const containsBonus = normalizeFoodText(candidate).includes(normalizeFoodText(query)) ? 0.08 : 0;
  return Math.min(1, Math.max(nameScore, fullScore) * 0.72 + tokenScore * 0.20 + containsBonus);
}
