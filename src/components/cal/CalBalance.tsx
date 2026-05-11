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
  const lowBalance = !limitReached && calBalance <= 1 && dailyUsageCount >= dailyLimit;

  // T-060 (3): admin "🛡️ 무제한"과 비슷한 단순 아이콘 칩으로 통일.
  // 사용량(N/3)은 모달 안에서 확인 — chip은 잔액만 표시.
  const bg = limitReached
    ? 'bg-orange-500 text-white'
    : lowBalance
    ? 'bg-orange-50 text-orange-600 ring-1 ring-orange-200'
    : 'bg-orange-50 text-orange-700 ring-1 ring-orange-100';

  const remaining = Math.max(0, dailyLimit - dailyUsageCount);
  const ariaLabel = `cal ${calBalance} 보유. 오늘 무료 분석 ${remaining}회 남음. 탭하여 잔액 보기`;

  return (
    <button
      type="button"
      onClick={onClick}
      className={`min-h-11 px-3 py-1 rounded-full text-xs font-black active:scale-95 transition-transform inline-flex items-center gap-1 ${bg}`}
      aria-label={ariaLabel}
    >
      <span aria-hidden="true">🌰</span>
      <span>{calBalance} cal</span>
    </button>
  );
}
