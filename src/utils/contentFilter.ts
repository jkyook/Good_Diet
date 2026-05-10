// 의료법/식약처 가이드 위반 표현 필터링 (2차 방어선).
// 1차 방어선은 서버 프롬프트의 "절대 사용 금지" 섹션. 모델이 이를 어길 때를 잡는다.
//
// T-032 (서연 T-031 머지) 변경:
//   - 사전 구조: string[] → MedicalTerm[] 객체
//   - 신규 카테고리 'effect' (식품/앱 표방 금지 효능)
//   - 회의론 5단어(회복·재생·교정·강화·조절) → regex + whitelist 형식만 차단
//   - +200 어 추가, T-023 베이스라인과 중복 제거
//
// 정책:
//   - severity:'block' (기본) — term-based 매칭 시 즉시 마스킹
//   - severity:'review' — regex 가 있어야 매칭. bare term 단독 차단 금지(false positive 방지)
//   - prefix:true — 한글 음절 연속 허용 (동사 어간)
//   - prefix:false — 다음 글자가 한글 조사/비-단어일 때만 매칭 (boundary 검사)
//   - whitelist 가 있고 입력 텍스트에 whitelist 토큰이 포함되면 해당 매칭 skip

export type MedicalCategory = 'disease' | 'treatment' | 'prescription' | 'effect';

interface MedicalTerm {
  term: string;
  severity?: 'block' | 'review';
  /** true 면 한글 음절 연속 허용. regex 가 있으면 무시. */
  prefix?: boolean;
  /** 지정 시 term 기반 매칭 대신 이 regex 사용 (g 플래그 보장됨). */
  regex?: RegExp;
  /** 입력 텍스트에 이 중 하나라도 포함되면 해당 사전 엔트리 매칭 skip. */
  whitelist?: string[];
  /** 감사 로그용 출처. */
  source?: string;
}

// === 한글 조사 인지 단어 경계 ===
// boundary OK = (다음 글자가 한글/영숫자가 아님) OR (한글 조사 + 그 뒤가 비-단어)
const KOREAN_JOSA = [
  '이라는', '이라고', '이라며', '이라면', '이라', '이지만', '이며',
  '에서는', '에서도', '에서', '에게서', '에게로', '에게',
  '으로는', '으로도', '으로',
  '까지는', '까지도', '까지',
  '부터는', '부터도', '부터',
  '마다', '처럼은', '처럼', '보다',
  '랑은', '랑도', '랑', '이랑',
  '이', '가', '을', '를', '은', '는', '도', '만', '의', '와', '과', '에', '로',
  // 동사 종결 다 뒤에 오는 conjunction/quote 류
  '고', '며', '면',
].sort((a, b) => b.length - a.length);

const NON_WORD = '(?![\\uAC00-\\uD7A3A-Za-z0-9])';
const POST_BOUNDARY = `(?:${NON_WORD}|(?=(?:${KOREAN_JOSA.join('|')})${NON_WORD}))`;

