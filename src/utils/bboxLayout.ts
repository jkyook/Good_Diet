/** Gemini/Vertex 표준: [ymin, xmin, ymax, xmax], 각 축 0~1000 정규화 (원본 이미지 전체 기준) */
export type NormalizedBBox = [number, number, number, number];

/** object-fit 렌더링 시 이미지가 실제로 그려지는 영역 (contain/cover 공통) */
export interface ImageFitLayout {
  containerWidth: number;
  containerHeight: number;
  offsetX: number;
  offsetY: number;
  displayWidth: number;
  displayHeight: number;
  naturalWidth: number;
  naturalHeight: number;
}

export type CoverLayout = ImageFitLayout;

export interface PercentRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** object-contain: 원본 비율 유지, 잘림 없음 — bbox와 1:1 매핑에 적합 */
export function computeObjectContainLayout(
  containerW: number,
  containerH: number,
  naturalW: number,
  naturalH: number,
): ImageFitLayout {
  const scale = Math.min(containerW / naturalW, containerH / naturalH);
  const displayWidth = naturalW * scale;
  const displayHeight = naturalH * scale;
  return {
    containerWidth: containerW,
    containerHeight: containerH,
    offsetX: (containerW - displayWidth) / 2,
    offsetY: (containerH - displayHeight) / 2,
    displayWidth,
    displayHeight,
    naturalWidth: naturalW,
    naturalHeight: naturalH,
  };
}

/** @deprecated 오버레이는 contain 사용 권장 */
export function computeObjectCoverLayout(
  containerW: number,
  containerH: number,
  naturalW: number,
  naturalH: number,
): ImageFitLayout {
  const scale = Math.max(containerW / naturalW, containerH / naturalH);
  const displayWidth = naturalW * scale;
  const displayHeight = naturalH * scale;
  return {
    containerWidth: containerW,
    containerHeight: containerH,
    offsetX: (containerW - displayWidth) / 2,
    offsetY: (containerH - displayHeight) / 2,
    displayWidth,
    displayHeight,
    naturalWidth: naturalW,
    naturalHeight: naturalH,
  };
}

/**
 * 정규화 bbox → 컨테이너 % 좌표.
 * layout은 measure 시점의 naturalWidth/Height와 동일한 이미지 기준이어야 함.
 */
export function bboxToPercentRect(region: NormalizedBBox, layout: ImageFitLayout): PercentRect {
  const [ymin, xmin, ymax, xmax] = region;
  const leftPx = layout.offsetX + (xmin / 1000) * layout.displayWidth;
  const topPx = layout.offsetY + (ymin / 1000) * layout.displayHeight;
  const rightPx = layout.offsetX + (xmax / 1000) * layout.displayWidth;
  const bottomPx = layout.offsetY + (ymax / 1000) * layout.displayHeight;
  return {
    left: (leftPx / layout.containerWidth) * 100,
    top: (topPx / layout.containerHeight) * 100,
    width: ((rightPx - leftPx) / layout.containerWidth) * 100,
    height: ((bottomPx - topPx) / layout.containerHeight) * 100,
  };
}

/** 디버그: bbox가 이미지 안에 있는지 검증 */
export function validateBboxAlignment(
  region: NormalizedBBox,
  layout: ImageFitLayout,
): { ok: boolean; issues: string[] } {
  const rect = bboxToPercentRect(region, layout);
  const issues: string[] = [];
  if (rect.left < -0.5 || rect.top < -0.5) issues.push('박스가 화면 밖(좌/상)으로 벗어남');
  if (rect.left + rect.width > 100.5 || rect.top + rect.height > 100.5) {
    issues.push('박스가 화면 밖(우/하)으로 벗어남');
  }
  if (rect.width < 2 || rect.height < 2) issues.push('박스가 너무 작음');
  if (rect.width > 95 && rect.height > 95) issues.push('박스가 거의 전체 화면');
  return { ok: issues.length === 0, issues };
}

export function sanitizeBBox(region: NormalizedBBox, minSpan = 20): NormalizedBBox {
  let [y0, x0, y1, x1] = region;
  const expand = (a: number, b: number, min: number) => {
    if (b - a >= min) return [a, b] as const;
    const c = (a + b) / 2;
    const half = min / 2;
    return [Math.max(0, c - half), Math.min(1000, c + half)] as const;
  };
  [y0, y1] = expand(y0, y1, minSpan);
  [x0, x1] = expand(x0, x1, minSpan);
  return [
    Math.round(y0),
    Math.round(x0),
    Math.round(y1),
    Math.round(x1),
  ];
}

export function parseNormalizedBBox(value: unknown): NormalizedBBox | undefined {
  let nums: number[];

  if (Array.isArray(value) && value.length === 4) {
    nums = value.map(v => Number(v));
  } else if (value && typeof value === 'object') {
    const o = value as Record<string, unknown>;
    const y0 = o.ymin ?? o.y_min ?? o.top;
    const x0 = o.xmin ?? o.x_min ?? o.left;
    const y1 = o.ymax ?? o.y_max ?? o.bottom;
    const x1 = o.xmax ?? o.x_max ?? o.right;
    nums = [y0, x0, y1, x1].map(v => Number(v));
  } else {
    return undefined;
  }

  if (nums.some(n => !Number.isFinite(n))) return undefined;

  let [y0, x0, y1, x1] = nums;
  if (nums.every(n => n >= 0 && n <= 1)) {
    y0 *= 1000;
    x0 *= 1000;
    y1 *= 1000;
    x1 *= 1000;
  }

  const clamp = (n: number) => Math.max(0, Math.min(1000, Math.round(n)));
  y0 = clamp(y0);
  x0 = clamp(x0);
  y1 = clamp(y1);
  x1 = clamp(x1);

  if (y1 <= y0 || x1 <= x0) return undefined;
  return sanitizeBBox([y0, x0, y1, x1]);
}

export const INGREDIENT_OVERLAY_COLORS = [
  '#10b981',
  '#f59e0b',
  '#3b82f6',
  '#ec4899',
  '#8b5cf6',
  '#14b8a6',
  '#f97316',
  '#6366f1',
  '#0ea5e9',
  '#a855f7',
] as const;
