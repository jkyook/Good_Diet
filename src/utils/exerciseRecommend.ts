// 운동 추천 — 정적 룰 (서연 [T-055a] §1.1).
// 칼로리 초과: 강도별 3개 (걷기/자전거/조깅), 초과분 소비 기준 시간 산출.
// 정상/부족: 일상 활동 1~2개 (산책 30분/스트레칭 10분) — 사용자 요구 T-057 (2).
import { EXERCISE_DATA, type ExerciseIntensity } from '../data/exerciseData';

export interface ExerciseRec {
  id: string;
  name: string;
  emoji: string;
  durationMin: number;
  burnedKcal: number;
  intensity: ExerciseIntensity;
}

const DEFAULT_WEIGHT_KG = 60;

function calcRec(id: string, durationMin: number, weight: number): ExerciseRec | null {
  const item = EXERCISE_DATA.find(e => e.id === id);
  if (!item) return null;
  const kcalPerMin = item.mets * weight * 0.0175;
  return {
    id: item.id,
    name: item.name,
    emoji: item.emoji,
    durationMin,
    burnedKcal: Math.round(kcalPerMin * durationMin),
    intensity: item.intensity,
  };
}

export function recommendExercise(
  excessKcal: number,
  opts?: { weightKg?: number; count?: number },
): ExerciseRec[] {
  const weight = opts?.weightKg ?? DEFAULT_WEIGHT_KG;

  if (excessKcal <= 0) {
    // 정상/부족: 일상 활동 — 시간 고정값으로 가벼운 추천
    return [
      calcRec('walk_slow', 30, weight),
      calcRec('yoga', 10, weight),
    ].filter((e): e is ExerciseRec => !!e);
  }

  // 초과: 강도별 3개 — 초과분만큼 소비 시간 산출
  const count = opts?.count ?? 3;
  const picks = ['walk_fast', 'bike_slow', 'jog'];
  return picks
    .map(id => {
      const item = EXERCISE_DATA.find(e => e.id === id);
      if (!item) return null;
      const kcalPerMin = item.mets * weight * 0.0175;
      const durationMin = Math.max(5, Math.round(excessKcal / kcalPerMin));
      return calcRec(item.id, durationMin, weight);
    })
    .filter((e): e is ExerciseRec => !!e)
    .slice(0, count);
}
