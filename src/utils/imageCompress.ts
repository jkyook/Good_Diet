// 클라이언트 측 이미지 리사이즈/JPEG 재인코딩.
// Vercel 서버리스 본문 ~4.5MB 한도 + AI 프로바이더 6MB 한도 회피 목적.
// canvas → toBlob/toDataURL 변환, 원본보다 작아질 때만 교체.

export interface CompressOptions {
  maxDim?: number;     // 가로/세로 중 큰 쪽 상한 (px)
  quality?: number;    // JPEG 품질 0~1
}

const DEFAULT_MAX_DIM = 1280;
const DEFAULT_QUALITY = 0.7;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('이미지 로드 실패'));
    img.src = src;
  });
}

function drawToCanvas(img: HTMLImageElement, maxDim: number): HTMLCanvasElement {
  const ratio = Math.min(maxDim / img.width, maxDim / img.height, 1);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.width * ratio);
  canvas.height = Math.round(img.height * ratio);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas 2d context 획득 실패');
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => blob ? resolve(blob) : reject(new Error('canvas.toBlob 실패')),
      'image/jpeg',
      quality,
    );
  });
}

// base64/dataUrl의 디코딩 후 바이트 수 추정 (validate.ts와 동일 산식)
function estimateBase64Bytes(input: string): number {
  if (!input) return 0;
  const b64 = input.includes(',') ? input.split(',', 2)[1] ?? '' : input;
  const padding = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0;
  return Math.floor((b64.length * 3) / 4) - padding;
}

/**
 * File → 압축된 File. 원본보다 작아질 때만 교체, 아니면 원본 반환.
 * HEIC/PNG/WebP 입력도 JPEG로 변환 (EXIF는 손실).
 */
export async function compressImage(file: File, opts?: CompressOptions): Promise<File> {
  const maxDim = opts?.maxDim ?? DEFAULT_MAX_DIM;
  const quality = opts?.quality ?? DEFAULT_QUALITY;

  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await loadImage(objectUrl);
    const canvas = drawToCanvas(img, maxDim);
    const blob = await canvasToBlob(canvas, quality);
    if (blob.size >= file.size) return file;
    const baseName = file.name.replace(/\.[^.]+$/, '');
    return new File([blob], `${baseName}.compressed.jpg`, { type: 'image/jpeg', lastModified: Date.now() });
  } catch {
    return file;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

/**
 * data URL → 압축된 data URL. 원본보다 작아질 때만 교체, 아니면 원본 반환.
 * BatchAnalyzer 경로(cameraService가 dataUrl 반환) 전용.
 */
export async function compressDataUrl(dataUrl: string, opts?: CompressOptions): Promise<string> {
  const maxDim = opts?.maxDim ?? DEFAULT_MAX_DIM;
  const quality = opts?.quality ?? DEFAULT_QUALITY;

  try {
    const img = await loadImage(dataUrl);
    const canvas = drawToCanvas(img, maxDim);
    const compressed = canvas.toDataURL('image/jpeg', quality);
    return estimateBase64Bytes(compressed) < estimateBase64Bytes(dataUrl) ? compressed : dataUrl;
  } catch {
    return dataUrl;
  }
}

/**
 * File → data URL 변환 헬퍼 (호출처 단순화용).
 */
export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('FileReader 실패'));
    reader.readAsDataURL(file);
  });
}
