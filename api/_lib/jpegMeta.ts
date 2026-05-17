/** JPEG 바이너리에서 SOF 마커로 width/height 추출 (서버 검증용) */

export function getJpegSizeFromBase64(imageData: string): { width: number; height: number } | null {
  const b64 = imageData.includes(',') ? imageData.split(',', 2)[1] ?? '' : imageData;
  if (!b64) return null;
  let buf: Buffer;
  try {
    buf = Buffer.from(b64, 'base64');
  } catch {
    return null;
  }
  return getJpegSizeFromBuffer(buf);
}

export function getJpegSizeFromBuffer(buf: Buffer): { width: number; height: number } | null {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return null;

  let i = 2;
  while (i < buf.length - 8) {
    if (buf[i] !== 0xff) {
      i++;
      continue;
    }
    const marker = buf[i + 1];
    if (marker === 0xd8) {
      i += 2;
      continue;
    }
    const len = buf.readUInt16BE(i + 2);
    // SOF0, SOF1, SOF2, SOF3, SOF5, SOF6, SOF7, SOF9, SOF10, SOF11, SOF13, SOF14, SOF15
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      const height = buf.readUInt16BE(i + 5);
      const width = buf.readUInt16BE(i + 7);
      if (width > 0 && height > 0) return { width, height };
    }
    i += 2 + len;
  }
  return null;
}

export function dimensionsMatch(
  claimed: { width: number; height: number },
  actual: { width: number; height: number },
  tolerancePx = 2,
): boolean {
  return Math.abs(claimed.width - actual.width) <= tolerancePx
    && Math.abs(claimed.height - actual.height) <= tolerancePx;
}
