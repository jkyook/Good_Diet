// 운동 추천 — 정적 룰. 칼로리 초과 시만 추천 (서연 [T-055a] §1.1).
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

export function recommendExercise(
  excessKcal: number,
  opts?: { weightKg?: number; count?: number },
): ExerciseRec[] {
  if (excessKcal <= 0) return [];
  const weight = opts?.weightKg ?? DEFAULT_WEIGHT_KG;
  const count = opts?.count ?? 3;

  // 강도별 균형 — 저/중/고 1개씩이 기본
  const picks = ['walk_fast', 'bike_slow', 'jog'];
  const candidates = picks
    .map(id => EXERCISE_DATA.find(e => e.id === id))
    .filter((e): e is NonNullable<typeof e> => !!e);

  return candidates.slice(0, count).map(c => {
    const kcalPerMin = c.mets * weight * 0.0175;
    const durationMin = Math.max(5, Math.round(excessKcal / kcalPerMin));
    return {
      id: c.id,
      name: c.name,
      emoji: c.emoji,
      durationMin,
      burnedKcal: Math.round(kcalPerMin * durationMin),
      intensity: c.intensity,
    };
  });
}
