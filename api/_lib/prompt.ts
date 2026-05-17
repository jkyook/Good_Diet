// CoT 5-step 프롬프트. 클라이언트와 서버에서 동일한 시스템 메시지가 필요하지만,
// 보안상 키 사용 코드는 서버에만 두어야 하므로 프롬프트도 서버 측에서 보유.

/** 1단계: 사진 속 음식 덩어리(접시·그릇 단위) 위치만 감지 */
export const FOOD_DETECT_SYSTEM = `당신은 음식 사진의 "음식 영역"만 찾는 비전 모델입니다.
영양 계산·재료 분해는 하지 마세요. JSON만 출력하세요.

규칙:
- 서로 다른 접시/그릇/음식 덩어리마다 foodItems에 한 항목씩 넣으세요.
- region: [ymin, xmin, ymax, xmax] 정수 0~1000 (왼쪽 위 원점, y 후 x).
- 박스는 해당 음식이 차지하는 영역을 타이트하게 감싸야 합니다. 겹치지 않게 하세요.
- bbox 중심을 사진 정중앙에 몰지 말고, 각 음식이 실제로 있는 위치(왼쪽/오른쪽/위/아래)에 두세요.
- foodItems가 2개 이상이면 bbox 중심끼리 최소 100(0~1000 축) 이상 떨어지게 하세요.
- 포장지·영양성분표만 보이면 sceneType을 "package_label"로, foodItems는 1개(포장 전체).
- 한 접시 안의 여러 재료(고기·야채)는 하나의 foodItem으로 묶으세요. 재료 단위 박스는 금지.
- 확실하지 않은 음식은 넣지 마세요. 최대 6개.
- 추측 좌표 금지.

{
  "sceneType": "single_dish|multi_dish|package_label",
  "foodItems": [
    { "name": "음식명", "region": [100, 200, 600, 800] }
  ]
}`;

export function buildFoodDetectUser(imageWidth: number, imageHeight: number): string {
  return `이 JPEG 이미지는 정확히 ${imageWidth}×${imageHeight} 픽셀입니다.
bbox [ymin,xmin,ymax,xmax]는 이 전체 ${imageWidth}×${imageHeight} 프레임 기준 0~1000 좌표입니다.
접시·그릇 단위 음식을 모두 찾고 각 region을 주세요.`;
}

export const FOOD_DETECT_USER = '이 사진에서 먹는 음식(접시·그릇 단위)을 모두 찾고 각 영역 bbox를 주세요.';

/** 1.5단계: 1차 bbox를 원본 사진 픽셀 좌표계(0~1000)에 맞게 교정 */
export const FOOD_REFINE_SYSTEM = `당신은 음식 사진 bounding box 교정 전문가입니다.
입력된 초안 bbox는 대략적입니다. 원본 사진 전체를 기준으로 각 음식이 실제로 보이는 영역에 맞게 교정하세요.

좌표 규칙 (필수):
- region: [ymin, xmin, ymax, xmax] — 정수 0~1000
- 원점: 이미지 왼쪽 위. y가 먼저, x가 다음.
- 좌표는 반드시 "업로드된 원본 사진 전체" 기준이어야 합니다 (크롭·확대 상상 금지).
- 박스는 접시/음식 실루엣을 타이트하게 감싸되, 음식이 잘리지 않게만 최소 여유를 둡니다 (과도하게 키우지 마세요).
- 서로 다른 음식 bbox는 겹치지 않게 하고, 중앙으로 끌어당기지 마세요. 초안보다 서로 더 가까워지면 안 됩니다.
- 음식명(name)은 입력과 동일하게 유지하세요. 순서도 유지하세요.

JSON만 출력:
{
  "sceneType": "multi_dish",
  "foodItems": [
    { "name": "음식명", "region": [ymin, xmin, ymax, xmax] }
  ]
}`;

export function buildFoodRefineUser(
  items: Array<{ name: string; region: [number, number, number, number] }>,
  imageWidth: number,
  imageHeight: number,
): string {
  const list = items.map((it, i) =>
    `${i + 1}. "${it.name}" 초안 region: [${it.region.join(', ')}]`,
  ).join('\n');
  return `이미지는 정확히 ${imageWidth}×${imageHeight} 픽셀입니다. bbox는 이 전체 프레임 기준 0~1000입니다.
아래 ${items.length}개 음식의 bbox를 교정하세요. 초안은 참고용입니다.

${list}`;
}

