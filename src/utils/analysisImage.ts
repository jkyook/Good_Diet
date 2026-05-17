/**
 * 분석·표시·AI bbox 좌표가 동일한 픽셀 그리드를 쓰도록 이미지를 한 번만 정규화합니다.
 * (0단계) 원본 → 분석용 JPEG + width/height 고정 → 이후 모든 단계는 이 이미지만 사용
 */

export const ANALYSIS_MAX_EDGE = 1024;
export const ANALYSIS_JPEG_QUALITY = 0.88;

export interface AnalysisImage {
  dataUrl: string;
  width: number;
  height: number;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('이미지 로드 실패'));
    img.src = src;
  });
}

function drawNormalizedCanvas(img: HTMLImageElement, maxEdge: number): HTMLCanvasElement {
  const scale = Math.min(maxEdge / img.naturalWidth, maxEdge / img.naturalHeight, 1);
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas 2d context 획득 실패');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);
  return canvas;
}

/**
 * File 또는 data URL → 분석·저장·오버레이에 쓸 단일 이미지.
 * aspect ratio는 원본 유지, 긴 변만 maxEdge로 제한.
 */
export async function normalizeForAnalysis(
  source: File | string,
  opts?: { maxEdge?: number; quality?: number },
): Promise<AnalysisImage> {
  const maxEdge = opts?.maxEdge ?? ANALYSIS_MAX_EDGE;
  const quality = opts?.quality ?? ANALYSIS_JPEG_QUALITY;

  const src = typeof source === 'string'
    ? source
    : await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error('FileReader 실패'));
        reader.readAsDataURL(source);
      });

  const img = await loadImage(src);
  const canvas = drawNormalizedCanvas(img, maxEdge);
  const dataUrl = canvas.toDataURL('image/jpeg', quality);

  return {
    dataUrl,
    width: canvas.width,
    height: canvas.height,
  };
}

/** bbox 0~1000 → 컨테이너 % (이미지와 컨테이너 비율이 동일할 때만 사용) */
export function bboxToPercentDirect(region: [number, number, number, number]) {
  const [ymin, xmin, ymax, xmax] = region;
  return {
    left: xmin / 10,
    top: ymin / 10,
    width: (xmax - xmin) / 10,
    height: (ymax - ymin) / 10,
  };
}
