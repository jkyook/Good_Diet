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
}

export const SNACK_DATA: SnackItem[] = [
  { id: 'greek_yogurt', name: '그릭 요거트 (무가당)', emoji: '🥛', serving: '100g',  kcal: 60,  protein: 10, calcium: 100, tags: ['protein', 'calcium', 'low_kcal'] },
  { id: 'boiled_egg',   name: '삶은 달걀',           emoji: '🥚', serving: '1개',   kcal: 80,  protein: 6,  tags: ['protein'] },
  { id: 'apple',        name: '사과',                emoji: '🍎', serving: '1개',   kcal: 100, fiber: 4,    tags: ['fiber', 'vitamin', 'low_kcal'] },
  { id: 'nuts',         name: '견과류 mix',          emoji: '🌰', serving: '30g',   kcal: 180, protein: 5,  fiber: 3, tags: ['protein', 'fiber', 'healthy_fat'] },
  { id: 'banana',       name: '바나나',              emoji: '🍌', serving: '1개',   kcal: 90,  fiber: 2,    potassium: 360, tags: ['potassium', 'fiber'] },
  { id: 'soymilk',      name: '두유 (무가당)',       emoji: '🥛', serving: '200ml', kcal: 80,  protein: 7,  calcium: 200, tags: ['protein', 'calcium'] },
  { id: 'milk',         name: '무지방 우유',         emoji: '🥛', serving: '200ml', kcal: 70,  protein: 7,  calcium: 250, tags: ['protein', 'calcium'] },
  { id: 'cheese',       name: '치즈 한 조각',        emoji: '🧀', serving: '20g',   kcal: 70,  protein: 4,  calcium: 130, tags: ['calcium', 'protein'] },
  { id: 'dark_choco',   name: '다크 초콜릿',         emoji: '🍫', serving: '20g',   kcal: 110, tags: ['indulgent'] },
  { id: 'cherry_tomato',name: '방울토마토',          emoji: '🍅', serving: '100g',  kcal: 20,  tags: ['vitamin', 'very_low_kcal'] },
  { id: 'cucumber',     name: '오이',                emoji: '🥒', serving: '1개',   kcal: 30,  tags: ['very_low_kcal'] },
  { id: 'sweet_potato', name: '군고구마',            emoji: '🍠', serving: '100g',  kcal: 130, fiber: 3,    potassium: 300, tags: ['fiber', 'complex_carb', 'potassium'] },
  { id: 'granola',      name: '그래놀라 (저당)',     emoji: '🥣', serving: '30g',   kcal: 130, fiber: 3,    tags: ['fiber'] },
  { id: 'chicken',      name: '닭가슴살 (구운)',     emoji: '🍗', serving: '100g',  kcal: 110, protein: 23, tags: ['protein', 'low_fat'] },
  { id: 'gim',          name: '조미김',              emoji: '🟫', serving: '4g',    kcal: 15,  tags: ['very_low_kcal'] },
];
