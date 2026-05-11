import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { LogOut } from 'lucide-react';
import type { MeResponse } from '../../services/calService';

export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'active';

export interface AccountProfile {
  age: number | null;
  gender: 'male' | 'female' | null;
  weight: number;
  height: number;
  activityLevel: ActivityLevel;
}

export interface AccountPatch {
  age?: number | null;
  gender?: 'male' | 'female' | null;
  weight?: number;
  height?: number;
  activityLevel?: ActivityLevel;
}

interface AccountModalProps {
  open: boolean;
  me: MeResponse | null;
  /** 칼로리 목표 계산용 로컬 profile 값 (localStorage 동기) */
  profile: AccountProfile;
  /** 자동 계산된 일일 권장 칼로리 */
  dailyKcalTarget: number;
  /** 성공 시 true, 실패 시 false 반환 또는 throw */
  onSave: (patch: AccountPatch) => Promise<boolean> | boolean;
  onLogout: () => void;
  onClose: () => void;
}

const ACTIVITY_OPTIONS: { value: ActivityLevel; label: string }[] = [
  { value: 'sedentary', label: '좌식 (운동 없음)' },
  { value: 'light',     label: '가벼운 활동 (주 1-3일)' },
  { value: 'moderate',  label: '보통 활동 (주 3-5일)' },
  { value: 'active',    label: '활발한 활동 (주 6-7일)' },
];

