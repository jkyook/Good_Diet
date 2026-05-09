import React, { useState } from 'react';
import { motion } from 'motion/react';
import { AlertTriangle, ChevronDown, ChevronUp, Lightbulb, Star } from 'lucide-react';
import { AnalysisResult, MealType } from '../services/geminiService';

// 일일 권장량 기준 (수아 T-010 설계)
const DAILY_REF = { protein: 55, carbs: 324, fat: 54, sodium: 2000 };

const MEAL_TYPE_LABELS: Record<MealType, { emoji: string; label: string }> = {
  breakfast: { emoji: '🌅', label: '아침' },
  lunch:     { emoji: '☀️', label: '점심' },
  dinner:    { emoji: '🌙', label: '저녁' },
  snack:     { emoji: '🍎', label: '간식' },
};

// 적정(70~100%): #22C55E | 부족(~70%): #EAB308 | 초과(100%+): #EF4444
function ratioBg(pct: number): string {
  if (pct >= 100) return '#EF4444';
  if (pct >= 70)  return '#22C55E';
  return '#EAB308';
}
function ratioLabel(pct: number): string {
  if (pct >= 100) return '초과';
  if (pct >= 70)  return '적정';
  return '부족';
}
function ratioTextColor(pct: number): string {
  if (pct >= 100) return 'text-red-500';
  if (pct >= 70)  return 'text-green-500';
  return 'text-yellow-500';
}

const CONFIDENCE_STYLE: Record<string, string> = {
  '높음': 'bg-green-100 text-green-700 border-green-300',
  '중간': 'bg-yellow-100 text-yellow-700 border-yellow-300',
  '낮음': 'bg-red-100 text-red-700 border-red-300',
};

interface Props {
  meal: AnalysisResult & { id: string; image: string; mealType: MealType };
  dailyCalorieTarget: number;
  dailyCalorieConsumed: number;
  onBack: () => void;
}

