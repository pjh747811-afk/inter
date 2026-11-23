import type { Question } from './research';

export const questionGuideKey = 'research.question-guide.v1';
export const interviewAnalysisKey = 'research.interview-analysis.v1';

export interface QuestionGuide {
  item: string;
  analysis?: {
    coreGoal: string;
    keyHypotheses: string[];
    questionAudit: string;
    interviewTips: string[];
  };
  interview: Array<{
    stage: string;
    prompt: string;
    purpose?: string;
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
  };
}
