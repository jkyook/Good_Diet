/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useRef, ChangeEvent } from 'react';
import { Camera, Upload, Utensils, AlertCircle, CheckCircle2, RefreshCw, User, Info } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import { analyzeFood } from './services/geminiService';

type Gender = 'male' | 'female';

export default function App() {
  const [image, setImage] = useState<string | null>(null);
  const [age, setAge] = useState<number>(30);
  const [gender, setGender] = useState<Gender>('male');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImageUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setImage(reader.result as string);
        setResult(null);
        setError(null);
      };
      reader.readAsDataURL(file);
    }
  };

  const startAnalysis = async () => {
    if (!image) {
      setError('음식 사진을 먼저 업로드해주세요.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const analysis = await analyzeFood(image, age, gender);
      setResult(analysis);
    } catch (err) {
      setError(err instanceof Error ? err.message : '분석 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setImage(null);
    setResult(null);
    setError(null);
  };

  return (
    <div className="min-h-screen bg-[#FDFCFB] text-[#2D2926] font-sans selection:bg-[#EEDDCC]">
      {/* Header */}
      <header className="border-b border-[#E6E1DC] bg-white sticky top-0 z-50">
        <div className="max-w-4xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 bg-[#FF6B35] rounded-xl flex items-center justify-center shadow-sm">
              <Utensils className="text-white w-6 h-6" />
            </div>
            <h1 className="text-xl font-bold tracking-tight text-[#1A1A1A]">MealWise</h1>
          </div>
          <div className="text-xs uppercase tracking-widest font-semibold text-[#8E877F]">
            AI 식단 분석기
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8 md:py-12">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
          
          {/* Left Column: Inputs */}
          <div className="space-y-8">
            <section>
              <div className="flex items-center gap-2 mb-4">
                <User className="w-5 h-5 text-[#FF6B35]" />
                <h2 className="text-lg font-bold">사용자 정보</h2>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase text-[#8E877F] tracking-wide">나이 (세)</label>
                  <input
                    type="number"
                    value={age}
                    onChange={(e) => setAge(Number(e.target.value))}
                    className="w-full h-12 px-4 rounded-xl border-2 border-[#E6E1DC] focus:border-[#FF6B35] focus:outline-none transition-colors bg-white font-medium shadow-sm hover:border-[#D1CCC7]"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase text-[#8E877F] tracking-wide">성별</label>
                  <div className="flex rounded-xl overflow-hidden border-2 border-[#E6E1DC] shadow-sm">
                    <button
                      onClick={() => setGender('male')}
                      className={`flex-1 h-12 font-medium transition-all ${
                        gender === 'male' ? 'bg-[#FF6B35] text-white' : 'bg-white text-[#8E877F] hover:bg-[#F9F7F5]'
                      }`}
                    >
                      남성
                    </button>
                    <button
                      onClick={() => setGender('female')}
                      className={`flex-1 h-12 font-medium transition-all ${
                        gender === 'female' ? 'bg-[#FF6B35] text-white' : 'bg-white text-[#8E877F] hover:bg-[#F9F7F5]'
                      }`}
                    >
                      여성
                    </button>
                  </div>
                </div>
              </div>
            </section>

            <section className="space-y-4">
              <div className="flex items-center gap-2 mb-2">
                <Camera className="w-5 h-5 text-[#FF6B35]" />
                <h2 className="text-lg font-bold">음식 사진</h2>
              </div>
              
              <div 
                className={`relative group h-80 rounded-3xl border-2 border-dashed transition-all cursor-pointer overflow-hidden flex flex-col items-center justify-center bg-white ${
                  image ? 'border-[#FF6B35]' : 'border-[#E6E1DC] hover:border-[#D1CCC7]'
                }`}
                onClick={() => fileInputRef.current?.click()}
              >
                {image ? (
                  <>
                    <img src={image} alt="Uploaded food" className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <p className="text-white font-bold flex items-center gap-2">
                        <RefreshCw className="w-5 h-5" /> 사진 변경
                      </p>
                    </div>
                  </>
                ) : (
                  <div className="text-center p-8">
                    <div className="w-16 h-16 bg-[#F9F7F5] rounded-2xl flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform">
                      <Upload className="text-[#8E877F] w-8 h-8" />
                    </div>
                    <p className="font-bold text-[#1A1A1A] mb-1">식단 사진을 클릭하여 올리기</p>
                    <p className="text-sm text-[#8E877F]">또는 파일을 여기로 드래그 하세요</p>
                  </div>
                )}
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleImageUpload}
                  accept="image/*"
                  className="hidden"
                />
              </div>
            </section>

            <button
              onClick={startAnalysis}
              disabled={loading || !image}
              className={`w-full h-16 rounded-2xl font-bold text-lg shadow-lg flex items-center justify-center gap-3 transition-all ${
                loading || !image 
                  ? 'bg-[#E6E1DC] text-[#8E877F] cursor-not-allowed shadow-none' 
                  : 'bg-[#1A1A1A] text-white hover:bg-[#333333] active:scale-[0.98]'
              }`}
            >
              {loading ? (
                <>
                  <RefreshCw className="w-6 h-6 animate-spin" />
                  AI 분석 중...
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-6 h-6" />
                  영양 분석 시작하기
                </>
              )}
            </button>

            {error && (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-4 bg-red-50 border border-red-100 rounded-xl flex items-start gap-3 mt-4"
              >
                <AlertCircle className="text-red-500 w-5 h-5 shrink-0 mt-0.5" />
                <p className="text-sm text-red-700 font-medium">{error}</p>
              </motion.div>
            )}
          </div>

          {/* Right Column: Results */}
          <div className="relative">
            <AnimatePresence mode="wait">
              {result ? (
                <motion.div
                  key="result"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="bg-white rounded-3xl border border-[#E6E1DC] overflow-hidden shadow-xl"
                >
                  <div className="bg-[#1A1A1A] p-6 text-white flex items-center justify-between">
                    <h3 className="text-xl font-bold">분석 리포트</h3>
                    <button 
                      onClick={reset}
                      className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                      title="새로 시작"
                    >
                      <RefreshCw className="w-5 h-5" />
                    </button>
                  </div>
                  <div className="p-8 space-y-6 max-h-[70vh] overflow-y-auto custom-scrollbar">
                    <div className="prose prose-stone max-w-none prose-h2:text-lg prose-h2:font-bold prose-h2:mb-2 prose-h2:mt-6 prose-p:text-[#4A443F] prose-li:text-[#4A443F]">
                      <ReactMarkdown>{result}</ReactMarkdown>
                    </div>
                  </div>
                  <div className="p-6 bg-[#F9F7F5] border-t border-[#E6E1DC]">
                    <div className="flex items-center gap-2 text-[#8E877F] text-xs font-bold uppercase tracking-wider">
                      <Info className="w-4 h-4" />
                      이 리포트는 AI 분석 결과이며 실제 의학적 소견을 대체할 수 없습니다.
                    </div>
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key="placeholder"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="h-full min-h-[500px] border-2 border-dashed border-[#E6E1DC] rounded-3xl flex flex-col items-center justify-center p-12 text-center"
                >
                  <div className="w-20 h-20 bg-[#F9F7F5] rounded-full flex items-center justify-center mb-6">
                    <Utensils className="text-[#D1CCC7] w-10 h-10" />
                  </div>
                  <h3 className="text-xl font-bold text-[#1A1A1A] mb-2 font-serif italic">식단 리포트 대기 중</h3>
                  <p className="text-[#8E877F]">사진을 찍거나 업로드하시면<br />맞춤형 영양 보고서가 생성됩니다.</p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </main>

      <footer className="max-w-4xl mx-auto px-4 py-12 border-t border-[#E6E1DC] mt-12">
        <p className="text-sm text-[#8E877F] text-center">
          © 2026 MealWise. All rights reserved. <br className="md:hidden" />
          건강한 일상을 위한 AI 동반자.
        </p>
      </footer>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: #F9F7F5;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #D1CCC7;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #8E877F;
        }
        
        .prose h1 { font-size: 1.5rem; font-weight: 800; margin-top: 1.5rem; margin-bottom: 1rem; color: #1A1A1A; }
        .prose h2 { font-size: 1.25rem; font-weight: 700; margin-top: 1.5rem; margin-bottom: 0.75rem; color: #1A1A1A; border-bottom: 1px solid #E6E1DC; padding-bottom: 0.25rem; }
        .prose h3 { font-size: 1.1rem; font-weight: 700; margin-top: 1rem; margin-bottom: 0.5rem; color: #1A1A1A; }
        .prose p { margin-bottom: 1rem; line-height: 1.7; color: #4A443F; }
        .prose ul, .prose ol { margin-bottom: 1rem; padding-left: 1.5rem; }
        .prose li { margin-bottom: 0.5rem; line-height: 1.6; color: #4A443F; list-style-type: decimal; }
        .prose ul li { list-style-type: disc; }
        .prose strong { color: #1A1A1A; font-weight: 700; }
        .prose blockquote { border-left: 4px solid #FF6B35; padding-left: 1rem; font-style: italic; color: #6B635B; margin: 1.5rem 0; }
      `}</style>
    </div>
  );
}