function formatKstResetAt(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('ko-KR', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function AccountModal({
  open, me, profile, dailyKcalTarget, onSave, onLogout, onClose,
}: AccountModalProps) {
  const [age, setAge] = useState<string>('');
  const [gender, setGender] = useState<'male' | 'female' | ''>('');
  const [weight, setWeight] = useState<string>('');
  const [height, setHeight] = useState<string>('');
  const [activityLevel, setActivityLevel] = useState<ActivityLevel>('moderate');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setAge(profile.age !== null ? String(profile.age) : (me?.age != null ? String(me.age) : ''));
    setGender((profile.gender ?? me?.gender ?? '') as 'male' | 'female' | '');
    setWeight(String(profile.weight));
    setHeight(String(profile.height));
    setActivityLevel(profile.activityLevel);
    setError(null);
  }, [open, profile, me]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!me) return null;

  const ageNum = age === '' ? null : Number(age);
  const ageValid = ageNum === null || (Number.isInteger(ageNum) && ageNum >= 1 && ageNum <= 150);
  const weightNum = Number(weight);
  const weightValid = Number.isFinite(weightNum) && weightNum >= 20 && weightNum <= 300;
  const heightNum = Number(height);
  const heightValid = Number.isFinite(heightNum) && heightNum >= 80 && heightNum <= 250;
  const genderNext: 'male' | 'female' | null = gender === '' ? null : gender;

  const changed =
    (ageNum !== profile.age) ||
    (genderNext !== profile.gender) ||
    (weightNum !== profile.weight) ||
    (heightNum !== profile.height) ||
    (activityLevel !== profile.activityLevel);

  const allValid = ageValid && weightValid && heightValid;

  const handleSave = async () => {
    if (!allValid || submitting || !changed) return;
    setSubmitting(true);
    setError(null);
    const patch: AccountPatch = {};
    if (ageNum !== profile.age)            patch.age = ageNum;
    if (genderNext !== profile.gender)     patch.gender = genderNext;
    if (weightNum !== profile.weight)      patch.weight = weightNum;
    if (heightNum !== profile.height)      patch.height = heightNum;
    if (activityLevel !== profile.activityLevel) patch.activityLevel = activityLevel;
    try {
      const ok = await onSave(patch);
      if (ok) onClose();
      else setError('저장에 실패했어요. 잠시 후 다시 시도해주세요.');
    } catch (e) {
      setError(e instanceof Error ? e.message : '저장 중 오류가 발생했어요.');
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
            className="bg-white w-full sm:max-w-md sm:mx-4 rounded-t-3xl sm:rounded-3xl flex flex-col max-h-[88vh] sm:max-h-[80vh]"
            style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* sticky header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
              <h2 id="accountModalTitle" className="text-base font-black text-slate-900">계정 · 프로필</h2>
              <button
                type="button"
                onClick={onClose}
                aria-label="닫기"
                className="min-h-11 min-w-11 text-xs font-black text-slate-400 px-2 py-1 rounded-full bg-slate-50"
              >
                닫기
              </button>
            </div>

            {/* scrollable body */}
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">

              {/* 계정 섹션 */}
              <section className="space-y-2">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">계정</p>
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
                      다음 자동 충전: <span className="text-slate-700">{formatKstResetAt(me.daily_usage_reset_at)}</span> · 잔액 &lt; 3이면 3으로 보충
                    </p>
                  )}
                </div>
              </section>

              {/* 프로필 섹션 */}
              <section className="space-y-3">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">프로필</p>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="acct-age" className="text-xs font-black text-slate-500 mb-1.5 block">나이</label>
                    <input
                      id="acct-age" type="number" inputMode="numeric"
                      min={1} max={150}
                      value={age}
                      onChange={(e) => setAge(e.target.value.replace(/[^0-9]/g, ''))}
                      placeholder="—"
                      className={`w-full border-2 rounded-xl px-3 py-2.5 text-sm font-bold focus:outline-none ${ageValid ? 'border-slate-200 focus:border-orange-500' : 'border-rose-400'}`}
                    />
                  </div>
                  <div>
                    <p className="text-xs font-black text-slate-500 mb-1.5">성별</p>
                    <div role="radiogroup" aria-label="성별 선택" className="flex gap-1">
                      {([
                        { v: '',       label: '—' },
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
                            className={`flex-1 min-h-11 py-2 rounded-xl border-2 text-xs font-black transition-colors ${active ? 'border-orange-500 bg-orange-500 text-white' : 'border-slate-200 bg-white text-slate-600'}`}
                          >
                            {opt.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="acct-weight" className="text-xs font-black text-slate-500 mb-1.5 block">체중 (kg)</label>
                    <input
                      id="acct-weight" type="number" inputMode="decimal"
                      min={20} max={300}
                      value={weight}
                      onChange={(e) => setWeight(e.target.value.replace(/[^0-9.]/g, ''))}
                      className={`w-full border-2 rounded-xl px-3 py-2.5 text-sm font-bold focus:outline-none ${weightValid ? 'border-slate-200 focus:border-orange-500' : 'border-rose-400'}`}
                    />
                  </div>
                  <div>
                    <label htmlFor="acct-height" className="text-xs font-black text-slate-500 mb-1.5 block">키 (cm)</label>
                    <input
                      id="acct-height" type="number" inputMode="decimal"
                      min={80} max={250}
                      value={height}
                      onChange={(e) => setHeight(e.target.value.replace(/[^0-9.]/g, ''))}
                      className={`w-full border-2 rounded-xl px-3 py-2.5 text-sm font-bold focus:outline-none ${heightValid ? 'border-slate-200 focus:border-orange-500' : 'border-rose-400'}`}
                    />
                  </div>
                </div>

                {(!ageValid || !weightValid || !heightValid) && (
                  <p className="text-[11px] font-bold text-rose-600">
                    {!ageValid && '나이 1–150, '}
                    {!weightValid && '체중 20–300kg, '}
                    {!heightValid && '키 80–250cm '}
                    범위 확인
                  </p>
                )}
              </section>

              {/* 활동 목표 섹션 */}
              <section className="space-y-2">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">활동 목표</p>
                <label htmlFor="acct-activity" className="text-xs font-black text-slate-500 block">활동 수준</label>
                <select
                  id="acct-activity"
                  value={activityLevel}
                  onChange={(e) => setActivityLevel(e.target.value as ActivityLevel)}
                  className="w-full border-2 border-slate-200 rounded-xl px-3 py-2.5 text-sm font-bold focus:border-orange-500 focus:outline-none appearance-none bg-white cursor-pointer"
                >
                  {ACTIVITY_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>

                <div className="bg-orange-50 rounded-2xl px-4 py-3 mt-1">
                  <p className="text-[10px] font-black text-orange-600 uppercase tracking-widest">일일 권장 칼로리 (자동)</p>
                  <p className="mt-0.5 text-lg font-black text-orange-700">
                    {dailyKcalTarget.toLocaleString()} <span className="text-xs">kcal</span>
                  </p>
                  <p className="text-[10px] font-bold text-slate-500">
                    Mifflin–St Jeor 공식 · 체중/키/나이/성별/활동 수준 기반
                  </p>
                </div>
              </section>

              {/* inline error */}
              {error && (
                <div className="bg-rose-50 border border-rose-200 rounded-xl px-3 py-2.5" role="alert" aria-live="assertive">
                  <p className="text-xs font-black text-rose-700">저장 실패</p>
                  <p className="mt-0.5 text-[11px] font-bold text-rose-600 break-words">{error}</p>
                  <p className="mt-1 text-[10px] font-bold text-rose-500">
                    'column ... does not exist' 메시지는 T-061 SQL 미실행 환경입니다.
                  </p>
                </div>
              )}
            </div>

            {/* sticky footer */}
            <div className="px-6 py-3 border-t border-slate-100 space-y-2 shrink-0 bg-white">
              <button
                type="button"
                onClick={handleSave}
                disabled={!changed || !allValid || submitting}
                className="w-full py-3 rounded-2xl bg-orange-500 text-white text-sm font-black shadow-[0_6px_14px_rgba(249,115,22,0.28)] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed transition-transform"
              >
                {submitting ? '저장 중…' : changed ? '저장' : '변경 없음'}
              </button>
              <button
                type="button"
                onClick={() => { onLogout(); onClose(); }}
                className="w-full py-2.5 rounded-2xl bg-white border-2 border-slate-200 text-slate-600 text-xs font-black active:scale-[0.98] transition-transform inline-flex items-center justify-center gap-2"
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