// === 사전 ===
export const MEDICAL_TERMS: Record<MedicalCategory, MedicalTerm[]> = {
  disease: [
    // T-023 베이스라인
    { term: '당뇨병' }, { term: '당뇨' },
    { term: '고혈압' }, { term: '저혈압' },
    { term: '비만' }, { term: '우울증' },
    { term: '위염' }, { term: '식도염' }, { term: '역류성' },
    { term: '지방간' }, { term: '심장병' }, { term: '심장질환' },
    { term: '뇌졸중' }, { term: '동맥경화' }, { term: '골다공증' },
    { term: '관절염' }, { term: '통풍' }, { term: '신부전' },
    { term: '간경화' }, { term: '고지혈증' },
    { term: '암 환자' }, { term: '암환자' },

    // T-031 추가 — 인지·신경
    { term: '치매' }, { term: '경도인지장애' }, { term: '인지장애' },
    { term: '건망증' }, { term: '노망' },
    { term: '뇌경색' }, { term: '중풍' }, { term: '반신마비' },
    { term: '파킨슨' }, { term: '간질' }, { term: '전간' },

    // T-031 추가 — 대사·내분비
    { term: '갑상선기능항진' }, { term: '갑상선기능저하' }, { term: '갑상선결절' },
    { term: '갱년기장애' }, { term: '갱년기증후군' }, { term: '폐경기증상' }, { term: '화병' },

    // T-031 추가 — 소화·간
    { term: '간염' }, { term: '간경변' }, { term: '지방간염' },
    { term: '위궤양' }, { term: '십이지장궤양' }, { term: '역류성식도염' },
    { term: '과민성대장증후군' }, { term: '과민성대장' },

    // T-031 추가 — 정신·수면
    { term: '공황장애' }, { term: '강박장애' }, { term: '외상후스트레스' }, { term: 'PTSD' },
    { term: '수면무호흡증' }, { term: '수면무호흡' },

    // T-031 추가 — 피부·알레르기
    { term: '건선' }, { term: '두드러기' }, { term: '비염' },
    { term: '축농증' }, { term: '결막염' }, { term: '무좀' }, { term: '백선' },

    // T-031 추가 — 심혈관
    { term: '심부전' }, { term: '심실세동' }, { term: '혈전증' },
    { term: '정맥류' }, { term: '동맥류' },

    // T-031 추가 — 비뇨·생식
    { term: '전립선비대' }, { term: '전립선염' }, { term: '방광염' }, { term: '요실금' },
    { term: '발기부전' }, { term: '조루' }, { term: '불임' },

    // T-031 추가 — 종양
    { term: '위암' }, { term: '간암' }, { term: '폐암' }, { term: '유방암' },
    { term: '대장암' }, { term: '췌장암' }, { term: '혈액암' }, { term: '백혈병' },

    // T-031 추가 — 골·관절
    { term: '류마티스' }, { term: '디스크' },
    { term: '추간판탈출' }, { term: '오십견' },

    // T-031 추가 — 안과·이비인후
    { term: '백내장' }, { term: '녹내장' }, { term: '황반변성' },
    { term: '이명' }, { term: '난청' },
  ],

  treatment: [
    // T-023 베이스라인 — 완성형 어미
    { term: '치료한다' }, { term: '치료해' },
    { term: '치료된다' }, { term: '치료됩니다' },
    { term: '진단한다' }, { term: '진단된다' }, { term: '진단됩니다' },
    { term: '호전된다' }, { term: '호전됩니다' },
    { term: '완치' },
    { term: '완화한다' }, { term: '완화된다' },
    { term: '예방한다' }, { term: '예방된다' },
    // (회복된다/회복됩니다 는 아래 회복 regex 로 대체)

    // T-031 추가 — 행위 동의어
    { term: '시술' }, { term: '처치' }, { term: '투약' }, { term: '투여' },
    { term: '복용 처방' },

    // T-031 추가 — 상태 변화
    { term: '경감' }, { term: '호전' }, { term: '차도' },
    { term: '완쾌' }, { term: '치유' }, { term: '쾌차' },
    { term: '병행 치료' }, { term: '재활치료' }, { term: '재활' },

    // T-031 추가 — 한방
    { term: '보혈' }, { term: '보정' }, { term: '보양' }, { term: '자양강장' },
    { term: '특효' }, { term: '비방' }, { term: '비법' },
    { term: '공진단' }, { term: '경옥고' }, { term: '십전대보' },

    // T-031 추가 — 보증·전문성
    { term: '임상시험' }, { term: '임상완료' }, { term: '임상검증' }, { term: '임상' },
    { term: '메디컬' }, { term: '전문 처방' }, { term: '맞춤 처방' },

    // T-031 회의론 5단어 — regex 분리 (단독 차단 ❌)
    {
      term: '회복', severity: 'review',
      regex: /(피로|기력|원기|질병|증상)\s*회복/g,
      whitelist: ['체력 회복', '활력 회복', '에너지 회복'],
      source: 'T-031 회의론 페르소나',
    },
    {
      term: '재생', severity: 'review',
      regex: /(세포|피부|연골|조직|모발|장기)\s*재생/g,
      whitelist: ['데이터 재생', '재생 에너지'],
      source: 'T-031 회의론 페르소나',
    },
    {
      term: '교정', severity: 'review',
      regex: /(척추|치아|관절|체형)\s*교정/g,
      source: 'T-031 회의론 페르소나',
    },
  ],

  prescription: [
    // T-023 베이스라인 — 동사화 캐치 위해 prefix
    { term: '처방', prefix: true },
    { term: '복용', prefix: true },
    { term: '약효' }, { term: '약리' },
    // (항암효과/항암 효과/면역력을 높/혈당을 낮/콜레스테롤... 등은 effect 카테고리로 이동)

    // T-031 추가 — 통증·염증
    { term: '진통' }, { term: '항염' }, { term: '소염' }, { term: '소종' }, { term: '해열' },
    { term: '항히스타민' }, { term: '항알레르기' }, { term: '진경' },

    // T-031 추가 — 순환·내분비 (단어 자체 — regex 는 effect 에)
    { term: '혈압강하' }, { term: '혈당강하' }, { term: '콜레스테롤강하' },
    { term: '항응고' }, { term: '혈전용해' }, { term: '강심' }, { term: '혈관확장' },
    { term: '이뇨' }, { term: '배뇨촉진' }, { term: '이담' }, { term: '호르몬조절' },

    // T-031 추가 — 정신·신경
    { term: '항우울' }, { term: '항불안' }, { term: '최면' }, { term: '마취' },
    { term: '항정신병' }, { term: '항파킨슨' }, { term: '항전간' },
    { term: '최음' }, { term: '환각' },

    // T-031 추가 — 소화·대사
    { term: '제산' }, { term: '건위' }, { term: '정장' }, { term: '지사' }, { term: '관장' },
    { term: '거담' }, { term: '진해' }, { term: '식욕억제' }, { term: '식욕증진' }, { term: '소화촉진' },

    // T-031 추가 — 면역·감염
    { term: '항균' }, { term: '항바이러스' }, { term: '항진균' }, { term: '항생' },
    { term: '살균' }, { term: '방부' }, { term: '면역억제' },
    { term: '항종양' }, { term: '항궤양' }, { term: '구충' },
    { term: '항암', prefix: true }, // 항암제/항암효과/항암치료 모두 캐치

    // T-031 추가 — 보강·회복(약리)
    { term: '강장' }, { term: '지혈' }, { term: '수렴작용' },
    { term: '최유' }, { term: '통경' }, { term: '발한작용' }, { term: '해독작용' },

    // T-031 추가 — 약효군명
    { term: '진통제' }, { term: '항생제' }, { term: '해열제' }, { term: '안정제' }, { term: '수면제' },
    { term: '혈압약' }, { term: '당뇨약' }, { term: '다이어트약' }, { term: '변비약' }, { term: '지사제' },
    { term: '자양강장제' }, { term: '항우울제' }, { term: '항불안제' },
  ],

  effect: [
    // 신체 기능
    { term: '항산화' }, { term: '활성산소제거' },

    // 면역력 — regex (강화/증진/향상/개선)
    {
      term: '면역력 강화', severity: 'review',
      regex: /(면역|면역력)\s*(강화|증진|향상|개선)/g,
      source: 'T-031 효능 표방 — 식품표시광고법 §8',
    },

    // 활력
    { term: '활력증진' },

    // 대사 — regex (혈당/혈압/콜레스테롤/호르몬 + 조절/개선/감소/강하/낮/줄)
    {
      term: '혈당 조절', severity: 'review',
      regex: /(혈당|혈압|콜레스테롤|호르몬)\s*(조절|개선|감소|강하|낮|줄)/g,
      source: 'T-031 효능 표방',
    },

    // 지방분해/연소 — regex
    {
      term: '체지방 분해', severity: 'review',
      regex: /(체지방|지방)\s*(분해|연소|태운다|태우는)/g,
      whitelist: ['지방 함량', '지방 비율'],
      source: 'T-031 효능 표방',
    },

    // 다이어트
    { term: '다이어트효과' },
    { term: '혈류개선' }, { term: '혈액순환개선' }, { term: '혈관건강' },

    // 노화·외모
    { term: '노화방지' }, { term: '안티에이징' }, { term: '회춘' },
    // 세포재생/피부재생 등은 treatment 의 재생 regex 가 잡음 — 중복 회피
    { term: '주름개선' }, { term: '탄력강화' },
    { term: '발모' }, { term: '탈모방지' }, { term: '탈모개선' }, { term: '모발성장' },
    { term: '미백' },

    // 생리 활성
    { term: '변비개선' }, { term: '변비해소' }, { term: '숙취해소' },
    { term: '시력개선' }, { term: '시력회복' }, { term: '눈건강' },
    { term: '기억력향상' }, { term: '기억력개선' },
    { term: '두뇌활성화' }, { term: '집중력증진' }, { term: '집중력향상' },
    { term: '수면개선' }, { term: '숙면' },

    // 성기능
    { term: '정력강화' }, { term: '정자수증가' },
    { term: '성기능개선' }, { term: '조루방지' }, { term: '발기부전치료' },

    // 뼈·관절·성장
    { term: '골다공증예방' }, { term: '관절염완화' }, { term: '관절건강' },
    { term: '키성장' }, { term: '성장호르몬촉진' }, { term: '연골재생' },

    // 기타 식약처 단속 빈출
    { term: '체질개선' }, { term: '독소배출' }, { term: '디톡스' },
    { term: '지방흡수억제' }, { term: '탄수화물흡수억제' },
  ],
};

