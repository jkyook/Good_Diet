// T-070b: 메가커피 영양정보 크롤러 — **미구현** (OCR 필요)
//
// 출처: https://www.mega-mgccoffee.com/bbs/detail/?bbs_idx=198&bbs_category=1
// 검사 결과: 게시판 페이지로 영양표가 .jpg 이미지 첨부. HTML 텍스트 추출 불가.
//
// TODO (별도 티켓 권장):
//   1. 이미지 다운로드 → tesseract.js 또는 Cloud Vision API로 OCR
//   2. 한글 표 인식 정확도 검증 필요
//   3. 또는 메가 공식 영양표 PDF 별도 확보 후 pdf-parse
//
// 라이선스: 사실 정보(영양 수치)는 저작권 X. 출처 URL 보존.

import type { FranchiseItem } from '../crawl_franchise.js';

export async function crawl(): Promise<FranchiseItem[]> {
  console.warn('[mega] crawler 미구현 — .jpg 이미지 표, OCR 필요. 빈 결과 반환.');
  return [];
}
