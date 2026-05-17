/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useRef, ChangeEvent, useEffect, useMemo } from 'react';
import React from 'react';
import {
  Camera, Upload, Utensils, RefreshCw, User, Calendar,
  Plus, Trash2, History, Zap, Target, TrendingUp, Download, RotateCcw,
  Home, ChevronDown, ChevronLeft, ChevronRight,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import {
  analyzeFood, AnalysisResult, AnalysisMode, StreamEvent, MealType,
  AIProvider, PROVIDER_LABELS, fetchHealth, ProviderHealth,
  InsufficientCalError,
} from './services/geminiService';
import { fetchMe, initPayment, type MeResponse } from './services/calService';
import { updateAccount } from './services/supabaseService';
import { type CalPackageId } from './config/packages';
import { inferMealTypeByTime } from './utils/mealTime';
import { divideByPortion } from './utils/portion';
import {
  signIn, signUp, signOut, getSession, onAuthChange,
  saveMeal, loadHistory, deleteMeal as dbDeleteMeal, clearHistory as dbClearHistory,
  updateMealClassification,
  SupabaseUser, SUPABASE_AVAILABLE,
} from './services/supabaseService';
import BatchAnalyzer from './components/BatchAnalyzer';
import DayMealLog from './components/DayMealLog';
import AnalysisResultCard from './components/AnalysisResultCard';
import AnalysisProgress from './components/AnalysisProgress';
import CalendarView from './components/CalendarView';
import DailyScoreModal from './components/DailyScoreModal';
import RecommendationCards from './components/RecommendationCards';
import DateNavBar from './components/DateNavBar';
import CameraFab from './components/CameraFab';
import BottomTabBar from './components/BottomTabBar';
import HomeSwipeArea from './components/HomeSwipeArea';
import CalBalance from './components/cal/CalBalance';
import CalLimitModal from './components/cal/CalLimitModal';
import CalChargeModal from './components/cal/CalChargeModal';
import AccountModal from './components/cal/AccountModal';
import MealCardMenu from './components/meal/MealCardMenu';
import MealEditModal from './components/meal/MealEditModal';
import MealPreviewModal from './components/meal/MealPreviewModal';
import AnalyzeModeTabs from './components/analyze/AnalyzeModeTabs';
import ExerciseRecommendCard from './components/recommend/ExerciseRecommendCard';
import SnackRecommendCard from './components/recommend/SnackRecommendCard';
import { recommendExercise } from './utils/exerciseRecommend';
import { recommendSnack } from './utils/snackRecommend';
import { calcDailyScore } from './services/scoreService';
import { normalizeForAnalysis } from './utils/analysisImage';
import type { AnalysisStep } from './components/AnalysisProgress.types';
import type { BatchAnalysisCompletion } from './components/BatchAnalyzer';
import type { MealRecord, DailyScore } from './types';

type Gender = 'male' | 'female';
type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'active';

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
  { value: 'dessert',   emoji: '🍰', label: '후식' },
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

function localDateKey(input: string | Date): string {
  const d = input instanceof Date ? input : new Date(input);
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
}

function shiftDateKey(baseKey: string, offsetDays: number): string {
  const base = new Date(`${baseKey}T12:00:00`);
  base.setDate(base.getDate() + offsetDays);
  return localDateKey(base);
}

function dateLabel(dateKey: string): string {
  const todayKey = localDateKey(new Date());
  const yesterdayKey = shiftDateKey(todayKey, -1);
  const twoDaysAgoKey = shiftDateKey(todayKey, -2);
  if (dateKey === todayKey) return '오늘';
  if (dateKey === yesterdayKey) return '어제';
  if (dateKey === twoDaysAgoKey) return '그제';
  return new Date(`${dateKey}T12:00:00`).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
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
  // T-067 (2): 분석 모드 UI 숨김 + 'detailed' 고정 (분석 결과 풍부함 우선).
  const [analysisMode] = useState<AnalysisMode>('detailed');
  const [mealType, setMealType] = useState<MealType>(() => inferMealTypeByTime());
  const [portionCount, setPortionCount] = useState<number>(1);
  const [provider, setProvider] = useState<AIProvider>('groq');
  const [health, setHealth] = useState<ProviderHealth>({ gemini: false, claude: false, groq: false });
  const [error, setError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  // --- Loading state ---
  const [loadingStep, setLoadingStep] = useState(0);
  const [currentAnalyzingIdx, setCurrentAnalyzingIdx] = useState(-1);
  const [currentAnalyzingImageUrl, setCurrentAnalyzingImageUrl] = useState<string | undefined>();
  const [stepDetails, setStepDetails] = useState<Record<number, string>>({});

  // --- History & UI ---
  const [history, setHistory] = useState<MealRecord[]>([]);
  const [selectedMeal, setSelectedMeal] = useState<MealRecord | null>(null);
  const [activeTab, setActiveTab] = useState<'history' | 'stats'>('history');

  // --- Navigation ---
  const [mainTab, setMainTab] = useState<'home' | 'analyze' | 'history' | 'stats'>('home');
  const [expandedDates, setExpandedDates] = useState<Set<string>>(new Set());
  const [selectedDateKey, setSelectedDateKey] = useState(() => localDateKey(new Date()));
  const [showScoreModal, setShowScoreModal] = useState(false);
  const [showCalendarModal, setShowCalendarModal] = useState(false);
  const [batchLoading, setBatchLoading] = useState(false);
  const [me, setMe] = useState<MeResponse | null>(null);
  const [showLimitModal, setShowLimitModal] = useState(false);
  const [showChargeModal, setShowChargeModal] = useState(false);
  const [editingMeal, setEditingMeal] = useState<MealRecord | null>(null);
  const [previewingMeal, setPreviewingMeal] = useState<MealRecord | null>(null);
  const [analyzeMode, setAnalyzeMode] = useState<'single' | 'batch'>('single');
  const [showAccountModal, setShowAccountModal] = useState(false);

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
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cameraAutoAnalyzeRef = useRef(false);

  // --- Computed ---
  const dailyCalorieTarget = useMemo(
    () => calcDailyTarget(gender, weight, height, age, activityLevel),
    [gender, weight, height, age, activityLevel],
  );

  // 서버 SSE 가 emit 하는 step index 와 1:1 대응 (analyze.ts 참조)
  const loadingStepsData: AnalysisStep[] = useMemo(() => analysisMode === 'quick' ? [
    { label: 'API 연결',     description: 'AI 서버 연결 중' },
    { label: '식재료 식별',  description: '음식 및 재료 감지' },
    { label: '수치 계산',    description: '칼로리 · 영양소 산출' },
  ] : [
    { label: 'API 연결',     description: 'AI 서버 연결 중' },
    { label: '식재료 식별',  description: '음식 및 재료 감지' },
    { label: '양 추정',      description: '용기 기준 무게 추정' },
    { label: '영양소 계측',  description: `${age}세 ${gender === 'male' ? '남성' : '여성'} 기준 분석` },
    { label: '신뢰도 평가',  description: '결과 정합성 검증' },
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

  // 세션 복원 + 인증 상태 구독
  useEffect(() => {
    getSession().then(u => setUser(u));
    const unsub = onAuthChange(u => setUser(u));
    return unsub;
  }, []);

  // 사용자 정보(me: role, cal_balance, daily_usage) 동기화
  useEffect(() => {
    if (!user?.id) { setMe(null); return; }
    void fetchMe().then(m => setMe(m));
  }, [user?.id]);

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
        setHistory(records);
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
    if (imageFiles.length === 0) { showToast('이미지 파일만 업로드 가능합니다.', 'error'); return []; }
    const newImages = imageFiles.map(file => ({ id: crypto.randomUUID(), url: URL.createObjectURL(file), file }));
    setImages(prev => [...prev, ...newImages]);
    setError(null);
    return newImages;
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
    const newImages = addFiles(Array.from(e.target.files || []));
    e.target.value = '';
    if (cameraAutoAnalyzeRef.current) {
      cameraAutoAnalyzeRef.current = false;
      if (newImages.length > 0) {
        void startAnalysis(newImages);
      }
    }
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

  const openCameraForAnalysis = () => {
    cameraAutoAnalyzeRef.current = true;
    setSelectedMeal(null);
    setMainTab('analyze');
    setMealType(inferMealTypeByTime()); // 카메라 진입 시점의 시간으로 자동 추천 (사용자 수동 변경 가능)
    cameraInputRef.current?.click();
  };

  const startAnalysis = async (sourceImages = images) => {
    if (sourceImages.length === 0) { setError('분석할 음식 사진을 하나 이상 업로드해주세요.'); return; }
    setMainTab('analyze');
    setSelectedMeal(null);
    setLoading(true);
    setError(null);
    setLoadingStep(0);
    setStepDetails({});
    setCurrentAnalyzingIdx(0);

    try {
      const results: MealRecord[] = [];
      for (let i = 0; i < sourceImages.length; i++) {
        const img = sourceImages[i];
        setCurrentAnalyzingIdx(i);
        setCurrentAnalyzingImageUrl(img.url);
        setLoadingStep(0);
        setStepDetails({});

        setStepDetails({ 0: '분석용 이미지 크기 통일 중…' });
        const normalized = await normalizeForAnalysis(img.file);
        setCurrentAnalyzingImageUrl(normalized.dataUrl);

        const today = new Date().toDateString();
        const inHistory = history.filter(h => new Date(h.date).toDateString() === today).length;
        const inBatch = results.filter(r => new Date(r.date).toDateString() === today).length;

        const onEvent = (event: StreamEvent) => {
          if (event.type === 'step') {
            setLoadingStep(event.index);
            setStepDetails(prev => ({ ...prev, [event.index]: event.detail }));
          } else if (event.type === 'provider-fallback') {
            // T-058: provider 이름을 사용자에게 노출하지 않음 (Grok 고정 UI).
            // 서버 로그에는 PROVIDER_LABELS[event.from] (${event.reason})로 남길 수 있도록 console만.
            console.info('[analyze] provider fallback:', PROVIDER_LABELS[event.from], event.reason);
            showToast('분석을 다시 시도하는 중…', 'error');
            setLoadingStep(0);
            setStepDetails({});
          }
        };

        // 폴백은 서버(/api/analyze)에서 처리됨 — 클라이언트는 한 번만 호출
        const analysis = await analyzeFood(
          normalized.dataUrl,
          age,
          gender,
          inHistory + inBatch,
          analysisMode,
          provider,
          onEvent,
          normalized.width,
          normalized.height,
        );
        // T-058: analysis.provider 변경 사실은 사용자에게 노출하지 않음.
        // T-068: N인분이면 영양/양 필드를 1인분 기준으로 환산해서 DB에 저장. portion_count는 원본 N 보존.
        const perPortion = divideByPortion(analysis, portionCount);
        // T-072: dbMatch가 있으면 matched_food_id/similarity를 record에 첨부 → supabase 영속.
        results.push({
          ...perPortion,
          id: img.id,
          image: normalized.dataUrl,
          imageWidth: analysis.imageWidth ?? normalized.width,
          imageHeight: analysis.imageHeight ?? normalized.height,
          mealType,
          portionCount,
          matchedFoodId: analysis.dbMatch?.food_id ?? null,
          matchSimilarity: analysis.dbMatch?.similarity ?? null,
        });
      }

      setHistory(prev => [...results, ...prev]);
      if (user) {
        const failed: string[] = [];
        for (const r of results) {
          const { error } = await saveMeal(r, user.id);
          if (error) failed.push(error);
        }
        if (failed.length > 0) {
          console.error('saveMeal 실패:', failed);
          showToast(`기록 저장 실패 (${failed.length}건) — 새로고침 시 사라질 수 있습니다`);
        }
      }
      setImages(prev => {
        const usedIds = new Set(sourceImages.map(img => img.id));
        prev.forEach(img => {
          if (usedIds.has(img.id)) URL.revokeObjectURL(img.url);
        });
        return prev.filter(img => !usedIds.has(img.id));
      });
      setSelectedMeal(results[0]);
      setSelectedDateKey(localDateKey(results[0].date));
      showToast(`${results.length}개 분석 완료!`);
      // 차감/리셋 결과 me에 반영 (결과의 quota는 SSE done 이벤트에 포함되어 있으나
      // 현재 분석 결과 객체에는 전파되지 않음 — me 재조회로 동기화).
      void fetchMe().then(m => { if (m) setMe(m); });
    } catch (err) {
      if (err instanceof InsufficientCalError) {
        setMe(prev => prev ? {
          ...prev,
          cal_balance: err.quota.cal_balance ?? prev.cal_balance,
          daily_usage_count: err.quota.daily_usage_count ?? prev.daily_usage_count,
          daily_usage_reset_at: err.quota.daily_usage_reset_at ?? prev.daily_usage_reset_at,
        } : prev);
        setShowLimitModal(true);
      } else {
        setError(err instanceof Error ? err.message : '분석 중 오류가 발생했습니다.');
      }
    } finally {
      setLoading(false);
      setLoadingStep(0);
      setStepDetails({});
      setCurrentAnalyzingIdx(-1);
      setCurrentAnalyzingImageUrl(undefined);
    }
  };

  const deleteRecordById = async (id: string) => {
    if (user) await dbDeleteMeal(id);
    setHistory(prev => prev.filter(m => m.id !== id));
    if (selectedMeal?.id === id) setSelectedMeal(null);
    showToast('기록이 삭제되었습니다.');
  };

  // T-055 식사 편집: mealType + date만 (음식명/칼로리는 후속 티켓).
  // Optimistic update → 실패 시 서버 상태 재조회로 롤백.
  const handleEditMeal = async (
    mealId: string,
    patch: { mealType?: MealType; date?: string },
  ) => {
    setHistory(prev => prev.map(m =>
      m.id === mealId ? { ...m, ...patch } : m,
    ));
    if (selectedMeal?.id === mealId) {
      setSelectedMeal(prev => prev ? { ...prev, ...patch } : prev);
    }

    if (user) {
      const { error } = await updateMealClassification(mealId, patch);
      if (error) {
        const fresh = await loadHistory(user.id);
        setHistory(fresh);
        showToast(`저장에 실패했어요. ${error}`, 'error');
        return;
      }
    }

    // 날짜 이동 시 변경된 식사가 보이는 날짜로 자동 이동 (수아 §회귀 3)
    if (patch.date) setSelectedDateKey(localDateKey(patch.date));
    showToast('식사 정보가 업데이트됐어요 ✨');
  };

  const deleteRecord = (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    showConfirm('이 기록을 삭제하시겠습니까?', () => {
      void deleteRecordById(id);
    });
  };

  const clearDayRecords = (targetDate: string) => {
    showConfirm(`${targetDate} 식단을 모두 삭제할까요?`, async () => {
      const ids = history.filter(m => localDateKey(m.date) === targetDate).map(m => m.id);
      if (user) {
        for (const id of ids) await dbDeleteMeal(id);
      }
      setHistory(prev => prev.filter(m => localDateKey(m.date) !== targetDate));
      if (selectedMeal && localDateKey(selectedMeal.date) === targetDate) setSelectedMeal(null);
      showToast('해당 날짜 기록이 삭제되었습니다.');
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

  const selectedDateMeals = useMemo(() =>
    history.filter(h => localDateKey(h.date) === selectedDateKey),
    [history, selectedDateKey],
  );

  const selectedDateCalories = useMemo(() =>
    selectedDateMeals.reduce((sum, m) => sum + (m.calories || 0), 0),
    [selectedDateMeals],
  );

  const todayKey = useMemo(() => localDateKey(new Date()), []);

  const mealCountByDate = useMemo(() => {
    const acc: Record<string, number> = {};
    history.forEach(h => {
      const key = localDateKey(h.date);
      acc[key] = (acc[key] ?? 0) + 1;
    });
    return acc;
  }, [history]);

  const todayScore = useMemo<DailyScore>(() => ({
    ...calcDailyScore(todayMeals, dailyCalorieTarget),
    aiComment: '',
  }), [todayMeals, dailyCalorieTarget]);

  // 운동/간식 추천 (선택된 날짜 기준, 정적 룰 — cal 차감 X)
  const exerciseRecs = useMemo(() => {
    const excess = selectedDateCalories - dailyCalorieTarget;
    return recommendExercise(excess);
  }, [selectedDateCalories, dailyCalorieTarget]);

  const snackRec = useMemo(() => recommendSnack({
    todayKcalConsumed: selectedDateCalories,
    dailyKcalTarget: dailyCalorieTarget,
    todayMeals: selectedDateMeals,
  }), [selectedDateCalories, dailyCalorieTarget, selectedDateMeals]);

  const excessKcal = selectedDateCalories - dailyCalorieTarget;

  const isAnalyzing = loading || batchLoading;
  const fabHidden = isAnalyzing || (mainTab === 'analyze' && !!selectedMeal);

  const maxWeeklyCalories = Math.max(...weeklyStats.map(d => d.calories), dailyCalorieTarget, 1);

  return (
    <div className="min-h-screen bg-[#f7f3ed] text-slate-900 font-sans overflow-x-hidden pb-28 selection:bg-orange-100">

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
      <header className="sticky top-0 z-40 bg-white border-b-[3px] border-slate-900 px-3 py-2.5 flex justify-between items-center gap-2 shadow-[0_4px_0_0_rgba(15,23,42,1)]">
        {/* T-061: 로고 축소 — 모바일 360px에서 한 줄 보장 */}
        <div className="flex items-center gap-1.5 shrink-0">
          <div className="w-6 h-6 bg-orange-500 rounded-md flex items-center justify-center shadow-md -rotate-12">
            <Utensils className="text-white w-3.5 h-3.5" />
          </div>
          <span className="font-black text-sm tracking-tighter">fat<span className="text-orange-500">guard</span></span>
        </div>
        <div className="flex items-center gap-1.5 min-w-0">
          {me && (
            <CalBalance
              calBalance={me.cal_balance}
              role={me.role}
              onClick={() => setShowChargeModal(true)}
            />
          )}
          {/* T-061: '오늘 칼로리' 표시는 모바일에서 숨김 (헤더 wrap 방지). 정보는 홈 진행률에서 확인. */}
          <div className="text-right hidden sm:block">
            <p className="text-[9px] font-black text-slate-400 uppercase leading-none">오늘</p>
            <p className="text-xs font-black leading-tight">{todayCalories.toLocaleString()}<span className="opacity-40 text-[10px]">/{dailyCalorieTarget.toLocaleString()}</span></p>
          </div>
          {SUPABASE_AVAILABLE && (
            user ? (
              <button
                onClick={() => setShowAccountModal(true)}
                className="min-h-11 px-2.5 py-1 max-w-[120px] truncate text-xs font-black text-slate-700 bg-slate-50 ring-1 ring-slate-200 rounded-full active:scale-95 transition-transform"
                aria-label={`계정: ${user.email}`}
                title={user.email}
              >
                {user.email?.split('@')[0] ?? '계정'}
              </button>
            ) : (
              <button onClick={() => { setShowAuthModal(true); setAuthMode('login'); setAuthError(null); }}
                className="px-2 py-1 text-[9px] font-black uppercase border-[2px] border-slate-900 bg-orange-500 text-white shadow-[2px_2px_0_0_rgba(15,23,42,1)]"
              >로그인</button>
            )
          )}
          {/* T-065: profile popover 통째 제거 — AccountModal에 통합. */}
        </div>
      </header>

      {/* ── 탭 콘텐츠 ── */}
      <main className="pb-[80px]">
        <AnimatePresence mode="wait">

          {/* ════ 홈 탭 ════ */}
          {mainTab === 'home' && (
            <motion.div key="home" initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 16 }} transition={{ duration: 0.2 }}>

              <DateNavBar
                selectedDateKey={selectedDateKey}
                onChange={setSelectedDateKey}
                todayKey={todayKey}
                mealCountByDate={mealCountByDate}
                onCalendarTap={() => setShowCalendarModal(true)}
              />

              <HomeSwipeArea
                onShiftDate={(offset) => setSelectedDateKey(prev => shiftDateKey(prev, offset))}
                canShiftNext={selectedDateKey < todayKey}
                onBlockedNext={() => showToast('오늘이 마지막이에요', 'success')}
              >
              <div className="p-4 space-y-4">

              <section className="bg-white rounded-[28px] border border-orange-100 shadow-sm overflow-hidden">
                <div className="px-5 pt-5 pb-4 bg-gradient-to-br from-orange-50 to-white">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-xs font-black text-orange-500">내 식단 동네</p>
                      <h1 className="mt-1 text-2xl font-black tracking-tight">{dateLabel(selectedDateKey)} 식단</h1>
                      <p className="mt-1 text-xs font-bold text-slate-400">
                        {new Date(`${selectedDateKey}T12:00:00`).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' })}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-[10px] font-black text-slate-400">섭취량</p>
                      <p className="text-xl font-black text-slate-900">{selectedDateCalories.toLocaleString()}</p>
                      <p className="text-[10px] font-bold text-slate-400">/ {dailyCalorieTarget.toLocaleString()} kcal</p>
                    </div>
                  </div>
                </div>

                <div className="px-5 py-4">
                  <div className="h-2.5 bg-orange-50 rounded-full overflow-hidden">
                    <motion.div
                      animate={{ width: `${Math.min(100, selectedDateCalories > 0 ? (selectedDateCalories / dailyCalorieTarget) * 100 : 0)}%` }}
                      transition={{ duration: 0.8, ease: 'easeOut' }}
                      className={`h-full rounded-full bg-gradient-to-r from-emerald-400 via-orange-400 to-rose-400`}
                      style={{ filter: selectedDateCalories === 0 ? 'grayscale(1)' : undefined }}
                    />
                  </div>
                  <p className="mt-2 text-[10px] font-bold text-slate-400">
                    목표 대비 {Math.round((selectedDateCalories / dailyCalorieTarget) * 100)}% · 총 {selectedDateMeals.length}끼 기록
                  </p>

                  {selectedDateKey === todayKey && todayMeals.length > 0 && (
                    <button
                      onClick={() => setShowScoreModal(true)}
                      className="mt-3 w-full py-2.5 rounded-2xl bg-orange-500 text-white text-xs font-black shadow-[0_6px_14px_rgba(249,115,22,0.28)] active:scale-[0.98] transition-transform"
                      aria-label="오늘의 식단 점수 보기"
                    >
                      오늘의 점수 보기 ({todayScore.totalScore}점 · {todayScore.grade})
                    </button>
                  )}
                </div>
              </section>

              {/* T-060 (2): 순서 변경 — 진행률 → 먹은 식단 → 7일 흐름 → 추천 */}

              <section className="space-y-3">
                <div className="flex items-center justify-between px-1">
                  <h2 className="text-sm font-black text-slate-900">{dateLabel(selectedDateKey)} 먹은 식단</h2>
                  {selectedDateMeals.length > 0 && (
                    <button onClick={() => setMainTab('history')} className="text-xs font-black text-orange-500">전체 기록</button>
                  )}
                </div>

                {selectedDateMeals.length === 0 ? (
                  <div className="bg-white rounded-[24px] border border-orange-100 p-8 text-center">
                    <div className="w-14 h-14 mx-auto rounded-full bg-orange-50 flex items-center justify-center text-orange-500">
                      <Camera className="w-6 h-6" />
                    </div>
                    <p className="mt-4 text-sm font-black text-slate-800">이 날짜에는 아직 식단이 없어요</p>
                    <p className="mt-1 text-xs font-bold text-slate-400">오른쪽 아래 + 버튼으로 바로 촬영해보세요.</p>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {selectedDateMeals.map(meal => (
                      <div
                        key={meal.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => setPreviewingMeal(meal)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            setPreviewingMeal(meal);
                          }
                        }}
                        className="w-full bg-white rounded-[22px] border border-orange-100 p-3 flex items-center gap-3 text-left shadow-sm active:scale-[0.99] transition-transform cursor-pointer"
                      >
                        <img src={meal.image} className="w-16 h-16 rounded-2xl object-cover bg-orange-50 shrink-0" alt="" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-black truncate">{MEAL_TYPES.find(t=>t.value===meal.mealType)?.emoji} {meal.foodName}</p>
                          <p className="mt-1 text-xs font-bold text-slate-400">
                            {new Date(meal.date).toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit'})} · {meal.calories.toLocaleString()} kcal
                          </p>
                          <div className="mt-2 flex gap-1.5">
                            <span className="rounded-full bg-orange-50 px-2 py-0.5 text-[10px] font-black text-orange-600">{meal.mode === 'quick' ? '퀵 분석' : '상세 분석'}</span>
                            {meal.category && <span className="rounded-full bg-slate-50 px-2 py-0.5 text-[10px] font-black text-slate-500">{meal.category}</span>}
                            {meal.matchedFoodId && (
                              <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-black text-emerald-700" title="DB 매칭됨">📚</span>
                            )}
                          </div>
                        </div>
                        <MealCardMenu
                          onEdit={() => setEditingMeal(meal)}
                          onDelete={() => deleteRecord(meal.id)}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <section className="bg-white rounded-[24px] border border-orange-100 p-4">
                <div className="flex justify-between items-center mb-4">
                  <p className="text-xs font-black text-slate-500">최근 7일 흐름</p>
                  <button onClick={() => setMainTab('stats')} className="text-xs font-black text-orange-500">통계 보기</button>
                </div>
                <div className="flex items-end gap-1.5" style={{ height: '60px' }}>
                  {weeklyStats.map((day, i) => {
                    const barH = day.calories > 0 ? Math.max(8, (day.calories / maxWeeklyCalories) * 100) : 4;
                    return (
                      <div key={i} className="flex-1 flex flex-col items-center justify-end gap-1 h-full">
                        <div className="w-full flex items-end rounded-full overflow-hidden bg-orange-50" style={{ height: 'calc(100% - 16px)' }}>
                          <motion.div
                            initial={{ height: 0 }}
                            animate={{ height: `${barH}%` }}
                            transition={{ duration: 0.5, delay: i * 0.04 }}
                            className={`w-full rounded-t-full ${day.isToday ? 'bg-orange-500' : day.calories > dailyCalorieTarget ? 'bg-rose-400' : 'bg-emerald-400'}`}
                          />
                        </div>
                        <span className={`text-[9px] font-black ${day.isToday ? 'text-orange-500' : 'text-slate-400'}`}>{day.label}</span>
                      </div>
                    );
                  })}
                </div>
              </section>

              {/* 운동 추천 — T-057 (2): 초과면 강도별 3개, 정상/부족이어도 일상 활동 1~2개 */}
              {exerciseRecs.length > 0 && (
                <ExerciseRecommendCard excessKcal={excessKcal} exercises={exerciseRecs} />
              )}
              {/* 간식 추천 — 칼로리 여유 + 영양 부족 시. 운동과 동시 노출 허용 */}
              {excessKcal <= 0 && snackRec.snacks.length > 0 && (
                <SnackRecommendCard snacks={snackRec.snacks} missing={snackRec.missing} />
              )}
              </div>
              </HomeSwipeArea>
            </motion.div>
          )}

          {/* ════ 분석 탭 ════ */}
          {mainTab === 'analyze' && (
            <motion.div key="analyze" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} className="p-4">
              {/* sub-탭 — selectedMeal 표시 중에는 의미 없으므로 숨김, 분석 진행 중에는 잠금 */}
              {!selectedMeal && (
                <AnalyzeModeTabs
                  mode={analyzeMode}
                  onChange={setAnalyzeMode}
                  locked={loading || batchLoading}
                />
              )}
              <AnimatePresence mode="wait">
                {loading ? (
                  <motion.div key="loading" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }}>
                    <AnalysisProgress
                      steps={loadingStepsData}
                      currentIndex={loadingStep}
                      detailByIndex={stepDetails}
                      etaSeconds={analysisMode === 'quick' ? 8 : 20}
                      modeLabel={analysisMode === 'quick' ? '⚡ 퀵 분석' : '📋 상세 분석'}
                      imageUrl={currentAnalyzingIdx >= 0 ? currentAnalyzingImageUrl : undefined}
                    />
                  </motion.div>

                ) : selectedMeal ? (
                  <motion.div key={selectedMeal.id} initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}>
                    <div className="flex justify-end mb-2">
                      <button
                        type="button"
                        onClick={() => setEditingMeal(selectedMeal)}
                        className="min-h-11 px-3 rounded-full bg-white border border-orange-100 text-xs font-black text-orange-600 active:scale-95 transition-transform inline-flex items-center gap-1"
                        aria-label="식사 정보 편집"
                      >
                        <span aria-hidden="true">✏️</span> 편집
                      </button>
                    </div>
                    <AnalysisResultCard
                      meal={selectedMeal}
                      dailyCalorieTarget={dailyCalorieTarget}
                      dailyCalorieConsumed={getDailyStats(selectedMeal.date).calories}
                      onBack={() => setSelectedMeal(null)}
                    />
                    {selectedMeal.recommendations && (
                      <RecommendationCards recommendations={selectedMeal.recommendations} />
                    )}
                  </motion.div>

                ) : analyzeMode === 'batch' ? (
                  <motion.div key="batch" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                    <BatchAnalyzer
                      age={age}
                      gender={gender}
                      provider={provider}
                      mealType={mealType}
                      onLoadingChange={setBatchLoading}
                      onComplete={(items: BatchAnalysisCompletion[]) => {
                        const records: MealRecord[] = items.map(({ result, image }) => {
                          // T-068: 배치도 동일 환산. 배치 N장이 모두 같은 portionCount 적용 (사용자 선택).
                          const perPortion = divideByPortion(result, portionCount);
                          return {
                            ...perPortion,
                            id: `batch-${Date.now()}-${Math.random().toString(36).slice(2,6)}`,
                            image,
                            mealType,
                            portionCount,
                            matchedFoodId: result.dbMatch?.food_id ?? null,
                            matchSimilarity: result.dbMatch?.similarity ?? null,
                          };
                        });
                        setHistory(prev => [...records, ...prev]);
                        if (user) {
                          void Promise.all(records.map(r => saveMeal(r, user.id))).then(rs => {
                            const failed = rs.filter(r => r.error);
                            if (failed.length > 0) {
                              console.error('saveMeal 실패:', failed.map(f => f.error));
                              showToast(`기록 저장 실패 (${failed.length}건) — 새로고침 시 사라질 수 있습니다`);
                            }
                          });
                        }
                        if (records[0]) setSelectedMeal(records[0]);
                        showToast(`${records.length}개 일괄 분석 완료!`);
                      }}
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
                      </div>

                      {/* 카메라 버튼 */}
                      <button onClick={() => { cameraAutoAnalyzeRef.current = false; cameraInputRef.current?.click(); }}
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
                        <div className="grid grid-cols-5 border-[3px] border-slate-900 shadow-[3px_3px_0_0_rgba(15,23,42,1)] overflow-hidden">
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

                      {/* 인분 — T-067 (3): 1~4+ 셀렉터. 분석 결과 자체 환산 X (메타데이터만 저장) */}
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black uppercase text-slate-500">몇 인분?</label>
                        <div className="grid grid-cols-4 border-[3px] border-slate-900 shadow-[3px_3px_0_0_rgba(15,23,42,1)] overflow-hidden">
                          {([1, 2, 3, 4] as const).map((n, i) => (
                            <button key={n} type="button" onClick={() => setPortionCount(n)}
                              className={`py-2.5 flex flex-col items-center transition-colors ${i > 0 ? 'border-l-[2px] border-slate-900' : ''} ${portionCount === n ? 'bg-slate-900 text-white' : 'bg-white text-slate-700'}`}
                            >
                              <span className="text-sm font-black">{n === 4 ? '4+' : n}</span>
                              <span className={`text-[8px] font-black uppercase ${portionCount === n ? 'text-orange-300' : 'text-slate-400'}`}>인분</span>
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* T-067 (1)(2): AI 엔진 + 분석 모드 UI 숨김. provider='groq' / analysisMode='detailed' 고정.
                          타입/호출 분기는 보존 (재활성화 시 본 블록만 복원). */}

                      {/* 에러 */}
                      {error && (
                        <div className="bg-rose-50 border-[3px] border-rose-500 shadow-[3px_3px_0_0_rgba(239,68,68,1)] p-4 flex items-start gap-3">
                          <span className="text-rose-500 text-lg shrink-0">⚠</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-rose-700 text-xs font-bold leading-relaxed break-all">{error}</p>
                            <button onClick={() => void startAnalysis()} className="mt-2 flex items-center gap-1.5 text-[10px] font-black uppercase text-rose-600">
                              <RotateCcw className="w-3 h-3" /> 다시 시도
                            </button>
                          </div>
                        </div>
                      )}

                      {/* 분석 버튼 */}
                      <button onClick={() => void startAnalysis()} disabled={loading || images.length === 0}
                        className={`w-full py-5 text-base font-black uppercase border-[3px] border-slate-900 transition-all ${loading || images.length === 0 ? 'bg-slate-100 text-slate-400 cursor-not-allowed shadow-none border-slate-300' : 'bg-orange-500 text-white shadow-[8px_8px_0_0_rgba(15,23,42,1)] active:shadow-none active:translate-x-2 active:translate-y-2'}`}
                      >
                        {loading ? (
                          <span className="flex items-center justify-center gap-2"><RefreshCw className="w-4 h-4 animate-spin" /> 분석 중...</span>
                        ) : 'AI 분석 시작'}
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
            >
              <CalendarView
                history={history}
                dailyTarget={dailyCalorieTarget}
                onMealClick={(meal) => setPreviewingMeal(meal)}
              />

              {/* 오늘 식단 요약 */}
              <DayMealLog
                records={history}
                dailyCalorieTarget={dailyCalorieTarget}
                onDeleteMeal={id => deleteRecord(id)}
                onClearDay={clearDayRecords}
                onSelect={(meal) => setPreviewingMeal(meal)}
                onEdit={(meal) => setEditingMeal(meal)}
              />

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
                              const mealEmoji = MEAL_TYPES.find(t => t.value === meal.mealType)?.emoji ?? '🍽️';
                              return (
                                <div
                                  key={meal.id}
                                  role="button"
                                  tabIndex={0}
                                  onClick={(e) => { e.stopPropagation(); setPreviewingMeal(meal); }}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                      e.preventDefault();
                                      setPreviewingMeal(meal);
                                    }
                                  }}
                                  className="flex items-center border-b-[1px] border-slate-100 last:border-0 bg-white active:bg-orange-50/50 cursor-pointer"
                                >
                                  <div className="flex-1 flex items-center gap-3 px-4 py-3 min-w-0">
                                    <img src={meal.image} className="w-12 h-12 object-cover shrink-0 border-2 border-slate-200" alt="" />
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-1 flex-wrap">
                                        <span className="text-sm">{mealEmoji}</span>
                                        <p className="text-sm font-black truncate max-w-[160px]">{meal.foodName}</p>
                                        <span className={`text-[8px] font-black px-1 border ${meal.mode === 'quick' ? 'border-amber-400 text-amber-600' : 'border-sky-400 text-sky-600'}`}>{meal.mode === 'quick' ? '⚡' : '📋'}</span>
                                        {meal.matchedFoodId && (
                                          <span className="text-[10px] bg-emerald-50 text-emerald-700 px-1 rounded-full font-black" title="DB 매칭됨" aria-label="DB 매칭됨">📚</span>
                                        )}
                                      </div>
                                      <p className="text-[10px] text-slate-400 font-bold mt-0.5">
                                        {new Date(meal.date).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })} · {meal.calories} kcal{meal.protein > 0 ? ` · 단백질 ${meal.protein}g` : ''}
                                      </p>
                                    </div>
                                  </div>
                                  <div className="pr-2">
                                    <MealCardMenu
                                      onEdit={() => setEditingMeal(meal)}
                                      onDelete={() => deleteRecord(meal.id)}
                                    />
                                  </div>
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

      <input
        type="file"
        ref={cameraInputRef}
        onChange={handleImageUpload}
        className="hidden"
        accept="image/*"
        capture="environment"
      />

      <CameraFab
        hide={fabHidden}
        onCapture={() => {
          setSelectedDateKey(todayKey);
          openCameraForAnalysis();
        }}
      />

      <BottomTabBar
        activeTab={mainTab}
        onChange={(tab) => setMainTab(tab)}
      />

      <AnimatePresence>
        {showScoreModal && (
          <DailyScoreModal
            score={todayScore}
            onClose={() => setShowScoreModal(false)}
          />
        )}
      </AnimatePresence>

      <CalLimitModal
        open={showLimitModal}
        calBalance={me?.cal_balance ?? 0}
        nextRechargeAt={me?.daily_usage_reset_at ?? null}
        adAvailable={false}
        onWatchAd={() => {}}
        onCharge={() => { setShowLimitModal(false); setShowChargeModal(true); }}
        onClose={() => setShowLimitModal(false)}
      />

      <CalChargeModal
        open={showChargeModal}
        calBalance={me?.cal_balance}
        nextRechargeAt={me?.daily_usage_reset_at ?? null}
        onPay={async (pkgId: CalPackageId) => {
          try {
            const r = await initPayment(pkgId);
            // 실 PG SDK 진입은 T-049 후속. 현재는 init 결과만 토스트.
            showToast(`결제 시작 (order ${r.orderId.slice(0, 8)}) — PG SDK 연동 대기 중`);
            setShowChargeModal(false);
          } catch (e) {
            showToast(e instanceof Error ? e.message : '결제 시작 실패', 'error');
          }
        }}
        onClose={() => setShowChargeModal(false)}
      />

      <MealEditModal
        open={!!editingMeal}
        meal={editingMeal}
        todayKey={todayKey}
        onSave={async (patch) => {
          if (!editingMeal) return;
          await handleEditMeal(editingMeal.id, patch);
        }}
        onClose={() => setEditingMeal(null)}
      />

      <MealPreviewModal
        open={!!previewingMeal}
        meal={previewingMeal}
        dailyCalorieTarget={dailyCalorieTarget}
        dailyCalorieConsumed={previewingMeal ? getDailyStats(previewingMeal.date).calories : 0}
        onClose={() => setPreviewingMeal(null)}
      />

      <AccountModal
        open={showAccountModal}
        me={me}
        profile={{ age, gender, weight, height, activityLevel }}
        dailyKcalTarget={dailyCalorieTarget}
        onSave={async (patch) => {
          // T-065: 통합 저장 — age/gender는 supabase update, weight/height/activityLevel은 localStorage(클라 state).
          if (patch.age !== undefined || patch.gender !== undefined) {
            if (!user) {
              // 비로그인은 supabase 동기화 불가하나, age/gender 자체는 클라 state로 보존.
              if (patch.age !== undefined && patch.age !== null) setAge(patch.age);
              if (patch.gender !== undefined && patch.gender !== null) setGender(patch.gender);
            } else {
              const { error } = await updateAccount(user.id, {
                age: patch.age,
                gender: patch.gender,
              });
              if (error) {
                console.error('[updateAccount] failed:', error);
                showToast(`저장 실패: ${error}`, 'error');
                throw new Error(error);
              }
              setMe(prev => prev ? {
                ...prev,
                age: patch.age !== undefined ? patch.age : prev.age,
                gender: patch.gender !== undefined ? patch.gender : prev.gender,
              } : prev);
              if (patch.age !== undefined && patch.age !== null) setAge(patch.age);
              if (patch.gender !== undefined && patch.gender !== null) setGender(patch.gender);
            }
          }
          // 로컬 profile (localStorage 자동 sync는 useEffect L286)
          if (patch.weight !== undefined) setWeight(patch.weight);
          if (patch.height !== undefined) setHeight(patch.height);
          if (patch.activityLevel !== undefined) setActivityLevel(patch.activityLevel);
          showToast('계정 정보가 업데이트됐어요 ✨');
          return true;
        }}
        onLogout={() => { void handleLogout(); }}
        onClose={() => setShowAccountModal(false)}
      />

      <AnimatePresence>
        {showCalendarModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[110] bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4"
            onClick={() => setShowCalendarModal(false)}
            role="dialog"
            aria-label="캘린더"
          >
            <motion.div
              initial={{ y: 32, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 32, opacity: 0 }}
              className="w-full sm:max-w-md bg-[#f7f3ed] rounded-t-3xl sm:rounded-3xl max-h-[88vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-4 pt-4 pb-2">
                <p className="text-sm font-black text-slate-900">캘린더</p>
                <button
                  onClick={() => setShowCalendarModal(false)}
                  className="text-xs font-black text-slate-500 px-3 py-1 rounded-full bg-white border border-slate-200"
                  aria-label="캘린더 닫기"
                >
                  닫기
                </button>
              </div>
              <CalendarView
                history={history}
                dailyTarget={dailyCalorieTarget}
                onMealClick={(meal) => {
                  setShowCalendarModal(false);
                  setPreviewingMeal(meal);
                }}
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

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
