import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { LogOut } from 'lucide-react';
import type { MeResponse } from '../../services/calService';

interface AccountModalProps {
  open: boolean;
  me: MeResponse | null;
  onSave: (patch: { age?: number | null; gender?: 'male' | 'female' | null }) => Promise<void> | void;
  onLogout: () => void;
  onClose: () => void;
}

function formatKstResetAt(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('ko-KR', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function AccountModal({ open, me, onSave, onLogout, onClose }: AccountModalProps) {
  const [age, setAge] = useState<string>('');
  const [gender, setGender] = useState<'male' | 'female' | ''>('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open && me) {
      setAge(me.age !== null ? String(me.age) : '');
      setGender(me.gender ?? '');
    }
  }, [open, me]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!me) return null;

  const ageNum = age === '' ? null : Number(age);
  const ageValid = ageNum === null || (Number.isInteger(ageNum) && ageNum >= 1 && ageNum <= 150);
  const genderNext: 'male' | 'female' | null = gender === '' ? null : gender;

  const changed = (ageNum !== me.age) || (genderNext !== me.gender);

  const handleSave = async () => {
    if (!ageValid || submitting || !changed) return;
    setSubmitting(true);
    try {
      await onSave({ age: ageNum, gender: genderNext });
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  const emailDisplay = me.email ?? '이메일 없음';
  const roleLabel = me.role === 'admin' ? '운영자' : '일반 사용자';
  const calLabel = me.role === 'admin' ? '🛡️ 무제한' : `🌰 ${me.cal_balance} cal`;

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
          aria-labelledby="accountModalTitle"
          onClick={onClose}
        >
          <motion.div
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            className="bg-white w-full sm:max-w-md sm:mx-4 rounded-t-3xl sm:rounded-3xl max-h-[92vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 space-y-5">
              <div className="flex items-center justify-between">
                <h2 id="accountModalTitle" className="text-base font-black text-slate-900">계정</h2>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="닫기"
                  className="text-xs font-black text-slate-400 px-2 py-1 rounded-full bg-slate-50"
                >
                  닫기
                </button>
              </div>

              {/* 이메일 + role + cal 잔고 */}
              <div className="bg-orange-50 rounded-2xl px-4 py-3 space-y-2">
                <div>
                  <p className="text-[10px] font-black text-orange-600 uppercase tracking-widest">이메일</p>
                  <p className="mt-0.5 text-sm font-black text-slate-900 break-all">{emailDisplay}</p>
                </div>
                <div className="flex items-center justify-between">
                  <span className={`text-[11px] font-black px-2 py-0.5 rounded-full ${me.role === 'admin' ? 'bg-emerald-100 text-emerald-700' : 'bg-white text-slate-600 ring-1 ring-orange-100'}`}>
                    {roleLabel}
                  </span>
                  <span className="text-sm font-black text-orange-700">{calLabel}</span>
                </div>
                {me.role !== 'admin' && (
                  <p className="text-[11px] font-bold text-slate-500">
                    다음 자동 충전: <span className="text-slate-700">{formatKstResetAt(me.daily_usage_reset_at)}</span> · 잔액이 3 미만이면 3으로 보충
                  </p>
                )}
              </div>

              {/* 나이 */}
              <div>
                <label htmlFor="acct-age" className="text-xs font-black text-slate-500 mb-1.5 block">나이</label>
                <input
                  id="acct-age"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={150}
                  value={age}
                  onChange={(e) => setAge(e.target.value.replace(/[^0-9]/g, ''))}
                  placeholder="선택 입력"
                  className={`w-full border-2 rounded-xl px-3 py-2.5 text-sm font-bold focus:outline-none ${ageValid ? 'border-slate-200 focus:border-orange-500' : 'border-rose-400 focus:border-rose-500'}`}
                />
                {!ageValid && (
                  <p className="mt-1 text-[11px] font-bold text-rose-600">1~150 사이 정수만 입력</p>
                )}
              </div>

              {/* 성별 */}
              <div>
                <p className="text-xs font-black text-slate-500 mb-1.5">성별</p>
                <div role="radiogroup" aria-label="성별 선택" className="grid grid-cols-3 gap-2">
                  {([
                    { v: '',       label: '선택 안 함' },
                    { v: 'male',   label: '남' },
                    { v: 'female', label: '여' },
                  ] as const).map(opt => {
                    const active = opt.v === gender;
                    return (
                      <button
                        key={opt.v || 'none'}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        onClick={() => setGender(opt.v as typeof gender)}
                        className={`min-h-11 py-2 rounded-xl border-2 text-xs font-black transition-colors ${active ? 'border-orange-500 bg-orange-500 text-white' : 'border-slate-200 bg-white text-slate-600'}`}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 저장 */}
              <button
                type="button"
                onClick={handleSave}
                disabled={!changed || !ageValid || submitting}
                className="w-full py-3 rounded-2xl bg-orange-500 text-white text-sm font-black shadow-[0_6px_14px_rgba(249,115,22,0.28)] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed transition-transform"
              >
                {submitting ? '저장 중…' : changed ? '저장' : '변경 없음'}
              </button>

              {/* 로그아웃 */}
              <button
                type="button"
                onClick={() => { onLogout(); onClose(); }}
                className="w-full py-3 rounded-2xl bg-white border-2 border-slate-200 text-slate-600 text-sm font-black active:scale-[0.98] transition-transform inline-flex items-center justify-center gap-2"
              >
                <LogOut className="w-4 h-4" aria-hidden="true" />
                로그아웃
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
