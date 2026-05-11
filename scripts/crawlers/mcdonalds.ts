// T-070b: 맥도날드 영양정보 크롤러 — **미구현** (Puppeteer 필요)
//
// 출처: https://www.mcdonalds.co.kr/kor/menu/information/nutrition
// 검사 결과: <table data-v-5772ca24> Vue SPA 마커, <tr> 1개 — 데이터 행이 JS로 동적 렌더.
// cheerio + fetch만으로는 못 긁음. Puppeteer / Playwright 필요.
//
// TODO (별도 티켓 권장):
//   1. puppeteer-core + @sparticuz/chromium (또는 playwright) 의존 추가 (~180MB Chromium)
//   2. page.goto(URL) + waitForSelector('table tbody tr')로 데이터 행 대기
//   3. page.evaluate로 DOM에서 영양 표 추출
//   4. rate limit 1~2초 + headless: true + 봇 차단 우회 X
//
// 라이선스: 사실 정보(영양 수치)는 저작권 X. 출처 URL 보존.

import type { FranchiseItem } from '../crawl_franchise.js';

export async function crawl(): Promise<FranchiseItem[]> {
  console.warn('[mcdonalds] crawler 미구현 — Vue SPA, Puppeteer 필요. 빈 결과 반환.');
  return [];
}
