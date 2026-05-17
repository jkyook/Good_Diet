/**
 * 서버 0단계: 클라이언트가 보낸 이미지의 실제 픽셀 크기를 검증하고,
 * AI·bbox·클라이언트 표시가 동일 그리드(0~1000)를 쓰도록 메타를 확정합니다.
 */
import { getJpegSizeFromBase64, dimensionsMatch } from './jpegMeta.js';

export interface CanonicalImageMeta {
  imageData: string;
  width: number;
  height: number;
  verified: boolean;
}

export function canonicalizeImageInput(
  imageData: string,
  claimedWidth?: number,
  claimedHeight?: number,
): CanonicalImageMeta {
  const actual = getJpegSizeFromBase64(imageData);

  if (actual) {
    const verified = claimedWidth != null && claimedHeight != null
      ? dimensionsMatch({ width: claimedWidth, height: claimedHeight }, actual)
      : true;
    if (!verified) {
      console.warn(
        '[imageCanonical] 클라이언트 크기와 JPEG 실측 불일치 — 실측값 사용',
        { claimedWidth, claimedHeight, actual },
      );
    }
    return {
      imageData,
      width: actual.width,
      height: actual.height,
      verified,
    };
  }

  if (claimedWidth != null && claimedHeight != null && claimedWidth > 0 && claimedHeight > 0) {
    return {
      imageData,
      width: Math.round(claimedWidth),
      height: Math.round(claimedHeight),
      verified: false,
    };
  }

  throw new Error('이미지 크기를 확인할 수 없습니다. 다시 촬영해 주세요.');
}
