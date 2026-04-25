import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export interface AnalysisResult {
  foodName: string;
  nutrients: {
    calories: string;
    carbs: string;
    protein: string;
    fat: string;
  };
  score: number;
  suitability: string;
  problems: string[];
  suggestions: string[];
  detailedAnalysis: string;
}

export const analyzeFood = async (
  imageData: string,
  age: number,
  gender: 'male' | 'female'
): Promise<string> => {
  const prompt = `
당신은 최고의 영양사입니다. 제공된 음식 사진을 분석하여 사용자의 나이(${age}세)와 성별(${gender === 'male' ? '남성' : '여성'})에 적합한 식단인지 상세히 평가해주세요.

다음 항목들을 포함하여 분석 결과를 Markdown 형식으로 작성해주세요:
1. **음식 이름 및 특징**: 사진에 보이는 음식이 무엇인지 설명.
2. **나이/성별 적합도**: 해당 연령대와 성별의 영양 권장량(칼로리, 단백질 등)을 고려한 점수 (0-100점).
3. **영양 분석**: 추정 칼로리 및 주요 영양소(탄수화물, 단백질, 지방 등) 분석.
4. **문제점 및 우려사항**: 나트륨 과다, 영양 불균형, 특정 가공식품 유무 등.
5. **개선 제안**: 더 건강한 식사를 위해 추가하거나 빼야 할 점.

반응은 매우 전문적이면서도 친절한 한국어로 작성해주세요.
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

    return response.text || "분석 결과를 생성하지 못했습니다.";
  } catch (error) {
    console.error("Gemini Analysis Error:", error);
    throw new Error("음식 분석 중 오류가 발생했습니다.");
  }
};
