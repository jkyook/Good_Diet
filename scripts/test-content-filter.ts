// contentFilter 스모크 테스트 — 회귀 방지용 가벼운 검증.
// 실행: npx tsx scripts/test-content-filter.ts
//
// vitest 같은 정식 테스트 러너가 도입되기 전까지 임시 스모크 테스트.
import { filterText } from '../src/utils/contentFilter';

interface Case {
  name: string;
  input: string;
  /** 마스킹돼야 할 핵심 표현 (포함 검사). 빈 배열이면 매칭 없어야 함. */
  expectMaskedTerms: string[];
  /** 마스킹되면 안 되는 표현 (false positive 방지). */
  expectNotMasked?: string[];
}

const CASES: Case[] = [
  // === T-031 사용자 권고 케이스 ===
  {
    name: 'FP: 체력 회복은 통과해야 함 (whitelist)',
    input: '체력 회복에 좋은 식단입니다.',
    expectMaskedTerms: [],
    expectNotMasked: ['체력 회복'],
  },
  {
    name: 'TP: 피로 회복은 차단 (treatment regex)',
    input: '피로 회복 효과가 있습니다.',
    expectMaskedTerms: ['피로 회복'],
  },
  {
    name: 'TP: 면역력 강화는 차단 (effect regex)',
    input: '이 음식은 면역력 강화에 도움됩니다.',
    expectMaskedTerms: ['면역력 강화'],
  },
  {
    name: 'FP: 근력 강화는 통과 (effect regex 의 prefix 가 면역|면역력만)',
    input: '근력 강화 운동을 추천합니다.',
    expectMaskedTerms: [],
    expectNotMasked: ['근력 강화'],
  },
  {
    name: 'TP: 혈당 조절은 차단 (effect regex)',
    input: '혈당 조절 식단으로 좋습니다.',
    expectMaskedTerms: ['혈당 조절'],
  },
  {
    name: 'FP: 체중 조절은 통과 (조절 단독은 review, regex 미매칭)',
    input: '체중 조절에 좋은 음식입니다.',
    expectMaskedTerms: [],
    expectNotMasked: ['체중 조절'],
  },

  // === effect 신규 카테고리 단어 매칭 ===
  {
    name: 'TP effect: 항산화 효과로 매칭',
    input: '항산화 효과로 노화를 막아줍니다.',
    expectMaskedTerms: ['항산화', '노화방지'].slice(0, 1), // 항산화만 명시 검증
  },
  {
    name: 'TP effect: 디톡스 매칭',
    input: '디톡스에 좋은 식단입니다.',
    expectMaskedTerms: ['디톡스'],
  },
  {
    name: 'TP effect: 콜레스테롤 감소 (regex)',
    input: '콜레스테롤 감소 효과가 있다고 알려져 있습니다.',
    expectMaskedTerms: ['콜레스테롤 감소'],
  },
  {
    name: 'TP effect: 지방 연소 (체지방 분해 regex)',
    input: '지방 연소를 도와준다고 합니다.',
    expectMaskedTerms: ['지방 연소'],
  },

  // === T-031 추가 disease 단어 ===
  {
    name: 'TP disease: 치매 (T-031 추가)',
    input: '치매 예방한다고 알려진 음식.',
    expectMaskedTerms: ['치매', '예방한다'],
  },
  {
    name: 'TP disease: PTSD (T-031 추가, 영문)',
    input: 'PTSD 환자에게 도움된다는 연구.',
    expectMaskedTerms: ['PTSD'],
  },

  // === T-031 추가 prescription ===
  {
    name: 'TP prescription: 항생제',
    input: '천연 항생제 효과를 가진 식품.',
    expectMaskedTerms: ['항생제'],
  },
  {
    name: 'TP prescription: 항암 (prefix=true → 항암제도 캐치)',
    input: '항암제로 분류되는 성분 포함.',
    expectMaskedTerms: ['항암'],
  },

  // === T-031 회의론 단어 단독 차단 NO ===
  {
    name: 'FP: 회복 단독 (음식이 회복에 좋다)는 통과',
    input: '회복에 좋은 죽 한 그릇.',
    expectMaskedTerms: [],
    expectNotMasked: ['회복'],
  },
  {
    name: 'FP: 재생 단독 (재생 가능 에너지)는 통과 (whitelist)',
    input: '재생 에너지를 활용한 농장에서 생산.',
    expectMaskedTerms: [],
    expectNotMasked: ['재생'],
  },

  // === 깨끗한 텍스트 ===
  {
    name: 'CLEAN: 일반 식단 설명',
    input: '비빔밥은 균형잡힌 한 끼로 영양소가 골고루 들어있습니다.',
    expectMaskedTerms: [],
  },

  // === 한글 조사 회복 ===
  {
    name: 'TP josa: 당뇨가 있어요',
    input: '당뇨가 있는 분에게 추천하지 않습니다.',
    expectMaskedTerms: ['당뇨'],
  },
];

let passed = 0;
let failed = 0;

for (const c of CASES) {
  const result = filterText(c.input);
  const matchedTerms = result.matches.map(m => m.term);

  const missingTerms = c.expectMaskedTerms.filter(
    t => !matchedTerms.some(m => m === t || m.includes(t) || t.includes(m)),
  );

  const wrongPositives = (c.expectNotMasked ?? []).filter(t => {
    // expectNotMasked 토큰이 출력에서 마스킹됐는지 확인
    return !result.text.includes(t);
  });

  const hasFalseTrue = c.expectMaskedTerms.length === 0 && matchedTerms.length > 0;

  const ok = missingTerms.length === 0 && wrongPositives.length === 0 && !hasFalseTrue;

  if (ok) {
    passed++;
    console.log(`  ✓ ${c.name}`);
  } else {
    failed++;
    console.log(`  ✗ ${c.name}`);
    console.log(`     input    : "${c.input}"`);
    console.log(`     output   : "${result.text}"`);
    console.log(`     matched  : [${matchedTerms.join(', ')}]`);
    if (missingTerms.length > 0) console.log(`     MISSING  : [${missingTerms.join(', ')}]`);
    if (wrongPositives.length > 0) console.log(`     FALSE POS: [${wrongPositives.join(', ')}]`);
    if (hasFalseTrue) console.log(`     UNEXPECTED MATCH (clean text 실패)`);
  }
}

console.log(`\n[contentFilter smoke] ${passed} passed / ${failed} failed (${CASES.length} total)`);
if (failed > 0) process.exit(1);
