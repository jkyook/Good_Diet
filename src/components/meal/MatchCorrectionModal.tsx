import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';

export type CorrectionReason = 'other_menu' | 'other_brand' | 'wrong_recognition' | 'etc';

interface MatchCorrectionModalProps {
  open: boolean;
  /** AI(Grok)가 인식한 음식명 */
  aiResultFoodName: string;
  /** DB 매칭된 음식명 (있으면 표시) */
  matchedFoodName?: string | null;
  /** DB 매칭 유사도 (있으면 표시) */
  matchSimilarity?: number | null;
  /** 매칭된 foods.id — 신고 payload에 포함 */
  matchedFoodId?: string | null;
  /** 어떤 meal_history 행에 대한 신고인지 — 매칭 추적용 */
  mealHistoryId?: string | null;
  onSubmit: (input: {
    user_correction: string;
    reason: CorrectionReason;
  }) => Promise<boolean> | boolean;
  onClose: () => void;
}

const REASON_OPTIONS: { v: CorrectionReason; label: string }[] = [
  { v: 'other_menu',         label: '다른 메뉴예요' },
  { v: 'other_brand',        label: '같은 메뉴 다른 브랜드' },
  { v: 'wrong_recognition',  label: '음식 자체를 잘못 인식' },
  { v: 'etc',                label: '기타' },
];

export default function MatchCorrectionModal({
  open, aiResultFoodName, matchedFoodName, matchSimilarity, onSubmit, onClose,
}: MatchCorrectionModalProps) {
  const [correction, setCorrection] = useState('');
  const [reason, setReason] = useState<CorrectionReason>('other_menu');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setCorrection('');
      setReason('other_menu');
      setError(null);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  const canSubmit = correction.trim().length > 0 && !submitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const ok = await onSubmit({ user_correction: correction.trim(), reason });
      if (ok) onClose();
      else setError('신고 저장에 실패했어요. 잠시 후 다시 시도해주세요.');
    } catch (e) {
      setError(e instanceof Error ? e.message : '신고 처리 중 오류가 발생했어요.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[150] flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="matchCorrectionTitle"
          onClick={onClose}
        >
          <motion.div
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            className="bg-white w-full sm:max-w-md sm:mx-4 rounded-t-3xl sm:rounded-3xl flex flex-col max-h-[88vh]"
            style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
              <h2 id="matchCorrectionTitle" className="text-base font-black text-slate-900">
                📚 매칭 정정 신고
              </h2>
              <button
                type="button"
                onClick={onClose}
                aria-label="닫기"
                className="min-h-11 min-w-11 text-xs font-black text-slate-400 px-2 py-1 rounded-full bg-slate-50"
              >
                닫기
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
              {/* 컨텍스트 */}
              <div className="bg-slate-50 rounded-2xl px-4 py-3 space-y-1">
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">AI 인식</p>
                <p className="text-sm font-black text-slate-800 break-all">{aiResultFoodName || '—'}</p>
                {matchedFoodName && (
                  <>
                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mt-2">DB 매칭</p>
                    <p className="text-sm font-black text-emerald-700 break-all">
                      {matchedFoodName}
                      {matchSimilarity !== null && matchSimilarity !== undefined && (
                        <span className="ml-1 text-[11px] font-bold text-emerald-600">
                          ({Math.round(matchSimilarity * 100)}%)
                        </span>
                      )}
                    </p>
                  </>
                )}
              </div>

              {/* 신고 사유 */}
              <div>
                <p className="text-xs font-black text-slate-500 mb-2">신고 사유</p>
                <div role="radiogroup" aria-label="신고 사유 선택" className="space-y-1.5">
                  {REASON_OPTIONS.map(opt => {
                    const active = opt.v === reason;
                    return (
                      <button
                        key={opt.v}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        onClick={() => setReason(opt.v)}
                        className={`w-full text-left min-h-11 px-3 py-2 rounded-xl border-2 text-xs font-black transition-colors ${active ? 'border-orange-500 bg-orange-500 text-white' : 'border-slate-200 bg-white text-slate-600'}`}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 정정 입력 */}
              <div>
                <label htmlFor="match-correction" className="text-xs font-black text-slate-500 mb-1.5 block">
                  올바른 음식명
                </label>
                <textarea
                  id="match-correction"
                  rows={3}
                  value={correction}
                  onChange={(e) => setCorrection(e.target.value)}
                  placeholder="예: BBQ 황금올리브치킨"
                  className="w-full border-2 border-slate-200 rounded-xl px-3 py-2.5 text-sm font-bold focus:border-orange-500 focus:outline-none resize-none"
                />
              </div>

              {error && (
                <div className="bg-rose-50 border border-rose-200 rounded-xl px-3 py-2.5" role="alert" aria-live="assertive">
                  <p className="text-xs font-black text-rose-700">신고 실패</p>
                  <p className="mt-0.5 text-[11px] font-bold text-rose-600 break-words">{error}</p>
                </div>
              )}

              <p className="text-[10px] font-bold text-slate-400 leading-relaxed">
                신고는 검토 후 DB 매칭 품질 개선에 반영됩니다. 개인 식별 정보는 저장하지 않습니다.
              </p>
            </div>

            <div className="px-6 py-3 border-t border-slate-100 space-y-2 shrink-0 bg-white">
              <button
                type="button"
                onClick={handleSubmit}
                disabled={!canSubmit}
                className="w-full py-3 rounded-2xl bg-orange-500 text-white text-sm font-black shadow-[0_6px_14px_rgba(249,115,22,0.28)] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed transition-transform"
              >
                {submitting ? '저장 중…' : '신고 보내기'}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
