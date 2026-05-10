import React, { useState, useEffect } from 'react';
import { Images, X, Loader2, CheckCircle, AlertCircle, ChevronDown, ChevronUp, RotateCcw } from 'lucide-react';
import { analyzeFoodBatch, AnalysisResult, MealType, AIProvider, AnalysisMode } from '../services/geminiService';
import { pickMultipleFromGallery, pickMultipleFromInput } from '../services/cameraService';
import { Capacitor } from '@capacitor/core';

interface BatchResult {
  imageUrl: string;
  result?: AnalysisResult;
  error?: string;
}

export interface BatchAnalysisCompletion {
  image: string;
  result: AnalysisResult;
}

interface Props {
  age: number;
  gender: 'male' | 'female';
  provider: AIProvider;
  mealType: MealType;
  onComplete: (results: BatchAnalysisCompletion[]) => void;
  onLoadingChange?: (loading: boolean) => void;
}

export default function BatchAnalyzer({ age, gender, provider, mealType, onComplete, onLoadingChange }: Props) {
  const [selectedImages, setSelectedImages] = useState<string[]>([]);
  const [batchResults, setBatchResults] = useState<BatchResult[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    onLoadingChange?.(isAnalyzing);
  }, [isAnalyzing, onLoadingChange]);

  const handlePickImages = async () => {
    const isNative = Capacitor.isNativePlatform();
    const picked = isNative
      ? await pickMultipleFromGallery()
      : await pickMultipleFromInput();

    if (!picked.length) return;
    setSelectedImages(picked.map(p => p.dataUrl));
    setBatchResults([]);
  };

  const handleRemoveImage = (idx: number) => {
    setSelectedImages(prev => prev.filter((_, i) => i !== idx));
  };

  const handleResetBatch = () => {
    setSelectedImages([]);
    setBatchResults([]);
    setProgress({ done: 0, total: 0 });
  };

  const handleAnalyze = async () => {
    if (!selectedImages.length) return;
    setIsAnalyzing(true);
    setProgress({ done: 0, total: selectedImages.length });
    const results: BatchResult[] = selectedImages.map(img => ({ imageUrl: img }));
    const completedItems: BatchAnalysisCompletion[] = [];
    setBatchResults([...results]);

    try {
      await analyzeFoodBatch(
        selectedImages,
        age,
        gender,
        'quick' as AnalysisMode,
        provider,
        (completed, total, result, error) => {
          const image = selectedImages[completed - 1];
          setProgress({ done: completed, total });
          setBatchResults(prev => {
            const updated = [...prev];
            updated[completed - 1] = {
              imageUrl: image,
              result,
              error: result ? undefined : (error || '분석 실패'),
            };
            return updated;
          });
          if (result) {
            completedItems.push({ image, result });
          }
        },
      );
      onComplete(completedItems);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '분석 실패';
      setBatchResults(prev => prev.map(item => item.result ? item : { ...item, error: msg }));
    } finally {
      setIsAnalyzing(false);
    }
  };

  const successCount = batchResults.filter(r => r.result).length;
  const failCount = batchResults.filter(r => r.error).length;

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 space-y-4">
      <button
        onClick={() => setExpanded(e => !e)}
        className="flex items-center justify-between w-full"
      >
        <div className="flex items-center gap-2 text-gray-700 font-semibold">
          <Images size={18} className="text-emerald-500" />
          <span>여러 사진 한번에 분석</span>
        </div>
        {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>

      {expanded && (
        <div className="space-y-3">
          {/* 이미지 선택 영역 */}
          <div className="flex flex-wrap gap-2">
            {selectedImages.map((img, i) => {
              const res = batchResults[i];
              return (
                <div key={i} className="relative w-16 h-16">
                  <img src={img} className="w-full h-full object-cover rounded-lg" alt={`선택 ${i + 1}`} />
                  {res?.result && (
                    <div className="absolute inset-0 bg-black/30 rounded-lg flex items-center justify-center">
                      <CheckCircle size={20} className="text-white" />
                    </div>
                  )}
                  {res?.error && (
                    <div className="absolute inset-0 bg-red-500/40 rounded-lg flex items-center justify-center">
                      <AlertCircle size={20} className="text-white" />
                    </div>
                  )}
                  {!isAnalyzing && (
                    <button
                      onClick={() => handleRemoveImage(i)}
                      className="absolute -top-1 -right-1 bg-gray-800 rounded-full p-0.5"
                    >
                      <X size={10} className="text-white" />
                    </button>
                  )}
                </div>
              );
            })}

            {!isAnalyzing && (
              <button
                onClick={handlePickImages}
                className="w-16 h-16 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center text-gray-400 hover:border-emerald-400 hover:text-emerald-500 transition-colors"
              >
                <Images size={20} />
              </button>
            )}
          </div>

          {/* 진행 바 */}
          {isAnalyzing && (
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs text-gray-500">
                <span className="flex items-center gap-1">
                  <Loader2 size={12} className="animate-spin" />
                  분석 중…
                </span>
                <span>{progress.done} / {progress.total}</span>
              </div>
              <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-500 rounded-full transition-all duration-300"
                  style={{ width: `${(progress.done / progress.total) * 100}%` }}
                />
              </div>
            </div>
          )}

          {/* 결과 요약 */}
          {!isAnalyzing && batchResults.length > 0 && (
            <p className="text-xs text-gray-500">
              완료: <span className="text-emerald-600 font-medium">{successCount}개 성공</span>
              {failCount > 0 && <span className="text-red-500 ml-1">{failCount}개 실패</span>}
            </p>
          )}

          {/* 결과 리스트 (성공 + 실패 모두) */}
          {batchResults.length > 0 && (
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {batchResults.map((r, i) => (
                r.result ? (
                  <div key={i} className="flex items-center gap-3 p-2 bg-gray-50 rounded-xl">
                    <img src={r.imageUrl} className="w-10 h-10 object-cover rounded-lg flex-shrink-0" alt="" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{r.result.foodName}</p>
                      <p className="text-xs text-gray-500">{r.result.calories} kcal · {r.result.weightGrams}g</p>
                    </div>
                    <span className="ml-auto text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full flex-shrink-0">
                      {r.result.category}
                    </span>
                  </div>
                ) : r.error ? (
                  <div key={i} className="flex items-center gap-3 p-2 bg-red-50 rounded-xl">
                    <img src={r.imageUrl} className="w-10 h-10 object-cover rounded-lg flex-shrink-0 opacity-60" alt="" />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-red-700">분석 실패</p>
                      <p className="text-[11px] text-red-500 truncate" title={r.error}>{r.error}</p>
                    </div>
                  </div>
                ) : null
              ))}
            </div>
          )}

          {/* 분석 버튼 */}
          {selectedImages.length > 0 && !isAnalyzing && batchResults.length === 0 && (
            <button
              onClick={handleAnalyze}
              className="w-full py-2.5 bg-emerald-500 text-white rounded-xl text-sm font-semibold hover:bg-emerald-600 active:scale-95 transition-all"
            >
              {selectedImages.length}개 사진 일괄 분석
            </button>
          )}

          {/* 다시 일괄 분석 버튼 (분석 완료 후) */}
          {!isAnalyzing && batchResults.length > 0 && (
            <button
              onClick={handleResetBatch}
              className="w-full py-2.5 bg-white border-2 border-emerald-400 text-emerald-600 rounded-xl text-sm font-semibold hover:bg-emerald-50 active:scale-95 transition-all flex items-center justify-center gap-2"
            >
              <RotateCcw size={14} /> 새 사진으로 다시 분석
            </button>
          )}
        </div>
      )}
    </div>
  );
}
