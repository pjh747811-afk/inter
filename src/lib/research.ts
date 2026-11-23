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
  '최근 이 문제를 경험한 순간은 언제였나요? 그때 상황을 자세히 들려주세요.',
  '그때 문제를 해결하기 위해 실제로 어떤 방법을 쓰셨나요?',
  '해결하는 데 시간이나 비용이 대략 얼마나 들었나요?',
  '현재 사용하는 해결 방법(또는 툴)에서 가장 번거롭거나 아쉬웠던 점은 무엇인가요?',
  '이 문제를 해결하기 위해 유료 서비스나 외주 등에 돈을 지불해 본 적이 있나요?',
  '이 문제를 해결하지 않고 그대로 두면 어떤 불편이나 손실이 생기나요?',
];
