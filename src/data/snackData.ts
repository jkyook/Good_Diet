// 간식 매핑 — 한국 시장 1회 분량 기준 (서연 [T-055a] §2).

export type SnackTag = 'protein' | 'fiber' | 'calcium' | 'potassium' | 'vitamin'
                     | 'healthy_fat' | 'complex_carb' | 'low_kcal' | 'very_low_kcal' | 'indulgent' | 'low_fat';

export interface SnackItem {
  id: string;
  name: string;
  emoji: string;
  serving: string;
  kcal: number;
  protein?: number;   // g
  fiber?: number;     // g
  calcium?: number;   // mg
  potassium?: number; // mg
  tags: SnackTag[];
  /** 출하 성수기 월 (1=1월 … 12=12월). 미지정 시 연중 출하. */
  seasonalMonths?: number[];
}

export const SNACK_DATA: SnackItem[] = [
  // ── 단백질 ──────────────────────────────────────────────────────────
  { id: 'greek_yogurt', name: '그릭 요거트 (무가당)', emoji: '🥛', serving: '100g',  kcal: 60,  protein: 10, calcium: 100, tags: ['protein', 'calcium', 'low_kcal'] },
  { id: 'boiled_egg',   name: '삶은 달걀',           emoji: '🥚', serving: '1개',   kcal: 80,  protein: 6,  tags: ['protein'] },
  { id: 'soymilk',      name: '두유 (무가당)',       emoji: '🥛', serving: '200ml', kcal: 80,  protein: 7,  calcium: 200, tags: ['protein', 'calcium'] },
  { id: 'milk',         name: '무지방 우유',         emoji: '🥛', serving: '200ml', kcal: 70,  protein: 7,  calcium: 250, tags: ['protein', 'calcium'] },
  { id: 'cheese',       name: '치즈 한 조각',        emoji: '🧀', serving: '20g',   kcal: 70,  protein: 4,  calcium: 130, tags: ['calcium', 'protein'] },
  { id: 'chicken',      name: '닭가슴살 (구운)',     emoji: '🍗', serving: '100g',  kcal: 110, protein: 23, tags: ['protein', 'low_fat'] },
  { id: 'nuts',         name: '견과류 mix',          emoji: '🌰', serving: '30g',   kcal: 180, protein: 5,  fiber: 3, tags: ['protein', 'fiber', 'healthy_fat'] },

  // ── 복합 탄수화물 ────────────────────────────────────────────────────
  { id: 'granola',      name: '그래놀라 (저당)',     emoji: '🥣', serving: '30g',   kcal: 130, fiber: 3,    tags: ['fiber'] },
  { id: 'dark_choco',   name: '다크 초콜릿',         emoji: '🍫', serving: '20g',   kcal: 110, tags: ['indulgent'] },

  // ── 연중 채소/과일 ────────────────────────────────────────────────────
  { id: 'banana',       name: '바나나',              emoji: '🍌', serving: '1개',   kcal: 90,  fiber: 2,    potassium: 360, tags: ['potassium', 'fiber'] },
  { id: 'gim',          name: '조미김',              emoji: '🟫', serving: '4g',    kcal: 15,  tags: ['very_low_kcal'] },

  // ── 봄 (3–5월) ───────────────────────────────────────────────────────
  { id: 'strawberry',   name: '딸기',                emoji: '🍓', serving: '10알(150g)', kcal: 50,  fiber: 2, potassium: 220, tags: ['vitamin', 'fiber', 'low_kcal'],    seasonalMonths: [12,1,2,3,4,5] },
  { id: 'broccoli',     name: '브로콜리 (생)',       emoji: '🥦', serving: '100g',  kcal: 34,  fiber: 3, calcium: 47, tags: ['fiber', 'vitamin', 'very_low_kcal'], seasonalMonths: [3,4,5,9,10,11] },
  { id: 'asparagus',    name: '아스파라거스',        emoji: '🌿', serving: '100g',  kcal: 20,  fiber: 2, potassium: 202, tags: ['fiber', 'vitamin', 'very_low_kcal'], seasonalMonths: [4,5,6] },
  { id: 'lettuce',      name: '상추 (쌈)',           emoji: '🥬', serving: '50g',   kcal: 10,  fiber: 1, tags: ['very_low_kcal', 'fiber'],                seasonalMonths: [4,5,6,9,10] },

  // ── 초여름 (5–7월) ──────────────────────────────────────────────────
  { id: 'chamoe',       name: '참외',                emoji: '🍈', serving: '1/2개(200g)', kcal: 58, fiber: 1, potassium: 210, tags: ['vitamin', 'low_kcal'],    seasonalMonths: [5,6,7,8] },
  { id: 'cucumber',     name: '오이',                emoji: '🥒', serving: '1개',   kcal: 30,  tags: ['very_low_kcal'],                                              seasonalMonths: [5,6,7,8,9] },
  { id: 'cherry_tomato',name: '방울토마토',          emoji: '🍅', serving: '100g',  kcal: 20,  tags: ['vitamin', 'very_low_kcal'],                                  seasonalMonths: [5,6,7,8,9] },
  { id: 'cherry',       name: '체리',                emoji: '🍒', serving: '15알(100g)', kcal: 60, fiber: 1, potassium: 220, tags: ['vitamin', 'low_kcal'],    seasonalMonths: [5,6,7] },

  // ── 여름 (6–8월) ────────────────────────────────────────────────────
  { id: 'watermelon',   name: '수박',                emoji: '🍉', serving: '2조각(300g)', kcal: 90, potassium: 270, tags: ['potassium', 'low_kcal'],          seasonalMonths: [6,7,8] },
  { id: 'peach',        name: '복숭아',              emoji: '🍑', serving: '1개(150g)',   kcal: 60, fiber: 2, potassium: 190, tags: ['vitamin', 'fiber', 'low_kcal'], seasonalMonths: [7,8] },
  { id: 'corn',         name: '옥수수 (삶은)',       emoji: '🌽', serving: '1개(150g)',   kcal: 130, fiber: 3, tags: ['fiber', 'complex_carb'],               seasonalMonths: [7,8,9] },
  { id: 'blueberry',    name: '블루베리',            emoji: '🫐', serving: '100g',        kcal: 57, fiber: 2, tags: ['vitamin', 'fiber', 'low_kcal'],         seasonalMonths: [7,8,9] },

  // ── 가을 (9–11월) ───────────────────────────────────────────────────
  { id: 'grape',        name: '포도',                emoji: '🍇', serving: '한 송이(150g)', kcal: 90, potassium: 200, tags: ['potassium', 'vitamin', 'low_kcal'], seasonalMonths: [8,9,10] },
  { id: 'apple',        name: '사과',                emoji: '🍎', serving: '1/2개(100g)', kcal: 55, fiber: 2, potassium: 110, tags: ['fiber', 'vitamin', 'low_kcal'],  seasonalMonths: [9,10,11,12] },
  { id: 'pear',         name: '배',                  emoji: '🍐', serving: '1/4개(100g)', kcal: 45, fiber: 2, potassium: 150, tags: ['fiber', 'vitamin', 'low_kcal'],  seasonalMonths: [9,10,11] },
  { id: 'persimmon',    name: '홍시/단감',           emoji: '🍊', serving: '1개(100g)',   kcal: 60, fiber: 2, tags: ['vitamin', 'fiber', 'low_kcal'],             seasonalMonths: [10,11] },
  { id: 'sweet_potato', name: '군고구마',            emoji: '🍠', serving: '100g',        kcal: 130, fiber: 3, potassium: 300, tags: ['fiber', 'complex_carb', 'potassium'], seasonalMonths: [9,10,11,12,1,2,3] },

  // ── 겨울 (10–2월) ───────────────────────────────────────────────────
  { id: 'tangerine',    name: '귤',                  emoji: '🍊', serving: '2개(150g)',   kcal: 60, fiber: 2, potassium: 180, tags: ['vitamin', 'fiber', 'low_kcal'],  seasonalMonths: [10,11,12,1,2] },
];