// === 빌드 ===
interface InternalTerm extends MedicalTerm {
  category: MedicalCategory;
}

const ALL_TERMS: InternalTerm[] = (
  Object.entries(MEDICAL_TERMS) as [MedicalCategory, MedicalTerm[]][]
)
  .flatMap(([cat, terms]) => terms.map(t => ({ ...t, category: cat })))
  .sort((a, b) => b.term.length - a.term.length);

const TERM_ENTRIES = ALL_TERMS.filter(t => !t.regex && t.severity !== 'review');
const REGEX_ENTRIES = ALL_TERMS.filter(t => t.regex);

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function fragment(t: InternalTerm): string {
  const esc = escapeRegex(t.term);
  return t.prefix ? esc : esc + POST_BOUNDARY;
}

const COMBINED_TERM_PATTERN = TERM_ENTRIES.length > 0
  ? new RegExp(TERM_ENTRIES.map(fragment).join('|'), 'g')
  : null;

// === 매칭 + 마스킹 ===
export interface FilterMatch {
  term: string;
  category: MedicalCategory;
  index: number;
  length: number;
  via: 'term' | 'regex';
}

interface Span {
  start: number;
  end: number;
  match: FilterMatch;
}

function whitelistHit(input: string, whitelist?: string[]): boolean {
  if (!whitelist || whitelist.length === 0) return false;
  return whitelist.some(w => input.includes(w));
}

