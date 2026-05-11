// T-070b: 롯데리아 영양성분표 크롤러.
//
// 출처: https://www.lotteeatz.com/upload/stg/etc/ria/items.html (정적 HTML, robots.txt Allow: /)
// 라이선스: 사실 정보(영양 수치)는 저작권 X (한국 저작권법 §35-5 정보분석 면책).
//           출처 URL을 metadata.url에 보존.
//
// 표 구조: <tbody> 단위 카테고리(<th rowspan>) + 메뉴 행 N개.
// 컬럼 (10 td): 메뉴명/알레르기/중량(g)/열량(kcal)/단백질(g)/나트륨(mg)/당류(g)/포화지방(g)/카페인(mg)/원산지
// '버거세트' 카테고리는 영양값을 colspan=6 범위 텍스트("715kcal ~ 1400kcal")로 표시 → 제외.

import * as cheerio from 'cheerio';
import type { FranchiseItem } from '../crawl_franchise.js';

const URL_TARGET = 'https://www.lotteeatz.com/upload/stg/etc/ria/items.html';
const BRAND = '롯데리아';

function num(v: string | null | undefined): number | null {
  if (!v) return null;
  const m = v.match(/[\d.]+/);
  if (!m) return null;
  const n = parseFloat(m[0]);
  return Number.isFinite(n) ? n : null;
}

export async function crawl(): Promise<FranchiseItem[]> {
  const res = await fetch(URL_TARGET, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; fatguard-import/1.0; +https://good-diet.vercel.app)',
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();
  const $ = cheerio.load(html);

  const items: FranchiseItem[] = [];

  $('tbody').each((_, tb) => {
    const cat = $(tb).find('th').first().text().trim().replace(/\s+/g, ' ');
    // 세트(영양 범위) 카테고리는 제외 — 단일 메뉴만
    if (/세트/.test(cat)) return;

    $(tb).find('tr').each((_, tr) => {
      const tds = $(tr).find('td');
      // 카테고리 첫 row는 td 10개, 그 외도 동일. colspan으로 묶인 row(<td colspan=6>)는 td 개수 부족.
      if (tds.length < 10) return;

      const name = $(tds[0]).text().trim().replace(/\s+/g, ' ');
      if (!name) return;

      const allergen = $(tds[1]).text().trim();
      const weight = num($(tds[2]).text());
      const calories = num($(tds[3]).text());
      const protein = num($(tds[4]).text());
      const sodium = num($(tds[5]).text());
      // 당류 [6] / 포화지방 [7] / 카페인 [8] / 원산지 [9] — 본 시스템 컬럼에 일부만 매핑

      // 최소 검증: 메뉴명 + (열량 OR 중량)
      if (calories === null && weight === null) return;

      items.push({
        brand: BRAND,
        name,
        source_id: `lotteria-${name}`,
        category: cat,
        serving_grams: weight !== null ? Math.round(weight) : undefined,
        calories: calories ?? undefined,
        protein: protein ?? undefined,
        // carbs/fat는 롯데리아 표에 없음 → undefined
        sodium: sodium ?? undefined,
        url: URL_TARGET,
        // metadata 보조 — allergen, 당류/포화지방/카페인은 import_franchise.ts에서 metadata로 보존 가능
        // 본 인터페이스에 추가 컬럼 없어 metadata는 import 단계에서 매핑
        extra: {
          allergen: allergen || undefined,
          source_url: URL_TARGET,
        },
      });
    });
  });

  return items;
}
