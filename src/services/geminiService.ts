import { GoogleGenAI } from '@google/genai';

export type AnalysisMode = 'quick' | 'detailed';

export interface AnalysisResult {
  date: string;
  foodName: string;
  calories: number;
  markdown: string;
  mode: AnalysisMode;
}

export interface StepEvent {
  type: 'step';
  index: number;
  detail: string;
}

export type StreamEvent =
  | StepEvent
  | { type: 'done'; result: AnalysisResult }
  | { type: 'error'; message: string };

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const buildQuickPrompt = (age: number, gender: string) => `
당신은 AI 영양사입니다. 음식 사진을 보고 핵심만 빠르게 분석해주세요. 답변은 간결하게 작성하세요.

# [음식명] 퀵 리뷰

## ⚡ 핵심 수치
* **칼로리**: [숫자] kcal
* **탄/단/지**: 탄수화물 [g] / 단백질 [g] / 지방 [g]
* **주의**: [나트륨 등 주요 주의사항 한 줄]

## ✅ ${age}세 ${gender === 'male' ? '남성' : '여성'} 한줄 평가
[한 문장으로 이 음식에 대한 평가]

## 💡 바로 실천 팁
[가장 중요한 실천 팁 한 가지]

마지막 줄에 다음 형식으로 데이터를 포함해주세요 (사용자에게는 절대 보이지 않게):
---DATA:{"calories": [숫자], "foodName": "[음식명]"}---
`;

const buildDetailedPrompt = (age: number, gender: string, mealNumber: number) => `
당신은 최고의 AI 영양사 및 운동 전문가입니다. 제공된 음식 사진을 분석하여 사용자의 나이(${age}세)와 성별(${gender === 'male' ? '남성' : '여성'})에 적격한지 분석해주세요.
이번이 오늘 ${mealNumber}번째 식사 분석입니다.

다음 항목들을 포함하여 Markdown 형식으로 작성해주세요:

# [음식 이름] 분석 리포트

## 📊 영양 성분 분석
* **추정 칼로리**: [숫자] kcal
* **탄수화물/단백질/지방**: [설명]
* **나트륨 및 기타**: [주의사항]

## 🎯 나이/성별 맞춤 평가
[${age}세 ${gender === 'male' ? '남성' : '여성'}에게 이 음식이 어떤 영향을 주는지, 권장 섭취량 대비 어떤지 상세 분석]

## 🥗 최고의 푸드 페어링 (곁들이면 좋을 음식)
[이 식단에 부족한 영양소를 채워주거나 소화를 도울 수 있는 구체적인 음식 2-3가지 추천]

## 🏃 추천 활동 및 운동
[이 식사의 칼로리를 효과적으로 연소하거나 대사를 돕기 위한 맞춤형 운동 제안. 예: '빠르게 걷기 30분']

## 💡 종합 개선 팁
[더 건강하게 먹기 위한 실천 가능한 한 줄 팁]

마지막 줄에 다음 형식으로 데이터를 포함해주세요 (사용자에게는 절대 보이지 않게):
---DATA:{"calories": [숫자], "foodName": "[음식명이름]"}---
`;

function parseResult(fullText: string, mode: AnalysisMode): AnalysisResult {
  const dataMatch = fullText.match(/---DATA:(\{.*?\})---/);
  let extractedData = { calories: 0, foodName: '알 수 없는 음식' };
  if (dataMatch) {
    try { extractedData = JSON.parse(dataMatch[1]); } catch { /* keep defaults */ }
  }
  return {
    date: new Date().toISOString(),
    foodName: extractedData.foodName,
    calories: extractedData.calories,
    markdown: fullText.replace(/---DATA:(\{.*?\})---/, '').trim(),
    mode,
  };
}

export const analyzeFood = async (
  imageData: string,
  age: number,
  gender: 'male' | 'female',
  existingMealsCount: number = 0,
  mode: AnalysisMode = 'detailed',
  onEvent?: (event: StreamEvent) => void,
): Promise<AnalysisResult> => {
  const prompt = mode === 'quick'
    ? buildQuickPrompt(age, gender)
    : buildDetailedPrompt(age, gender, existingMealsCount + 1);

  const base64Data = imageData.split(',')[1] || imageData;

  try {
    // Step 0: connecting
    onEvent?.({ type: 'step', index: 0, detail: 'Gemini 2.0 Flash 연결 완료' });

    const stream = await ai.models.generateContentStream({
      model: 'gemini-2.0-flash',
      contents: [{
        parts: [
          { text: prompt },
          { inlineData: { mimeType: 'image/jpeg', data: base64Data } },
        ],
      }],
    });

    let fullText = '';
    let detectedStep = 0;

    for await (const chunk of stream) {
      const text = chunk.text ?? '';
      fullText += text;

      // Step 1: food name from heading
      if (detectedStep < 1) {
        const nameMatch = fullText.match(/^#\s+(.+?)(?:\s+분석 리포트|\s+퀵 리뷰)/m);
        if (nameMatch) {
          detectedStep = 1;
          onEvent?.({ type: 'step', index: 1, detail: `"${nameMatch[1].trim()}" 감지됨` });
        }
      }

      if (mode === 'detailed') {
        if (detectedStep < 2 && fullText.includes('## 📊')) {
          detectedStep = 2;
          onEvent?.({ type: 'step', index: 2, detail: '칼로리 · 탄수화물 · 단백질 · 지방 계산 중' });
        } else if (detectedStep < 3 && fullText.includes('## 🎯')) {
          detectedStep = 3;
          onEvent?.({ type: 'step', index: 3, detail: `${age}세 ${gender === 'male' ? '남성' : '여성'} 기준 평가 작성 중` });
        } else if (detectedStep < 4 && (fullText.includes('## 🥗') || fullText.includes('## 🏃'))) {
          detectedStep = 4;
          onEvent?.({ type: 'step', index: 4, detail: '맞춤 운동 · 페어링 추천 생성 중' });
        }
      } else {
        if (detectedStep < 2 && (fullText.includes('## ⚡') || fullText.includes('---DATA'))) {
          detectedStep = 2;
          onEvent?.({ type: 'step', index: 2, detail: '칼로리 · 영양소 수치 산출 중' });
        }
      }
    }

    const lastStep = mode === 'quick' ? 2 : 5;
    onEvent?.({ type: 'step', index: lastStep, detail: '리포트 완성' });

    const result = parseResult(fullText, mode);
    onEvent?.({ type: 'done', result });
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : '음식 분석 중 오류가 발생했습니다.';
    onEvent?.({ type: 'error', message });
    throw new Error(message);
  }
};
