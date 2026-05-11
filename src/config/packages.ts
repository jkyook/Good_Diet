// 충전 패키지 정의 — 서버(api/cal/charge/payment/init.ts) + 클라(CalChargeModal.tsx) 공유.
// 클라 입력은 packageId만 받고, 가격/cal 수량은 서버 정의를 사용 (위변조 방지).

export const CAL_PACKAGES = [
  { id: 'small',  cal: 10,  krw: 500,   bonus: 0,  badge: null },
  { id: 'medium', cal: 55,  krw: 2500,  bonus: 5,  badge: '인기' as const },
  { id: 'large',  cal: 115, krw: 5000,  bonus: 15, badge: '+15%' as const },
  { id: 'jumbo',  cal: 240, krw: 10000, bonus: 40, badge: '+20%' as const },
] as const;

export type CalPackage = (typeof CAL_PACKAGES)[number];
export type CalPackageId = CalPackage['id'];

export function findPackage(id: string): CalPackage | undefined {
  return CAL_PACKAGES.find(p => p.id === id);
}

// @deprecated T-061 RPC에서 free 한도 분기 폐기 — 모든 분석 = 1 cal.
//   자정 KST 자동 충전(min 3 cal floor)으로 정책 대체. 호환성 위해 상수 자체는 유지.
export const FREE_DAILY_LIMIT = 3;

// 광고 1회 보상 cal 수량
export const AD_REWARD_CAL = 1;
