import { searchExternalNutritionCandidates } from '../api/_lib/externalNutrition.js';
import { diceSimilarity, normalizeFoodText } from '../api/_lib/nutritionText.js';

interface OffProduct {
  code?: string;
  product_name?: string;
  product_name_en?: string;
  brands?: string;
  nutriments?: Record<string, number | string | undefined>;
}

interface OffSearchResponse {
  products?: OffProduct[];
}

interface EvalCase {
  code: string;
  query: string;
  name: string;
  brand: string;
  calories100g: number;
  caloriesServing: number | null;
}

const TERMS = [
  'ramen', 'milk', 'coffee', 'yogurt', 'chocolate', 'chips', 'juice',
  'noodles', 'rice', 'cookie', 'cereal', 'sandwich', 'pizza', 'tea',
];

const SAMPLE_SIZE = Number(process.env.EVAL_SAMPLE_SIZE ?? 30);
const USER_AGENT = 'GoodDietFlavorGuardEval/1.0 (https://good-diet.vercel.app)';

async function main() {
  const cases = await sampleCases(SAMPLE_SIZE);
  if (cases.length === 0) {
    throw new Error('평가 샘플을 가져오지 못했습니다.');
  }

  const rows = [];
  let exactCode = 0;
  let nameHit = 0;
  let nutritionClose = 0;
  let resolved = 0;

  for (const c of cases) {
    const candidates = await searchExternalNutritionCandidates(c.query, 10).catch(() => []);
    const r = candidates[0] ?? null;
    const codeHit = r?.externalId === c.code;
    const nameSim = r ? diceSimilarity(c.name, r.name) : 0;
    const expectedKcal = r?.basis === 'serving' && c.caloriesServing != null
      ? c.caloriesServing
      : c.calories100g;
    const kcalDelta = r?.calories != null ? Math.abs(r.calories - expectedKcal) : null;
    const kcalOk = kcalDelta != null && Math.max(kcalDelta, 0) <= Math.max(10, expectedKcal * 0.1);

    if (r) resolved++;
    if (codeHit) exactCode++;
    if (nameSim >= 0.85) nameHit++;
    if (kcalOk) nutritionClose++;

    rows.push({
      query: c.query,
      expectedCode: c.code,
      foundCode: r?.externalId ?? '-',
      expectedName: c.name,
      foundName: r?.name ?? '-',
      score: r?.score.toFixed(3) ?? '-',
      nameSim: nameSim.toFixed(3),
      expectedKcal,
      foundKcal: r?.calories ?? '-',
      basis: r?.basis ?? '-',
      kcalDelta: kcalDelta?.toFixed(1) ?? '-',
      codeHit,
      kcalOk,
    });
    await new Promise(r => setTimeout(r, 250));
  }

  console.table(rows);
  console.log(JSON.stringify({
    sampleSize: cases.length,
    resolved,
    resolveRate: pct(resolved, cases.length),
    exactCode,
    exactCodeAccuracy: pct(exactCode, cases.length),
    nameHit,
    nameAccuracy: pct(nameHit, cases.length),
    nutritionClose,
    nutritionAccuracy: pct(nutritionClose, cases.length),
  }, null, 2));
}

async function sampleCases(limit: number): Promise<EvalCase[]> {
  const cases: EvalCase[] = [];
  const seen = new Set<string>();

  for (const term of shuffle(TERMS)) {
    if (cases.length >= limit) break;
    const products = await searchOpenFoodFacts(term, 30);
    for (const p of shuffle(products)) {
      if (cases.length >= limit) break;
      const code = p.code;
      const name = p.product_name || p.product_name_en || '';
      const calories100g = numberField(p.nutriments, 'energy-kcal_100g');
      if (!code || seen.has(code) || !name || calories100g == null) continue;
      seen.add(code);
      const brand = firstBrand(p.brands);
      cases.push({
        code,
        name,
        brand,
        calories100g,
        caloriesServing: numberField(p.nutriments, 'energy-kcal_serving'),
        query: normalizeFoodText(`${brand} ${name}`),
      });
    }
  }

  return cases;
}

async function searchOpenFoodFacts(term: string, pageSize: number): Promise<OffProduct[]> {
  const url = new URL('https://world.openfoodfacts.org/cgi/search.pl');
  url.searchParams.set('search_terms', term);
  url.searchParams.set('search_simple', '1');
  url.searchParams.set('action', 'process');
  url.searchParams.set('json', '1');
  url.searchParams.set('page_size', String(pageSize));
  url.searchParams.set('fields', 'code,product_name,product_name_en,brands,nutriments');
  const res = await fetch(url, {
    headers: { 'Accept': 'application/json', 'User-Agent': USER_AGENT },
  });
  if (!res.ok) return [];
  const data = await res.json() as OffSearchResponse;
  return data.products ?? [];
}

function firstBrand(brands: string | undefined): string {
  return (brands ?? '').split(',').map(s => s.trim()).find(Boolean) ?? '';
}

function numberField(obj: Record<string, number | string | undefined> | undefined, key: string): number | null {
  const raw = obj?.[key];
  const n = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : NaN;
  return Number.isFinite(n) ? n : null;
}

function shuffle<T>(items: T[]): T[] {
  return [...items].sort(() => Math.random() - 0.5);
}

function pct(n: number, d: number): string {
  return `${((n / d) * 100).toFixed(1)}%`;
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
