/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useRef, ChangeEvent, useEffect, useMemo } from 'react';
import React from 'react';
import {
  Camera, Upload, Utensils, CheckCircle2, RefreshCw, User, Calendar,
  Plus, Trash2, History, Zap, Target, TrendingUp, Download, RotateCcw,
  Home, ChevronDown,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import {
  analyzeFood, AnalysisResult, AnalysisMode, StreamEvent, MealType,
  AIProvider, PROVIDER_LABELS, fetchHealth, ProviderHealth,
} from './services/geminiService';
import {
  signIn, signUp, signOut, getSession, onAuthChange,
  saveMeal, loadHistory, deleteMeal as dbDeleteMeal, clearHistory as dbClearHistory,
  SupabaseUser, SUPABASE_AVAILABLE,
} from './services/supabaseService';
import { addMeal as localAddMeal } from './services/mealStore';
import BatchAnalyzer from './components/BatchAnalyzer';
import DayMealLog from './components/DayMealLog';
import AnalysisResultCard from './components/AnalysisResultCard';

type Gender = 'male' | 'female';
type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'active';

interface MealRecord extends AnalysisResult {
  id: string;
  image: string;
  mealType: MealType;
}

interface ConfirmDialog {
  message: string;
  onConfirm: () => void;
}

interface Toast {
  message: string;
  type: 'success' | 'error';
}

const MEAL_TYPES: { value: MealType; emoji: string; label: string }[] = [
  { value: 'breakfast', emoji: '🌅', label: '아침' },
  { value: 'lunch',     emoji: '☀️', label: '점심' },
  { value: 'dinner',    emoji: '🌙', label: '저녁' },
  { value: 'snack',     emoji: '🍎', label: '간식' },
];

const ACTIVITY_LABELS: Record<ActivityLevel, string> = {
  sedentary: '좌식 (운동 없음)',
  light: '가벼운 활동 (주 1-3일)',
  moderate: '보통 활동 (주 3-5일)',
  active: '활발한 활동 (주 6-7일)',
};

function calcDailyTarget(gender: Gender, weight: number, height: number, age: number, activity: ActivityLevel): number {
  const bmr = gender === 'male'
    ? 88.362 + 13.397 * weight + 4.799 * height - 5.677 * age
    : 447.593 + 9.247 * weight + 3.098 * height - 4.330 * age;
  const multipliers: Record<ActivityLevel, number> = { sedentary: 1.2, light: 1.375, moderate: 1.55, active: 1.725 };
  return Math.round(bmr * multipliers[activity]);
}

function compressImage(file: File): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      const maxSize = 1024;
      const ratio = Math.min(maxSize / img.width, maxSize / img.height, 1);
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * ratio);
      canvas.height = Math.round(img.height * ratio);
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(objectUrl);
      resolve(canvas.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => { URL.revokeObjectURL(objectUrl); resolve(''); };
    img.src = objectUrl;
  });
}

