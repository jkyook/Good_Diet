import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export interface AnalysisResult {
  date: string;
  foodName: string;
  calories: number;
  markdown: string;
}

export const analyzeFood = async (
  imageData: string,
  age: number,
  gender: 'male' | 'female',
  existingMealsCount: number = 0
): Promise<AnalysisResult> => {
  const prompt = `
당신은 최고의 AI 영양사 및 운동 전문가입니다. 제공된 음식 사진을 분석하여 사용자의 나이(${age}세)와 성별(${gender === 'male' ? '남성' : '여성'})에 적격한지 분석해주세요.
이번이 오늘 ${existingMealsCount + 1}번째 식사 분석입니다.

다음 형식을 엄격히 지켜서 Markdown으로 작성해주세요:

# [음식 이름] 분석 리포트

## 1. 영양 성분 요약
* **추정 칼로리**: [숫자] kcal (반드시 'kcal' 앞에 숫자만 기입)
* **주요 영양소**: 탄수화물, 단백질, 지방량 추정치

## 2. 나이/성별 적합도 및 문제점
[연령과 성별을 고려한 구체적인 분석 및 주의사항]

## 3. 추천 곁들임 음식
[이 음식과 함께 먹으면 영양 균형이 좋아질 수 있는 음식 추천]

## 4. 추천 운동
[이 식사의 칼로리를 소모하거나 영양 흡수를 돕기 위한 구체적인 운동 추천]

마지막 줄에 다음 형식으로 데이터를 포함해주세요 (사용자에게는 보이지 않게):
---DATA:{"calories": [숫자], "foodName": "[음식명이름]"}---
`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [
        {
          parts: [
            { text: prompt },
            {
              inlineData: {
                mimeType: "image/jpeg",
                data: imageData.split(",")[1] || imageData,
              },
            },
          ],
        },
      ],
    });

    const text = response.text || "";
    
    // Extract structured data from the tag
    const dataMatch = text.match(/---DATA:({.*})---/);
    let extractedData = { calories: 0, foodName: "알 수 없는 음식" };
    if (dataMatch) {
      try {
        extractedData = JSON.parse(dataMatch[1]);
      } catch (e) {
        console.error("JSON parse error", e);
      }
    }

    return {
      date: new Date().toISOString(),
      foodName: extractedData.foodName,
      calories: extractedData.calories,
      markdown: text.replace(/---DATA:({.*})---/, "").trim(),
    };
  } catch (error) {
    console.error("Gemini Analysis Error:", error);
    throw new Error("음식 분석 중 오류가 발생했습니다.");
  }
};
