export const groups = ['핵심 타겟', '대안 사용자', '이탈/비사용'] as const;
export const statuses = ['섭외 대기', '컨택 중', '일정 확정', '완료', '거절/보류'] as const;

export const types = {
  text: '서술형',
  choice: '객관식',
  scale: '5점 척도',
} as const;

export type QuestionType = keyof typeof types;

export interface Person {
  id: string;
  name: string;
  desc: string;
  group: string;
  source: string;
  status: string;
  date: string;
  alternative: string;
  note: string;
  sample?: boolean;
}

export interface Question {
  label: string;
  type: QuestionType;
  required: boolean;
  options: string[];
}

export interface Survey {
  id: string;
  title: string;
  intro: string;
  questions: Question[];
  active: boolean;
  createdAt?: string;
}

export interface SurveyResponseRow {
  id: string;
  answers: string[];
  createdAt: string;
}

export interface SurveySummary extends Survey {
  count: number;
  responses: SurveyResponseRow[];
}

export interface SurveyKey {
  id: string;
  key: string;
  title: string;
}

export interface SurveyKeyword {
  word: string;
  count: number;
  sentiment: '긍정' | '중립' | '개선요청';
}

export interface SurveyAnalysis {
  overview: string;
  keyFindings: string[];
  segmentSignals: string[];
  recommendations: string[];
  keywords?: SurveyKeyword[];
}

export const interviewPrompts = [
  '[문제 탐색] 최근 이 문제를 겪은 경험은 언제인가요? 그때 어떤 상황이었는지 구체적으로 알려주세요.',
  '[문제 강도 · 빈도] 그 문제는 얼마나 자주 발생하며, 해결 과정에 시간과 비용은 대략 얼마나 들었나요?',
  '[문제 강도 · 고통] 그 문제 때문에 가장 힘들었던 점이나 업무·일상에 미친 실제 손실은 무엇이었나요?',
  '[기존 대안 확인] 그때 문제를 해결하기 위해 어떤 대안을 시도해 보셨고, 왜 그 방법을 계속 사용하고 계신가요?',
  '[대체재 불만] 기존 해결 방식이나 경쟁 제품·서비스에서 가장 답답하거나 비싸다고 느낀 부분은 무엇인가요?',
  '[지출·행동 검증] 이 불편을 줄이기 위해 직접 비용을 지출하거나 다른 도구를 탐색해 본 경험이 있나요?',
];

