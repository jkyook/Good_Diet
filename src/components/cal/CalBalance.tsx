import React from 'react';

interface CalBalanceProps {
  calBalance: number;
  role: 'user' | 'admin';
  onClick: () => void;
}

export default function CalBalance({ calBalance, role, onClick }: CalBalanceProps) {
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

  // T-062: free 한도 분기 폐기 (T-061 RPC) — cal_balance만으로 시각 분기.
  const exhausted = calBalance < 1;
  const low = !exhausted && calBalance <= 1;

  const bg = exhausted
    ? 'bg-orange-500 text-white'
    : low
    ? 'bg-orange-50 text-orange-600 ring-1 ring-orange-200'
    : 'bg-orange-50 text-orange-700 ring-1 ring-orange-100';

  const ariaLabel = `cal ${calBalance} 보유. 탭하여 잔액 보기`;

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