export default function App() {
  // --- Profile ---
  const [age, setAge] = useState(30);
  const [gender, setGender] = useState<Gender>('male');
  const [weight, setWeight] = useState(68);
  const [height, setHeight] = useState(170);
  const [activityLevel, setActivityLevel] = useState<ActivityLevel>('light');

  // --- Upload & Analysis ---
  const [images, setImages] = useState<{ id: string; url: string; file: File }[]>([]);
  const [loading, setLoading] = useState(false);
  const [analysisMode, setAnalysisMode] = useState<AnalysisMode>('quick');
  const [mealType, setMealType] = useState<MealType>('lunch');
  const [provider, setProvider] = useState<AIProvider>('groq');
  const [health, setHealth] = useState<ProviderHealth>({ gemini: false, claude: false, groq: false });
  const [error, setError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  // --- Loading state ---
  const [loadingStep, setLoadingStep] = useState(0);
  const [currentAnalyzingIdx, setCurrentAnalyzingIdx] = useState(-1);
  const [stepDetails, setStepDetails] = useState<Record<number, string>>({});

  // --- History & UI ---
  const [history, setHistory] = useState<MealRecord[]>([]);
  const [selectedMeal, setSelectedMeal] = useState<MealRecord | null>(null);
  const [showProfile, setShowProfile] = useState(false);
  const [activeTab, setActiveTab] = useState<'history' | 'stats'>('history');

  // --- Navigation ---
  const [mainTab, setMainTab] = useState<'home' | 'analyze' | 'history' | 'stats'>('home');
  const [expandedDates, setExpandedDates] = useState<Set<string>>(new Set());
  const [activeItemId, setActiveItemId] = useState<string | null>(null);

  // --- Overlays ---
  const [toast, setToast] = useState<Toast | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialog | null>(null);

  // --- Auth ---
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // --- Computed ---
  const dailyCalorieTarget = useMemo(
    () => calcDailyTarget(gender, weight, height, age, activityLevel),
    [gender, weight, height, age, activityLevel],
  );

  const loadingStepsData = useMemo(() => analysisMode === 'quick' ? [
    { label: 'API 연결',    desc: 'Gemini AI 서버에 연결 중' },
    { label: '식재료 식별', desc: '사진에서 음식 및 재료 감지 중' },
    { label: '수치 계산',  desc: '칼로리 · 영양소 빠르게 산출 중' },
  ] : [
    { label: 'API 연결',    desc: 'Gemini AI 서버에 연결 중' },
    { label: '식재료 식별', desc: '사진에서 음식 및 재료 감지 중' },
    { label: '영양소 계측', desc: '칼로리 · 탄수화물 · 단백질 · 지방 산출 중' },
    { label: '맞춤 평가',  desc: `${age}세 ${gender === 'male' ? '남성' : '여성'} 기준 분석 중` },
    { label: '추천 생성',  desc: '운동 플랜 및 푸드 페어링 생성 중' },
    { label: '리포트 완성', desc: '분석 결과 최종 정리 중' },
  ], [analysisMode, age, gender]);

  const groupedHistory = useMemo(() => history.reduce((groups: Record<string, MealRecord[]>, meal) => {
    const date = new Date(meal.date).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' });
    (groups[date] ??= []).push(meal);
    return groups;
  }, {}), [history]);

  const weeklyStats = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (6 - i));
      const dayStr = d.toDateString();
      const meals = history.filter(h => new Date(h.date).toDateString() === dayStr);
      return {
        label: d.toLocaleDateString('ko-KR', { weekday: 'short' }),
        date: d.toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' }),
        calories: meals.reduce((sum, m) => sum + (m.calories || 0), 0),
        count: meals.length,
        isToday: i === 6,
      };
    });
  }, [history]);

  // --- Effects ---
  useEffect(() => {
    if (!showProfile) return;
    const handler = (e: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setShowProfile(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showProfile]);

  // 세션 복원 + 인증 상태 구독
  useEffect(() => {
    getSession().then(u => setUser(u));
    const unsub = onAuthChange(u => setUser(u));
    return unsub;
  }, []);

  // 서버에서 프로바이더 가용성 조회 (키는 서버에만 존재)
  useEffect(() => {
    fetchHealth()
      .then(h => {
        setHealth(h);
        // 기본 프로바이더 자동 선택: 사용 가능한 첫 번째
        setProvider(prev => h[prev] ? prev : (h.groq ? 'groq' : h.claude ? 'claude' : h.gemini ? 'gemini' : prev));
      })
      .catch(err => console.error('[health] 서버 가용성 조회 실패:', err));
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem('mealwise_profile');
    if (saved) {
      try {
        const p = JSON.parse(saved);
        if (p.age)           setAge(p.age);
        if (p.gender)        setGender(p.gender);
        if (p.weight)        setWeight(p.weight);
        if (p.height)        setHeight(p.height);
        if (p.activityLevel) setActivityLevel(p.activityLevel);
      } catch { /* ignore */ }
    }
  }, []);

  // history 로드 — 로그인 시 Supabase, 비로그인 시 localStorage
  useEffect(() => {
    if (user) {
      loadHistory(user.id).then(records => {
        if (records.length > 0) setHistory(records);
      });
    } else {
      const saved = localStorage.getItem('mealwise_history');
      if (saved) { try { setHistory(JSON.parse(saved)); } catch { /* ignore */ } }
    }
  }, [user]);

  useEffect(() => {
    localStorage.setItem('mealwise_profile', JSON.stringify({ age, gender, weight, height, activityLevel }));
  }, [age, gender, weight, height, activityLevel]);

  // history 저장 — 비로그인 시에만 localStorage에 저장
  useEffect(() => {
    if (!user) {
      localStorage.setItem('mealwise_history', JSON.stringify(history));
    }
  }, [history, user]);

  useEffect(() => {
    return () => { images.forEach(img => URL.revokeObjectURL(img.url)); };
  }, [images]);

  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const files = Array.from(e.clipboardData?.files || []).filter(f => f.type.startsWith('image/'));
      if (files.length > 0) addFiles(files);
    };
    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // --- Helpers ---
  const showToast = (message: string, type: Toast['type'] = 'success') => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ message, type });
    toastTimerRef.current = setTimeout(() => setToast(null), 3200);
  };

  const showConfirm = (message: string, onConfirm: () => void) => {
    setConfirmDialog({ message, onConfirm });
  };

  const addFiles = (files: File[]) => {
    const imageFiles = files.filter(f => f.type.startsWith('image/'));
    if (imageFiles.length === 0) { showToast('이미지 파일만 업로드 가능합니다.', 'error'); return; }
    const newImages = imageFiles.map(file => ({ id: crypto.randomUUID(), url: URL.createObjectURL(file), file }));
    setImages(prev => [...prev, ...newImages]);
    setError(null);
  };

  const getDailyStats = (date: string) => {
    const daily = history.filter(h => new Date(h.date).toDateString() === new Date(date).toDateString());
    return { count: daily.length, calories: daily.reduce((sum, m) => sum + (m.calories || 0), 0) };
  };

  const exportCSV = () => {
    const headers = ['날짜', '시간', '음식명', '식사종류', '칼로리', '단백질(g)', '탄수화물(g)', '지방(g)', '분석모드'];
    const rows = history.map(m => [
      new Date(m.date).toLocaleDateString('ko-KR'),
      new Date(m.date).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }),
      `"${m.foodName}"`,
      MEAL_TYPES.find(t => t.value === m.mealType)?.label ?? '-',
      m.calories,
      m.protein || 0,
      m.carbs || 0,
      m.fat || 0,
      m.mode === 'quick' ? '퀵 리뷰' : '상세 리뷰',
    ]);
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `flavorguard_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('CSV로 내보내기 완료!');
  };

  // --- Auth Handlers ---
  const handleAuth = async () => {
    setAuthLoading(true);
    setAuthError(null);
    const fn = authMode === 'login' ? signIn : signUp;
    const { user: u, error } = await fn(authEmail, authPassword);
    setAuthLoading(false);
    if (error) { setAuthError(error); return; }
    setUser(u);
    setShowAuthModal(false);
    setAuthEmail(''); setAuthPassword('');
    showToast(authMode === 'login' ? '로그인되었습니다!' : '회원가입 완료! 이메일을 확인해주세요.');
    // 기존 localStorage 기록 마이그레이션 제안
    if (authMode === 'login' && u) {
      const local = localStorage.getItem('mealwise_history');
      if (local) {
        try {
          const records: MealRecord[] = JSON.parse(local);
          if (records.length > 0) {
            showConfirm(`로컬에 저장된 ${records.length}개 기록을 클라우드로 이동할까요?`, async () => {
              for (const r of records) await saveMeal(r, u.id);
              localStorage.removeItem('mealwise_history');
              const refreshed = await loadHistory(u.id);
              setHistory(refreshed);
              showToast('기록 이동 완료!');
            });
          }
        } catch { /* ignore */ }
      }
    }
  };

  const handleLogout = async () => {
    await signOut();
    setUser(null);
    setHistory([]);
    showToast('로그아웃되었습니다.');
  };

  // --- Handlers ---
  const handleImageUpload = (e: ChangeEvent<HTMLInputElement>) => {
    addFiles(Array.from(e.target.files || []));
    e.target.value = '';
  };

  const removeImage = (id: string) => {
    setImages(prev => {
      const target = prev.find(img => img.id === id);
      if (target) URL.revokeObjectURL(target.url);
      return prev.filter(img => img.id !== id);
    });
  };

  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragOver(true); };
  const handleDragLeave = () => setIsDragOver(false);
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    addFiles(Array.from(e.dataTransfer.files));
  };

  const startAnalysis = async () => {
    if (images.length === 0) { setError('분석할 음식 사진을 하나 이상 업로드해주세요.'); return; }
    setLoading(true);
    setError(null);
    setLoadingStep(0);
    setStepDetails({});
    setCurrentAnalyzingIdx(0);

    try {
      const results: MealRecord[] = [];
      for (let i = 0; i < images.length; i++) {
        const img = images[i];
        setCurrentAnalyzingIdx(i);
        setLoadingStep(0);
        setStepDetails({});

        const compressed = await compressImage(img.file);
        const base64 = compressed || await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.readAsDataURL(img.file);
        });

        const today = new Date().toDateString();
        const inHistory = history.filter(h => new Date(h.date).toDateString() === today).length;
        const inBatch = results.filter(r => new Date(r.date).toDateString() === today).length;

        const onEvent = (event: StreamEvent) => {
          if (event.type === 'step') {
            setLoadingStep(event.index);
            setStepDetails(prev => ({ ...prev, [event.index]: event.detail }));
          } else if (event.type === 'provider-fallback') {
            showToast(`${PROVIDER_LABELS[event.from]} ${event.reason === 'parse' ? '응답 파싱 실패' : '할당량 초과'} → 다음 프로바이더 전환`, 'error');
            setLoadingStep(0);
            setStepDetails({});
          }
        };

        // 폴백은 서버(/api/analyze)에서 처리됨 — 클라이언트는 한 번만 호출
        const analysis = await analyzeFood(base64, age, gender, inHistory + inBatch, analysisMode, provider, onEvent);
        if (analysis.provider !== provider) {
          showToast(`${PROVIDER_LABELS[analysis.provider]} 로 분석 완료!`);
        }
        results.push({ ...analysis, id: img.id, image: base64, mealType });
      }

      setHistory(prev => [...results, ...prev]);
      // localStore에도 저장 (오프라인/모바일 대비)
      for (const r of results) {
        localAddMeal(r.image, r.mealType, r);
      }
      if (user) {
        for (const r of results) await saveMeal(r, user.id);
      }
      setImages(prev => { prev.forEach(img => URL.revokeObjectURL(img.url)); return []; });
      setSelectedMeal(results[0]);
      showToast(`${results.length}개 분석 완료!`);
    } catch (err) {
      setError(err instanceof Error ? err.message : '분석 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
      setLoadingStep(0);
      setStepDetails({});
      setCurrentAnalyzingIdx(-1);
    }
  };

  const deleteRecord = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    showConfirm('이 기록을 삭제하시겠습니까?', async () => {
      if (user) await dbDeleteMeal(id);
      setHistory(prev => prev.filter(m => m.id !== id));
      if (selectedMeal?.id === id) setSelectedMeal(null);
      showToast('기록이 삭제되었습니다.');
    });
  };

  const clearHistory = () => {
    showConfirm('모든 기록을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.', async () => {
      if (user) await dbClearHistory(user.id);
      setHistory([]);
      setSelectedMeal(null);
      if (!user) localStorage.removeItem('mealwise_history');
      showToast('전체 기록이 삭제되었습니다.');
    });
  };

  const todayMeals = useMemo(() =>
    history.filter(h => new Date(h.date).toDateString() === new Date().toDateString()),
    [history]
  );
  const todayCalories = useMemo(() =>
    todayMeals.reduce((sum, m) => sum + (m.calories || 0), 0),
    [todayMeals]
  );

  const maxWeeklyCalories = Math.max(...weeklyStats.map(d => d.calories), dailyCalorieTarget, 1);

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-900 font-sans overflow-x-hidden pb-20 selection:bg-orange-100">

      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 60, x: '-50%' }}
            animate={{ opacity: 1, y: 0, x: '-50%' }}
            exit={{ opacity: 0, y: 60, x: '-50%' }}
            className={`fixed bottom-24 left-1/2 z-[200] px-6 py-4 border-[3px] border-slate-900 shadow-[6px_6px_0px_0px_rgba(15,23,42,1)] font-black text-sm uppercase flex items-center gap-3 whitespace-nowrap ${toast.type === 'error' ? 'bg-rose-500 text-white' : 'bg-emerald-500 text-white'}`}
          >
            <span>{toast.type === 'error' ? '⚠' : '✓'}</span>
            {toast.message}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Confirm Dialog */}
      <AnimatePresence>
        {confirmDialog && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
            onClick={() => setConfirmDialog(null)}
          >
            <motion.div
              initial={{ scale: 0.9, y: 16 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 16 }}
              onClick={e => e.stopPropagation()}
              className="bg-white border-[3px] border-slate-900 shadow-[8px_8px_0px_0px_rgba(15,23,42,1)] p-8 max-w-sm w-full"
            >
              <p className="font-black text-slate-900 mb-6 leading-relaxed">{confirmDialog.message}</p>
              <div className="flex gap-4">
                <button
                  onClick={() => { confirmDialog.onConfirm(); setConfirmDialog(null); }}
                  className="flex-1 bg-rose-500 text-white py-3 font-black uppercase text-sm border-[3px] border-slate-900 shadow-[4px_4px_0px_0px_rgba(15,23,42,1)] hover:bg-rose-600 hover:shadow-[2px_2px_0px_0px_rgba(15,23,42,1)] hover:-translate-x-0.5 hover:-translate-y-0.5 transition-all active:shadow-none"
                >삭제</button>
                <button
                  onClick={() => setConfirmDialog(null)}
                  className="flex-1 bg-white py-3 font-black uppercase text-sm border-[3px] border-slate-900 shadow-[4px_4px_0px_0px_rgba(15,23,42,1)] hover:bg-slate-50 hover:shadow-[2px_2px_0px_0px_rgba(15,23,42,1)] hover:-translate-x-0.5 hover:-translate-y-0.5 transition-all active:shadow-none"
                >취소</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Auth Modal */}
      <AnimatePresence>
        {showAuthModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
            onClick={() => setShowAuthModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, y: 16 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 16 }}
              onClick={e => e.stopPropagation()}
              className="bg-white border-[3px] border-slate-900 shadow-[8px_8px_0px_0px_rgba(15,23,42,1)] w-full max-w-sm"
            >
              {/* 탭 헤더 */}
              <div className="flex border-b-[3px] border-slate-900">
                {(['login', 'signup'] as const).map((mode, i) => (
                  <button key={mode} onClick={() => { setAuthMode(mode); setAuthError(null); }}
                    className={`flex-1 py-4 text-xs font-black uppercase tracking-widest transition-colors ${i > 0 ? 'border-l-[3px] border-slate-900' : ''} ${authMode === mode ? 'bg-slate-900 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'}`}
                  >{mode === 'login' ? '로그인' : '회원가입'}</button>
                ))}
              </div>
              {/* 폼 */}
              <div className="p-8 space-y-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase text-slate-500">이메일</label>
                  <input
                    type="email" value={authEmail}
                    onChange={e => setAuthEmail(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleAuth()}
                    placeholder="you@example.com"
                    className="w-full border-[3px] border-slate-900 px-3 py-2.5 font-bold text-sm focus:outline-none focus:bg-orange-50 transition-all shadow-[3px_3px_0px_0px_rgba(15,23,42,1)]"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase text-slate-500">비밀번호</label>
                  <input
                    type="password" value={authPassword}
                    onChange={e => setAuthPassword(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleAuth()}
                    placeholder="6자 이상"
                    className="w-full border-[3px] border-slate-900 px-3 py-2.5 font-bold text-sm focus:outline-none focus:bg-orange-50 transition-all shadow-[3px_3px_0px_0px_rgba(15,23,42,1)]"
                  />
                </div>
                {authError && (
                  <div className="bg-rose-50 border-[2px] border-rose-500 p-3 text-xs font-bold text-rose-700">{authError}</div>
                )}
                <button
                  onClick={handleAuth}
                  disabled={authLoading || !authEmail || !authPassword}
                  className={`w-full py-4 text-sm font-black uppercase border-[3px] border-slate-900 transition-all ${authLoading || !authEmail || !authPassword ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : 'bg-orange-500 text-white shadow-[6px_6px_0px_0px_rgba(15,23,42,1)] hover:bg-orange-600 active:shadow-none active:translate-x-1.5 active:translate-y-1.5'}`}
                >
                  {authLoading ? '처리 중...' : authMode === 'login' ? '로그인' : '회원가입'}
                </button>
                <p className="text-center text-[10px] font-bold text-slate-400">
                  {authMode === 'login' ? '계정이 없으신가요? ' : '이미 계정이 있으신가요? '}
                  <button onClick={() => { setAuthMode(authMode === 'login' ? 'signup' : 'login'); setAuthError(null); }}
                    className="text-orange-500 font-black uppercase hover:underline"
                  >{authMode === 'login' ? '회원가입' : '로그인'}</button>
                </p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── 상단 헤더 (sticky) ── */}
      <header className="sticky top-0 z-40 bg-white border-b-[3px] border-slate-900 px-4 py-3 flex justify-between items-center shadow-[0_4px_0_0_rgba(15,23,42,1)]">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-orange-500 rounded-lg flex items-center justify-center shadow-md -rotate-12">
            <Utensils className="text-white w-4 h-4" />
          </div>
          <span className="font-black text-lg tracking-tighter">Flavor<span className="text-orange-500">Guard</span> <span className="text-slate-300 text-sm">AI</span></span>
        </div>
        <div className="flex items-center gap-2">
          <div className="text-right">
            <p className="text-[9px] font-black text-slate-400 uppercase leading-none">오늘</p>
            <p className="text-xs font-black leading-tight">{todayCalories.toLocaleString()}<span className="opacity-40 text-[10px]">/{dailyCalorieTarget.toLocaleString()}</span></p>
          </div>
          {SUPABASE_AVAILABLE && (
            user ? (
              <button onClick={handleLogout}
                className="px-2 py-1 text-[9px] font-black uppercase border-[2px] border-slate-900 bg-white hover:bg-rose-50 transition-colors shadow-[2px_2px_0_0_rgba(15,23,42,1)]"
              >로그아웃</button>
            ) : (
              <button onClick={() => { setShowAuthModal(true); setAuthMode('login'); setAuthError(null); }}
                className="px-2 py-1 text-[9px] font-black uppercase border-[2px] border-slate-900 bg-orange-500 text-white shadow-[2px_2px_0_0_rgba(15,23,42,1)]"
              >로그인</button>
            )
          )}
          <div ref={profileRef} className="relative">
            <button onClick={() => setShowProfile(p => !p)}
              className="w-9 h-9 bg-white border-[3px] border-slate-900 rounded-xl flex items-center justify-center text-slate-900 shadow-[3px_3px_0_0_rgba(15,23,42,1)] hover:bg-orange-50 transition-colors"
            >
              <span className="text-xs font-black">{gender === 'male' ? 'M' : 'F'}{age}</span>
            </button>
            <AnimatePresence>
              {showProfile && (
                <motion.div
                  initial={{ opacity: 0, y: -8, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -8, scale: 0.95 }}
                  transition={{ duration: 0.15 }}
                  className="absolute right-0 top-full mt-2 w-72 max-w-[calc(100vw-1rem)] bg-white border-[3px] border-slate-900 shadow-[8px_8px_0_0_rgba(15,23,42,1)] p-5 z-50"
                >
                  <h4 className="text-[10px] font-black uppercase text-slate-400 mb-4 tracking-widest flex items-center gap-2">
                    <User className="w-3 h-3" /> Profile Settings
                  </h4>
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <label className="text-[10px] font-black uppercase text-slate-500">나이</label>
                        <input type="number" value={age} min={10} max={100} onChange={e => setAge(Number(e.target.value))}
                          className="w-full border-[3px] border-slate-900 px-2 py-1.5 font-black text-sm focus:outline-none focus:bg-orange-50 shadow-[2px_2px_0_0_rgba(15,23,42,1)]"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-black uppercase text-slate-500">체중(kg)</label>
                        <input type="number" value={weight} min={30} max={200} onChange={e => setWeight(Number(e.target.value))}
                          className="w-full border-[3px] border-slate-900 px-2 py-1.5 font-black text-sm focus:outline-none focus:bg-orange-50 shadow-[2px_2px_0_0_rgba(15,23,42,1)]"
                        />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-black uppercase text-slate-500">키(cm)</label>
                      <input type="number" value={height} min={100} max={250} onChange={e => setHeight(Number(e.target.value))}
                        className="w-full border-[3px] border-slate-900 px-2 py-1.5 font-black text-sm focus:outline-none focus:bg-orange-50 shadow-[2px_2px_0_0_rgba(15,23,42,1)]"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-black uppercase text-slate-500">성별</label>
                      <div className="flex border-[3px] border-slate-900 overflow-hidden shadow-[2px_2px_0_0_rgba(15,23,42,1)]">
                        {(['male', 'female'] as Gender[]).map((g, i) => (
                          <button key={g} onClick={() => setGender(g)}
                            className={`flex-1 py-1.5 text-xs font-black uppercase transition-colors ${i > 0 ? 'border-l-[3px] border-slate-900' : ''} ${gender === g ? 'bg-slate-900 text-white' : 'bg-white'}`}
                          >{g === 'male' ? '남성' : '여성'}</button>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-black uppercase text-slate-500">활동량</label>
                      <select value={activityLevel} onChange={e => setActivityLevel(e.target.value as ActivityLevel)}
                        className="w-full border-[3px] border-slate-900 px-2 py-1.5 font-bold text-xs bg-white shadow-[2px_2px_0_0_rgba(15,23,42,1)] focus:outline-none appearance-none cursor-pointer"
                      >
                        {(Object.entries(ACTIVITY_LABELS) as [ActivityLevel, string][]).map(([v, l]) => (
                          <option key={v} value={v}>{l}</option>
                        ))}
                      </select>
                    </div>
                    <div className="bg-orange-50 border-[3px] border-orange-400 p-3 shadow-[3px_3px_0_0_rgba(251,146,60,1)]">
                      <p className="text-[9px] font-black uppercase text-orange-600 mb-1">일일 권장 칼로리</p>
                      <p className="text-xl font-black">{dailyCalorieTarget.toLocaleString()} <span className="text-xs opacity-50">kcal</span></p>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </header>

      {/* ── 탭 콘텐츠 ── */}
      <main>
        <AnimatePresence mode="wait">

          {/* ════ 홈 탭 ════ */}
          {mainTab === 'home' && (
            <motion.div key="home" initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 16 }} transition={{ duration: 0.2 }} className="p-4 space-y-4">

              {/* 오늘 칼로리 카드 */}
              <div className="bg-white border-[3px] border-slate-900 shadow-[6px_6px_0_0_rgba(15,23,42,1)] p-5">
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">오늘 섭취</p>
                    <p className="text-3xl font-black mt-0.5">{todayCalories.toLocaleString()} <span className="text-sm opacity-40">kcal</span></p>
                  </div>
                  <div className="text-right">
                    <p className="text-[9px] font-black text-slate-400 uppercase">목표</p>
                    <p className="text-sm font-black text-orange-500">{dailyCalorieTarget.toLocaleString()}</p>
                    <p className="text-[9px] text-slate-400 font-bold">{gender === 'male' ? '남성' : '여성'} · {age}세</p>
                  </div>
                </div>
                <div className="h-3 bg-slate-100 border-[2px] border-slate-900 overflow-hidden shadow-[2px_2px_0_0_rgba(15,23,42,1)]">
                  <motion.div
                    animate={{ width: `${Math.min(100, todayCalories > 0 ? (todayCalories / dailyCalorieTarget) * 100 : 0)}%` }}
                    transition={{ duration: 0.8, ease: 'easeOut' }}
                    className={`h-full ${todayCalories > dailyCalorieTarget ? 'bg-rose-500' : 'bg-orange-500'}`}
                  />
                </div>
                <p className="text-[9px] text-slate-400 font-bold mt-2 uppercase">
                  {Math.round((todayCalories / dailyCalorieTarget) * 100)}% of daily goal · {todayMeals.length}끼
                </p>
              </div>

              {/* 오늘 식사 */}
              <div className="bg-slate-900 text-white border-[3px] border-slate-900 shadow-[6px_6px_0_0_rgba(15,23,42,1)]">
                <div className="px-5 pt-4 pb-2 flex justify-between items-center">
                  <p className="text-[10px] font-black uppercase text-slate-400">오늘 식사</p>
                  {todayMeals.length > 0 && (
                    <button onClick={() => setMainTab('history')} className="text-[9px] font-black uppercase text-slate-400 hover:text-white">전체 보기</button>
                  )}
                </div>
                {todayMeals.length === 0 ? (
                  <div className="text-center py-8 opacity-30">
                    <p className="text-sm font-black">아직 기록된 식사가 없습니다</p>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-800">
                    {todayMeals.slice(0, 3).map(meal => (
                      <button key={meal.id}
                        onClick={() => { setSelectedMeal(meal); setMainTab('analyze'); }}
                        className="w-full flex items-center gap-3 px-5 py-3 hover:bg-slate-800 transition-colors active:bg-slate-700 text-left"
                      >
                        <img src={meal.image} className="w-11 h-11 object-cover shrink-0 border border-slate-700" alt="" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-black truncate">{MEAL_TYPES.find(t=>t.value===meal.mealType)?.emoji} {meal.foodName}</p>
                          <p className="text-[10px] text-slate-400 font-bold">{meal.calories} kcal · {new Date(meal.date).toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit'})}</p>
                        </div>
                        <span className="text-[9px] text-slate-500">&rsaquo;</span>
                      </button>
                    ))}
                    {todayMeals.length > 3 && (
                      <button onClick={() => setMainTab('history')} className="w-full py-2 text-[10px] font-black uppercase text-slate-500 hover:text-white transition-colors">
                        +{todayMeals.length - 3}개 더 보기
                      </button>
                    )}
                  </div>
                )}
                <div className="px-5 pb-4 pt-3">
                  <button onClick={() => setMainTab('analyze')}
                    className="w-full py-4 bg-orange-500 text-white font-black uppercase text-sm border-[3px] border-white/20 active:opacity-80 transition-opacity flex items-center justify-center gap-2"
                  >
                    <Camera className="w-4 h-4" /> 식사 분석하기
                  </button>
                </div>
              </div>

              {/* 주간 요약 */}
              <div className="bg-white border-[3px] border-slate-900 shadow-[6px_6px_0_0_rgba(15,23,42,1)] p-5">
                <div className="flex justify-between items-center mb-4">
                  <p className="text-[10px] font-black uppercase text-slate-400">이번 주</p>
                  <button onClick={() => setMainTab('stats')} className="text-[9px] font-black uppercase text-orange-500">통계 보기</button>
                </div>
                <div className="flex items-end gap-1" style={{ height: '60px' }}>
                  {weeklyStats.map((day, i) => {
                    const barH = day.calories > 0 ? Math.max(8, (day.calories / maxWeeklyCalories) * 100) : 4;
                    return (
                      <div key={i} className="flex-1 flex flex-col items-center justify-end gap-0.5 h-full">
                        <div className="w-full flex items-end" style={{ height: 'calc(100% - 14px)' }}>
                          <motion.div
                            initial={{ height: 0 }}
                            animate={{ height: `${barH}%` }}
                            transition={{ duration: 0.5, delay: i * 0.04 }}
                            className={`w-full border ${day.calories === 0 ? 'bg-slate-100 border-slate-200' : day.isToday ? 'bg-orange-400 border-orange-300' : day.calories > dailyCalorieTarget ? 'bg-rose-400 border-rose-300' : 'bg-emerald-400 border-emerald-300'}`}
                          />
                        </div>
                        <span className={`text-[8px] font-black uppercase ${day.isToday ? 'text-orange-500' : 'text-slate-400'}`}>{day.label}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </motion.div>
          )}

          {/* ════ 분석 탭 ════ */}
          {mainTab === 'analyze' && (
            <motion.div key="analyze" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} className="p-4">
              <AnimatePresence mode="wait">
                {loading ? (
                  <motion.div key="loading" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }}
                    className="bg-white border-[3px] border-slate-900 shadow-[8px_8px_0_0_rgba(15,23,42,1)] overflow-hidden"
                  >
                    <div className="bg-slate-900 text-white px-5 py-4 flex justify-between items-center">
                      <div className="flex items-center gap-2">
                        <RefreshCw className="w-4 h-4 animate-spin text-orange-400" />
                        <span className="text-sm font-black uppercase tracking-wider">
                          {analysisMode === 'quick' ? '⚡ 퀵 분석' : '📋 상세 분석'}
                        </span>
                      </div>
                      <p className="text-[10px] font-black text-orange-400 uppercase">
                        {Math.min(loadingStep + 1, loadingStepsData.length)}/{loadingStepsData.length}
                      </p>
                    </div>
                    <div className="h-1.5 bg-slate-100">
                      <motion.div className="h-full bg-orange-500"
                        animate={{ width: `${((loadingStep + 1) / loadingStepsData.length) * 100}%` }}
                        transition={{ duration: 0.6 }}
                      />
                    </div>
                    {/* 이미지 프리뷰 */}
                    {currentAnalyzingIdx >= 0 && images[currentAnalyzingIdx] && (
                      <div className="relative aspect-video overflow-hidden">
                        <img src={images[currentAnalyzingIdx].url} className="w-full h-full object-cover" alt="" />
                        <div className="absolute inset-0 bg-orange-500/10 animate-pulse" />
                        <div className="absolute bottom-0 left-0 right-0 bg-slate-900/80 py-2 text-center">
                          <span className="text-[9px] font-black uppercase text-orange-400 tracking-widest">SCANNING...</span>
                        </div>
                      </div>
                    )}
                    {/* 스텝 목록 */}
                    <div className="p-5 space-y-1">
                      {loadingStepsData.map((step, i) => (
                        <div key={i} className={`flex items-center gap-3 p-2.5 transition-all ${i === loadingStep ? 'bg-orange-50 border-2 border-orange-400' : i < loadingStep ? 'border-2 border-transparent' : 'border-2 border-transparent opacity-30'}`}>
                          <div className="shrink-0 w-5 h-5 flex items-center justify-center">
                            {i < loadingStep ? <CheckCircle2 className="w-4 h-4 text-emerald-500" /> :
                             i === loadingStep ? <RefreshCw className="w-3.5 h-3.5 text-orange-500 animate-spin" /> :
                             <div className="w-3.5 h-3.5 rounded-full border-2 border-slate-300" />}
                          </div>
                          <div>
                            <p className={`text-xs font-black uppercase ${i === loadingStep ? 'text-orange-600' : i < loadingStep ? 'text-emerald-700' : 'text-slate-400'}`}>{step.label}</p>
                            {stepDetails[i] ? (
                              <p className="text-[9px] font-bold text-orange-500">{stepDetails[i]}</p>
                            ) : (
                              <p className="text-[9px] font-bold text-slate-400">{step.desc}</p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </motion.div>

                ) : selectedMeal ? (
                  <motion.div key={selectedMeal.id} initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}>
                    <AnalysisResultCard
                      meal={selectedMeal}
                      dailyCalorieTarget={dailyCalorieTarget}
                      dailyCalorieConsumed={getDailyStats(selectedMeal.date).calories}
                      onBack={() => setSelectedMeal(null)}
                    />
                  </motion.div>

                ) : (
                  <motion.div key="upload" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                    {/* 업로드 카드 */}
                    <div className="bg-white border-[3px] border-slate-900 shadow-[8px_8px_0_0_rgba(15,23,42,1)] p-5 space-y-4">
                      <h4 className="text-[10px] font-black uppercase text-slate-400 tracking-widest flex items-center gap-2">
                        <Camera className="w-3 h-3" /> Meal Capture
                      </h4>

                      {/* 드롭존 */}
                      <div
                        className={`border-[3px] border-dashed p-8 text-center cursor-pointer transition-all ${isDragOver ? 'border-orange-500 bg-orange-50/60' : 'border-slate-300 bg-slate-50/50 hover:border-orange-400 hover:bg-orange-50/30'}`}
                        onClick={() => fileInputRef.current?.click()}
                        onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}
                      >
                        <div className={`w-12 h-12 bg-white border-2 border-slate-900 rounded-xl flex items-center justify-center mx-auto mb-3 shadow-[3px_3px_0_0_rgba(15,23,42,1)] transition-transform ${isDragOver ? 'scale-110 -rotate-6 bg-orange-50' : ''}`}>
                          <Upload className="w-6 h-6 text-slate-900" />
                        </div>
                        <p className="text-xs font-black uppercase">{isDragOver ? '놓아서 업로드' : '사진 업로드'}</p>
                        <p className="text-[9px] font-bold text-slate-400 mt-1 uppercase">드래그 · 클릭 · 붙여넣기</p>
                        <input type="file" multiple ref={fileInputRef} onChange={handleImageUpload} className="hidden" accept="image/*" />
                        <input type="file" ref={cameraInputRef} onChange={handleImageUpload} className="hidden" accept="image/*" capture="environment" />
                      </div>

                      {/* 카메라 버튼 */}
                      <button onClick={() => cameraInputRef.current?.click()}
                        className="w-full py-3 flex items-center justify-center gap-2 bg-slate-900 text-white border-[3px] border-slate-900 shadow-[4px_4px_0_0_rgba(15,23,42,1)] active:shadow-none active:translate-x-1 active:translate-y-1 transition-all font-black uppercase text-sm"
                      >
                        <Camera className="w-4 h-4" /> 카메라로 촬영
                      </button>

                      {/* 이미지 프리뷰 */}
                      <AnimatePresence>
                        {images.length > 0 && (
                          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                            className="grid grid-cols-3 gap-2"
                          >
                            {images.map(img => (
                              <div key={img.id} className="relative aspect-square border-2 border-slate-900 shadow-[2px_2px_0_0_rgba(15,23,42,1)] overflow-hidden">
                                <img src={img.url} className="w-full h-full object-cover" alt="" />
                                <button onClick={e => { e.stopPropagation(); removeImage(img.id); }}
                                  className="absolute top-1 right-1 bg-rose-500 text-white p-1 border-2 border-slate-900"
                                ><Plus className="w-2.5 h-2.5 rotate-45" /></button>
                              </div>
                            ))}
                          </motion.div>
                        )}
                      </AnimatePresence>

                      {/* 식사 종류 */}
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black uppercase text-slate-500">식사 종류</label>
                        <div className="grid grid-cols-4 border-[3px] border-slate-900 shadow-[3px_3px_0_0_rgba(15,23,42,1)] overflow-hidden">
                          {MEAL_TYPES.map((type, i) => (
                            <button key={type.value} onClick={() => setMealType(type.value)}
                              className={`py-2.5 flex flex-col items-center gap-0.5 transition-colors ${i > 0 ? 'border-l-[2px] border-slate-900' : ''} ${mealType === type.value ? 'bg-slate-900 text-white' : 'bg-white text-slate-700'}`}
                            >
                              <span className="text-sm">{type.emoji}</span>
                              <span className={`text-[8px] font-black uppercase ${mealType === type.value ? 'text-orange-300' : 'text-slate-400'}`}>{type.label}</span>
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* AI 엔진 */}
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black uppercase text-slate-500">AI 엔진</label>
                        <div className="flex border-[3px] border-slate-900 shadow-[3px_3px_0_0_rgba(15,23,42,1)] overflow-hidden">
                          {([
                            { value: 'gemini' as AIProvider, icon: '🔵', name: 'Gemini', sub: 'Google · Flash', available: health.gemini },
                            { value: 'claude' as AIProvider, icon: '🟠', name: 'Claude', sub: 'Anthropic', available: health.claude },
                            { value: 'groq' as AIProvider, icon: '🟢', name: 'Groq', sub: '무료', available: health.groq },
                          ]).map(({ value, icon, name, sub, available }, i) => (
                            <button key={value} onClick={() => available && setProvider(value)}
                              title={available ? undefined : `.env에 API 키를 추가해주세요`}
                              className={`flex-1 py-2.5 flex items-center justify-center gap-1 transition-colors ${i > 0 ? 'border-l-[3px] border-slate-900' : ''} ${!available ? 'opacity-35 cursor-not-allowed bg-slate-50' : provider === value ? 'bg-slate-900 text-white' : 'bg-white text-slate-700'}`}
                            >
                              <span className="text-sm leading-none">{icon}</span>
                              <div className="text-left">
                                <p className="text-[10px] font-black uppercase leading-tight">{name}</p>
                                <p className={`hidden sm:block text-[8px] font-bold leading-tight ${provider === value && available ? 'text-orange-300' : 'text-slate-400'}`}>{available ? sub : '키 없음'}</p>
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* 분석 모드 */}
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black uppercase text-slate-500">분석 모드</label>
                        <div className="flex border-[3px] border-slate-900 shadow-[3px_3px_0_0_rgba(15,23,42,1)] overflow-hidden">
                          {([['quick', '⚡ 퀵', '빠름'], ['detailed', '📋 상세', '상세']] as const).map(([mode, title, sub], i) => (
                            <button key={mode} onClick={() => setAnalysisMode(mode)}
                              className={`flex-1 py-3 flex flex-col items-center gap-0.5 transition-colors ${i > 0 ? 'border-l-[3px] border-slate-900' : ''} ${analysisMode === mode ? 'bg-slate-900 text-white' : 'bg-white text-slate-700'}`}
                            >
                              <span className="text-sm font-black uppercase">{title}</span>
                              <span className={`text-[8px] font-bold uppercase ${analysisMode === mode ? 'text-orange-300' : 'text-slate-400'}`}>{sub}</span>
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* 에러 */}
                      {error && (
                        <div className="bg-rose-50 border-[3px] border-rose-500 shadow-[3px_3px_0_0_rgba(239,68,68,1)] p-4 flex items-start gap-3">
                          <span className="text-rose-500 text-lg shrink-0">⚠</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-rose-700 text-xs font-bold leading-relaxed break-all">{error}</p>
                            <button onClick={startAnalysis} className="mt-2 flex items-center gap-1.5 text-[10px] font-black uppercase text-rose-600">
                              <RotateCcw className="w-3 h-3" /> 다시 시도
                            </button>
                          </div>
                        </div>
                      )}

                      {/* 배치 분석 */}
                      <BatchAnalyzer
                        age={age}
                        gender={gender}
                        provider={provider}
                        mealType={mealType}
                        onComplete={results => {
                          setHistory(prev => [
                            ...results.map(r => ({
                              ...r,
                              id: `batch-${Date.now()}-${Math.random().toString(36).slice(2,6)}`,
                              image: '',
                              mealType,
                            })),
                            ...prev,
                          ]);
                          showToast(`${results.length}개 일괄 분석 완료!`);
                        }}
                      />

                      {/* 분석 버튼 */}
                      <button onClick={startAnalysis} disabled={loading || images.length === 0}
                        className={`w-full py-5 text-base font-black uppercase border-[3px] border-slate-900 transition-all ${loading || images.length === 0 ? 'bg-slate-100 text-slate-400 cursor-not-allowed shadow-none border-slate-300' : 'bg-orange-500 text-white shadow-[8px_8px_0_0_rgba(15,23,42,1)] active:shadow-none active:translate-x-2 active:translate-y-2'}`}
                      >
                        {loading ? (
                          <span className="flex items-center justify-center gap-2"><RefreshCw className="w-4 h-4 animate-spin" /> 분석 중...</span>
                        ) : analysisMode === 'quick' ? '⚡ Quick Analysis' : '📋 Full Analysis'}
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}

          {/* ════ 기록 탭 ════ */}
          {mainTab === 'history' && (
            <motion.div key="history" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} transition={{ duration: 0.2 }}
              className="p-4 space-y-4"
              onClick={() => setActiveItemId(null)}
            >
              {/* 오늘 식단 요약 (mealStore 기반) */}
              <DayMealLog dailyCalorieTarget={dailyCalorieTarget} onMealDeleted={() => {}} />

              <div className="flex justify-between items-center mt-2">
                <p className="text-[10px] font-black uppercase text-slate-500">{history.length} Records</p>
                <button onClick={e => { e.stopPropagation(); clearHistory(); }}
                  className="text-[9px] font-black uppercase bg-rose-500 text-white px-2 py-1 border-2 border-slate-900 shadow-[2px_2px_0_0_rgba(15,23,42,1)]"
                >전체 삭제</button>
              </div>

              <div className="space-y-3">
                {Object.entries(groupedHistory).map(([date, meals]) => {
                  const isExpanded = expandedDates.has(date);
                  const stats = getDailyStats(meals[0].date);
                  const pct = Math.min(100, Math.round((stats.calories / dailyCalorieTarget) * 100));
                  return (
                    <div key={date} className="bg-white border-[3px] border-slate-900 shadow-[4px_4px_0_0_rgba(15,23,42,1)] overflow-hidden">
                      {/* 날짜 헤더 */}
                      <button
                        onClick={e => { e.stopPropagation(); setExpandedDates(prev => { const next = new Set(prev); next.has(date) ? next.delete(date) : next.add(date); return next; }); }}
                        className="w-full flex items-center justify-between px-4 py-3.5 active:bg-slate-50 transition-colors"
                      >
                        <div className="text-left">
                          <p className="text-sm font-black text-slate-800">{date}</p>
                          <p className="text-[10px] text-slate-400 font-bold mt-0.5">
                            {stats.count}끼 · {stats.calories.toLocaleString()} kcal · {pct}%
                          </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <div className="w-14 h-1.5 bg-slate-100 border border-slate-300 overflow-hidden">
                            <div className={`h-full ${pct > 110 ? 'bg-rose-500' : pct > 90 ? 'bg-orange-400' : 'bg-emerald-400'}`} style={{ width: `${Math.min(100, pct)}%` }} />
                          </div>
                          <motion.div animate={{ rotate: isExpanded ? 180 : 0 }} transition={{ duration: 0.2 }}>
                            <ChevronDown className="w-4 h-4 text-slate-400" />
                          </motion.div>
                        </div>
                      </button>

                      {/* 식사 목록 */}
                      <AnimatePresence>
                        {isExpanded && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.25 }}
                            className="overflow-hidden border-t-[2px] border-slate-200"
                          >
                            {meals.map(meal => {
                              const isActive = activeItemId === meal.id;
                              const mealEmoji = MEAL_TYPES.find(t => t.value === meal.mealType)?.emoji ?? '🍽️';
                              return (
                                <div key={meal.id}
                                  className={`flex items-stretch border-b-[1px] border-slate-100 last:border-0 transition-colors ${isActive ? 'bg-orange-50' : 'bg-white'}`}
                                >
                                  <button
                                    onClick={e => { e.stopPropagation(); isActive ? (setSelectedMeal(meal), setMainTab('analyze')) : setActiveItemId(meal.id); }}
                                    className="flex-1 flex items-center gap-3 px-4 py-3 text-left min-w-0"
                                  >
                                    <img src={meal.image} className="w-12 h-12 object-cover shrink-0 border-2 border-slate-200" alt="" />
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-1 flex-wrap">
                                        <span className="text-sm">{mealEmoji}</span>
                                        <p className="text-sm font-black truncate max-w-[160px]">{meal.foodName}</p>
                                        <span className={`text-[8px] font-black px-1 border ${meal.mode === 'quick' ? 'border-amber-400 text-amber-600' : 'border-sky-400 text-sky-600'}`}>{meal.mode === 'quick' ? '⚡' : '📋'}</span>
                                      </div>
                                      <p className="text-[10px] text-slate-400 font-bold mt-0.5">
                                        {new Date(meal.date).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })} · {meal.calories} kcal{meal.protein > 0 ? ` · 단백질 ${meal.protein}g` : ''}
                                      </p>
                                      {isActive && <p className="text-[9px] text-orange-500 font-black uppercase mt-0.5">다시 탭하면 상세 보기 →</p>}
                                    </div>
                                  </button>
                                  <AnimatePresence>
                                    {isActive && (
                                      <motion.button
                                        initial={{ width: 0, opacity: 0 }}
                                        animate={{ width: 60, opacity: 1 }}
                                        exit={{ width: 0, opacity: 0 }}
                                        transition={{ duration: 0.2 }}
                                        onClick={e => { e.stopPropagation(); deleteRecord(meal.id, e); }}
                                        className="bg-rose-500 text-white flex items-center justify-center shrink-0 overflow-hidden border-l-[2px] border-slate-200"
                                      >
                                        <Trash2 className="w-5 h-5" />
                                      </motion.button>
                                    )}
                                  </AnimatePresence>
                                </div>
                              );
                            })}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  );
                })}

                {Object.keys(groupedHistory).length === 0 && (
                  <div className="text-center py-16 opacity-40">
                    <Calendar className="w-12 h-12 mx-auto mb-3" />
                    <p className="text-sm font-black uppercase">기록된 식단이 없습니다</p>
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {/* ════ 통계 탭 ════ */}
          {mainTab === 'stats' && (
            <motion.div key="stats" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} transition={{ duration: 0.2 }} className="p-4 space-y-4">
              <div className="bg-slate-900 text-white border-[3px] border-slate-900 shadow-[6px_6px_0_0_rgba(15,23,42,1)] p-5">
                <div className="flex justify-between items-center mb-5">
                  <p className="text-[10px] font-black uppercase text-slate-400">최근 7일 칼로리</p>
                  <button onClick={exportCSV} className="flex items-center gap-1.5 text-[9px] font-black uppercase bg-emerald-500 px-3 py-1.5 border border-black shadow-[2px_2px_0_0_rgba(0,0,0,1)]">
                    <Download className="w-3 h-3" /> CSV
                  </button>
                </div>
                <div className="flex items-end gap-1.5" style={{ height: '120px' }}>
                  {weeklyStats.map((day, i) => {
                    const barHeight = day.calories > 0 ? Math.max(8, (day.calories / maxWeeklyCalories) * 100) : 4;
                    const targetLineY = (dailyCalorieTarget / maxWeeklyCalories) * 100;
                    const overTarget = day.calories > dailyCalorieTarget;
                    return (
                      <div key={i} className="flex-1 flex flex-col items-center justify-end gap-1 h-full relative">
                        {day.calories > 0 && (
                          <span className="text-[7px] font-black text-slate-400 absolute top-0 left-1/2 -translate-x-1/2">
                            {day.calories >= 1000 ? `${(day.calories/1000).toFixed(1)}k` : day.calories}
                          </span>
                        )}
                        <div className="w-full relative flex items-end" style={{ height: 'calc(100% - 16px)' }}>
                          <div className="absolute w-full border-t border-dashed border-orange-400/60 pointer-events-none" style={{ bottom: `${targetLineY}%` }} />
                          <motion.div
                            initial={{ height: 0 }}
                            animate={{ height: `${barHeight}%` }}
                            transition={{ duration: 0.5, delay: i * 0.04 }}
                            className={`w-full border ${day.calories === 0 ? 'bg-slate-700 border-slate-600' : overTarget ? 'bg-rose-500 border-rose-400' : day.isToday ? 'bg-orange-400 border-orange-300' : 'bg-emerald-500 border-emerald-400'}`}
                          />
                        </div>
                        <span className={`text-[8px] font-black uppercase ${day.isToday ? 'text-orange-400' : 'text-slate-500'}`}>{day.label}</span>
                      </div>
                    );
                  })}
                </div>
                <div className="mt-4 flex items-center gap-3 flex-wrap">
                  {[['bg-orange-400','오늘'],['bg-emerald-500','목표 이하'],['bg-rose-500','목표 초과']].map(([bg,label]) => (
                    <div key={label} className="flex items-center gap-1.5">
                      <div className={`w-2.5 h-2.5 ${bg} border border-slate-600`} />
                      <span className="text-[8px] font-black uppercase text-slate-400">{label}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: '7일 총 칼로리', value: `${weeklyStats.reduce((s,d)=>s+d.calories,0).toLocaleString()} kcal` },
                  { label: '일평균', value: `${Math.round(weeklyStats.reduce((s,d)=>s+d.calories,0)/7).toLocaleString()} kcal` },
                  { label: '총 기록', value: `${history.length}건` },
                  { label: '일일 목표', value: `${dailyCalorieTarget.toLocaleString()} kcal` },
                ].map(({ label, value }) => (
                  <div key={label} className="bg-white border-[3px] border-slate-900 shadow-[4px_4px_0_0_rgba(15,23,42,1)] p-4">
                    <p className="text-[9px] font-black uppercase text-slate-400 mb-1">{label}</p>
                    <p className="text-sm font-black text-slate-900">{value}</p>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

        </AnimatePresence>
      </main>

      {/* ── 하단 탭바 ── */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t-[3px] border-slate-900 flex shadow-[0_-4px_0_0_rgba(15,23,42,1)]">
        {([
          { id: 'home',    icon: <Home className="w-5 h-5" />,      label: '홈' },
          { id: 'analyze', icon: <Camera className="w-5 h-5" />,    label: '분석' },
          { id: 'history', icon: <History className="w-5 h-5" />,   label: '기록' },
          { id: 'stats',   icon: <TrendingUp className="w-5 h-5" />, label: '통계' },
        ] as { id: 'home'|'analyze'|'history'|'stats', icon: React.ReactNode, label: string }[]).map(tab => (
          <button key={tab.id} onClick={() => { setMainTab(tab.id); setActiveItemId(null); }}
            className={`relative flex-1 flex flex-col items-center gap-0.5 py-3 transition-colors ${mainTab === tab.id ? 'text-orange-500' : 'text-slate-400 hover:text-slate-600'}`}
          >
            {tab.icon}
            <span className="text-[9px] font-black uppercase">{tab.label}</span>
            {mainTab === tab.id && (
              <motion.div layoutId="tabIndicator" className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-orange-500" />
            )}
          </button>
        ))}
      </nav>

      <style>{`
        @keyframes shimmer { 0% { left: -100%; opacity: 0; } 20% { opacity: 0.5; } 100% { left: 100%; opacity: 0; } }
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #475569; }
        .custom-prose h1 { font-family: ui-sans-serif, system-ui; font-size: 1.4rem; font-weight: 900; text-transform: uppercase; border-bottom: 4px solid #0f172a; margin-bottom: 1rem; color: #0f172a; letter-spacing: -0.05em; line-height: 1; }
        .custom-prose h2 { font-size: 0.95rem; font-weight: 900; text-transform: uppercase; color: #0f172a; margin-top: 1.5rem; background: #f8fafc; padding: 0.25rem 0.5rem; border-left: 5px solid #f97316; }
        .custom-prose p { font-size: 0.9rem; color: #334155; font-weight: 500; margin-bottom: 0.75rem; line-height: 1.8; }
        .custom-prose ul { list-style: none; padding: 0; margin-bottom: 1rem; }
        .custom-prose li { position: relative; padding-left: 1.5rem; font-size: 0.85rem; font-weight: 700; color: #1e293b; margin-bottom: 0.5rem; line-height: 1.5; border-bottom: 1px dashed #e2e8f0; padding-bottom: 0.4rem; }
        .custom-prose li::before { content: "●"; position: absolute; left: 0; color: #f97316; font-size: 0.7rem; top: 0.1rem; }
        .custom-prose strong { color: #0f172a; font-weight: 900; background: #fef3c7; padding: 0 2px; }
      `}</style>
    </div>
  );
}
