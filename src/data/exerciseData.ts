// 운동 칼로리 소비 — 60kg 성인 기준 METs 환산 (서연 [T-055a] §1).
// 분당 kcal = METs × 체중(kg) × 0.0175

export type ExerciseIntensity = 'low' | 'mid' | 'high';

export interface ExerciseItem {
  id: string;
  name: string;
  emoji: string;
  mets: number;
  intensity: ExerciseIntensity;
}

export const EXERCISE_DATA: ExerciseItem[] = [
  { id: 'walk_slow', name: '천천히 걷기',       emoji: '🚶', mets: 3.0,  intensity: 'low' },
  { id: 'walk_fast', name: '빠른 걷기',         emoji: '🚶', mets: 4.3,  intensity: 'low' },
  { id: 'jog',       name: '조깅',              emoji: '🏃', mets: 7.0,  intensity: 'mid' },
  { id: 'run',       name: '러닝',              emoji: '🏃', mets: 10.0, intensity: 'high' },
  { id: 'bike_slow', name: '자전거 (천천히)',   emoji: '🚴', mets: 4.0,  intensity: 'low' },
  { id: 'bike_fast', name: '자전거 (빠르게)',   emoji: '🚴', mets: 8.0,  intensity: 'high' },
  { id: 'swim',      name: '수영 (자유형)',     emoji: '🏊', mets: 8.0,  intensity: 'high' },
  { id: 'rope',      name: '줄넘기',            emoji: '🪢', mets: 10.0, intensity: 'high' },
  { id: 'stairs',    name: '계단 오르기',       emoji: '🪜', mets: 8.0,  intensity: 'high' },
  { id: 'yoga',      name: '요가',              emoji: '🧘', mets: 3.0,  intensity: 'low' },
  { id: 'pilates',   name: '필라테스',          emoji: '🤸', mets: 3.0,  intensity: 'low' },
  { id: 'weight',    name: '헬스 (웨이트)',     emoji: '🏋️', mets: 5.0,  intensity: 'mid' },
  { id: 'hike',      name: '등산 (보통 경사)',  emoji: '⛰️', mets: 7.0,  intensity: 'mid' },
  { id: 'house',     name: '청소·집안일',       emoji: '🧹', mets: 3.5,  intensity: 'low' },
  { id: 'dance',     name: '댄스 (유산소)',     emoji: '💃', mets: 5.0,  intensity: 'mid' },
];
