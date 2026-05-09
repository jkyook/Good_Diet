import { useEffect, useState } from 'react';
import { CheckCircle2, RefreshCw, X } from 'lucide-react';
import type { AnalysisProgressProps, AnalysisStepStatus } from './AnalysisProgress.types';

function getStatus(i: number, currentIndex: number): AnalysisStepStatus {
  if (i < currentIndex) return 'done';
  if (i === currentIndex) return 'current';
  return 'pending';
}

function useCountdown(initialSec: number | undefined): number | null {
  const [remaining, setRemaining] = useState<number | null>(
    typeof initialSec === 'number' ? Math.max(0, Math.floor(initialSec)) : null,
  );

  useEffect(() => {
    if (typeof initialSec !== 'number') {
      setRemaining(null);
      return;
    }
    setRemaining(Math.max(0, Math.floor(initialSec)));
    const timer = setInterval(() => {
      setRemaining(prev => (prev === null || prev <= 0 ? prev : prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [initialSec]);

  return remaining;
}

export default function AnalysisProgress({
  steps,
  currentIndex,
  etaSeconds,
  detailByIndex,
  onRetry,
  onCancel,
  imageUrl,
  modeLabel,
}: AnalysisProgressProps) {
  const remaining = useCountdown(etaSeconds);
  const allDone = currentIndex >= steps.length;
  const displayCurrent = Math.min(Math.max(currentIndex, 0), steps.length - 1);

  return (
    <div className="bg-white border-[3px] border-slate-900 shadow-[8px_8px_0_0_rgba(15,23,42,1)] overflow-hidden">
      {/* 헤더 */}
      <div className="bg-slate-900 text-white px-5 py-4 flex justify-between items-center">
        <div className="flex items-center gap-2">
          <RefreshCw
            className="w-4 h-4 text-orange-400 motion-safe:animate-spin"
            aria-hidden="true"
          />
          <span className="text-sm font-black uppercase tracking-wider">
            {modeLabel ?? '분석 중'}
          </span>
        </div>
        <p className="text-[10px] font-black text-orange-400 uppercase">
          {Math.min(displayCurrent + (allDone ? 0 : 1), steps.length)}/{steps.length}
          {remaining !== null && remaining > 0 && (
            <span className="ml-2 text-orange-300">~{remaining}s</span>
          )}
        </p>
      </div>

      {/* 진행 바 */}
      <div
        className="h-1.5 bg-slate-100"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={steps.length}
        aria-valuenow={Math.min(currentIndex + (allDone ? 0 : 1), steps.length)}
        aria-label="분석 진행률"
      >
        <div
          className="h-full bg-orange-500 transition-[width] duration-500"
          style={{
            width: `${(Math.min(currentIndex + (allDone ? 0 : 1), steps.length) / steps.length) * 100}%`,
          }}
        />
      </div>

      {/* 이미지 미리보기 */}
      {imageUrl && (
        <div className="relative aspect-video overflow-hidden">
          <img src={imageUrl} className="w-full h-full object-cover" alt="분석 중인 음식" />
          <div className="absolute inset-0 bg-orange-500/10 motion-safe:animate-pulse motion-reduce:opacity-60" />
          <div className="absolute bottom-0 left-0 right-0 bg-slate-900/80 py-2 text-center">
            <span className="text-[9px] font-black uppercase text-orange-400 tracking-widest">
              SCANNING...
            </span>
          </div>
        </div>
      )}

      {/* 단계 리스트 — 세로선 포함 */}
      <ol className="p-5 relative" aria-label="분석 단계">
        {steps.map((step, i) => {
          const status = getStatus(i, currentIndex);
          const isLast = i === steps.length - 1;
          const detail = detailByIndex?.[i];
          return (
            <li key={step.id ?? `step-${i}`} className="relative flex gap-3 pb-3 last:pb-0">
              {/* 세로 연결선 (마지막 단계 제외) */}
              {!isLast && (
                <span
                  aria-hidden="true"
                  className={`absolute left-[11px] top-7 bottom-0 w-0.5 ${
                    status === 'done' ? 'bg-emerald-500' : 'bg-slate-200'
                  }`}
                />
              )}

              {/* 아이콘 (✓ / ● / ○) */}
              <div className="relative shrink-0 z-10">
                {status === 'done' && (
                  <CheckCircle2 className="w-6 h-6 text-emerald-500 bg-white" aria-label="완료" />
                )}
                {status === 'current' && (
                  <span
                    className="block w-6 h-6 rounded-full bg-orange-500 ring-4 ring-orange-200 motion-safe:animate-pulse motion-reduce:opacity-90"
                    aria-label="진행 중"
                    role="img"
                  />
                )}
                {status === 'pending' && (
                  <span
                    className="block w-6 h-6 rounded-full border-2 border-slate-300 bg-white"
                    aria-label="대기"
                    role="img"
                  />
                )}
              </div>

              {/* 라벨 + 디테일 */}
              <div className="flex-1 min-w-0">
                <p
                  className={`text-xs font-black uppercase tracking-wide ${
                    status === 'current'
                      ? 'text-orange-600'
                      : status === 'done'
                      ? 'text-emerald-700'
                      : 'text-slate-400'
                  }`}
                >
                  {step.label}
                </p>
                <p
                  className={`text-[11px] mt-0.5 ${
                    status === 'current' ? 'text-orange-500 font-semibold' : 'text-slate-400'
                  }`}
                >
                  {detail || step.description || ' '}
                </p>
              </div>
            </li>
          );
        })}
      </ol>

      {/* 액션 버튼 (옵션) */}
      {(onRetry || onCancel) && (
        <div className="px-5 pb-5 flex gap-2">
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 flex items-center justify-center gap-1.5 border-2 border-slate-300 text-slate-600 py-2.5 rounded-xl text-xs font-bold uppercase active:scale-95 transition-transform"
            >
              <X className="w-3.5 h-3.5" /> 취소
            </button>
          )}
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="flex-1 flex items-center justify-center gap-1.5 bg-orange-500 text-white py-2.5 rounded-xl text-xs font-bold uppercase active:scale-95 transition-transform"
            >
              <RefreshCw className="w-3.5 h-3.5" /> 재시도
            </button>
          )}
        </div>
      )}
    </div>
  );
}
