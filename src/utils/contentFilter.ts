// 의료법/식약처 가이드 위반 표현을 잡아내는 2차 방어선.
// 1차 방어선은 서버 프롬프트의 "절대 사용 금지" 섹션이지만,
// 모델이 이를 어길 수 있으므로 클라이언트에서도 필터링한다.
//
// 정책: 매칭된 단어를 같은 길이의 ★ 로 마스킹.
// (검열보다는 의료 표현 제거 시그널 — 사용자가 시각적으로 인지 가능)

export type MedicalCategory = 'disease' | 'treatment' | 'prescription';

export const MEDICAL_TERMS: Record<MedicalCategory, string[]> = {
  // 질병명 / 진단명
  disease: [
    '당뇨병', '당뇨', '고혈압', '저혈압', '비만', '우울증', '위염', '식도염',
    '역류성', '지방간', '심장병', '심장질환', '뇌졸중', '동맥경화', '골다공증',
    '관절염', '통풍', '신부전', '간경화', '고지혈증', '암 환자', '암환자',
  ],

  // 치료 / 진단 / 회복 동작
  treatment: [
    '치료한다', '치료해', '치료된다', '치료됩니다',
    '진단한다', '진단된다', '진단됩니다',
    '호전된다', '호전됩니다', '회복된다', '회복됩니다',
    '완치', '완화한다', '완화된다', '예방한다', '예방된다',
  ],

  // 처방 / 약리 효과
  prescription: [
    '처방', '복용', '약효', '약리',
    '항암효과', '항암 효과', '면역력을 높', '면역력 향상',
    '혈당을 낮', '혈당을 조절', '혈압을 낮', '혈압을 조절',
    '콜레스테롤을 낮', '콜레스테롤을 줄', '콜레스테롤 감소',
    '체지방을 분해', '지방을 태운다', '독소를 배출', '디톡스 효과',
  ],
};

const ALL_TERMS: { term: string; category: MedicalCategory }[] = (
  Object.entries(MEDICAL_TERMS) as [MedicalCategory, string[]][]
)
  .flatMap(([cat, terms]) => terms.map(term => ({ term, category: cat })))
  // 긴 단어가 짧은 단어보다 우선 매칭되어야 함 (당뇨병 > 당뇨)
  .sort((a, b) => b.term.length - a.term.length);

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const COMBINED_PATTERN = new RegExp(
  ALL_TERMS.map(t => escapeRegex(t.term)).join('|'),
  'g',
);

export interface FilterMatch {
  term: string;
  category: MedicalCategory;
  index: number;
}

export interface FilterResult {
  text: string;
  matches: FilterMatch[];
}

// 마스킹 + 매치 정보 반환
export function filterText(input: string): FilterResult {
  if (!input) return { text: input, matches: [] };

  const matches: FilterMatch[] = [];
  const text = input.replace(COMBINED_PATTERN, (m, offset: number) => {
    const meta = ALL_TERMS.find(t => t.term === m) ?? ALL_TERMS.find(t => t.term.startsWith(m));
    if (meta) matches.push({ term: m, category: meta.category, index: offset });
    return '★'.repeat(m.length);
  });

  return { text, matches };
}

// 편의 함수: 마스킹된 텍스트만 필요할 때
export function maskText(input: string): string {
  return filterText(input).text;
}

// 편의 함수: 매칭만 필요할 때 (로깅 등)
export function findMatches(input: string): FilterMatch[] {
  return filterText(input).matches;
}

// 배열 일괄 처리
export function maskArray(arr: string[] | undefined): string[] | undefined {
  if (!arr) return arr;
  return arr.map(maskText);
}
