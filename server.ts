import express from 'express';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
dotenv.config();

const app = express();
app.use(express.json({ limit: '20mb' }));

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

const buildPrompt = (age: number, gender: string, mealNumber: number) => `
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

app.post('/api/analyze', async (req, res) => {
  try {
    const { imageData, age, gender, existingMealsCount = 0 } = req.body;

    if (!imageData || !age || !gender) {
      res.status(400).json({ error: '필수 데이터가 누락되었습니다.' });
      return;
    }

    const prompt = buildPrompt(age, gender, existingMealsCount + 1);
    const base64Data = imageData.split(',')[1] || imageData;

    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: [{
        parts: [
          { text: prompt },
          { inlineData: { mimeType: 'image/jpeg', data: base64Data } },
        ],
      }],
    });

    const text = response.text || '';
    const dataMatch = text.match(/---DATA:(\{.*\})---/);
    let extractedData = { calories: 0, foodName: '알 수 없는 음식' };

    if (dataMatch) {
      try {
        extractedData = JSON.parse(dataMatch[1]);
      } catch {
        // keep defaults
      }
    }

    res.json({
      date: new Date().toISOString(),
      foodName: extractedData.foodName,
      calories: extractedData.calories,
      markdown: text.replace(/---DATA:(\{.*\})---/, '').trim(),
    });
  } catch (error) {
    console.error('Gemini Analysis Error:', error);
    res.status(500).json({ error: '음식 분석 중 오류가 발생했습니다.' });
  }
});

const PORT = process.env.PORT ? Number(process.env.PORT) + 1 : 3001;
app.listen(PORT, () => {
  console.log(`API server running on http://localhost:${PORT}`);
});
