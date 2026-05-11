// T-069 Phase 1B: 식품 데이터 bulk import.
// 입력: CSV 또는 JSONL 파일 (./data/foods/*.csv 또는 *.jsonl)
// 출력: Supabase foods 테이블 (upsert by source + source_id)
//
// 실행:
//   1. .env에 SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY 설정 (또는 환경변수)
//   2. ./data/foods/ 에 입력 파일 둠 — 공공데이터포털 "식품영양성분 데이터"
//      https://www.data.go.kr/ → "식품영양성분" 검색 → 다운로드 (CSV)
//      EUC-KR 인코딩이면 UTF-8로 변환:  iconv -f EUC-KR -t UTF-8 source.csv > target.csv
//   3. npm run import:foods -- ./data/foods/your_file.csv public_data
//      (인자: 파일경로, source 라벨)
//
// 입력 형식 (CSV 헤더 한국어 — 공공데이터포털 표준):
//   식품명, 식품코드(옵션), 식품군, 1회제공량(g), 에너지(kcal),
//   단백질(g), 탄수화물(g), 지방(g), 식이섬유(g), 나트륨(mg)
//
// JSONL 형식 (한 줄당 한 객체):
//   {"name":"갈비구이","source_id":"...","category":"한식","serving_grams":150,
//    "calories":380,"protein":25,"carbs":12,"fat":22,"fiber":1,"sodium":680}

import { createClient } from '@supabase/supabase-js';
import { parse } from 'csv-parse/sync';
import * as fs from 'node:fs';
import * as path from 'node:path';

interface FoodRow {
  name: string;
  name_normalized: string;
  source: string;
  source_id: string | null;
  category: string | null;
  serving_grams: number | null;
  calories: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
  fiber: number | null;
  sodium: number | null;
  brand?: string | null;
  metadata: Record<string, unknown>;
}

function normalize(s: string): string {
  return s.toLowerCase().trim().replace(/\s+/g, ' ');
}

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

function intVal(v: unknown): number | null {
  const n = num(v);
  return n === null ? null : Math.round(n);
}

function str(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s ? s : null;
}

// CSV 한 행을 FoodRow로 매핑. 공공데이터포털 표준 컬럼명 + 변형 처리.
function fromCsvRow(row: Record<string, unknown>, source: string): FoodRow | null {
  const name = str(row['식품명'] ?? row['name'] ?? row['Food Name']);
  if (!name) return null;
  return {
    name,
    name_normalized: normalize(name),
    source,
    source_id: str(row['식품코드'] ?? row['source_id'] ?? row['code']),
    category: str(row['식품군'] ?? row['category'] ?? row['group']),
    serving_grams: intVal(row['1회제공량'] ?? row['serving_grams'] ?? row['serving']),
    calories: num(row['에너지(kcal)'] ?? row['에너지'] ?? row['calories'] ?? row['kcal']),
    protein:  num(row['단백질(g)']     ?? row['단백질']  ?? row['protein']),
    carbs:    num(row['탄수화물(g)']   ?? row['탄수화물'] ?? row['carbs']),
    fat:      num(row['지방(g)']       ?? row['지방']    ?? row['fat']),
    fiber:    num(row['식이섬유(g)']   ?? row['식이섬유'] ?? row['fiber']),
    sodium:   num(row['나트륨(mg)']    ?? row['나트륨']   ?? row['sodium']),
    metadata: { origin: source, imported_at: new Date().toISOString() },
  };
}

function fromJsonlLine(line: string, source: string): FoodRow | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  let obj: Record<string, unknown>;
  try { obj = JSON.parse(trimmed); } catch { return null; }
  const name = str(obj['name'] ?? obj['식품명']);
  if (!name) return null;
  return {
    name,
    name_normalized: normalize(name),
    source,
    source_id: str(obj['source_id'] ?? obj['식품코드']),
    category: str(obj['category'] ?? obj['식품군']),
    serving_grams: intVal(obj['serving_grams']),
    calories: num(obj['calories']),
    protein:  num(obj['protein']),
    carbs:    num(obj['carbs']),
    fat:      num(obj['fat']),
    fiber:    num(obj['fiber']),
    sodium:   num(obj['sodium']),
    brand: str(obj['brand']),
    metadata: { origin: source, imported_at: new Date().toISOString(), ...(obj['metadata'] as object ?? {}) },
  };
}

async function main(): Promise<void> {
  const [, , filePath, sourceArg] = process.argv;
  if (!filePath || !sourceArg) {
    console.error('Usage: npm run import:foods -- <file.csv|.jsonl> <source>');
    console.error('Example: npm run import:foods -- ./data/foods/public.csv public_data');
    process.exit(1);
  }
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY env가 필요합니다 (service role key).');
    process.exit(1);
  }

  const supabase = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const absPath = path.resolve(filePath);
  const raw = fs.readFileSync(absPath, 'utf-8');
  const ext = path.extname(absPath).toLowerCase();

  let rows: FoodRow[] = [];
  if (ext === '.csv') {
    const parsed = parse(raw, { columns: true, skip_empty_lines: true, trim: true }) as Record<string, unknown>[];
    rows = parsed.map(r => fromCsvRow(r, sourceArg)).filter((r): r is FoodRow => r !== null);
  } else if (ext === '.jsonl' || ext === '.ndjson') {
    rows = raw.split('\n').map(l => fromJsonlLine(l, sourceArg)).filter((r): r is FoodRow => r !== null);
  } else if (ext === '.json') {
    const arr = JSON.parse(raw) as Record<string, unknown>[];
    rows = arr.map(r => fromJsonlLine(JSON.stringify(r), sourceArg)).filter((r): r is FoodRow => r !== null);
  } else {
    console.error(`지원하지 않는 형식: ${ext}. .csv/.jsonl/.json만 지원.`);
    process.exit(1);
  }

  console.log(`총 ${rows.length}건 파싱 완료. Supabase upsert 시작 (배치 1000)…`);

  const BATCH = 1000;
  let ok = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const { error } = await supabase
      .from('foods')
      .upsert(batch, { onConflict: 'source,source_id', ignoreDuplicates: false });
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
