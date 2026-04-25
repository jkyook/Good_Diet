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

  const startAnalysis = async () => {
    if (images.length === 0) {
      setError('분석할 음식 사진을 하나 이상 업로드해주세요.');
      return;
    }

    setLoading(true);
    setError(null);
    
    try {
      const results: MealRecord[] = [];
      for (const img of images) {
        // Convert file to base64
        const reader = new FileReader();
        const base64Promise = new Promise<string>((resolve) => {
          reader.onloadend = () => resolve(reader.result as string);
          reader.readAsDataURL(img.file);
        });
        const base64 = await base64Promise;
        
        // Use file mod date as fallback or current date
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
      }
      
      setHistory(prev => [...results, ...prev]);
      setImages([]);
      setSelectedMeal(results[0]);
    } catch (err) {
      setError(err instanceof Error ? err.message : '분석 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const getDailyStats = (date: string) => {
    const dailyMeals = history.filter(h => new Date(h.date).toDateString() === new Date(date).toDateString());
    const totalCalories = dailyMeals.reduce((sum, m) => sum + (m.calories || 0), 0);
    return { count: dailyMeals.length, calories: totalCalories };
  };

  // Group history by date
  const groupedHistory = history.reduce((groups: { [key: string]: MealRecord[] }, meal) => {
    const date = new Date(meal.date).toDateString();
    if (!groups[date]) groups[date] = [];
    groups[date].push(meal);
    return groups;
  }, {});

  const deleteRecord = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setHistory(prev => prev.filter(m => m.id !== id));
    if (selectedMeal?.id === id) setSelectedMeal(null);
  };

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-900 font-sans p-4 md:p-8 overflow-x-hidden">
      {/* Header */}
      <header className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-start md:items-end mb-8 gap-4">
        <div>
          <h1 className="text-4xl font-black tracking-tighter text-slate-900 uppercase">
            FlavorGuard <span className="text-orange-500">AI</span>
          </h1>
          <p className="text-slate-500 text-sm font-medium">Personalized Nutritional Analysis & History</p>
        </div>
        <div className="flex gap-4 items-center">
          <div className="text-right hidden sm:block">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Target Profile</p>
            <p className="font-bold">{gender === 'male' ? '남성' : '여성'}, {age}세</p>
          </div>
          <div className="w-12 h-12 bg-slate-900 rounded-full border-2 border-slate-900 flex items-center justify-center text-white shadow-lg">
            <span className="text-xs font-bold">{gender === 'male' ? 'M' : 'F'}{age}</span>
          </div>
        </div>
      </header>

      {/* Main Bento Grid */}
      <main className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-12 gap-6 auto-rows-min">
        
        {/* Profile & Input Column (Left) */}
        <div className="md:col-span-4 space-y-6">
          {/* User Settings Card */}
          <div className="bg-white border-2 border-slate-900 shadow-[4px_4px_0px_0px_rgba(15,23,42,1)] p-6">
            <h4 className="text-xs font-black uppercase text-slate-400 mb-4 tracking-widest">Profile Settings</h4>
            <div className="space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase text-slate-500">나이</label>
                <input 
                  type="number" 
                  value={age} 
                  onChange={e => setAge(Number(e.target.value))}
                  className="w-full border-2 border-slate-900 px-3 py-2 font-bold focus:outline-none focus:bg-orange-50"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase text-slate-500">성별</label>
                <div className="flex border-2 border-slate-900">
                  <button 
                    onClick={() => setGender('male')}
                    className={`flex-1 py-2 text-xs font-black uppercase border-r-2 border-slate-900 ${gender === 'male' ? 'bg-slate-900 text-white' : 'hover:bg-slate-50'}`}
                  >남성</button>
                  <button 
                    onClick={() => setGender('female')}
                    className={`flex-1 py-2 text-xs font-black uppercase ${gender === 'female' ? 'bg-slate-900 text-white' : 'hover:bg-slate-50'}`}
                  >여성</button>
                </div>
              </div>
            </div>
          </div>

          {/* Upload Card */}
          <div className="bg-white border-2 border-slate-900 shadow-[4px_4px_0px_0px_rgba(15,23,42,1)] p-6">
            <h4 className="text-xs font-black uppercase text-slate-400 mb-4 tracking-widest">Meal Capture</h4>
            <div 
              className="border-2 border-dashed border-slate-300 p-8 text-center cursor-pointer hover:border-orange-500 transition-colors group"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="w-8 h-8 mx-auto mb-2 text-slate-300 group-hover:text-orange-500 transition-colors" />
              <p className="text-xs font-bold uppercase tracking-tight">Click to Upload Food Photos</p>
              <input type="file" multiple ref={fileInputRef} onChange={handleImageUpload} className="hidden" accept="image/*" />
            </div>

            {/* Preview Grid */}
            {images.length > 0 && (
              <div className="grid grid-cols-3 gap-2 mt-4">
                {images.map(img => (
                  <div key={img.id} className="relative aspect-square border border-slate-900 group">
                    <img src={img.url} className="w-full h-full object-cover" />
                    <button 
                      onClick={(e) => { e.stopPropagation(); removeImage(img.id); }}
                      className="absolute -top-2 -right-2 bg-rose-500 text-white p-1 border border-slate-900 shadow-[2px_2px_0px_0px_rgba(15,23,42,1)]"
                    >
                      <Plus className="w-3 h-3 rotate-45" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <button
              onClick={startAnalysis}
              disabled={loading || images.length === 0}
              className={`w-full mt-6 py-4 text-sm font-black uppercase border-2 border-slate-900 shadow-[4px_4px_0px_0px_rgba(15,23,42,1)] active:shadow-none active:translate-x-1 active:translate-y-1 transition-all ${
                loading || images.length === 0 ? 'bg-slate-100 text-slate-400 cursor-not-allowed shadow-none border-slate-300' : 'bg-orange-500 text-white hover:bg-orange-600'
              }`}
            >
              {loading ? 'Analyzing...' : 'Start Guard Analysis'}
            </button>
          </div>

          {/* History Sidebar */}
          <div className="bg-slate-900 text-white border-2 border-slate-900 shadow-[4px_4px_0px_0px_rgba(15,23,42,1)] p-6 max-h-[400px] overflow-y-auto custom-scrollbar">
            <h4 className="text-xs font-black uppercase text-slate-500 mb-4 tracking-widest flex items-center gap-2">
              <History className="w-4 h-4" /> Log History
            </h4>
            <div className="space-y-6">
              {Object.keys(groupedHistory).length === 0 && (
                <p className="text-[10px] text-slate-500 text-center py-8">기록이 없습니다.</p>
              )}
              {Object.entries(groupedHistory).map(([date, meals]) => {
                const stats = getDailyStats(date);
                return (
                  <div key={date} className="space-y-2">
                    <div className="flex justify-between items-center border-b border-slate-800 pb-1">
                      <p className="text-[10px] font-black text-slate-400 uppercase">{date}</p>
                      <p className="text-[10px] font-black text-orange-500">{stats.calories}KCAL / {stats.count} MEALS</p>
                    </div>
                    {meals.map(meal => (
                      <div 
                        key={meal.id} 
                        onClick={() => setSelectedMeal(meal)}
                        className={`flex items-center gap-3 p-2 bg-slate-800 border border-transparent hover:border-orange-500 cursor-pointer transition-all ${selectedMeal?.id === meal.id ? 'border-orange-500 bg-slate-700' : ''}`}
                      >
                        <img src={meal.image} className="w-8 h-8 object-cover border border-slate-700" />
                        <div className="flex-1 min-w-0">
                          <p className="text-[10px] font-bold uppercase truncate">{meal.foodName}</p>
                          <p className="text-[8px] text-slate-500 uppercase">{meal.calories}kcal</p>
                        </div>
                        <button 
                          onClick={(e) => deleteRecord(meal.id, e)}
                          className="text-slate-600 hover:text-rose-500 transition-colors"
                        >
                          <Trash2 className="w-3 h-3" />
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
        <div className="md:col-span-8 space-y-6">
          <AnimatePresence mode="wait">
            {selectedMeal ? (
              <motion.div
                key={selectedMeal.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="grid grid-cols-1 md:grid-cols-2 gap-6"
              >
                {/* Image Focus */}
                <div className="md:col-span-2 bg-white border-2 border-slate-900 shadow-[4px_4px_0px_0px_rgba(15,23,42,1)] relative aspect-video md:aspect-[21/9] overflow-hidden group">
                  <img src={selectedMeal.image} className="w-full h-full object-cover grayscale-[0.2] transition-all duration-700 group-hover:scale-105" />
                  <div className="absolute top-4 left-4 bg-slate-900 text-white px-3 py-1 text-[10px] font-black uppercase tracking-widest">
                    Subject: {selectedMeal.foodName}
                  </div>
                  <div className="absolute bottom-4 right-4 bg-white border-2 border-slate-900 px-3 py-1 text-[10px] font-black uppercase text-slate-900">
                    Energy Intake: {selectedMeal.calories} kcal
                  </div>
                </div>

                {/* Analysis Score/Markdown */}
                <div className="md:col-span-1 bg-white border-2 border-slate-900 shadow-[4px_4px_0px_0px_rgba(15,23,42,1)] p-8">
                  <div className="prose prose-slate max-w-none prose-sm custom-prose">
                    <ReactMarkdown>{selectedMeal.markdown}</ReactMarkdown>
                  </div>
                </div>

                {/* Right Side Cards */}
                <div className="md:col-span-1 space-y-6">
                  {/* Daily Progress */}
                  <div className="bg-emerald-50 border-2 border-slate-900 shadow-[4px_4px_0px_0px_rgba(15,23,42,1)] p-6 flex flex-col justify-between min-h-[160px]">
                    <div className="flex justify-between items-start">
                      <span className="bg-emerald-500 text-white px-2 py-0.5 text-[10px] font-bold uppercase">Daily Goal Tracker</span>
                      <Target className="text-emerald-600 w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="font-black text-lg text-slate-800 leading-tight uppercase mb-1">
                        {getDailyStats(selectedMeal.date).calories} / 2500 kcal
                      </h3>
                      <div className="w-full h-3 bg-slate-200 border border-slate-900 overflow-hidden">
                        <div 
                          className="h-full bg-emerald-500 transition-all duration-1000" 
                          style={{ width: `${Math.min(100, (getDailyStats(selectedMeal.date).calories / 2500) * 100)}%` }}
                        />
                      </div>
                      <p className="text-[10px] font-bold text-slate-500 mt-2 uppercase">Recommended Daily Intake for Age {age}</p>
                    </div>
                  </div>

                  {/* Quick Action Item */}
                  <div className="bg-amber-50 border-2 border-slate-900 shadow-[4px_4px_0px_0px_rgba(15,23,42,1)] p-6">
                    <h4 className="text-[10px] font-black uppercase text-slate-400 mb-2 tracking-widest flex items-center gap-2">
                       <Zap className="w-3 h-3" /> Quick Optimization
                    </h4>
                    <p className="text-xs font-bold text-slate-700 leading-relaxed uppercase italic">
                      "이 식사는 평균보다 칼로리가 높습니다. 저녁 식단은 가벼운 샐러드와 식후 20분 걷기를 추천합니다."
                    </p>
                  </div>

                  <button 
                    onClick={() => setSelectedMeal(null)}
                    className="w-full bg-slate-900 text-white py-4 text-xs font-black uppercase border-2 border-slate-900 hover:bg-slate-800 transition-all"
                  >
                    Return to Scanner
                  </button>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="col-span-8 bg-[#f1f5f9] border-2 border-dashed border-slate-300 rounded-[2rem] flex flex-col items-center justify-center py-24 px-12 text-center"
              >
                <div className="w-24 h-24 bg-white border-2 border-slate-900 rounded-full flex items-center justify-center mb-8 shadow-[4px_4px_0px_0px_rgba(15,23,42,1)]">
                  <Utensils className="text-slate-900 w-10 h-10" />
                </div>
                <h3 className="text-2xl font-black text-slate-900 mb-4 uppercase tracking-tighter">Ready for Analysis</h3>
                <p className="text-slate-500 font-medium max-w-sm">음식 사진을 업로드하거나 목록에서 이전 기록을 선택하여 상세 영양 분석 및 운동 가이드를 확인하세요.</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>

      <footer className="max-w-7xl mx-auto mt-12 py-8 border-t-2 border-slate-200 flex justify-between items-center text-[10px] font-bold text-slate-400 uppercase tracking-widest">
        <div className="flex gap-8">
          <div className="flex items-center gap-2"><div className="w-2 h-2 bg-rose-500"></div> Risk High</div>
          <div className="flex items-center gap-2"><div className="w-2 h-2 bg-amber-500"></div> Warning</div>
          <div className="flex items-center gap-2"><div className="w-2 h-2 bg-emerald-500"></div> Optimal</div>
        </div>
        <div className="text-slate-900">FlavorGuard AI Core v2.5.1</div>
      </footer>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #475569; border-radius: 0; }
        
        .custom-prose h1 { font-family: ui-sans-serif, system-ui; font-size: 1.25rem; font-weight: 900; text-transform: uppercase; border-bottom: 2px solid #0f172a; margin-bottom: 1rem; color: #0f172a; }
        .custom-prose h2 { font-size: 1rem; font-weight: 800; text-transform: uppercase; color: #0f172a; margin-top: 1.5rem; }
        .custom-prose p { font-size: 0.875rem; color: #475569; font-weight: 500; margin-bottom: 0.75rem; line-height: 1.6; }
        .custom-prose ul { list-style: none; padding: 0; }
        .custom-prose li { position: relative; padding-left: 1rem; font-size: 0.8125rem; font-weight: 600; text-transform: uppercase; color: #1e293b; margin-bottom: 0.5rem; }
        .custom-prose li::before { content: \"→\"; position: absolute; left: 0; color: #f97316; font-weight: 900; }
        .custom-prose strong { color: #0f172a; font-weight: 900; }
      `}</style>
    </div>
  );
}