function lookupTermEntry(matched: string): InternalTerm | undefined {
  const exact = TERM_ENTRIES.find(t => t.term === matched);
  if (exact) return exact;
  return TERM_ENTRIES.find(t => t.prefix && matched.startsWith(t.term));
}

export interface FilterResult {
  text: string;
  matches: FilterMatch[];
}

export function filterText(input: string): FilterResult {
  if (!input) return { text: input, matches: [] };

  const spans: Span[] = [];

  // pass 1: term-based combined regex
  if (COMBINED_TERM_PATTERN) {
    COMBINED_TERM_PATTERN.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = COMBINED_TERM_PATTERN.exec(input))) {
      const entry = lookupTermEntry(m[0]);
      if (!entry) continue;
      if (whitelistHit(input, entry.whitelist)) continue;
      spans.push({
        start: m.index,
        end: m.index + m[0].length,
        match: {
          term: m[0],
          category: entry.category,
          index: m.index,
          length: m[0].length,
          via: 'term',
        },
      });
    }
  }

  // pass 2: regex entries
  for (const entry of REGEX_ENTRIES) {
    if (whitelistHit(input, entry.whitelist)) continue;
    const re = entry.regex!;
    if (!re.flags.includes('g')) {
      // 안전: g 플래그 강제
      const fixed = new RegExp(re.source, re.flags + 'g');
      let m: RegExpExecArray | null;
      while ((m = fixed.exec(input))) {
        spans.push(makeSpan(m, entry));
        if (m[0].length === 0) fixed.lastIndex++;
      }
      continue;
    }
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(input))) {
      spans.push(makeSpan(m, entry));
      if (m[0].length === 0) re.lastIndex++;
    }
  }

  // sort + dedupe overlapping (외곽 우선)
  spans.sort((a, b) => a.start - b.start || (b.end - b.start) - (a.end - a.start));
  const merged: Span[] = [];
  for (const s of spans) {
    const last = merged[merged.length - 1];
    if (last && s.start < last.end) {
      // 겹침 — 더 긴 쪽으로 확장
      if (s.end > last.end) last.end = s.end;
      continue;
    }
    merged.push({ ...s });
  }

  // 마스킹
  if (merged.length === 0) return { text: input, matches: [] };
  let out = '';
  let cursor = 0;
  const matches: FilterMatch[] = [];
  for (const s of merged) {
    out += input.slice(cursor, s.start) + '★'.repeat(s.end - s.start);
    cursor = s.end;
    matches.push(s.match);
  }
  out += input.slice(cursor);
  return { text: out, matches };
}

function makeSpan(m: RegExpExecArray, entry: InternalTerm): Span {
  return {
    start: m.index,
    end: m.index + m[0].length,
    match: {
      term: m[0],
      category: entry.category,
      index: m.index,
      length: m[0].length,
      via: 'regex',
    },
  };
}

// === 편의 함수 ===
export function maskText(input: string): string {
  return filterText(input).text;
}

export function findMatches(input: string): FilterMatch[] {
  return filterText(input).matches;
}

export function maskArray(arr: string[] | undefined): string[] | undefined {
  if (!arr) return arr;
  return arr.map(maskText);
}
