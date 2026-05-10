import React from 'react';
import { motion } from 'motion/react';
import { Utensils, Dumbbell, IceCream, AlertTriangle, Clock, Flame } from 'lucide-react';
import type { Recommendations } from '../services/geminiService';

interface Props {
  recommendations: Recommendations;
}

export default function RecommendationCards({ recommendations }: Props) {
  const { nextMeals, exercises, desserts, avoidFoods } = recommendations;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="space-y-3"
    >
      {/* 다음 식사 추천 */}
      {nextMeals.length > 0 && (
        <div className="bg-white border-[3px] border-slate-900 shadow-[6px_6px_0_0_rgba(15,23,42,1)] p-5">
          <h4 className="text-[10px] font-black uppercase text-slate-400 mb-3 flex items-center gap-2 tracking-widest">
            <Utensils className="w-3.5 h-3.5 text-orange-500" /> 다음 식사 추천
          </h4>
          <div className="space-y-2">
            {nextMeals.map((meal, i) => (
              <div key={i} className="flex items-start gap-2">
                <span className="text-orange-500 font-black text-sm leading-none mt-0.5">{i + 1}</span>
                <p className="text-sm font-bold text-slate-800 leading-snug">{meal}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 운동 추천 */}
      {exercises.length > 0 && (
        <div className="bg-sky-50 border-[3px] border-slate-900 shadow-[6px_6px_0_0_rgba(15,23,42,1)] p-5">
          <h4 className="text-[10px] font-black uppercase text-slate-400 mb-3 flex items-center gap-2 tracking-widest">
            <Dumbbell className="w-3.5 h-3.5 text-sky-500" /> 운동 추천
          </h4>
          <div className="space-y-2">
            {exercises.map((ex, i) => (
              <div key={i} className="bg-white border-[2px] border-slate-900 p-3 shadow-[3px_3px_0_0_rgba(15,23,42,1)]">
                <p className="text-sm font-black text-slate-900">{ex.name}</p>
                <div className="flex gap-3 mt-1.5">
                  <span className="flex items-center gap-1 text-[10px] font-bold text-slate-500">
                    <Clock className="w-3 h-3" /> {ex.duration}
                  </span>
                  {ex.burnCalories > 0 && (
                    <span className="flex items-center gap-1 text-[10px] font-bold text-orange-500">
                      <Flame className="w-3 h-3" /> ~{ex.burnCalories} kcal
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 건강 디저트 */}
      {desserts.length > 0 && (
        <div className="bg-purple-50 border-[3px] border-slate-900 shadow-[6px_6px_0_0_rgba(15,23,42,1)] p-5">
          <h4 className="text-[10px] font-black uppercase text-slate-400 mb-3 flex items-center gap-2 tracking-widest">
            <IceCream className="w-3.5 h-3.5 text-purple-500" /> 건강 디저트 페어링
          </h4>
          <div className="flex flex-wrap gap-2">
            {desserts.map((d, i) => (
              <span
                key={i}
                className="bg-white border-[2px] border-slate-900 px-3 py-1.5 text-xs font-black shadow-[2px_2px_0_0_rgba(15,23,42,1)]"
              >
                {d}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* 주의 음식 */}
      {avoidFoods.length > 0 && (
        <div className="bg-rose-50 border-[3px] border-rose-400 shadow-[6px_6px_0_0_rgba(251,113,133,1)] p-5">
          <h4 className="text-[10px] font-black uppercase text-rose-600 mb-3 flex items-center gap-2 tracking-widest">
            <AlertTriangle className="w-3.5 h-3.5" /> 오늘 남은 식사 주의
          </h4>
          <div className="space-y-1">
            {avoidFoods.map((f, i) => (
              <p key={i} className="text-xs font-bold text-rose-700 flex items-start gap-1.5">
                <span className="mt-0.5">•</span> {f}
              </p>
            ))}
          </div>
        </div>
      )}
    </motion.div>
  );
}
