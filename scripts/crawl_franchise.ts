// T-070b: 외식 프랜차이즈 크롤러 CLI.
//
// 실행:
//   npm run crawl:franchise -- lotteria
//   npm run crawl:franchise -- all
//
// 출력: ./data/foods/franchise/<brand>.json (FranchiseItem[] 배열)
// 다음 단계: npm run import:franchise -- ./data/foods/franchise/<brand>.json
//
// 라이선스: 각 사이트 robots.txt 준수, rate limit 1~2초, 사실 정보(영양 수치)만 추출,
//          한국 저작권법 §35-5 정보분석 면책. 출처 URL은 metadata에 보존.

import * as fs from 'node:fs';
import * as path from 'node:path';

export interface FranchiseItem {
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
  /** crawler가 metadata에 추가로 보존할 임의 필드 (allergen, source_url 등) */
  extra?: Record<string, unknown>;
}

const REGISTRY: Record<string, () => Promise<FranchiseItem[]>> = {
  lotteria:   async () => (await import('./crawlers/lotteria.js')).crawl(),
  mcdonalds:  async () => (await import('./crawlers/mcdonalds.js')).crawl(),
  mega:       async () => (await import('./crawlers/mega.js')).crawl(),
};

const OUT_DIR = './data/foods/franchise';

async function runOne(brand: string): Promise<void> {
  const fn = REGISTRY[brand];
  if (!fn) {
    console.error(`Unknown brand: ${brand}. Available: ${Object.keys(REGISTRY).join(', ')}`);
    process.exit(1);
  }
  console.log(`[${brand}] 크롤링 시작…`);
  const t0 = Date.now();
  const items = await fn();
  console.log(`[${brand}] ${items.length}건 추출 (${((Date.now() - t0) / 1000).toFixed(1)}s)`);

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const outPath = path.join(OUT_DIR, `${brand}.json`);
  fs.writeFileSync(outPath, JSON.stringify(items, null, 2), 'utf-8');
  console.log(`[${brand}] 저장: ${outPath}`);
}

async function main(): Promise<void> {
  const [, , target] = process.argv;
  if (!target) {
    console.error('Usage: npm run crawl:franchise -- <brand|all>');
    console.error(`Brands: ${Object.keys(REGISTRY).join(', ')}`);
    process.exit(1);
  }

  if (target === 'all') {
    for (const brand of Object.keys(REGISTRY)) {
      try { await runOne(brand); }
      catch (e) { console.error(`[${brand}] 실패:`, e instanceof Error ? e.message : String(e)); }
      // rate limit: 브랜드 간 2초 간격
      await new Promise(r => setTimeout(r, 2000));
    }
  } else {
    await runOne(target);
  }
}

void main();
