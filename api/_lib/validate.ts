// 입력 크기 검증 헬퍼.
// AI 프로바이더 페이로드 한도 + Vercel 함수 메모리 보호 목적.

export const MAX_IMAGE_BYTES = 6 * 1024 * 1024; // 6 MB (decoded)

/**
 * data URL 또는 raw base64 문자열의 디코딩 후 바이트 크기를 추정한다.
 * base64 4 chars → 3 bytes 이며 padding(=) 보정.
 */
export function estimateBase64Bytes(input: string): number {
  if (!input) return 0;
  const b64 = input.includes(',') ? input.split(',', 2)[1] ?? '' : input;
  const padding = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0;
  return Math.floor((b64.length * 3) / 4) - padding;
}

export interface ImageValidationError {
  status: number;
  error: string;
}

export function validateImage(input: string | undefined): ImageValidationError | null {
  if (!input) return { status: 400, error: 'imageData 가 비어있습니다.' };
  const size = estimateBase64Bytes(input);
  if (size === 0) return { status: 400, error: 'imageData 디코딩 실패.' };
  if (size > MAX_IMAGE_BYTES) {
    return {
      status: 413,
      error: `이미지가 너무 큽니다 (${(size / 1024 / 1024).toFixed(2)}MB > ${MAX_IMAGE_BYTES / 1024 / 1024}MB 한도).`,
    };
  }
  return null;
}
