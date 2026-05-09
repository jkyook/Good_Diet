// 의료법/식약처 가이드 위반 표현을 잡아내는 2차 방어선.
// 1차 방어선은 서버 프롬프트의 "절대 사용 금지" 섹션이지만,
// 모델이 이를 어길 수 있으므로 클라이언트에서도 필터링한다.
//
// 정책: 매칭된 단어를 같은 길이의 ★ 로 마스킹.
// (검열보다는 의료 표현 제거 시그널 — 사용자가 시각적으로 인지 가능)
//
// T-030d 단어 경계: 기본 동작은 "다음 글자가 한글 음절/영숫자가 아닐 때만 매칭".
// 예: '저혈' 이 '저혈당' 일부로 들어가지 않음 (현재 사전엔 '저혈' 이 없으나 방어).
// '면역력을 높' 같은 동사 어간 prefix 텀은 prefix 플래그로 경계 검사 면제.
// 트레이드오프: '비만증', '당뇨병환자' 같은 한글 복합어 매칭은 약화됨.
// 이 손실은 1차 방어선(프롬프트)으로 보완.

export type MedicalCategory = 'disease' | 'treatment' | 'prescription';

interface MedicalTerm {
  term: string;
  /** true 면 한글 음절 연속 허용 (동사 어간 prefix). 기본 false. */
  prefix?: boolean;
}

export const MEDICAL_TERMS: Record<MedicalCategory, MedicalTerm[]> = {
  // 질병명 / 진단명 — 모두 단어 경계 검사
  disease: [
    { term: '당뇨병' }, { term: '당뇨' },
    { term: '고혈압' }, { term: '저혈압' },
    { term: '비만' }, { term: '우울증' },
    { term: '위염' }, { term: '식도염' }, { term: '역류성' },
    { term: '지방간' }, { term: '심장병' }, { term: '심장질환' },
    { term: '뇌졸중' }, { term: '동맥경화' }, { term: '골다공증' },
    { term: '관절염' }, { term: '통풍' }, { term: '신부전' },
    { term: '간경화' }, { term: '고지혈증' },
    { term: '암 환자' }, { term: '암환자' },
  ],

  // 치료 / 진단 / 회복 동작 — 완성형 어미라 모두 경계 검사
  treatment: [
    { term: '치료한다' }, { term: '치료해' },
    { term: '치료된다' }, { term: '치료됩니다' },
    { term: '진단한다' }, { term: '진단된다' }, { term: '진단됩니다' },
    { term: '호전된다' }, { term: '호전됩니다' },
    { term: '회복된다' }, { term: '회복됩니다' },
    { term: '완치' },
    { term: '완화한다' }, { term: '완화된다' },
    { term: '예방한다' }, { term: '예방된다' },
  ],

  // 처방 / 약리 효과 — 동사 어간 prefix 와 완성형 혼재
  prescription: [
    // 짧은 명사는 동사화(처방하다, 복용하다)까지 잡기 위해 prefix=true
    { term: '처방', prefix: true },
    { term: '복용', prefix: true },
    { term: '약효' }, { term: '약리' },
    { term: '항암효과' }, { term: '항암 효과' },
    { term: '면역력을 높', prefix: true },   // 높여, 높이는, 높입니다
    { term: '면역력 향상' },
    { term: '혈당을 낮', prefix: true },     // 낮춘다, 낮추는
    { term: '혈당을 조절', prefix: true },   // 조절한다, 조절하는
    { term: '혈압을 낮', prefix: true },
    { term: '혈압을 조절', prefix: true },
    { term: '콜레스테롤을 낮', prefix: true },
    { term: '콜레스테롤을 줄', prefix: true },
    { term: '콜레스테롤 감소', prefix: true },
    { term: '체지방을 분해', prefix: true },
    { term: '지방을 태운다' },
    { term: '독소를 배출', prefix: true },
    { term: '디톡스 효과' },
  ],
};

interface InternalTerm extends MedicalTerm {
  category: MedicalCategory;
}

const ALL_TERMS: InternalTerm[] = (
  Object.entries(MEDICAL_TERMS) as [MedicalCategory, MedicalTerm[]][]
)
  .flatMap(([cat, terms]) => terms.map(t => ({ ...t, category: cat })))
  // 긴 단어가 먼저 매칭되도록 길이 내림차순 (당뇨병 > 당뇨)
  .sort((a, b) => b.term.length - a.term.length);

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// 단어 경계: 다음 글자가
//  (a) 한글 음절/영문/숫자가 아니거나(공백, 구두점, 문장끝), 또는
//  (b) 한글 조사 패턴이고 그 조사 뒤가 다시 (a) 인 경우
// 만 매칭으로 인정. 조사 리스트는 길이 내림차순 정렬해 가장 긴 매칭 먼저.
//
// 트레이드오프: '비만증', '고혈압약', '당뇨병환자' 같은 한글 복합어는 매칭 안 됨.
// 이 손실은 1차 방어선(서버 프롬프트 가드)으로 보완.
const KOREAN_JOSA = [
  '이라는', '이라고', '이라', '이지만', '이며',
  '에서는', '에서도', '에서', '에게서', '에게로', '에게',
  '으로는', '으로도', '으로',
  '까지는', '까지도', '까지',
  '부터는', '부터도', '부터',
  '마다', '처럼은', '처럼', '보다',
  '랑은', '랑도', '랑', '이랑',
  '이', '가', '을', '를', '은', '는', '도', '만', '의', '와', '과', '에', '로',
].sort((a, b) => b.length - a.length);

const NON_WORD = '(?![\\uAC00-\\uD7A3A-Za-z0-9])';
const POST_BOUNDARY = `(?:${NON_WORD}|(?=(?:${KOREAN_JOSA.join('|')})${NON_WORD}))`;

function patternFragment(t: InternalTerm): string {
  const esc = escapeRegex(t.term);
  return t.prefix ? esc : esc + POST_BOUNDARY;
}

const COMBINED_PATTERN = new RegExp(
  ALL_TERMS.map(patternFragment).join('|'),
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

// 매칭 시 어떤 사전 엔트리에서 왔는지 역추적.
function lookupCategory(matched: string): MedicalCategory | undefined {
  // 정확 매칭 우선 (non-prefix 결과)
  const exact = ALL_TERMS.find(t => t.term === matched);
  if (exact) return exact.category;
  // prefix 매칭은 어간으로 시작하는 사전 엔트리
  const pref = ALL_TERMS.find(t => t.prefix && matched.startsWith(t.term));
  return pref?.category;
}

// 마스킹 + 매치 정보 반환
export function filterText(input: string): FilterResult {
  if (!input) return { text: input, matches: [] };

  const matches: FilterMatch[] = [];
  const text = input.replace(COMBINED_PATTERN, (m, offset: number) => {
    const cat = lookupCategory(m);
    if (cat) matches.push({ term: m, category: cat, index: offset });
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
