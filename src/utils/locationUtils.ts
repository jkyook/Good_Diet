/**
 * 현재 위치를 동(洞) 단위 문자열로 반환.
 * Nominatim(OpenStreetMap) 무료 reverse geocoding 사용.
 * 권한 거부·타임아웃·네트워크 오류 시 null 반환 (non-blocking).
 */
export async function getCurrentDong(): Promise<string | null> {
  return new Promise<string | null>((resolve) => {
    if (!navigator?.geolocation) { resolve(null); return; }

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const { latitude, longitude } = pos.coords;
          const resp = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json&accept-language=ko`,
            { headers: { 'User-Agent': 'GoodDietApp/1.0' }, signal: AbortSignal.timeout(6000) },
          );
          if (!resp.ok) { resolve(null); return; }
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const data: any = await resp.json();
          const addr = data?.address ?? {};
          // 한국 행정구역: suburb(동) > quarter > neighbourhood > village > town > county
          const dong: string | undefined =
            addr.suburb ?? addr.quarter ?? addr.neighbourhood ??
            addr.village ?? addr.town ?? addr.city_district ?? addr.county;
          resolve(dong ?? null);
        } catch {
          resolve(null);
        }
      },
      () => resolve(null),
      { timeout: 7000, enableHighAccuracy: false },
    );
  });
}
