# 외식 프랜차이즈 메뉴 데이터

> 일반 식품 import는 `scripts/import_foods.ts` 사용 (헤더 주석에 csv/xlsx/jsonl 예시).
> 예: `npm run import:foods -- ./data/foods/20260429_가공식품_277074건.xlsx mfds_processed`


T-069 식품 매칭 시스템 — 외식 프랜차이즈 메뉴 영양정보 수동 입력.

## 입력 형식

각 브랜드 한 JSON 파일. `FranchiseItem` 배열.

```json
[
  {
    "brand": "스타벅스",
    "name": "아메리카노 (Tall)",
    "source_id": "starbucks-americano-tall",
    "category": "음료",
    "serving_grams": 355,
    "calories": 10,
    "protein": 0.6,
    "carbs": 0,
    "fat": 0,
    "sodium": 5,
    "url": "https://www.starbucks.co.kr/menu/..."
  }
]
```

## 데이터 출처

각 브랜드의 **영양정보 공식 공개 페이지** (사실 정보 추출, 한국 저작권법 §35-5
정보분석 면책). 출처 URL은 `url` 필드에 보존하고 UI footer에 "데이터 출처:
공공데이터포털 + 외식 프랜차이즈 사이트"로 표기.

## 권장 브랜드 (T-069c Phase 1 — 5~10개)

| 브랜드 | 영양정보 URL (참고, 변경 가능) |
|---|---|
| 스타벅스 | https://www.starbucks.co.kr/menu/drink_list.do |
| 메가커피 | https://www.mega-mgccoffee.com/menu/ |
| 맥도날드 | https://www.mcdonalds.co.kr/kor/menu/nutrition.do |
| 버거킹 | https://www.burgerking.co.kr/menu/nutrition |
| 김밥천국 | (공식 영양표 별도 확인) |
| BBQ | https://www.bbq.co.kr/menu/menuList.asp |
| 교촌치킨 | https://www.kyochon.com/menu/ |
| 도미노피자 | https://www.dominos.co.kr/menu/ |
| 피자헛 | https://www.pizzahut.co.kr/menu/ |

## 적재 절차

1. 브랜드별 JSON 파일을 `./data/franchise/<brand>.json`로 저장
2. `.env`에 `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` 설정
3. `npm run import:franchise -- ./data/franchise/starbucks.json`
4. Supabase에서 `SELECT * FROM foods WHERE source='franchise' LIMIT 5;`로 검증

## 자동 크롤러 (후속)

본 Phase 1은 **수동 JSON 입력**만 지원. 자동 크롤러는 사이트별 구조 분석 +
robots.txt 준수 + production 차단 대응이 별도 큰 작업이라 후속 티켓
(T-070, T-071 등 사이트별 분리) 권장.

크롤러 라이선스 가이드:
- 사실 정보만 추출 (영양 수치)
- robots.txt 준수
- rate limit 1초 이상
- IP 우회/CAPTCHA 회피 금지
- 사이트 변경 시 즉시 중단
