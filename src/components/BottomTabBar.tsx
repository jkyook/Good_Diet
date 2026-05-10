import React from 'react';
import { Home, Camera, History, TrendingUp } from 'lucide-react';

export type MainTab = 'home' | 'analyze' | 'history' | 'stats';

interface BottomTabBarProps {
  activeTab: MainTab;
  onChange: (tab: MainTab) => void;
}

const TABS: { id: MainTab; icon: React.ReactNode; label: string }[] = [
  { id: 'home',    icon: <Home className="w-5 h-5" />,        label: '홈' },
  { id: 'analyze', icon: <Camera className="w-5 h-5" />,      label: '분석' },
  { id: 'history', icon: <History className="w-5 h-5" />,     label: '기록' },
  { id: 'stats',   icon: <TrendingUp className="w-5 h-5" />,  label: '통계' },
];

export default function BottomTabBar({ activeTab, onChange }: BottomTabBarProps) {
  return (
    <nav
      className="fixed bottom-0 inset-x-0 z-30 bg-[#f7f3ed]/95 backdrop-blur border-t border-orange-100 grid grid-cols-4"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      role="navigation"
      aria-label="주요 탭"
    >
      {TABS.map(tab => {
        const active = tab.id === activeTab;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            aria-current={active ? 'page' : undefined}
            aria-label={tab.label}
            className={`relative h-16 flex flex-col items-center justify-center gap-0.5 transition-colors ${active ? 'text-orange-500' : 'text-slate-400'}`}
          >
            {active && (
              <span className="absolute top-0 left-1/2 -translate-x-1/2 w-10 h-0.5 bg-orange-500 rounded-full" aria-hidden="true" />
            )}
            {tab.icon}
            <span className={`text-[11px] ${active ? 'font-black' : 'font-bold'}`}>{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
