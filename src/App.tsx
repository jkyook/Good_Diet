/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useRef, ChangeEvent, useEffect } from 'react';
import { Camera, Upload, Utensils, AlertCircle, CheckCircle2, RefreshCw, User, Info, Calendar, Plus, Trash2, History, ChevronRight, Zap, Target } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import { analyzeFood, AnalysisResult } from './services/geminiService';

type Gender = 'male' | 'female';

interface MealRecord extends AnalysisResult {
  id: string;
  image: string;
}

export default function App() {
  const [images, setImages] = useState<{ id: string; url: string; file: File }[]>([]);
  const [age, setAge] = useState<number>(30);
  const [gender, setGender] = useState<Gender>('male');
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<MealRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selectedMeal, setSelectedMeal] = useState<MealRecord | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load history from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('mealwise_history');
    if (saved) {
      try {
        setHistory(JSON.parse(saved));
      } catch (e) {
        console.error("Failed to load history", e);
      }
    }
  }, []);

  // Save history to localStorage
  useEffect(() => {
    localStorage.setItem('mealwise_history', JSON.stringify(history));
  }, [history]);

  const handleImageUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      const newImages = files.map(file => ({
        id: Math.random().toString(36).substr(2, 9),
        url: URL.createObjectURL(file),
        file: file
      }));
      setImages(prev => [...prev, ...newImages]);
      setError(null);
    }
  };

  const removeImage = (id: string) => {
    setImages(prev => prev.filter(img => img.id !== id));
  };

  const [loadingStep, setLoadingStep] = useState(0);
  const loadingSteps = [
    "이미지 스캔 중...",
    "식재료 식별 중...",
    "영양소 함량 계측 중...",
    "나이/성별 맞춤 분석 중...",
    "운동 및 페어링 추천 생성 중...",
    "최종 리포트 구성 중..."
  ];

  const startAnalysis = async () => {
    if (images.length === 0) {
      setError('분석할 음식 사진을 하나 이상 업로드해주세요.');
      return;
    }

    setLoading(true);
    setError(null);
    setLoadingStep(0);
    
    try {
      const results: MealRecord[] = [];
      for (const [index, img] of images.entries()) {
        // Simple step progression for UI feel
        const stepInterval = setInterval(() => {
          setLoadingStep(prev => (prev < loadingSteps.length - 1 ? prev + 1 : prev));
        }, 1500);

        const reader = new FileReader();
        const base64Promise = new Promise<string>((resolve) => {
          reader.onloadend = () => resolve(reader.result as string);
          reader.readAsDataURL(img.file);
        });
        const base64 = await base64Promise;
        
        const mealDate = new Date(img.file.lastModified).toISOString();
        const existingCount = history.filter(h => new Date(h.date).toDateString() === new Date(mealDate).toDateString()).length;
        
        const analysis = await analyzeFood(base64, age, gender, existingCount);
        
        const record: MealRecord = {
          ...analysis,
          id: img.id,
          image: base64,
          date: mealDate 
        };
        results.push(record);
        clearInterval(stepInterval);
      }
      
      setHistory(prev => [...results, ...prev]);
      setImages([]);
      setSelectedMeal(results[0]);
    } catch (err) {
      setError(err instanceof Error ? err.message : '분석 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
      setLoadingStep(0);
    }
  };

  const getDailyStats = (date: string) => {
    const dailyMeals = history.filter(h => new Date(h.date).toDateString() === new Date(date).toDateString());
    const totalCalories = dailyMeals.reduce((sum, m) => sum + (m.calories || 0), 0);
    return { count: dailyMeals.length, calories: totalCalories };
  };

  // Group history by date
  const groupedHistory = history.reduce((groups: { [key: string]: MealRecord[] }, meal) => {
    const date = new Date(meal.date).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' });
    if (!groups[date]) groups[date] = [];
    groups[date].push(meal);
    return groups;
  }, {});

  const deleteRecord = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('이 기록을 삭제하시겠습니까?')) {
      setHistory(prev => prev.filter(m => m.id !== id));
      if (selectedMeal?.id === id) setSelectedMeal(null);
    }
  };

  const clearHistory = () => {
    if (confirm('모든 기록을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.')) {
      setHistory([]);
      setSelectedMeal(null);
      localStorage.removeItem('mealwise_history');
    }
  };

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-900 font-sans p-4 md:p-8 overflow-x-hidden selection:bg-orange-100">
      {/* Header */}
      <header className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-start md:items-end mb-8 gap-4 relative z-10">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 bg-orange-500 rounded-lg flex items-center justify-center shadow-lg transform -rotate-12">
              <Utensils className="text-white w-5 h-5" />
            </div>
            <span className="text-[10px] font-black uppercase text-orange-500 tracking-[0.2em]">Live Analysis</span>
          </div>
          <h1 className="text-5xl font-black tracking-tighter text-slate-900 uppercase leading-none">
            Flavor<span className="text-orange-500">Guard</span> <span className="opacity-20 text-slate-400">AI</span>
          </h1>
          <p className="text-slate-500 text-sm font-medium mt-1">Smart Nutritional Analysis & Smart Activity Guide</p>
        </div>
        <div className="flex gap-6 items-center">
          <div className="text-right hidden sm:block">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Target Profile</p>
            <p className="font-black text-lg text-slate-900">{gender === 'male' ? '남성' : '여성'}, {age}세</p>
          </div>
          <div className="w-16 h-16 bg-white border-4 border-slate-900 rounded-3xl flex items-center justify-center text-slate-900 shadow-[8px_8px_0px_0px_rgba(15,23,42,1)] transform hover:scale-105 transition-transform cursor-default">
            <span className="text-xl font-black">{gender === 'male' ? 'M' : 'F'}{age}</span>
          </div>
        </div>
      </header>

      {/* Main Bento Grid */}
      <main className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-12 gap-8 auto-rows-min pb-24">
        
        {/* Profile & Input Column (Left) */}
        <div className="md:col-span-4 space-y-8">
          {/* User Settings Card */}
          <div className="bg-white border-2 border-slate-900 shadow-[8px_8px_0px_0px_rgba(15,23,42,1)] p-8 relative overflow-hidden group">
            <div className="absolute -right-4 -top-4 w-24 h-24 bg-slate-50 rounded-full opacity-50 group-hover:scale-110 transition-transform duration-500" />
            <h4 className="text-[10px] font-black uppercase text-slate-400 mb-6 tracking-widest flex items-center gap-2 relative">
              <User className="w-3 h-3" /> Profile Settings
            </h4>
            <div className="space-y-6 relative">
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase text-slate-500 ml-1">나이 (Age)</label>
                <input 
                  type="number" 
                  value={age} 
                  onChange={e => setAge(Number(e.target.value))}
                  className="w-full border-[3px] border-slate-900 px-4 py-3 font-black text-xl focus:outline-none focus:bg-orange-50 focus:shadow-none transition-all shadow-[4px_4px_0px_0px_rgba(15,23,42,1)]"
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase text-slate-500 ml-1">성별 (Gender)</label>
                <div className="flex border-[3px] border-slate-900 shadow-[4px_4px_0px_0px_rgba(15,23,42,1)] overflow-hidden">
                  <button 
                    onClick={() => setGender('male')}
                    className={`flex-1 py-3 text-sm font-black uppercase transition-colors ${gender === 'male' ? 'bg-slate-900 text-white' : 'bg-white hover:bg-slate-50'}`}
                  >남성</button>
                  <button 
                    onClick={() => setGender('female')}
                    className={`flex-1 py-3 text-sm font-black uppercase border-l-[3px] border-slate-900 transition-colors ${gender === 'female' ? 'bg-slate-900 text-white' : 'bg-white hover:bg-slate-50'}`}
                  >여성</button>
                </div>
              </div>
            </div>
          </div>

          {/* Upload Card */}
          <div className="bg-white border-2 border-slate-900 shadow-[8px_8px_0px_0px_rgba(15,23,42,1)] p-8">
            <h4 className="text-[10px] font-black uppercase text-slate-400 mb-6 tracking-widest flex items-center gap-2">
              <Camera className="w-3 h-3" /> Meal Capture
            </h4>
            <div 
              className="border-[3px] border-dashed border-slate-300 p-12 text-center cursor-pointer hover:border-orange-500 hover:bg-orange-50/30 transition-all group relative bg-slate-50/50"
              onClick={() => fileInputRef.current?.click()}
            >
              <div className="w-16 h-16 bg-white border-2 border-slate-900 rounded-2xl flex items-center justify-center mx-auto mb-4 group-hover:scale-110 group-hover:-rotate-6 transition-all shadow-[4px_4px_0px_0px_rgba(15,23,42,1)]">
                <Upload className="w-8 h-8 text-slate-900" />
              </div>
              <p className="text-xs font-black uppercase tracking-tight text-slate-900">Upload Food Photos</p>
              <p className="text-[10px] font-bold text-slate-400 mt-1 uppercase">Supports Multiple Files</p>
              <input type="file" multiple ref={fileInputRef} onChange={handleImageUpload} className="hidden" accept="image/*" />
            </div>

            {/* Preview Grid */}
            <AnimatePresence>
              {images.length > 0 && (
                <motion.div 
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="grid grid-cols-3 gap-3 mt-8"
                >
                  {images.map(img => (
                    <div key={img.id} className="relative aspect-square border-2 border-slate-900 shadow-[3px_3px_0px_0px_rgba(15,23,42,1)] group overflow-hidden">
                      <img src={img.url} className="w-full h-full object-cover group-hover:scale-110 transition-transform" />
                      <button 
                        onClick={(e) => { e.stopPropagation(); removeImage(img.id); }}
                        className="absolute top-1 right-1 bg-rose-500 text-white p-1 border-2 border-slate-900 shadow-[2px_2px_0px_0px_rgba(15,23,42,1)] hover:bg-rose-600 transition-colors"
                      >
                        <Plus className="w-3 h-3 rotate-45" />
                      </button>
                    </div>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>

            <button
              onClick={startAnalysis}
              disabled={loading || images.length === 0}
              className={`w-full mt-8 py-5 text-base font-black uppercase border-[3px] border-slate-900 shadow-[8px_8px_0px_0px_rgba(15,23,42,1)] active:shadow-none active:translate-x-2 active:translate-y-2 transition-all overflow-hidden relative group ${
                loading || images.length === 0 ? 'bg-slate-100 text-slate-400 cursor-not-allowed shadow-none border-slate-300' : 'bg-orange-500 text-white hover:bg-orange-600'
              }`}
            >
              {loading ? (
                <div className="flex flex-col items-center gap-1">
                  <div className="flex items-center gap-3">
                    <RefreshCw className="w-5 h-5 animate-spin" />
                    <span className="tracking-tighter">GUARD ANALYZING...</span>
                  </div>
                  <span className="text-[10px] lowercase font-bold text-white/90 bg-black/10 px-2 py-0.5 rounded tracking-widest">{loadingSteps[loadingStep]}</span>
                </div>
              ) : 'Start Guard Analysis'}
              <div className="absolute top-0 -left-full w-full h-full bg-white/20 skew-x-[30deg] group-hover:animate-[shimmer_2s_infinite]" />
            </button>
          </div>

          {/* History Sidebar */}
          <div className="bg-slate-900 text-white border-2 border-slate-900 shadow-[8px_8px_0px_0px_rgba(15,23,42,1)] p-8 max-h-[600px] overflow-y-auto custom-scrollbar relative">
            <div className="sticky top-0 bg-slate-900 z-10 pb-6 mb-4 border-b border-white/10 flex justify-between items-center">
              <h4 className="text-[10px] font-black uppercase text-slate-500 tracking-widest flex items-center gap-2">
                <History className="w-4 h-4" /> Log History
              </h4>
              <button 
                onClick={clearHistory}
                className="text-[9px] font-black uppercase bg-rose-500 px-2 py-1 border border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:bg-rose-600 transition-all hover:scale-105 active:scale-95"
              >
                Clear All
              </button>
            </div>
            <div className="space-y-8">
              {Object.keys(groupedHistory).length === 0 && (
                <div className="text-center py-12 opacity-30">
                  <Calendar className="w-12 h-12 mx-auto mb-4" />
                  <p className="text-[10px] font-black uppercase tracking-widest">기록된 식단이 없습니다.</p>
                </div>
              )}
              {Object.entries(groupedHistory).map(([date, meals]) => {
                const stats = getDailyStats(meals[0].date);
                return (
                  <div key={date} className="space-y-3">
                    <div className="flex justify-between items-end border-b border-slate-700 pb-2">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-tighter">{date}</p>
                      <div className="text-right">
                        <p className="text-[11px] font-black text-orange-500 uppercase">{stats.calories} <span className="opacity-50">kcal</span></p>
                        <p className="text-[8px] font-bold text-slate-500 uppercase">{stats.count} Meals recorded</p>
                      </div>
                    </div>
                    {meals.map(meal => (
                      <div 
                        key={meal.id} 
                        onClick={() => setSelectedMeal(meal)}
                        className={`group flex items-center gap-4 p-3 bg-slate-800 border-2 transition-all relative overflow-hidden ${selectedMeal?.id === meal.id ? 'border-orange-500 shadow-none' : 'border-slate-800 hover:border-slate-600 cursor-pointer shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]'}`}
                      >
                        <div className="w-12 h-12 border border-slate-700 bg-slate-900 overflow-hidden shrink-0">
                          <img src={meal.image} className="w-full h-full object-cover grayscale-[0.5] group-hover:grayscale-0 transition-all" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[11px] font-black uppercase truncate group-hover:text-orange-500 transition-colors">{meal.foodName}</p>
                          <p className="text-[9px] text-slate-500 uppercase font-bold">{new Date(meal.date).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })} • {meal.calories}kcal</p>
                        </div>
                        <button 
                          onClick={(e) => deleteRecord(meal.id, e)}
                          className="opacity-0 group-hover:opacity-100 text-slate-700 hover:text-rose-500 transition-all p-1"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Dynamic content Column (Right) */}
        <div className="md:col-span-8">
          <AnimatePresence mode="wait">
            {selectedMeal ? (
              <motion.div
                key={selectedMeal.id}
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                className="grid grid-cols-1 md:grid-cols-12 gap-8"
              >
                {/* Image Focus */}
                <div className="md:col-span-12 bg-white border-[3px] border-slate-900 shadow-[10px_10px_0px_0px_rgba(15,23,42,1)] relative aspect-video md:aspect-[21/7] overflow-hidden group">
                  <img src={selectedMeal.image} className="w-full h-full object-cover transition-all duration-1000 group-hover:scale-110" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                  <div className="absolute top-6 left-6 bg-slate-900 text-white px-4 py-1 text-xs font-black uppercase tracking-[0.2em] shadow-[4px_4px_0px_0px_rgba(255,107,53,1)]">
                    Scanned Subject: {selectedMeal.foodName}
                  </div>
                  <div className="absolute bottom-6 right-6 bg-white border-[3px] border-slate-900 p-4 text-center shadow-[6px_6px_0px_0px_rgba(15,23,42,1)]">
                    <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-1">Total Caloric Load</p>
                    <p className="text-3xl font-black text-slate-900 leading-none">{selectedMeal.calories} <span className="text-sm">KCAL</span></p>
                  </div>
                </div>

                {/* Analysis Score/Markdown */}
                <div className="md:col-span-12 lg:col-span-7 bg-white border-[3px] border-slate-900 shadow-[10px_10px_0px_0px_rgba(15,23,42,1)] p-10 relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-slate-50 rounded-bl-full -z-0" />
                  <div className="prose prose-slate max-w-none prose-sm custom-prose relative z-10">
                    <ReactMarkdown>{selectedMeal.markdown}</ReactMarkdown>
                  </div>
                </div>

                {/* Right Side Cards */}
                <div className="md:col-span-12 lg:col-span-5 space-y-8">
                  {/* Daily Progress */}
                  <div className="bg-emerald-50 border-[3px] border-slate-900 shadow-[10px_10px_0px_0px_rgba(15,23,42,1)] p-8 flex flex-col justify-between min-h-[220px]">
                    <div className="flex justify-between items-start mb-6">
                      <div className="bg-emerald-500 text-white px-3 py-1 text-[10px] font-black uppercase tracking-widest shadow-[3px_3px_0px_0px_rgba(15,23,42,1)]">Daily Target</div>
                      <Target className="text-emerald-600 w-6 h-6 stroke-[3px]" />
                    </div>
                    <div>
                      <div className="flex justify-between items-end mb-3">
                        <h3 className="font-black text-4xl text-slate-900 leading-none lowercase">
                          {getDailyStats(selectedMeal.date).calories}<span className="text-lg opacity-30">/2500</span>
                        </h3>
                        <p className="text-[10px] font-black text-emerald-600 uppercase mb-1">
                          {Math.round((getDailyStats(selectedMeal.date).calories / 2500) * 100)}% Complete
                        </p>
                      </div>
                      <div className="w-full h-5 bg-white border-[3px] border-slate-900 overflow-hidden shadow-[3px_3px_0px_0px_rgba(0,0,0,0.1)] p-0.5">
                        <div 
                          className="h-full bg-emerald-500 transition-all duration-1000 ease-out" 
                          style={{ width: `${Math.min(100, (getDailyStats(selectedMeal.date).calories / 2500) * 100)}%` }}
                        />
                      </div>
                      <p className="text-[10px] font-bold text-slate-500 mt-4 uppercase text-center tracking-widest bg-emerald-100/50 py-1">Recommended for {gender === 'male' ? 'Male' : 'Female'} Age {age}</p>
                    </div>
                  </div>

                  {/* Highlights/Quick Guide Card */}
                  <div className="bg-orange-50 border-[3px] border-slate-900 shadow-[10px_10px_0px_0px_rgba(15,23,42,1)] p-8 relative group overflow-hidden">
                    <div className="absolute -right-8 -bottom-8 w-32 h-32 bg-orange-200/30 rounded-full group-hover:scale-125 transition-transform duration-700" />
                    <h4 className="text-[10px] font-black uppercase text-slate-400 mb-4 tracking-widest flex items-center gap-2 relative">
                       <Zap className="w-4 h-4 text-orange-500 fill-orange-500" /> AI Optimization
                    </h4>
                    <p className="text-sm font-black text-slate-900 leading-relaxed uppercase relative italic">
                      "오늘 총 칼로리는 적정 수준이나 탄수화물 비율이 높습니다. 곁들임 추천 음식인 채소 샐러드로 식이섬유를 보충해주시고, 식후 15분 정도 가볍게 산책해주세요."
                    </p>
                    <div className="mt-6 flex gap-3 relative">
                      <div className="px-2 py-1 bg-white border-2 border-slate-900 text-[9px] font-black uppercase text-orange-600">Fiber deficiency</div>
                      <div className="px-2 py-1 bg-white border-2 border-slate-900 text-[9px] font-black uppercase text-emerald-600">Good hydration</div>
                    </div>
                  </div>

                  <button 
                    onClick={() => setSelectedMeal(null)}
                    className="w-full bg-slate-900 text-white py-6 text-sm font-black uppercase border-[3px] border-slate-900 shadow-[10px_10px_0px_0px_rgba(15,23,42,1)] hover:bg-slate-800 transition-all hover:-translate-y-1 hover:shadow-[12px_12px_0px_0px_rgba(15,23,42,1)] active:scale-95 active:shadow-none"
                  >
                    Return to Mission Hub
                  </button>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="h-full min-h-[700px] bg-slate-100/50 border-[4px] border-dashed border-slate-300 rounded-[3rem] flex flex-col items-center justify-center p-20 text-center relative overflow-hidden"
              >
                <div className="absolute top-0 right-0 w-64 h-64 bg-white/30 rounded-full blur-3xl" />
                <div className="absolute bottom-0 left-0 w-64 h-64 bg-orange-100/30 rounded-full blur-3xl" />
                <div className="w-32 h-32 bg-white border-[3px] border-slate-900 rounded-[2.5rem] flex items-center justify-center mb-10 shadow-[10px_10px_0px_0px_rgba(15,23,42,1)] transform hover:rotate-12 transition-all">
                  <Utensils className="text-slate-900 w-12 h-12 stroke-[2.5px]" />
                </div>
                <h3 className="text-4xl font-black text-slate-900 mb-4 uppercase tracking-tighter">Mission Ready</h3>
                <p className="text-slate-500 font-bold max-w-sm text-lg uppercase tracking-tight opacity-60">Upload meal visuals to begin heavy-duty micro-nutrient analysis and dynamic activity mapping.</p>
                <div className="mt-12 grid grid-cols-2 gap-4">
                  <div className="p-4 bg-white/80 border-2 border-slate-900 text-[10px] font-black uppercase tracking-widest leading-tight">Image-to-Macro<br/>Technology</div>
                  <div className="p-4 bg-white/80 border-2 border-slate-900 text-[10px] font-black uppercase tracking-widest leading-tight">User-Targeted<br/>Benchmarks</div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>

      <footer className="max-w-7xl mx-auto mt-24 py-12 border-t-[3px] border-slate-200 flex flex-col md:flex-row justify-between items-center gap-6 text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">
        <div className="flex gap-10">
          <div className="flex items-center gap-3"><div className="w-3 h-3 bg-rose-500 border-2 border-slate-900"></div> Critical Alert</div>
          <div className="flex items-center gap-3"><div className="w-3 h-3 bg-orange-500 border-2 border-slate-900"></div> System Warning</div>
          <div className="flex items-center gap-3"><div className="w-3 h-3 bg-emerald-500 border-2 border-slate-900"></div> Optimal Status</div>
        </div>
        <div className="text-slate-900 flex items-center gap-4">
          <span className="opacity-40">System Core v2.6.4</span>
          <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse capitalize" />
          <span className="tracking-widest">Operation Active</span>
        </div>
      </footer>

      <style>{`
        @keyframes shimmer {
          0% { left: -100%; opacity: 0; }
          20% { opacity: 0.5; }
          100% { left: 100%; opacity: 0; }
        }
        
        .custom-scrollbar::-webkit-scrollbar { width: 5px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #475569; border-radius: 0; }
        
        /* Custom MD Styling */
        .custom-prose h1 { font-family: ui-sans-serif, system-ui; font-size: 1.75rem; font-weight: 900; text-transform: uppercase; border-bottom: 4px solid #0f172a; margin-bottom: 1.5rem; color: #0f172a; letter-spacing: -0.05em; line-height: 1; }
        .custom-prose h2 { font-size: 1.1rem; font-weight: 900; text-transform: uppercase; color: #0f172a; margin-top: 2rem; display: flex; align-items: center; gap: 0.5rem; background: #f8fafc; padding: 0.25rem 0.5rem; border-left: 5px solid #f97316; }
        .custom-prose p { font-size: 0.9375rem; color: #334155; font-weight: 500; margin-bottom: 1rem; line-height: 1.8; }
        .custom-prose ul { list-style: none; padding: 0; margin-bottom: 1.5rem; }
        .custom-prose li { position: relative; padding-left: 1.5rem; font-size: 0.875rem; font-weight: 700; text-transform: uppercase; color: #1e293b; margin-bottom: 1rem; line-height: 1.4; border-bottom: 1px dashed #e2e8f0; padding-bottom: 0.5rem; }
        .custom-prose li::before { content: \"●\"; position: absolute; left: 0; color: #f97316; font-size: 0.75rem; top: 0.125rem; }
        .custom-prose strong { color: #0f172a; font-weight: 950; background: #fef3c7; px-1; }
        .custom-prose blockquote { border-left: 6px solid #cbd5e1; padding-left: 1.5rem; margin: 2rem 0; font-style: italic; color: #64748b; font-weight: 600; font-size: 1.1rem; }
      `}</style>
    </div>
  );
}
