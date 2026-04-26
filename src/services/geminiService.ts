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

export const analyzeFood = (
  imageData: string,
  age: number,
  gender: 'male' | 'female',
  existingMealsCount: number = 0,
  mode: AnalysisMode = 'detailed',
  onEvent?: (event: StreamEvent) => void,
): Promise<AnalysisResult> => {
  return new Promise(async (resolve, reject) => {
    try {
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageData, age, gender, existingMealsCount, mode }),
      });

      if (!response.ok || !response.body) {
        const err = await response.json().catch(() => ({ error: '음식 분석 중 오류가 발생했습니다.' }));
        reject(new Error(err.error || '음식 분석 중 오류가 발생했습니다.'));
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // SSE lines end with \n\n; keep incomplete tail in buffer
        const parts = buffer.split('\n\n');
        buffer = parts.pop() ?? '';

        for (const block of parts) {
          for (const line of block.split('\n')) {
            if (!line.startsWith('data: ')) continue;
            try {
              const event: StreamEvent = JSON.parse(line.slice(6));
              onEvent?.(event);
              if (event.type === 'done') { resolve(event.result); return; }
              if (event.type === 'error') { reject(new Error(event.message)); return; }
            } catch { /* skip malformed */ }
          }
        }
      }
    } catch (err) {
      reject(err instanceof Error ? err : new Error('분석 중 오류가 발생했습니다.'));
    }
  });
};
