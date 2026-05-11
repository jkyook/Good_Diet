import React from 'react';

interface CalBalanceProps {
  dailyUsageCount: number;
  dailyLimit: number;
  calBalance: number;
  role: 'user' | 'admin';
  onClick: () => void;
}

export default function CalBalance({
  dailyUsageCount, dailyLimit, calBalance, role, onClick,
}: CalBalanceProps) {
  if (role === 'admin') {
    return (
      <button
        type="button"
        onClick={onClick}
        className="min-h-11 px-3 py-1 rounded-full text-xs font-black text-emerald-700 bg-emerald-50 ring-1 ring-emerald-200 active:scale-95 transition-transform"
        aria-label="운영자 모드, 무제한"
      >
        🛡️ 무제한
      </button>
    );
  }

  const limitReached = dailyUsageCount >= dailyLimit && calBalance < 1;
  const lowBalance = !limitReached && calBalance > 0 && calBalance <= 1 && dailyUsageCount >= dailyLimit;

  const bg = limitReached
    ? 'bg-orange-500 text-white'
    : lowBalance
    ? 'bg-orange-50 text-orange-600 ring-1 ring-orange-200'
    : 'bg-orange-50 text-slate-700';

  const remaining = Math.max(0, dailyLimit - dailyUsageCount);
  const ariaLabel = `오늘 분석 ${dailyUsageCount}회 사용, ${remaining}회 남음. cal ${calBalance} 보유. 탭하여 충전`;

  return (
    <button
      type="button"
      onClick={onClick}
      className={`min-h-11 px-3 py-1 rounded-full text-xs font-black active:scale-95 transition-transform inline-flex items-center gap-1.5 ${bg}`}
      aria-label={ariaLabel}
    >
      <span>{dailyUsageCount}/{dailyLimit}</span>
      <span className="opacity-50">·</span>
      <span aria-hidden="true">🌰</span>
      <span>{calBalance} cal</span>
    </button>
  );
}
