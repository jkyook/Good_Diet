import { Camera, CameraResultType, CameraSource, GalleryPhoto } from '@capacitor/camera';

export interface PickedImage {
  dataUrl: string;     // base64 data URL
  webPath: string;
}

// 갤러리에서 단일 사진 선택
export async function pickFromGallery(): Promise<PickedImage | null> {
  try {
    const photo = await Camera.getPhoto({
      quality: 85,
      resultType: CameraResultType.DataUrl,
      source: CameraSource.Photos,
      correctOrientation: true,
    });
    if (!photo.dataUrl) return null;
    return { dataUrl: photo.dataUrl, webPath: photo.webPath ?? '' };
  } catch (err) {
    // 사용자 취소 시 null 반환
    if (String(err).includes('cancelled') || String(err).includes('canceled')) return null;
    throw err;
  }
}

// 카메라로 촬영
export async function takePhoto(): Promise<PickedImage | null> {
  try {
    const photo = await Camera.getPhoto({
      quality: 85,
      resultType: CameraResultType.DataUrl,
      source: CameraSource.Camera,
      correctOrientation: true,
    });
    if (!photo.dataUrl) return null;
    return { dataUrl: photo.dataUrl, webPath: photo.webPath ?? '' };
  } catch (err) {
    if (String(err).includes('cancelled') || String(err).includes('canceled')) return null;
    throw err;
  }
}

// 갤러리에서 다중 선택 (Capacitor Camera.pickImages)
export async function pickMultipleFromGallery(): Promise<PickedImage[]> {
  try {
    const result = await Camera.pickImages({
      quality: 85,
      limit: 10,
    });
    return await Promise.all(
      result.photos.map(async (p: GalleryPhoto) => {
        const dataUrl = await galleryPhotoToDataUrl(p);
        return { dataUrl, webPath: p.webPath ?? '' };
      }),
    );
  } catch (err) {
    if (String(err).includes('cancelled') || String(err).includes('canceled')) return [];
    throw err;
  }
}

async function galleryPhotoToDataUrl(photo: GalleryPhoto): Promise<string> {
  // 웹 환경에서는 fetch로 변환, 네이티브에서는 Filesystem 사용
  if (photo.webPath) {
    const res = await fetch(photo.webPath);
    const blob = await res.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }
  return '';
}

// 웹 환경용 파일 input 기반 다중 선택 (Capacitor 미지원 브라우저 fallback)
export function pickMultipleFromInput(): Promise<PickedImage[]> {
  return new Promise(resolve => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.multiple = true;
    input.onchange = async () => {
      const files = Array.from(input.files ?? []);
      const images = await Promise.all(
        files.map(f => new Promise<PickedImage>((res, rej) => {
          const reader = new FileReader();
          reader.onload = () => res({ dataUrl: reader.result as string, webPath: '' });
          reader.onerror = rej;
          reader.readAsDataURL(f);
        })),
      );
      resolve(images);
    };
    input.oncancel = () => resolve([]);
    input.click();
  });
}
