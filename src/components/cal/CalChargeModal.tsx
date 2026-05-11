import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { CAL_PACKAGES, type CalPackageId } from '../../config/packages';

type PaymentMethod = 'kakao' | 'toss' | 'card';

const PAYMENT_METHODS: { id: PaymentMethod; label: string; emoji: string }[] = [
  { id: 'kakao', label: '카카오페이', emoji: '💛' },
  { id: 'toss',  label: '토스',       emoji: '🟦' },
  { id: 'card',  label: '신용카드',    emoji: '💳' },
];

interface CalChargeModalProps {
  open: boolean;
  onPay: (packageId: CalPackageId, method: PaymentMethod) => void | Promise<void>;
  onClose: () => void;
}

export default function CalChargeModal({ open, onPay, onClose }: CalChargeModalProps) {
  const [selectedPkg, setSelectedPkg] = useState<CalPackageId>('medium');
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod>('toss');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handlePay = async () => {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await onPay(selectedPkg, selectedMethod);
    } catch (e) {
      setError(e instanceof Error ? e.message : '결제 처리 중 오류가 발생했습니다.');
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
          className="fixed inset-0 z-[150] flex items-end sm:items-center justify-center bg-black/50"
          role="dialog"
          aria-modal="true"
          aria-labelledby="calChargeTitle"
          onClick={onClose}
        >
          <motion.div
            initial={{ y: 40 }}
            animate={{ y: 0 }}
            exit={{ y: 40 }}
            className="bg-white w-full sm:max-w-md sm:mx-4 rounded-t-3xl sm:rounded-3xl max-h-[88vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 space-y-5">
              <div className="flex items-center justify-between">
                <h2 id="calChargeTitle" className="text-base font-black text-slate-900">
                  🌰 cal 충전
                </h2>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="닫기"
                  className="text-xs font-black text-slate-400 px-2 py-1 rounded-full bg-slate-50"
                >
                  닫기
                </button>
              </div>

              {/* 패키지 라디오 리스트 */}
              <div role="radiogroup" aria-label="충전 패키지 선택" className="space-y-2">
                {CAL_PACKAGES.map(pkg => {
                  const active = pkg.id === selectedPkg;
                  return (
                    <button
                      key={pkg.id}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      aria-label={`${pkg.cal} cal 패키지, ${pkg.krw.toLocaleString()}원${pkg.badge ? `, ${pkg.badge}` : ''}`}
                      onClick={() => setSelectedPkg(pkg.id)}
                      className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl border-2 transition-colors text-left ${active ? 'border-orange-500 bg-orange-50' : 'border-slate-200 bg-white'}`}
                    >
                      <span className="text-base">🌰</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-black text-slate-900">{pkg.cal} cal</p>
                        <p className="text-[11px] font-bold text-slate-500">{pkg.krw.toLocaleString()}원</p>
                      </div>
                      {pkg.badge && (
                        <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${pkg.badge === '인기' ? 'bg-orange-500 text-white' : 'bg-emerald-100 text-emerald-700'}`}>
                          {pkg.badge}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* 결제수단 */}
              <div>
                <p className="text-xs font-black text-slate-500 mb-2">결제수단</p>
                <div role="radiogroup" aria-label="결제수단 선택" className="grid grid-cols-3 gap-2">
                  {PAYMENT_METHODS.map(m => {
                    const active = m.id === selectedMethod;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        onClick={() => setSelectedMethod(m.id)}
                        className={`py-2.5 rounded-xl border-2 text-[11px] font-black transition-colors ${active ? 'border-orange-500 bg-orange-50 text-orange-700' : 'border-slate-200 bg-white text-slate-600'}`}
                      >
                        <span className="mr-1" aria-hidden="true">{m.emoji}</span>{m.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {error && (
                <p className="text-xs font-bold text-rose-600 bg-rose-50 px-3 py-2 rounded-xl">{error}</p>
              )}

              <button
                type="button"
                onClick={handlePay}
                disabled={submitting}
                className="w-full py-4 rounded-2xl bg-orange-500 text-white text-sm font-black shadow-[0_6px_14px_rgba(249,115,22,0.3)] active:scale-[0.98] transition-transform disabled:opacity-50"
              >
                {submitting ? '결제 진행 중…' : '결제하기'}
              </button>

              <p className="text-[10px] font-bold text-slate-400 text-center underline">
                약관 · 환불정책
              </p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
