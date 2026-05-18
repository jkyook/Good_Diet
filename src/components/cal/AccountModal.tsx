import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { LogOut } from 'lucide-react';
import type { MeResponse } from '../../services/calService';
import { fetchMatchCorrections, type MatchCorrectionRow } from '../../services/supabaseService';

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

interface BmiInfo {
  bmi: number;
  label: string;
  color: string;         // tailwind text color class
  bgColor: string;       // tailwind bg color class
  ringColor: string;     // tailwind ring color class
  targetMinKg: number;   // 정상 하한 (BMI 18.5)
  targetMaxKg: number;   // 정상 상한 (BMI 22.9)
  idealKg: number;       // 이상 목표 (BMI 22.0)
}

function calcBmi(weightKg: number, heightCm: number): BmiInfo {
  const hm = heightCm / 100;
  const bmi = weightKg / (hm * hm);
  const targetMinKg = Math.round(18.5 * hm * hm * 10) / 10;
  const targetMaxKg = Math.round(22.9 * hm * hm * 10) / 10;
  const idealKg     = Math.round(22.0 * hm * hm * 10) / 10;

  let label: string;
  let color: string;
  let bgColor: string;
  let ringColor: string;

  if (bmi < 18.5) {
    label = '저체중'; color = 'text-sky-700'; bgColor = 'bg-sky-50'; ringColor = 'ring-sky-200';
  } else if (bmi < 23.0) {
    label = '정상'; color = 'text-emerald-700'; bgColor = 'bg-emerald-50'; ringColor = 'ring-emerald-200';
  } else if (bmi < 25.0) {
    label = '과체중'; color = 'text-amber-700'; bgColor = 'bg-amber-50'; ringColor = 'ring-amber-200';
  } else if (bmi < 30.0) {
    label = '비만 1단계'; color = 'text-orange-700'; bgColor = 'bg-orange-50'; ringColor = 'ring-orange-200';
  } else if (bmi < 35.0) {
    label = '비만 2단계'; color = 'text-rose-700'; bgColor = 'bg-rose-50'; ringColor = 'ring-rose-200';
  } else {
    label = '고도비만'; color = 'text-rose-900'; bgColor = 'bg-rose-100'; ringColor = 'ring-rose-300';
  }

  return { bmi: Math.round(bmi * 10) / 10, label, color, bgColor, ringColor, targetMinKg, targetMaxKg, idealKg };
}

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

  // T-075: admin 전용 정정 신고 list (read-only)
  const [corrections, setCorrections] = useState<MatchCorrectionRow[] | null>(null);
  const [correctionsLoading, setCorrectionsLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setAge(profile.age !== null ? String(profile.age) : (me?.age != null ? String(me.age) : ''));
    setGender((profile.gender ?? me?.gender ?? '') as 'male' | 'female' | '');
    setWeight(String(profile.weight));
    setHeight(String(profile.height));
    setActivityLevel(profile.activityLevel);
    setError(null);
  }, [open, profile, me]);

  // T-075: admin 진입 시 정정 신고 list fetch (최근 50건)
  useEffect(() => {
    if (!open || me?.role !== 'admin') return;
    setCorrectionsLoading(true);
    void fetchMatchCorrections({ limit: 50 })
      .then(setCorrections)
      .finally(() => setCorrectionsLoading(false));
  }, [open, me?.role]);

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

  const bmiInfo = (weightValid && heightValid) ? calcBmi(weightNum, heightNum) : null;

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

                {/* BMI 카드 */}
                {bmiInfo && (
                  <div className={`${bmiInfo.bgColor} ring-1 ${bmiInfo.ringColor} rounded-2xl px-4 py-3 space-y-2`}>
                    <div className="flex items-center justify-between">
                      <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">BMI 분석</p>
                      <span className={`text-[11px] font-black px-2.5 py-0.5 rounded-full ring-1 ${bmiInfo.ringColor} ${bmiInfo.bgColor} ${bmiInfo.color}`}>
                        {bmiInfo.label}
                      </span>
                    </div>

                    <div className="flex items-baseline gap-1.5">
                      <span className={`text-3xl font-black ${bmiInfo.color}`}>{bmiInfo.bmi}</span>
                      <span className={`text-xs font-bold ${bmiInfo.color} opacity-70`}>kg/m²</span>
                    </div>

                    {/* BMI 게이지 바 — 범위 BMI 15~40 */}
                    {(() => {
                      const BMI_MIN = 15, BMI_MAX = 40;
                      // 각 BMI 경계값을 퍼센트로 변환
                      const pct = (v: number) => ((v - BMI_MIN) / (BMI_MAX - BMI_MIN)) * 100;
                      const p185 = pct(18.5).toFixed(1); // 14%
                      const p230 = pct(23.0).toFixed(1); // 32%
                      const p250 = pct(25.0).toFixed(1); // 40%
                      const p300 = pct(30.0).toFixed(1); // 60%
                      const p350 = pct(35.0).toFixed(1); // 80%
                      const markerPct = Math.min(Math.max(pct(bmiInfo.bmi), 1), 99);
                      return (
                        <div className="relative py-1.5">
                          {/* 색상 바 — 경계에서 하드 컷 */}
                          <div
                            className="h-2 rounded-full"
                            style={{
                              background: `linear-gradient(to right,
                                #7dd3fc 0%, #7dd3fc ${p185}%,
                                #34d399 ${p185}%, #34d399 ${p230}%,
                                #fbbf24 ${p230}%, #fbbf24 ${p250}%,
                                #fb923c ${p250}%, #fb923c ${p300}%,
                                #fb7185 ${p300}%, #fb7185 ${p350}%,
                                #9f1239 ${p350}%, #9f1239 100%
                              )`,
                            }}
                          />
                          {/* 마커 — translateX(-50%)로 정중앙 정렬 */}
                          <div
                            className="absolute w-3 h-3 bg-white rounded-full shadow-md border-2 border-slate-500"
                            style={{
                              left: `${markerPct}%`,
                              top: '50%',
                              transform: 'translate(-50%, -50%)',
                            }}
                          />
                        </div>
                      );
                    })()}
                    {/* 눈금 레이블 — 실제 BMI 비율에 맞게 배치 */}
                    <div className="relative h-3 text-[9px] font-bold text-slate-400 select-none">
                      {[
                        { label: '15', bmi: 15 },
                        { label: '18.5', bmi: 18.5 },
                        { label: '23', bmi: 23 },
                        { label: '25', bmi: 25 },
                        { label: '30', bmi: 30 },
                        { label: '35', bmi: 35 },
                        { label: '40', bmi: 40 },
                      ].map(({ label, bmi }) => {
                        const p = ((bmi - 15) / 25) * 100;
                        return (
                          <span
                            key={label}
                            className="absolute -translate-x-1/2 leading-none"
                            style={{ left: `${p}%` }}
                          >
                            {label}
                          </span>
                        );
                      })}
                    </div>

                    {/* 목표 체중 */}
                    <div className="pt-1 border-t border-white/60">
                      <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">목표 체중 (정상 범위)</p>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 bg-white/70 rounded-xl px-3 py-1.5 text-center">
                          <p className="text-[9px] font-bold text-slate-400">최소</p>
                          <p className="text-sm font-black text-slate-700">{bmiInfo.targetMinKg} <span className="text-[10px] font-bold">kg</span></p>
                        </div>
                        <div className="flex-1 bg-emerald-500 rounded-xl px-3 py-1.5 text-center shadow-sm">
                          <p className="text-[9px] font-bold text-emerald-100">권장 목표</p>
                          <p className="text-sm font-black text-white">{bmiInfo.idealKg} <span className="text-[10px] font-bold">kg</span></p>
                        </div>
                        <div className="flex-1 bg-white/70 rounded-xl px-3 py-1.5 text-center">
                          <p className="text-[9px] font-bold text-slate-400">최대</p>
                          <p className="text-sm font-black text-slate-700">{bmiInfo.targetMaxKg} <span className="text-[10px] font-bold">kg</span></p>
                        </div>
                      </div>
                      {bmiInfo.bmi >= 18.5 && bmiInfo.bmi < 23.0 ? (
                        <p className="mt-1.5 text-[10px] font-bold text-emerald-600 text-center">현재 정상 체중 범위입니다 ✓</p>
                      ) : (
                        <p className="mt-1.5 text-[10px] font-bold text-slate-500 text-center">
                          권장 목표까지{' '}
                          <span className={`font-black ${bmiInfo.color}`}>
                            {Math.abs(Math.round((weightNum - bmiInfo.idealKg) * 10) / 10)} kg{' '}
                            {weightNum > bmiInfo.idealKg ? '감량' : '증량'}
                          </span>
                        </p>
                      )}
                    </div>
                  </div>
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

              {/* T-075: admin 전용 정정 신고 list (read-only) */}
              {me.role === 'admin' && (
                <section className="pt-2 border-t border-slate-100">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[10px] font-black text-emerald-700 uppercase tracking-widest">
                      🛡️ 정정 신고 (read-only, 최근 50건)
                    </p>
                    {corrections && (
                      <span className="text-[10px] font-bold text-slate-500">{corrections.length}건</span>
                    )}
                  </div>
                  {correctionsLoading && (
                    <p className="text-[11px] font-bold text-slate-400">불러오는 중…</p>
                  )}
                  {!correctionsLoading && corrections && corrections.length === 0 && (
                    <p className="text-[11px] font-bold text-slate-400">신고 없음.</p>
                  )}
                  {!correctionsLoading && corrections && corrections.length > 0 && (
                    <ul className="space-y-1.5 max-h-64 overflow-y-auto bg-slate-50 rounded-xl p-2">
                      {corrections.map(row => {
                        const dt = new Date(row.created_at).toLocaleString('ko-KR', {
                          month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
                        });
                        const matched = row.foods?.name
                          ? `${row.foods.name}${row.foods.brand ? ` · ${row.foods.brand}` : ''}`
                          : (row.matched_food_id ? '(food deleted)' : '(매칭 없음)');
                        return (
                          <li key={row.id} className="bg-white rounded-lg px-2.5 py-2 border border-slate-100">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-[10px] font-black text-slate-400">{dt}</span>
                              <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full ${row.status === 'merged' ? 'bg-emerald-100 text-emerald-700' : row.status === 'reviewed' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'}`}>
                                {row.status}
                              </span>
                            </div>
                            <p className="mt-1 text-[11px] font-bold text-slate-700 break-all">
                              <span className="text-slate-400">AI: </span>{row.ai_result_food_name ?? '—'}
                            </p>
                            <p className="text-[11px] font-bold text-emerald-700 break-all">
                              <span className="text-emerald-500">DB: </span>{matched}
                            </p>
                            <p className="text-[11px] font-bold text-orange-700 break-all">
                              <span className="text-orange-500">→ </span>{row.user_correction ?? '—'}
                            </p>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </section>
              )}

              {/* T-069 Q4: 데이터 출처 표시 */}
              <section className="pt-2 border-t border-slate-100">
                <p className="text-[10px] font-bold text-slate-400 leading-relaxed">
                  데이터 출처: 공공데이터포털 · 식약처 식품영양정보 · 외식 프랜차이즈 공식 영양표
                  <br />
                  <span className="text-slate-300">AI 분석은 참고용. 의료 판단 X.</span>
                </p>
              </section>
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
