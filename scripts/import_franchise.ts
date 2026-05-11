// T-069 Phase 1C: 외식 프랜차이즈 메뉴 import.
// 자동 크롤러는 사이트별 구조 분석 + production 검증이 별도 큰 작업이라 본 스크립트는
// **수동 JSON 입력 파이프라인**만 제공. ./data/franchise/<brand>.json 형식으로 두면 적재.
//
// JSON 형식 (배열):
// [
//   {
//     "brand": "스타벅스",
//     "name": "아메리카노 (Tall)",
//     "source_id": "starbucks-americano-tall",
//     "category": "음료",
//     "serving_grams": 355,
//     "calories": 10,
//     "protein": 0.6,
//     "carbs": 0,
//     "fat": 0,
//     "sodium": 5,
//     "url": "https://www.starbucks.co.kr/menu/drink_view.do?product_cd=..."
//   },
//   ...
// ]
//
// 자동 크롤링이 필요해지면 별도 모듈 (scripts/crawlers/<brand>.ts)로 분리.
// 각 사이트의 robots.txt 준수, rate limit 1초 이상, 사실 정보만 추출 (한국 저작권법 §35-5 정보분석 면책).
//
// 실행:
//   npm run import:franchise -- ./data/franchise/starbucks.json
//   (소스는 'franchise'로 고정, brand는 JSON 내부 필드)

import { createClient } from '@supabase/supabase-js';
import * as fs from 'node:fs';
import * as path from 'node:path';

interface FranchiseItem {
  brand: string;
  name: string;
  source_id?: string;
  category?: string;
  serving_grams?: number;
  calories?: number;
  protein?: number;
  carbs?: number;
  fat?: number;
  fiber?: number;
  sodium?: number;
  url?: string;
}

interface FoodRow {
  name: string;
  name_normalized: string;
  source: 'franchise';
  source_id: string | null;
  category: string | null;
  serving_grams: number | null;
  calories: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
  fiber: number | null;
  sodium: number | null;
  brand: string;
  metadata: Record<string, unknown>;
}

function normalize(s: string): string {
  return s.toLowerCase().trim().replace(/\s+/g, ' ');
}

function toRow(item: FranchiseItem): FoodRow | null {
  if (!item.brand || !item.name) return null;
  const sourceId = item.source_id ?? `${item.brand}-${item.name}`.replace(/\s+/g, '-').toLowerCase();
  return {
    name: `${item.brand} ${item.name}`,            // brand 접두 — 'name + brand'로 매칭 풍부
    name_normalized: normalize(`${item.brand} ${item.name}`),
    source: 'franchise',
    source_id: sourceId,
    category: item.category ?? null,
    serving_grams: item.serving_grams ?? null,
    calories: item.calories ?? null,
    protein:  item.protein ?? null,
    carbs:    item.carbs ?? null,
    fat:      item.fat ?? null,
    fiber:    item.fiber ?? null,
    sodium:   item.sodium ?? null,
    brand: item.brand,
    metadata: {
      origin: 'franchise_manual',
      imported_at: new Date().toISOString(),
      ...(item.url ? { url: item.url } : {}),
    },
  };
}

async function main(): Promise<void> {
  const [, , filePath] = process.argv;
  if (!filePath) {
    console.error('Usage: npm run import:franchise -- <file.json>');
    process.exit(1);
  }
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY env가 필요합니다.');
    process.exit(1);
  }

  const supabase = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const absPath = path.resolve(filePath);
  const raw = fs.readFileSync(absPath, 'utf-8');
  const items = JSON.parse(raw) as FranchiseItem[];
  if (!Array.isArray(items)) {
    console.error('입력 파일은 FranchiseItem 배열이어야 합니다.');
    process.exit(1);
  }

  const rows = items.map(toRow).filter((r): r is FoodRow => r !== null);
  console.log(`총 ${rows.length}건 파싱 완료. Supabase upsert 시작…`);

  const BATCH = 500;
  let ok = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const { error } = await supabase
      .from('foods')
      .upsert(batch, { onConflict: 'source,source_id' });
    if (error) {
      console.error(`[batch ${i}] 실패:`, error.message);
    } else {
      ok += batch.length;
      console.log(`[batch ${i + batch.length} / ${rows.length}] 적재 완료`);
    }
  }
  console.log(`완료: ${ok}건 / ${rows.length}건 적재.`);
}

void main();
