import React from 'react';

export type AnalyzeMode = 'single' | 'batch';

interface AnalyzeModeTabsProps {
  mode: AnalyzeMode;
  onChange: (mode: AnalyzeMode) => void;
  /** 분석/배치 진행 중일 때 모드 전환 차단 */
  locked?: boolean;
}

const TABS: { id: AnalyzeMode; emoji: string; label: string }[] = [
  { id: 'single', emoji: '📷', label: '한 장' },
  { id: 'batch',  emoji: '🖼', label: '여러 장' },
];

export default function AnalyzeModeTabs({ mode, onChange, locked = false }: AnalyzeModeTabsProps) {
  return (
    <div
      role="tablist"
      aria-label="분석 모드"
      className={`grid grid-cols-2 border-b border-slate-200 mb-4 ${locked ? 'pointer-events-none opacity-50' : ''}`}
    >
      {TABS.map(t => {
        const active = t.id === mode;
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(t.id)}
            className={`min-h-11 py-2.5 text-xs font-black transition-colors border-b-2 ${active ? 'text-orange-500 border-orange-500' : 'text-slate-400 border-transparent'}`}
          >
            <span className="mr-1" aria-hidden="true">{t.emoji}</span>{t.label}
          </button>
        );
      })}
    </div>
  );
}