export default function AnalysisResultCard({ meal, dailyCalorieTarget, dailyCalorieConsumed, onBack }: Props) {
  const [weightOverride, setWeightOverride] = useState<number>(meal.weightGrams);
  const [showIngredients, setShowIngredients] = useState(true);
  const [showNutrition, setShowNutrition] = useState(true);

  const confidence = meal.confidence ?? meal.portionEstimate?.confidence ?? '중간';
  const totals = meal.totals ?? {
    calories: meal.calories,
    protein: meal.protein,
    carbs: meal.carbs,
    fat: meal.fat,
    sodium: 0,
  };
  const mealLabel = MEAL_TYPE_LABELS[meal.mealType];
  const caloriePct = Math.round((dailyCalorieConsumed / dailyCalorieTarget) * 100);

  return (
    <div className="space-y-3">

      {/* ── 섹션 1: 요약 카드 ── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {meal.image && (
          <div className="relative aspect-video">
            <img src={meal.image} className="w-full h-full object-cover" alt={meal.foodName} />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
            {/* 식사 타입 뱃지 */}
            <div className="absolute top-3 left-3 flex items-center gap-2">
              <span className="bg-white/90 backdrop-blur-sm text-xs font-bold px-2.5 py-1 rounded-full">
                {mealLabel.emoji} {mealLabel.label}
              </span>
              <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${CONFIDENCE_STYLE[confidence] ?? CONFIDENCE_STYLE['중간']}`}>
                신뢰도 {confidence}
              </span>
            </div>
            {/* 칼로리 오버레이 */}
            <div className="absolute bottom-3 right-3 text-right">
              <p className="text-3xl font-black text-white leading-none">
                {totals.calories.toLocaleString()}
                <span className="text-sm font-normal ml-1">kcal</span>
              </p>
              <p className="text-white/70 text-xs">{weightOverride}g</p>
            </div>
          </div>
        )}

        <div className="p-4">
          {/* 음식명 + 감지 태그 */}
          <h2 className="text-lg font-black text-gray-900">{meal.foodName}</h2>
          <div className="flex flex-wrap gap-1.5 mt-2">
            {meal.detectedFoods?.map(f => (
              <span key={f} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{f}</span>
            ))}
            {meal.category && (
              <span className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full">{meal.category}</span>
            )}
            {meal.cookingMethod && (
              <span className="text-xs bg-orange-50 text-orange-600 px-2 py-0.5 rounded-full">{meal.cookingMethod}</span>
            )}
            {meal.sauce && meal.sauce !== '없음' && (
              <span className="text-xs bg-purple-50 text-purple-600 px-2 py-0.5 rounded-full">{meal.sauce}</span>
            )}
          </div>

          {/* 일일 칼로리 진행 바 */}
          <div className="mt-4 space-y-1">
            <div className="flex justify-between text-xs text-gray-500">
              <span>오늘 총 섭취</span>
              <span className={ratioTextColor(caloriePct)}>
                {dailyCalorieConsumed} / {dailyCalorieTarget} kcal ({caloriePct}%)
              </span>
            </div>
            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${Math.min(caloriePct, 100)}%` }}
                transition={{ duration: 0.8 }}
                className="h-full rounded-full"
                style={{ backgroundColor: ratioBg(caloriePct) }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* ── 섹션 2: 재료별 breakdown ── */}
      {meal.ingredients && meal.ingredients.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <button
            onClick={() => setShowIngredients(e => !e)}
            className="flex items-center justify-between w-full p-4"
          >
            <span className="text-sm font-bold text-gray-700">재료별 분석</span>
            {showIngredients ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
          </button>
          {showIngredients && (
            <div className="px-4 pb-4 space-y-3">
              {meal.ingredients.map((ing, i) => (
                <div key={i}>
                  <div className="flex items-center justify-between mb-1">
                    <div>
                      <span className="text-sm font-medium text-gray-800">{ing.name}</span>
                      <span className="text-xs text-gray-400 ml-1.5">({ing.parentFood})</span>
                    </div>
                    <div className="text-right text-xs text-gray-500">
                      <span className="font-medium">{ing.weightGrams}g</span>
                      <span className="ml-1.5">{ing.calories}kcal</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${ing.ratio}%` }}
                        transition={{ duration: 0.6, delay: i * 0.05 }}
                        className="h-full rounded-full bg-emerald-400"
                      />
                    </div>
                    <span className="text-xs text-gray-400 w-8 text-right">{ing.ratio}%</span>
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">
                    탄 {ing.carbs}g · 단 {ing.protein}g · 지 {ing.fat}g
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── 섹션 3: 영양소 상세 (일일 권장량 대비) ── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <button
          onClick={() => setShowNutrition(e => !e)}
          className="flex items-center justify-between w-full p-4"
        >
          <span className="text-sm font-bold text-gray-700">영양소 상세</span>
          {showNutrition ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
        </button>
        {showNutrition && (
          <div className="px-4 pb-4 space-y-3">
            {([
              { label: '단백질', value: totals.protein, ref: DAILY_REF.protein, unit: 'g' },
              { label: '탄수화물', value: totals.carbs, ref: DAILY_REF.carbs, unit: 'g' },
              { label: '지방', value: totals.fat, ref: DAILY_REF.fat, unit: 'g' },
              { label: '나트륨', value: totals.sodium, ref: DAILY_REF.sodium, unit: 'mg' },
            ] as const).map(({ label, value, ref, unit }) => {
              const pct = Math.round((value / ref) * 100);
              return (
                <div key={label}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm text-gray-700">{label}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500">{value}{unit} / {ref}{unit}</span>
                      <span className={`text-xs font-semibold ${ratioTextColor(pct)}`}>
                        {pct}% {ratioLabel(pct)}
                      </span>
                    </div>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.min(pct, 100)}%` }}
                      transition={{ duration: 0.7 }}
                      className="h-full rounded-full"
                      style={{ backgroundColor: ratioBg(pct) }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── 섹션 4: 식사 평가 ── */}
      {(meal.mealScore || meal.improvements?.length || meal.warnings?.length) && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-3">
          <h3 className="text-sm font-bold text-gray-700">식사 평가</h3>

          {meal.mealScore && (
            <div className="grid grid-cols-3 gap-2">
              {([
                { key: '균형', value: meal.mealScore.balance },
                { key: '단백질', value: meal.mealScore.proteinSufficiency },
                { key: '채소', value: meal.mealScore.vegetableRatio },
              ]).map(({ key, value }) => (
                <div key={key} className="bg-gray-50 rounded-xl p-2 text-center">
                  <p className="text-xs text-gray-400">{key}</p>
                  <p className="text-sm font-bold text-gray-700 mt-0.5">{value}</p>
                </div>
              ))}
            </div>
          )}

          {meal.improvements && meal.improvements.length > 0 && (
            <div className="space-y-1.5">
              {meal.improvements.map((tip, i) => (
                <div key={i} className="flex items-start gap-2">
                  <Lightbulb size={13} className="text-yellow-500 mt-0.5 flex-shrink-0" />
                  <p className="text-xs text-gray-600">{tip}</p>
                </div>
              ))}
            </div>
          )}

          {meal.warnings && meal.warnings.length > 0 && (
            <div className="space-y-1.5">
              {meal.warnings.map((w, i) => (
                <div key={i} className="flex items-start gap-2">
                  <AlertTriangle size={13} className="text-red-400 mt-0.5 flex-shrink-0" />
                  <p className="text-xs text-red-600">{w}</p>
                </div>
              ))}
            </div>
          )}

          {meal.mealTip && (
            <div className="flex items-start gap-2 pt-1 border-t border-gray-50">
              <Star size={13} className="text-orange-400 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-gray-600">{meal.mealTip}</p>
            </div>
          )}
        </div>
      )}

      {/* ── 섹션 5: 양 추정 근거 + 수정 ── */}
      {meal.portionEstimate && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-3">
          <h3 className="text-sm font-bold text-gray-700">양 추정 근거</h3>
          <div className="flex items-center justify-between text-xs text-gray-500">
            <span>{meal.portionEstimate.method}</span>
            <span className="font-medium text-gray-700">{meal.portionEstimate.referenceObject}</span>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-500 whitespace-nowrap">실제 무게 수정:</label>
            <input
              type="number"
              value={weightOverride}
              onChange={e => setWeightOverride(Number(e.target.value))}
              className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-emerald-400"
              min={1}
              max={3000}
            />
            <span className="text-xs text-gray-400">g</span>
          </div>
          <p className="text-xs text-gray-400">
            * 수정값은 현재 세션에만 반영됩니다. 정확한 무게 측정 시 직접 입력하세요.
          </p>
        </div>
      )}

      {/* 의료 면책 디스클레이머 */}
      <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3">
        <p className="text-[11px] leading-relaxed text-amber-900">
          ⚠️ 본 서비스는 <span className="font-semibold">의료기기가 아니며</span>, 의사의 진단·치료·처방을 대체할 수 없습니다.
          영양 정보는 일반 참고용이며, 건강 상태에 따라 전문가와 상의하세요.
        </p>
      </div>

      {/* 뒤로 가기 */}
      <button
        onClick={onBack}
        className="w-full bg-gray-900 text-white py-4 rounded-2xl text-sm font-bold active:scale-95 transition-transform"
      >
        ← 분석 화면으로
      </button>
    </div>
  );
}