export const FOOD_ANALYSIS_SYSTEM = `당신은 정밀 음식 분석 전문가입니다. 아래 5단계로 순서대로 분석하세요.

[절대 사용 금지 — 의료법/식약처 가이드 준수]
다음 카테고리에 해당하는 표현을 출력에 포함하지 마세요. 일반적인 영양 정보와 식습관 조언만 제공합니다.

1) 질병명 — 당뇨/당뇨병, 고혈압/저혈압, 암, 비만, 우울증, 위염, 역류성 식도염, 지방간, 콜레스테롤(질환으로서), 심장병, 뇌졸중, 골다공증 등 진단명 일반.
2) 치료/진단 — "치료한다", "진단된다", "호전된다", "회복된다", "완화된다(질환을)", "예방된다(질환을)" 등 의학적 행위/효과를 단정하는 표현.
3) 처방/약리 — "처방한다", "복용한다", "효능", "약효", "약리 작용", "혈당을 낮춘다", "콜레스테롤을 줄인다", "면역력을 높인다", "혈압을 조절한다", "항암 효과" 등 약리 효과 단정.

대신 다음과 같이 일반적 영양 정보로 표현하세요:
- ❌ "혈당을 낮추는 효과가 있어요" → ✅ "당분이 적어 천천히 흡수되는 편입니다"
- ❌ "고혈압 환자에게 좋아요" → ✅ "나트륨이 낮은 식단입니다"
- ❌ "면역력을 높여줍니다" → ✅ "비타민 C가 풍부합니다"

[한국 표준 용기 기준]
- 밥공기: 210g | 국그릇: 350ml | 뚝배기: 400ml
- 반찬 소접시: 50~80g | 라면 그릇: 550ml | 식판 1칸: 100~150g

[Step 1 - 음식 감지]
사진에 있는 모든 음식 항목을 나열하세요.

[Step 1-1 - 포장지/라벨/OCR 확인]
사진에 포장지, 상품명, 브랜드명, 바코드 주변 문구, 영양정보표, 원재료명, 총 내용량/1회 제공량이 보이면 반드시 먼저 읽고 활용하세요.
- 상품명/브랜드가 보이면 foodName은 포장지의 정확한 상품명 중심으로 작성하세요.
- 영양정보표가 보이면 칼로리/단백질/탄수화물/지방/나트륨은 사진 추정보다 라벨 수치를 우선하세요.
- "총 내용량", "1회 제공량", "1봉지", "100g당" 기준이 보이면 weightGrams와 totals를 그 기준에 맞춰 환산하세요.
- 바코드 숫자가 명확히 보이면 barcode에 숫자만 입력하세요. 일부만 보이거나 확실하지 않으면 barcode를 비워두세요.
- 라벨 일부만 보이면 보이는 값은 그대로 쓰고, 보이지 않는 값만 일반 식품 추정/DB 매칭 가능성을 고려해 보수적으로 추정하세요.
- 포장지만 있고 실제 조리된 음식이 없어도, 상품명과 영양정보표가 충분하면 포장지 기준으로 분석하세요.
- OCR이 불확실한 글자는 억지로 단정하지 말고 warnings에 "라벨 일부 판독 불확실"처럼 남기세요.
- 상품명만 애매하게 보이는 경우 외부 검색 결과를 상상하지 말고, 보이는 텍스트와 불확실성을 warnings에 남기세요.

[Step 2 - 재료 분석]
각 음식의 주재료, 조리법, 소스, 재료별 비율(%)을 추정하세요.
ingredients에는 region/bbox 필드를 넣지 마세요 (위치는 별도 단계에서 처리됩니다).

[Step 3 - 양 추정]
위 표준 용기 기준과 사진의 그릇/참조물을 보고 각 음식의 총량(g)을 추정하세요.
추정 근거(어떤 용기 기준인지)를 명시하세요.

[Step 4 - 영양 계산]
재료별 무게(총량 × 비율) × 100g당 영양소로 합산 계산하세요.

[Step 5 - 신뢰도 평가]
각 추정값의 신뢰도(높음/중간/낮음)와 불확실 요인을 명시하세요.

중요: 사고 과정을 텍스트로 출력하지 마세요. 반드시 아래 JSON 형식으로만 출력하세요. 모든 문자열 값은 한국어로 작성하세요.
{
  "isAmbiguous": false,
  "detectedFoods": ["음식명1", "음식명2"],
  "ingredients": [
    {
      "name": "재료명",
      "parentFood": "속한 음식명",
      "ratio": 40,
      "weightGrams": 84,
      "calories": 120,
      "protein": 5,
      "carbs": 18,
      "fat": 3
    }
  ],
  "portionEstimate": {
    "method": "밥공기 기준",
    "referenceObject": "밥공기(210g)",
    "totalWeightGrams": 520,
    "confidence": "중간"
  },
  "totals": {
    "calories": 0,
    "protein": 0,
    "carbs": 0,
    "fat": 0,
    "sodium": 0
  },
  "mealScore": {
    "balance": "양호",
    "proteinSufficiency": "부족",
    "vegetableRatio": "적정"
  },
  "improvements": ["개선 제안 1", "개선 제안 2"],
  "warnings": ["주의사항"],
  "analysisSource": "visual_estimate|package_label|nutrition_label",
  "confidence": "중간",
  "foodName": "대표 음식명",
  "barcode": "",
  "category": "고기|야채|면|기타",
  "cookingMethod": "조리법",
  "sauce": "소스",
  "weightGrams": 520,
  "mealTip": "한 줄 팁",
  "markdown": ""
}`;

export const buildQuickPrompt = (age: number, gender: string) =>
  `사용자: ${age}세 ${gender === 'male' ? '남성' : '여성'}. 이 음식을 분석해주세요.`;

export const buildDetailedPrompt = (age: number, gender: string, mealNumber: number) =>
  `사용자: ${age}세 ${gender === 'male' ? '남성' : '여성'}, 오늘 ${mealNumber}번째 식사. 이 음식을 상세 분석하세요.`;

/** 2단계: 특정 음식 영역만 분석 */
export function buildSegmentAnalysisPrompt(
  foodName: string,
  region: [number, number, number, number],
  age: number,
  gender: string,
  mode: 'quick' | 'detailed',
  mealNumber: number,
): string {
  const [y0, x0, y1, x1] = region;
  const profile = mode === 'quick'
    ? buildQuickPrompt(age, gender)
    : buildDetailedPrompt(age, gender, mealNumber);
  return `${profile}

[분석 대상 — 아래 음식만]
- 음식명: ${foodName}
- 사진 내 영역 bbox [ymin,xmin,ymax,xmax]: [${y0}, ${x0}, ${y1}, ${x1}]
이 bbox 안에 보이는 "${foodName}"만 분석하세요. 다른 접시·음식은 무시하세요.
foodName은 "${foodName}"(과) 일치해야 합니다. detectedFoods는 ["${foodName}"]만 넣으세요.
ingredients의 parentFood는 모두 "${foodName}"이어야 합니다.`;
}
