import React from 'react';
import type { SnackRec } from '../../utils/snackRecommend';

interface SnackRecommendCardProps {
  snacks: SnackRec[];
  missing: string[];
}

export default function SnackRecommendCard({ snacks, missing }: SnackRecommendCardProps) {
  if (snacks.length === 0) return null;
  const headline = missing.length > 0
    ? `${missing.join(', ')}이 살짝 부족해요`
    : '여유분에 맞는 가벼운 간식이에요';

  return (
    <section
      role="region"
      aria-label="간식 추천"
      className="bg-amber-50 border border-amber-100 rounded-2xl p-4 space-y-3"
    >
      <div>
        <h3 className="text-sm font-black text-amber-700">🍪 간식 추천</h3>
        <p className="mt-1 text-xs font-bold text-amber-700/80">{headline}</p>
      </div>
      <ul className="space-y-2">
        {snacks.map(s => (
          <li
            key={s.id}
            className="bg-white rounded-xl px-3 py-2 flex items-center gap-2 text-sm"
          >
            <span aria-hidden="true">{s.emoji}</span>
            <div className="flex-1 min-w-0">
              <p className="font-black text-slate-800 truncate">{s.name}</p>
              <p className="text-[11px] font-bold text-slate-500">{s.serving} · {s.kcal} kcal · {s.mainNutrient}</p>
            </div>
          </li>
        ))}
      </ul>
      <p className="text-[10px] font-bold text-amber-700/60">* 일반 분량 기준, 알레르기·기저질환은 별도 확인</p>
    </section>
  );
}
