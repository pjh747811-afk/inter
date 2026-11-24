import type { Question } from './research';

export const questionGuideKey = 'research.question-guide.v1';
export const interviewAnalysisKey = 'research.interview-analysis.v1';

export type VpcElement = 'JTBD' | 'Pains' | 'Pain Relievers' | 'Gains' | 'Gain Creators';

export interface QuestionGuide {
  item: string;
  cpfHypothesis?: {
    customerArchetype: string;
    customerHypothesis: string;
    problemHypothesis: string;
    valueProposition?: string;
  };
  analysis?: {
    coreGoal: string;
    keyHypotheses: string[];
    questionAudit: string;
    interviewTips: string[];
  };
  interview: Array<{
    stage: string;
    vpcElement?: VpcElement;
    hypothesis?: string;
    prompt: string;
    purpose?: string;
    metricSignal?: string;
  }>;
  survey: Question[];
}

export interface InterviewAnalysis {
  item: string;
  summary: string;
  validationReadiness: string;
  questionReviews: Array<{
    original: string;
    verdict: '적합' | '보완 필요' | '유도 위험';
    violatedPrinciple?: string;
    diagnosis: string;
    improved: string;
    insightGoal: string;
  }>;
  insights: {
    painPoints: string[];
    currentAlternatives: string[];
    willingnessToPay: string;
    keyPatterns: string[];
    nextActions: string[];
    factPatternInsights?: Array<{
      fact: string;
      pattern: string;
      insight: string;
      painGainTag: 'Pain 있음' | 'Pain 없음' | 'Gain 있음';
      verdict: '가설 적용 (Pass & Fact)' | '가설 기각 (Fail)' | '새로운 사실 발견 (아하! 모먼트)';
    }>;
  };
  checklist?: Array<{
    item: string;
    status: '충족' | '보완 필요' | '미확인';
    note: string;
  }>;
}

