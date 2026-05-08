import React, { useState, useEffect } from 'react';
import { Trash2, ChevronDown, ChevronUp, RotateCcw } from 'lucide-react';
import { MealRecord, getDaySummary, deleteMeal, clearDay, getMealsByDate, DaySummary } from '../services/mealStore';
import { MealType } from '../services/geminiService';

const MEAL_LABELS: Record<MealType, { emoji: string; label: string }> = {
  breakfast: { emoji: '🌅', label: '아침' },
  lunch:     { emoji: '☀️', label: '점심' },
  dinner:    { emoji: '🌙', label: '저녁' },
  snack:     { emoji: '🍎', label: '간식' },
};

const MEAL_ORDER: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];

interface Props {
  date?: string; // YYYY-MM-DD, 기본값 오늘
  dailyCalorieTarget?: number;
  onMealDeleted?: () => void;
}

export default function DayMealLog({ date, dailyCalorieTarget = 2000, onMealDeleted }: Props) {
  const today = new Date().toISOString().slice(0, 10);
  const targetDate = date ?? today;

  const [summary, setSummary] = useState<DaySummary>(() => getDaySummary(targetDate));
  const [expandedTypes, setExpandedTypes] = useState<Set<MealType>>(new Set(['breakfast', 'lunch', 'dinner', 'snack']));

  const refresh = () => setSummary(getDaySummary(targetDate));

  useEffect(() => { refresh(); }, [targetDate]);

  const handleDelete = (id: string) => {
    deleteMeal(id);
    refresh();
    onMealDeleted?.();
  };

  const handleClearDay = () => {
    if (!window.confirm(`${targetDate} 식단을 모두 삭제할까요?`)) return;
    clearDay(targetDate);
    refresh();
    onMealDeleted?.();
  };

  const toggleType = (type: MealType) => {
    setExpandedTypes(prev => {
      const next = new Set(prev);
      next.has(type) ? next.delete(type) : next.add(type);
      return next;
    });
  };

  const calorieRatio = Math.min((summary.totalCalories / dailyCalorieTarget) * 100, 100);
  const isToday = targetDate === today;

  return (
    <div className="space-y-4">
      {/* 일일 요약 */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="font-bold text-gray-800">
              {isToday ? '오늘' : targetDate} 식단
            </h3>
            <p className="text-xs text-gray-400">{summary.mealCount}끼 기록됨</p>
          </div>
          {summary.mealCount > 0 && (
            <button
              onClick={handleClearDay}
              className="flex items-center gap-1 text-xs text-red-400 hover:text-red-600"
            >
              <RotateCcw size={12} />
              초기화
            </button>
          )}
        </div>

        {/* 칼로리 진행 바 */}
        <div className="space-y-1 mb-3">
          <div className="flex justify-between text-xs text-gray-500">
            <span>{summary.totalCalories} kcal 섭취</span>
            <span>목표 {dailyCalorieTarget} kcal</span>
          </div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                calorieRatio >= 100 ? 'bg-red-400' : calorieRatio >= 75 ? 'bg-yellow-400' : 'bg-emerald-400'
              }`}
              style={{ width: `${calorieRatio}%` }}
            />
          </div>
        </div>

        {/* 영양소 요약 */}
        <div className="grid grid-cols-3 gap-2 text-center">
          {[
            { label: '탄수화물', value: summary.totalCarbs, unit: 'g', color: 'text-blue-500' },
            { label: '단백질',  value: summary.totalProtein, unit: 'g', color: 'text-emerald-500' },
            { label: '지방',    value: summary.totalFat, unit: 'g', color: 'text-orange-500' },
          ].map(({ label, value, unit, color }) => (
            <div key={label} className="bg-gray-50 rounded-xl p-2">
              <p className={`text-sm font-bold ${color}`}>{Math.round(value)}{unit}</p>
              <p className="text-xs text-gray-400">{label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* 끼니별 기록 */}
      {MEAL_ORDER.map(type => {
        const records = summary.byType[type];
        if (!records.length) return null;
        const isOpen = expandedTypes.has(type);
        const { emoji, label } = MEAL_LABELS[type];
        const typeCal = records.reduce((s, r) => s + r.analysis.calories, 0);

        return (
          <div key={type} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <button
              onClick={() => toggleType(type)}
              className="flex items-center justify-between w-full p-4"
            >
              <div className="flex items-center gap-2">
                <span className="text-lg">{emoji}</span>
                <span className="font-semibold text-gray-700">{label}</span>
                <span className="text-xs text-gray-400">{records.length}가지 · {typeCal} kcal</span>
              </div>
              {isOpen ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
            </button>

            {isOpen && (
              <div className="border-t border-gray-50">
                {records.map(record => (
                  <MealRow key={record.id} record={record} onDelete={() => handleDelete(record.id)} />
                ))}
              </div>
            )}
          </div>
        );
      })}

      {summary.mealCount === 0 && (
        <div className="text-center py-8 text-gray-400">
          <p className="text-3xl mb-2">🍽️</p>
          <p className="text-sm">아직 기록된 식사가 없어요</p>
        </div>
      )}
    </div>
  );
}

function MealRow({ record, onDelete }: { record: MealRecord; onDelete: () => void }) {
  const { analysis } = record;
  return (
    <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-50 last:border-0">
      <img
        src={record.image}
        className="w-12 h-12 object-cover rounded-xl flex-shrink-0"
        alt={analysis.foodName}
      />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-800 truncate">{analysis.foodName}</p>
        <div className="flex items-center gap-1.5 mt-0.5">
          <span className="text-xs text-gray-500">{analysis.calories} kcal</span>
          {analysis.weightGrams > 0 && (
            <span className="text-xs text-gray-400">· {analysis.weightGrams}g</span>
          )}
          {analysis.cookingMethod && (
            <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">
              {analysis.cookingMethod}
            </span>
          )}
        </div>
      </div>
      <button
        onClick={onDelete}
        className="p-2 text-gray-300 hover:text-red-400 transition-colors flex-shrink-0"
      >
        <Trash2 size={15} />
      </button>
    </div>
  );
}
