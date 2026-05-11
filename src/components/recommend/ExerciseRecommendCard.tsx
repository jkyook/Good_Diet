import React from 'react';
import type { ExerciseRec } from '../../utils/exerciseRecommend';

interface ExerciseRecommendCardProps {
  excessKcal: number;
  exercises: ExerciseRec[];
}

function headline(excess: number): string {
  if (excess <= 0)   return '오늘의 활동 추천 — 가볍게 산책 어떠세요?';
  if (excess >= 300) return '오늘은 충분히 즐기셨네요! 가벼운 운동 한 번 어떠세요?';
  return '오늘은 좀 든든하셨네요! 산책 어떠세요?';
}

export default function ExerciseRecommendCard({ excessKcal, exercises }: ExerciseRecommendCardProps) {
  if (exercises.length === 0) return null;
  return (
    <section
      role="region"
      aria-label="운동 추천"
      className="bg-emerald-50 border border-emerald-100 rounded-2xl p-4 space-y-3"
    >
      <div>
        <h3 className="text-sm font-black text-emerald-700">
          {excessKcal > 0 ? '🏃 운동 추천' : '🚶 오늘의 활동'}
        </h3>
        <p className="mt-1 text-xs font-bold text-emerald-700/80">{headline(excessKcal)}</p>
      </div>
      <ul className="space-y-2">
        {exercises.map(ex => (
          <li
            key={ex.id}
            className="bg-white rounded-xl px-3 py-2 flex items-center gap-2 text-sm"
          >
            <span aria-hidden="true">{ex.emoji}</span>
            <span className="font-black text-slate-800 flex-1 truncate">{ex.name}</span>
            <span className="text-xs font-bold text-slate-500">{ex.durationMin}분</span>
            <span className="text-xs font-black text-emerald-600">−{ex.burnedKcal} kcal</span>
          </li>
        ))}
      </ul>
      <p className="text-[10px] font-bold text-emerald-700/60">* 60kg 성인 기준, 개인 차이 있어요</p>
    </section>
  );
}
