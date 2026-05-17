import React, { useEffect, useMemo, useState } from 'react';
import { Eye, EyeOff, MapPin } from 'lucide-react';
import type { FoodSegment, IngredientDetail } from '../services/geminiService';
import { bboxToPercentDirect } from '../utils/analysisImage';
import { INGREDIENT_OVERLAY_COLORS, type NormalizedBBox } from '../utils/bboxLayout';

interface OverlayItem {
  key: string;
  name: string;
  region: NormalizedBBox;
  calories?: number;
}

interface Props {
  imageSrc: string;
  foodName: string;
  /** 분석에 사용된 픽셀 크기 — 표시 컨테이너와 1:1 (없으면 이미지 로드 후 natural 크기 사용) */
  imageWidth?: number;
  imageHeight?: number;
  foodSegments?: FoodSegment[];
  ingredients?: IngredientDetail[];
  calories?: number;
  weightGrams?: number;
  className?: string;
}

export default function IngredientPhotoOverlay({
  imageSrc,
  foodName,
  imageWidth: metaW,
  imageHeight: metaH,
  foodSegments,
  ingredients = [],
  calories,
  weightGrams,
  className = '',
}: Props) {
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [overlayOn, setOverlayOn] = useState(true);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const pixelW = metaW && metaH ? metaW : natural?.w;
  const pixelH = metaW && metaH ? metaH : natural?.h;
  const gridReady = pixelW != null && pixelH != null && pixelW > 0 && pixelH > 0;

  const overlayItems: OverlayItem[] = useMemo(() => {
    if (foodSegments?.length) {
      return foodSegments.map((seg, i) => ({
        key: `seg-${i}`,
        name: seg.name,
        region: seg.region,
        calories: seg.calories,
      }));
    }
    return ingredients
      .map((ing, i) => ({ ing, i }))
      .filter(({ ing }) => ing.region != null)
      .map(({ ing, i }) => ({
        key: `ing-${i}`,
        name: ing.name,
        region: ing.region!,
        calories: ing.calories,
      }));
  }, [foodSegments, ingredients]);

  const hasRegions = overlayItems.length > 0 && gridReady;
  const isFoodLevel = (foodSegments?.length ?? 0) > 0;
  const sizeLabel = gridReady ? `${pixelW}×${pixelH}px` : '';

  useEffect(() => {
    if (selectedKey && !overlayItems.some(it => it.key === selectedKey)) {
      setSelectedKey(overlayItems[0]?.key ?? null);
    }
  }, [selectedKey, overlayItems]);

  return (
    <div className={`space-y-3 ${className}`}>
      <div
        className="relative w-full mx-auto bg-slate-900 rounded-2xl overflow-hidden"
        style={gridReady ? { aspectRatio: `${pixelW} / ${pixelH}` } : { aspectRatio: '4 / 3' }}
      >
        <img
          src={imageSrc}
          alt={foodName}
          className="block w-full h-full"
          width={pixelW}
          height={pixelH}
          onLoad={e => {
            const t = e.currentTarget;
            if (!metaW || !metaH) {
              setNatural({ w: t.naturalWidth, h: t.naturalHeight });
            }
          }}
        />

        <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-transparent to-black/15 pointer-events-none" />

        {gridReady && isFoodLevel && overlayOn && (
          <div className="absolute top-2 left-2 right-2 z-10 flex justify-between gap-2 pointer-events-none text-[9px]">
            <span className="font-bold text-white/90 bg-black/40 px-2 py-0.5 rounded-full">
              음식별 · {sizeLabel}
            </span>
            <span className="text-white/80 bg-emerald-600/70 px-2 py-0.5 rounded-full">
              분석=표시 동일
            </span>
          </div>
        )}

        {overlayOn && hasRegions && overlayItems.map((item, index) => {
          const rect = bboxToPercentDirect(item.region);
          const color = INGREDIENT_OVERLAY_COLORS[index % INGREDIENT_OVERLAY_COLORS.length];
          const active = selectedKey === item.key;
          return (
            <button
              key={item.key}
              type="button"
              aria-label={`${item.name} 위치`}
              aria-pressed={active}
              onClick={() => setSelectedKey(active ? null : item.key)}
              className="absolute p-0 border-0 bg-transparent cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-white z-[5]"
              style={{
                left: `${rect.left}%`,
                top: `${rect.top}%`,
                width: `${rect.width}%`,
                height: `${rect.height}%`,
              }}
            >
              <span
                className="absolute inset-0 rounded-lg transition-all duration-200"
                style={{
                  border: `2px solid ${color}`,
                  backgroundColor: active ? `${color}55` : `${color}22`,
                  boxShadow: active ? `0 0 0 2px ${color}99` : undefined,
                }}
              />
              {(active || rect.width > 6) && (
                <span
                  className="absolute -top-1 left-0 -translate-y-full max-w-[160px] truncate text-[10px] font-bold text-white px-1.5 py-0.5 rounded-md shadow-md"
                  style={{ backgroundColor: color }}
                >
                  {item.name}
                  {item.calories != null && (
                    <span className="font-normal opacity-90 ml-1">{item.calories}kcal</span>
                  )}
                </span>
              )}
            </button>
          );
        })}

        <div className="absolute bottom-3 left-3 right-3 flex items-end justify-between gap-2 pointer-events-none z-10">
          <div>
            {calories != null && (
              <p className="text-2xl font-black text-white leading-none drop-shadow-md">
                {calories.toLocaleString()}
                <span className="text-sm font-normal ml-1">kcal</span>
              </p>
            )}
            {weightGrams != null && (
              <p className="text-white/80 text-xs mt-0.5 drop-shadow">{weightGrams}g</p>
            )}
          </div>
          {hasRegions && (
            <button
              type="button"
              onClick={() => setOverlayOn(v => !v)}
              className="pointer-events-auto flex items-center gap-1 text-[10px] font-bold text-white bg-black/50 backdrop-blur px-2.5 py-1.5 rounded-full border border-white/20 active:scale-95"
            >
              {overlayOn ? <EyeOff size={12} /> : <Eye size={12} />}
              {overlayOn ? '영역 숨기기' : '영역 표시'}
            </button>
          )}
        </div>
      </div>

      {!hasRegions && ingredients.length > 0 && (
        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2 flex items-start gap-2">
          <MapPin size={14} className="shrink-0 mt-0.5" />
          {gridReady
            ? '사진 위치 정보가 없습니다. 새로 분석해 주세요.'
            : '이미지 크기 확인 중…'}
        </p>
      )}

      {overlayItems.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {overlayItems.map((item, i) => {
            const color = INGREDIENT_OVERLAY_COLORS[i % INGREDIENT_OVERLAY_COLORS.length];
            const active = selectedKey === item.key;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => setSelectedKey(active ? null : item.key)}
                className={`text-xs px-2.5 py-1 rounded-full border transition-all active:scale-95 ${
                  active ? 'font-bold text-white border-transparent' : 'bg-white text-gray-700 border-gray-200'
                }`}
                style={active ? { backgroundColor: color, borderColor: color } : undefined}
              >
                <span
                  className="inline-block w-1.5 h-1.5 rounded-full mr-1 align-middle"
                  style={{ backgroundColor: active ? '#fff' : color }}
                />
                {item.name}
                {item.calories != null && (
                  <span className="opacity-70 ml-1">{item.calories}kcal</span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
