// AnalysisProgress 컴포넌트 타입.
// 수아 T-024 시안 기반: 세로 5-단계 리스트, 각 단계는 done/current/pending 중 하나.

export interface AnalysisStep {
  id?: string;
  label: string;
  description?: string;
}

export type AnalysisStepStatus = 'done' | 'current' | 'pending';

export interface AnalysisProgressProps {
  /** 단계 목록. 길이는 가변(quick=3, detailed=5 등). */
  steps: AnalysisStep[];
  /**
   * 현재 진행 중인 단계 인덱스. (0-based)
   * - i < currentIndex → done
   * - i === currentIndex → current
   * - i > currentIndex → pending
   * - currentIndex >= steps.length → 모든 단계 done
   */
  currentIndex: number;
  /** ETA 초 단위. 지정 시 카운트다운 표시. */
  etaSeconds?: number;
  /** 단계별 실시간 디테일 텍스트 (서버 SSE step.detail). 미지정 시 step.description 사용. */
  detailByIndex?: Record<number, string>;
  /** 재시도 핸들러. 지정 시 [재시도] 버튼 표시. */
  onRetry?: () => void;
  /** 취소 핸들러. 지정 시 [취소] 버튼 표시. */
  onCancel?: () => void;
  /** 현재 분석 중인 이미지 URL (옵션 — 헤더에 미리보기 노출). */
  imageUrl?: string;
  /** 모드 라벨 (예: "⚡ 퀵 분석" / "📋 상세 분석"). */
  modeLabel?: string;
}
