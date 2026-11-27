import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import type { SurveyQuestion } from './storage.ts';

const PRIMARY_MODEL = 'gemini-4-hydrogen';
const FALLBACK_MODEL = 'gemini-3.1-flash-lite';
const TRANSCRIBE_MODEL = 'gemini-3.5-transcribe';

export class AiApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'AiApiError';
    this.status = status;
  }
}

function getAiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    throw new AiApiError(
      503,
      'GEMINI_API_KEY가 설정되지 않았습니다. Settings > Secrets 패널에서 API 키를 확인해 주세요.',
    );
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface ParsedAiError {
  status: number;
  statusText: string;
  rawMessage: string;
}

function inspectAiError(err: unknown): ParsedAiError {
  const anyErr = err as Record<string, unknown> | null | undefined;
  let status =
    typeof anyErr?.status === 'number'
      ? anyErr.status
      : typeof anyErr?.code === 'number'
      ? anyErr.code
      : 0;
  let statusText = typeof anyErr?.status === 'string' ? anyErr.status : '';
  let rawMessage = err instanceof Error ? err.message : String(err ?? '');

  // Handle Google GenAI SDK errors whose message is a serialized JSON payload
  if (rawMessage.includes('{')) {
    const start = rawMessage.indexOf('{');
    try {
      const parsed = JSON.parse(rawMessage.slice(start)) as {
        error?: { code?: number; status?: string; message?: string };
        code?: number;
        status?: string;
        message?: string;
      };
      const inner = parsed.error ?? parsed;
      if (typeof inner.code === 'number' && !status) status = inner.code;
      if (typeof inner.status === 'string' && !statusText) statusText = inner.status;
      if (typeof inner.message === 'string') rawMessage = inner.message;
    } catch {
      // Keep rawMessage when JSON parse fails
    }
  }

  const upper = `${statusText} ${rawMessage}`.toUpperCase();
  if (!status) {
    if (upper.includes('UNAVAILABLE') || upper.includes('HIGH DEMAND') || upper.includes('OVERLOADED')) {
      status = 503;
    } else if (upper.includes('RESOURCE_EXHAUSTED') || upper.includes('RATE LIMIT') || upper.includes('QUOTA')) {
      status = 429;
    } else if (upper.includes('API_KEY_INVALID') || upper.includes('PERMISSION_DENIED') || upper.includes('UNAUTHORIZED')) {
      status = 403;
    } else if (upper.includes('INVALID_ARGUMENT')) {
      status = 400;
    } else {
      status = 500;
    }
  }

  return { status, statusText: upper, rawMessage };
}

function isRetryableStatus(info: ParsedAiError): boolean {
  return (
    info.status === 503 ||
    info.status === 429 ||
    info.status === 500 ||
    info.status === 502 ||
    info.status === 504 ||
    info.statusText.includes('UNAVAILABLE') ||
    info.statusText.includes('RESOURCE_EXHAUSTED') ||
    info.statusText.includes('FETCH FAILED') ||
    info.statusText.includes('ECONNRESET') ||
    info.statusText.includes('ETIMEDOUT')
  );
}

function toUserFriendlyAiError(info: ParsedAiError): AiApiError {
  if (info.status === 503 || info.statusText.includes('UNAVAILABLE')) {
    return new AiApiError(
      503,
      'AI 모델에 일시적으로 요청이 몰려 응답이 지연되고 있어요(503). 잠시 후 다시 시도해 주세요.',
    );
  }
  if (info.status === 429 || info.statusText.includes('RESOURCE_EXHAUSTED')) {
    return new AiApiError(
      429,
      'AI 요청 한도를 잠시 초과했어요(429). 몇 초 뒤 다시 시도해 주세요.',
    );
  }
  if (info.status === 401 || info.status === 403) {
    return new AiApiError(
      info.status,
      'GEMINI_API_KEY가 유효하지 않거나 권한이 없습니다. Settings > Secrets 패널을 확인해 주세요.',
    );
  }
  if (info.status === 404 || info.statusText.includes('NOT_FOUND')) {
    return new AiApiError(
      502,
      '요청한 AI 모델을 일시적으로 사용할 수 없어요(404). 잠시 후 다시 시도해 주세요.',
    );
  }
  if (info.status === 400) {
    return new AiApiError(400, 'AI 요청 형식을 처리할 수 없어요. 입력 내용을 조금 다듬어 다시 시도해 주세요.');
  }
  return new AiApiError(500, 'AI 분석 요청을 처리하는 중 일시적인 오류가 발생했어요. 다시 시도해 주세요.');
}

function parseJsonResponse<T>(text: string | undefined, fallbackMsg: string): T {
  const raw = (text ?? '').trim();
  if (!raw) {
    throw new AiApiError(502, fallbackMsg);
  }
  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new AiApiError(502, fallbackMsg);
  }
}

async function callGeminiJson<T>(options: {
  contents: string;
  responseSchema: Record<string, unknown>;
  parseFallbackMsg: string;
}): Promise<T> {
  const ai = getAiClient();
  const attempts: Array<{ model: string; delayBeforeMs: number }> = [
    { model: PRIMARY_MODEL, delayBeforeMs: 0 },
    { model: FALLBACK_MODEL, delayBeforeMs: 150 },
    { model: FALLBACK_MODEL, delayBeforeMs: 700 + Math.floor(Math.random() * 250) },
  ];

  let lastInfo: ParsedAiError | null = null;

  for (let i = 0; i < attempts.length; i++) {
    const attempt = attempts[i];
    if (attempt.delayBeforeMs > 0) {
      await sleep(attempt.delayBeforeMs);
    }
    try {
      const response = await ai.models.generateContent({
        model: attempt.model,
        contents: options.contents,
        config: {
          responseMimeType: 'application/json',
          responseSchema: options.responseSchema,
          ...(attempt.model === PRIMARY_MODEL
            ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } }
            : {}),
        },
      });
      return parseJsonResponse<T>(response.text, options.parseFallbackMsg);
    } catch (err) {
      if (err instanceof AiApiError && (err.status === 502 || err.status === 401 || err.status === 403)) {
        // Parse failure or auth error — don't spin endlessly on auth errors
        if (err.status === 401 || err.status === 403) throw err;
        lastInfo = { status: err.status, statusText: '', rawMessage: err.message };
        continue;
      }
      const info = inspectAiError(err);
      lastInfo = info;
      const canFallbackOnModelNotFound =
        (info.status === 404 || info.statusText.includes('NOT_FOUND')) && i < attempts.length - 1;
      if (!canFallbackOnModelNotFound && !isRetryableStatus(info)) {
        throw toUserFriendlyAiError(info);
      }
    }
  }

  throw toUserFriendlyAiError(
    lastInfo ?? { status: 503, statusText: 'UNAVAILABLE', rawMessage: 'All model attempts exhausted' },
  );
}

export type VpcElement = 'JTBD' | 'Pains' | 'Pain Relievers' | 'Gains' | 'Gain Creators';

export interface QuestionGuideOutput {
  item: string;
  cpfHypothesis?: {
    customerArchetype: string;
    customerHypothesis: string;
    problemHypothesis: string;
    valueProposition?: string;
  };
  analysis: {
    coreGoal: string;
    keyHypotheses: string[];
    questionAudit: string;
    interviewTips: string[];
  };
  interview: Array<{
    stage: string;
    vpcElement: VpcElement;
    hypothesis: string;
    prompt: string;
    purpose: string;
    metricSignal: string;
  }>;
  survey: SurveyQuestion[];
}

function normalizeVpcElement(raw: unknown): VpcElement {
  const s = String(raw ?? '').trim();
  if (s === 'JTBD' || s === 'Pains' || s === 'Pain Relievers' || s === 'Gains' || s === 'Gain Creators') {
    return s;
  }
  const lower = s.toLowerCase();
  if (lower.includes('reliev')) return 'Pain Relievers';
  if (lower.includes('creat')) return 'Gain Creators';
  if (lower.includes('gain')) return 'Gains';
  if (lower.includes('pain')) return 'Pains';
  return 'JTBD';
}

export async function generateQuestionGuide(input: {
  item: string;
  audience?: string;
  customerArchetype?: string;
  hypothesis?: string;
  valueProposition?: string;
  draftQuestions?: string;
}): Promise<QuestionGuideOutput> {
  const prompt = [
    '당신은 가치제안캔버스(VPC) 및 CPF(Customer Problem Fit) 기반 고객검증 인터뷰 설계 전문가입니다.',
    '사용자가 입력한 아이템과 타겟·가설 정보를 바탕으로, 1) VPC·CPF 가설 구조화, 2) 검증 분석 및 질문 3원칙 진단, 3) 가설과 1:1로 매핑된 고객검증 인터뷰 7문항, 4) 객관적 데이터·숫자를 수집하는 설문 6문항을 한국어로 설계하세요.',
    '',
    `[검증할 아이템]: ${input.item}`,
    input.audience ? `[타겟 고객군]: ${input.audience}` : '',
    input.customerArchetype ? `[우선 탐색 고객 원형]: ${input.customerArchetype}` : '',
    input.hypothesis ? `[CPF 핵심 가설]: ${input.hypothesis}` : '',
    input.valueProposition ? `[가치제안]: ${input.valueProposition}` : '',
    input.draftQuestions ? `[사용자가 미리 작성한 질문/메모]:\n${input.draftQuestions}` : '',
    '',
    '필수 반영 방법론 (VPC · CPF 고객검증 인터뷰 작성법):',
    '1. CPF 가설 구조화(cpfHypothesis):',
    '   - customerArchetype: 기초 탐색 우선 원형(최종사용자 / 구매자 / (최종)의사결정자 / 인플루언서 / 추천자 중 가장 적합한 원형)',
    '   - customerHypothesis: "고객이 누구이며 어떤 상황(JTBD)을 경험하고 있는가" 형식의 고객 가설',
    '   - problemHypothesis: "어떤 불만(Pain)과 기대(Gain)를 갖고 있는가" 형식의 문제 가설',
    '   - valueProposition: 이 아이템이 고객에게 주는 핵심 가치제안 한 줄 요약',
    '2. 인터뷰 질문 작성 3대 원칙 (엄수):',
    '   - [원칙 01] 의견을 묻지 말고, 과거 및 현재 경험하고 있는 상황을 물어보기 (비용 / 시간 지출 여부 / 마지막 경험 / 실제 행동 / 실패 경험 / 감정 강도).',
    '   - [원칙 02] 개방형으로 물어보기 ("~드셨나요?" 같은 예/아니오 닫힌 질문 대신 "어떻게 ~하셨는지 알려주세요"처럼 구체적 맥락을 끌어내는 열린 질문, 필요 시 닫힌 질문→개방형 연결).',
    '   - [원칙 03] 평가나 의견·미래 가정("Would") 질문 절대 금지 ("이 서비스 괜찮은 것 같으세요?", "나오면 쓰실 것 같아요?", "Would you buy/use/pay?" 등 가짜 데이터를 유발하는 질문 금지).',
    '3. 인터뷰 질문 순서 및 데이터/숫자 판단근거 (정확히 7문항):',
    '   - 1문항 [고객 특성·JTBD]: VPC=JTBD — 고객 가설(역할, 최근 실제 수행 작업/행동) 확인',
    '   - 2문항 [문제 탐색]: VPC=Pains — 최근 이 문제를 겪은 시점과 구체적 상황 확인',
    '   - 3문항 [문제 강도·빈도]: VPC=Pains — 발생 빈도와 중요도(숫자·횟수) 확인',
    '   - 4문항 [문제 강도·비용/시간]: VPC=Pains — 해결 과정 소요 시간, 비용 지출 경험 여부 확인',
    '   - 5문항 [기존 대안·대체재]: VPC=Pain Relievers — 그때 어떻게 해결했는지, 어떤 대안·경쟁 제품을 시도했고 왜 계속 쓰는지/불만인지 확인',
    '   - 6문항 [실패 경험·기대 가치]: VPC=Gains — 실패/포기 경험과 해결 시 기대하는 핵심 변화 확인',
    '   - 7문항 [후속 인터뷰 추천]: VPC=Gain Creators — 동일 문제를 겪는 주변 타겟 고객 추천 및 실무 후속 연결 확인',
    '   - 각 문항마다 hypothesis(이 질문으로 검증할 가설)와 metricSignal(응답에서 뽑아낼 판단근거 숫자·사실 지표)을 반드시 작성하세요.',
    '4. questionAudit: [사용자가 미리 작성한 질문/메모]가 있으면 원칙 01~03 위반 여부(미래형/평가/닫힌 질문)를 진단하고 개선 방향을 작성하세요. 없으면 이 아이템 인터뷰 시 피해야 할 대표적인 Would 질문과 닫힌 질문 함정을 구체적으로 적으세요.',
    '5. survey: 정확히 6문항("text", "choice", "scale" 중 하나)으로 작성하되, 미래 구매 의향("Would you") 대신 최근 경험 빈도, 소요 시간·비용, 현재 대안, 가장 불편했던 실제 사례를 묻는 질문으로 구성하세요. "choice"일 때는 options에 3~5개 선택지를 넣고 "text"/"scale"일 때는 []로 두세요.',
  ]
    .filter(Boolean)
    .join('\n');

  const parsed = await callGeminiJson<{
    cpfHypothesis: QuestionGuideOutput['cpfHypothesis'];
    analysis: QuestionGuideOutput['analysis'];
    interview: Array<{
      stage: string;
      vpcElement: string;
      hypothesis: string;
      prompt: string;
      purpose: string;
      metricSignal: string;
    }>;
    survey: Array<{ label: string; type: string; required: boolean; options: string[] }>;
  }>({
    contents: prompt,
    parseFallbackMsg: 'AI 질문 생성 응답을 해석하지 못했어요. 다시 시도해 주세요.',
    responseSchema: {
      type: Type.OBJECT,
      properties: {
        cpfHypothesis: {
          type: Type.OBJECT,
          properties: {
            customerArchetype: { type: Type.STRING, description: '최종사용자, 구매자, (최종)의사결정자 등 고객 원형' },
            customerHypothesis: { type: Type.STRING, description: '고객 가설 (누구이며 어떤 상황/JTBD를 경험하는가)' },
            problemHypothesis: { type: Type.STRING, description: '문제 가설 (어떤 불만/Pain과 기대/Gain이 있는가)' },
            valueProposition: { type: Type.STRING, description: '가치제안 한 줄 요약' },
          },
          required: ['customerArchetype', 'customerHypothesis', 'problemHypothesis', 'valueProposition'],
        },
        analysis: {
          type: Type.OBJECT,
          properties: {
            coreGoal: { type: Type.STRING, description: '가장 먼저 검증해야 할 CPF 핵심 목적과 리스크 요약' },
            keyHypotheses: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: 'VPC(JTBD/Pains/Gains) 기반 우선 검증 가설 3가지',
            },
            questionAudit: { type: Type.STRING, description: '질문 3원칙(과거경험/개방형/평가·Would금지) 기준 진단' },
            interviewTips: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: '인터뷰 수행 및 판단근거(숫자/Fact) 확보 팁 3가지',
            },
          },
          required: ['coreGoal', 'keyHypotheses', 'questionAudit', 'interviewTips'],
        },
        interview: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              stage: { type: Type.STRING },
              vpcElement: {
                type: Type.STRING,
                description: 'JTBD, Pains, Pain Relievers, Gains, Gain Creators 중 하나',
              },
              hypothesis: { type: Type.STRING, description: '질문과 1:1 매핑되는 검증 가설' },
              prompt: { type: Type.STRING },
              purpose: { type: Type.STRING },
              metricSignal: { type: Type.STRING, description: '응답에서 확보할 판단근거(빈도·시간·비용·행동)' },
            },
            required: ['stage', 'vpcElement', 'hypothesis', 'prompt', 'purpose', 'metricSignal'],
          },
        },
        survey: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              label: { type: Type.STRING },
              type: { type: Type.STRING, description: 'text, choice, scale 중 하나' },
              required: { type: Type.BOOLEAN },
              options: { type: Type.ARRAY, items: { type: Type.STRING } },
            },
            required: ['label', 'type', 'required', 'options'],
          },
        },
      },
      required: ['cpfHypothesis', 'analysis', 'interview', 'survey'],
    },
  });

  return {
    item: input.item,
    cpfHypothesis: parsed.cpfHypothesis,
    analysis: parsed.analysis,
    interview: (parsed.interview ?? []).slice(0, 7).map((q) => ({
      stage: String(q.stage ?? '').trim(),
      vpcElement: normalizeVpcElement(q.vpcElement),
      hypothesis: String(q.hypothesis ?? '').trim(),
      prompt: String(q.prompt ?? '').trim(),
      purpose: String(q.purpose ?? '').trim(),
      metricSignal: String(q.metricSignal ?? '').trim(),
    })),
    survey: normalizeQuestions(parsed.survey).slice(0, 8),
  };
}

export interface InterviewAnalysisOutput {
  item: string;
  summary: string;
  validationReadiness: string;
  questionReviews: Array<{
    original: string;
    verdict: '적합' | '보완 필요' | '유도 위험';
    violatedPrinciple: string;
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
    factPatternInsights: Array<{
      fact: string;
      pattern: string;
      insight: string;
      painGainTag: 'Pain 있음' | 'Pain 없음' | 'Gain 있음';
      verdict: '가설 적용 (Pass & Fact)' | '가설 기각 (Fail)' | '새로운 사실 발견 (아하! 모먼트)';
    }>;
  };
  checklist: Array<{
    item: string;
    status: '충족' | '보완 필요' | '미확인';
    note: string;
  }>;
}

export async function analyzeInterviewContent(input: {
  item: string;
  questions: string;
  notes?: string;
}): Promise<InterviewAnalysisOutput> {
  const prompt = [
    '당신은 VPC·CPF 고객검증 인터뷰 분석 전문가입니다.',
    '사용자가 검증하려는 아이템과 인터뷰 질문(및 선택적으로 인터뷰 답변/메모)을 입력했습니다.',
    '다음 방법론에 따라 체계적으로 분석해 구조화하세요:',
    '1) 질문 작성 3대 원칙 진단:',
    '   - 원칙 01: 의견을 묻지 말고, 과거·현재 경험하고 있는 상황(비용/시간/마지막 경험/실제 행동/실패 경험)을 묻는가?',
    '   - 원칙 02: 개방형으로 물어보는가?',
    '   - 원칙 03: 평가/의견/미래형("Would you", "~할 것 같나요?", "괜찮나요?") 질문이 아닌가?',
    '2) Fact(사실) → Pattern(반복) → Insight(해석) 및 가설 검증 판정:',
    '   - 고객 발언과 실제 행동(돈·시간 지출, 외주, 다른 툴 탐색 vs 돈 안 씀)을 바탕으로 "Pain 있음 / Pain 없음 / Gain 있음"을 구분하고,',
    '   - 반복 패턴 여부에 따라 "가설 적용 (Pass & Fact)", "가설 기각 (Fail)", "새로운 사실 발견 (아하! 모먼트)"로 판정하세요.',
    '3) 인스트럭터 체크리스트 점검: 타겟 고객군 일치, 공통 질문 여부, 빈도·강도·지출 비용 확인, 기존 대안 불만, 후속 인터뷰 추천 확보 여부.',
    '',
    `[검증 아이템]: ${input.item}`,
    `[입력한 인터뷰 질문]:\n${input.questions}`,
    input.notes?.trim()
      ? `[인터뷰 답변 / 관찰 메모]:\n${input.notes}`
      : '[인터뷰 답변 / 관찰 메모]: 아직 입력되지 않음 (질문 기준의 검증 분석 및 예상 Fact→Pattern→Insight 프레임워크를 제공)',
    '',
    '작성 규칙:',
    '- questionReviews: 입력된 각 질문을 최대 8개까지 분석하세요. verdict는 "적합", "보완 필요", "유도 위험" 중 하나, violatedPrinciple은 "원칙 준수", "원칙 1 위반(의견·미래 질문)", "원칙 2 위반(닫힌 질문)", "원칙 3 위반(평가·Would 질문)" 등으로 구체적으로 적으세요.',
    '- factPatternInsights: 3~4개 항목으로 Fact(실제 발화/가설 검증 신호) → Pattern(반복 경향) → Insight(제품/전략 해석)을 정리하고 painGainTag와 verdict를 지정하세요.',
    '- checklist: 핵심 점검 항목 5개(타겟 고객군 적합성, 문제 빈도·강도 숫자 확보, 실제 비용/시간 지출 확인, 기존 대안·경쟁 불만 확인, 후속 인터뷰 추천 요청)의 상태를 "충족", "보완 필요", "미확인" 중 하나로 평가하세요.',
  ].join('\n');

  const parsed = await callGeminiJson<Omit<InterviewAnalysisOutput, 'item'>>({
    contents: prompt,
    parseFallbackMsg: '인터뷰 질문·내용 분석 응답을 해석하지 못했어요. 다시 시도해 주세요.',
    responseSchema: {
      type: Type.OBJECT,
      properties: {
        summary: { type: Type.STRING, description: '전체 분석 한눈에 보기 요약' },
        validationReadiness: { type: Type.STRING, description: '현재 질문/검증 상태 종합 진단' },
        questionReviews: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              original: { type: Type.STRING },
              verdict: { type: Type.STRING, description: '적합, 보완 필요, 유도 위험 중 하나' },
              violatedPrinciple: { type: Type.STRING, description: '질문 원칙 1~3 준수/위반 여부' },
              diagnosis: { type: Type.STRING },
              improved: { type: Type.STRING },
              insightGoal: { type: Type.STRING },
            },
            required: ['original', 'verdict', 'violatedPrinciple', 'diagnosis', 'improved', 'insightGoal'],
          },
        },
        insights: {
          type: Type.OBJECT,
          properties: {
            painPoints: { type: Type.ARRAY, items: { type: Type.STRING } },
            currentAlternatives: { type: Type.ARRAY, items: { type: Type.STRING } },
            willingnessToPay: { type: Type.STRING },
            keyPatterns: { type: Type.ARRAY, items: { type: Type.STRING } },
            nextActions: { type: Type.ARRAY, items: { type: Type.STRING } },
            factPatternInsights: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  fact: { type: Type.STRING, description: '고객이 실제로 말한 내용 또는 행동(Fact)' },
                  pattern: { type: Type.STRING, description: '여러 고객에서 반복된 내용(Pattern)' },
                  insight: { type: Type.STRING, description: '패턴을 통한 해석 및 아하 모먼트(Insight)' },
                  painGainTag: { type: Type.STRING, description: 'Pain 있음, Pain 없음, Gain 있음 중 하나' },
                  verdict: {
                    type: Type.STRING,
                    description: '가설 적용 (Pass & Fact), 가설 기각 (Fail), 새로운 사실 발견 (아하! 모먼트) 중 하나',
                  },
                },
                required: ['fact', 'pattern', 'insight', 'painGainTag', 'verdict'],
              },
            },
          },
          required: ['painPoints', 'currentAlternatives', 'willingnessToPay', 'keyPatterns', 'nextActions', 'factPatternInsights'],
        },
        checklist: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              item: { type: Type.STRING },
              status: { type: Type.STRING, description: '충족, 보완 필요, 미확인 중 하나' },
              note: { type: Type.STRING },
            },
            required: ['item', 'status', 'note'],
          },
        },
      },
      required: ['summary', 'validationReadiness', 'questionReviews', 'insights', 'checklist'],
    },
  });

  return {
    item: input.item,
    summary: parsed.summary,
    validationReadiness: parsed.validationReadiness,
    questionReviews: (parsed.questionReviews ?? []).map((q) => ({
      ...q,
      verdict: q.verdict === '적합' || q.verdict === '보완 필요' || q.verdict === '유도 위험' ? q.verdict : '보완 필요',
      violatedPrinciple: String(q.violatedPrinciple ?? '').trim() || '원칙 점검',
    })),
    insights: {
      painPoints: parsed.insights?.painPoints ?? [],
      currentAlternatives: parsed.insights?.currentAlternatives ?? [],
      willingnessToPay: parsed.insights?.willingnessToPay ?? '',
      keyPatterns: parsed.insights?.keyPatterns ?? [],
      nextActions: parsed.insights?.nextActions ?? [],
      factPatternInsights: (parsed.insights?.factPatternInsights ?? []).map((f) => ({
        fact: String(f.fact ?? '').trim(),
        pattern: String(f.pattern ?? '').trim(),
        insight: String(f.insight ?? '').trim(),
        painGainTag:
          f.painGainTag === 'Pain 있음' || f.painGainTag === 'Pain 없음' || f.painGainTag === 'Gain 있음'
            ? f.painGainTag
            : 'Pain 있음',
        verdict:
          f.verdict === '가설 적용 (Pass & Fact)' ||
          f.verdict === '가설 기각 (Fail)' ||
          f.verdict === '새로운 사실 발견 (아하! 모먼트)'
            ? f.verdict
            : '새로운 사실 발견 (아하! 모먼트)',
      })),
    },
    checklist: (parsed.checklist ?? []).map((c) => ({
      item: String(c.item ?? '').trim(),
      status: c.status === '충족' || c.status === '보완 필요' || c.status === '미확인' ? c.status : '미확인',
      note: String(c.note ?? '').trim(),
    })),
  };
}

export async function generateSurveyFromItem(input: {
  item: string;
  audience?: string;
  goal?: string;
}): Promise<{ title: string; intro: string; questions: SurveyQuestion[] }> {
  const prompt = [
    '당신은 타겟 유저 대상 고객검증·연구 설문 설계 전문가입니다.',
    '아래 아이템을 검증하기 위해 타겟 유저에게 배포하고 데이터를 수집할 수 있는 설문 제목, 참여 안내(동의 문구), 그리고 설문 문항 6개를 만들어 주세요.',
    '',
    `[검증할 아이템]: ${input.item}`,
    input.audience ? `[타겟 유저]: ${input.audience}` : '',
    input.goal ? `[설문 목적]: ${input.goal}` : '',
    '',
    '작성 규칙:',
    '- title: 참여자가 거부감 없이 응답할 수 있는 명확한 설문 제목 (50자 이내)',
    '- intro: 설문 목적, 예상 소요 시간(약 2~3분), 익명·자발적 참여 및 연구 외 미사용 안내를 포함한 자연스러운 안내문',
    '- questions: 6문항을 생성하며, 스크리닝/경험/대안(choice), 불편 정도/의향(scale), 구체적 맥락(text)이 균형 있게 섞이도록 하세요.',
    '- type이 "choice"면 options에 3~5개의 명확한 선택지를 넣고, "text"나 "scale"이면 options는 []로 두세요.',
  ]
    .filter(Boolean)
    .join('\n');

  const parsed = await callGeminiJson<{
    title: string;
    intro: string;
    questions: Array<{ label: string; type: string; required: boolean; options: string[] }>;
  }>({
    contents: prompt,
    parseFallbackMsg: '설문 문항 생성 결과를 해석하지 못했어요. 다시 시도해 주세요.',
    responseSchema: {
      type: Type.OBJECT,
      properties: {
        title: { type: Type.STRING },
        intro: { type: Type.STRING },
        questions: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              label: { type: Type.STRING },
              type: { type: Type.STRING, description: 'text, choice, scale 중 하나' },
              required: { type: Type.BOOLEAN },
              options: { type: Type.ARRAY, items: { type: Type.STRING } },
            },
            required: ['label', 'type', 'required', 'options'],
          },
        },
      },
      required: ['title', 'intro', 'questions'],
    },
  });

  const cleanTitle = String(parsed.title ?? '').trim().slice(0, 100);
  const cleanIntro = String(parsed.intro ?? '').trim().slice(0, 2000);
  const normalizedQuestions = normalizeQuestions(Array.isArray(parsed.questions) ? parsed.questions : []).slice(0, 10);

  if (normalizedQuestions.length === 0) {
    throw new AiApiError(502, '설문 문항을 충분히 생성하지 못했어요. 다시 시도해 주세요.');
  }

  return {
    title: cleanTitle || `${input.item.trim().slice(0, 36)} · 고객검증 설문`,
    intro:
      cleanIntro ||
      '안녕하세요. 서비스 개선 및 고객 경험 검증을 위한 짧은 설문(약 2~3분 소요)입니다. 모든 응답은 연구 목적 외에는 사용되지 않으며, 원하실 경우 언제든 참여를 중단하실 수 있습니다.',
    questions: normalizedQuestions,
  };
}

export async function analyzeSurveyData(input: {
  title: string;
  questions: SurveyQuestion[];
  responses: Array<{ answers: string[]; createdAt: string }>;
}): Promise<{
  overview: string;
  keyFindings: string[];
  segmentSignals: string[];
  recommendations: string[];
  keywords: Array<{ word: string; count: number; sentiment: '긍정' | '중립' | '개선요청' }>;
}> {
  const formattedResponses = input.responses
    .slice(0, 60)
    .map((r, idx) => {
      const pairs = input.questions
        .map((q, qIdx) => `  Q${qIdx + 1}(${q.label}): ${r.answers[qIdx] || '(무응답)'}`)
        .join('\n');
      return `응답 #${idx + 1} (${r.createdAt.slice(0, 10)}):\n${pairs}`;
    })
    .join('\n\n');

  const prompt = [
    `설문 제목: ${input.title}`,
    `총 분석 대상 응답 수: ${input.responses.length}건`,
    '',
    '[수집된 응답 데이터]',
    formattedResponses,
    '',
    '위 설문 데이터를 바탕으로 아래 항목을 한국어로 객관적이고 구체적으로 정리해 주세요.',
    '1) overview: 전체 경향 한눈에 보기 요약',
    '2) keyFindings: 핵심 발견 사항 3~4가지',
    '3) segmentSignals: 타겟 유저 반응 및 세그먼트 신호 2~3가지',
    '4) recommendations: 제품/인터뷰 후속 실행 제안 3가지',
    '5) keywords: 응답 텍스트에서 자주 등장하거나 핵심적인 키워드 최대 12개 (word: 1~2어절 핵심 단어, count: 등장/언급 빈도 정수, sentiment: "긍정", "중립", "개선요청" 중 하나)',
  ].join('\n');

  const parsed = await callGeminiJson<{
    overview: string;
    keyFindings: string[];
    segmentSignals: string[];
    recommendations: string[];
    keywords: Array<{ word: string; count: number; sentiment: string }>;
  }>({
    contents: prompt,
    parseFallbackMsg: '설문 응답 분석 결과를 해석하지 못했어요. 다시 시도해 주세요.',
    responseSchema: {
      type: Type.OBJECT,
      properties: {
        overview: { type: Type.STRING },
        keyFindings: { type: Type.ARRAY, items: { type: Type.STRING } },
        segmentSignals: { type: Type.ARRAY, items: { type: Type.STRING } },
        recommendations: { type: Type.ARRAY, items: { type: Type.STRING } },
        keywords: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              word: { type: Type.STRING },
              count: { type: Type.INTEGER },
              sentiment: { type: Type.STRING, description: '긍정, 중립, 개선요청 중 하나' },
            },
            required: ['word', 'count', 'sentiment'],
          },
        },
      },
      required: ['overview', 'keyFindings', 'segmentSignals', 'recommendations', 'keywords'],
    },
  });

  return {
    overview: parsed.overview,
    keyFindings: parsed.keyFindings,
    segmentSignals: parsed.segmentSignals,
    recommendations: parsed.recommendations,
    keywords: (parsed.keywords ?? [])
      .filter((k) => k && typeof k.word === 'string' && k.word.trim().length > 0)
      .slice(0, 12)
      .map((k) => ({
        word: k.word.trim().slice(0, 24),
        count: Math.max(1, Math.round(Number(k.count) || 1)),
        sentiment: k.sentiment === '긍정' || k.sentiment === '개선요청' ? k.sentiment : '중립',
      })),
  };
}

function normalizeQuestions(
  raw: Array<{ label: string; type: string; required?: boolean; options?: string[] }>,
): SurveyQuestion[] {
  return raw
    .filter((q) => q && typeof q.label === 'string' && q.label.trim().length > 0)
    .map((q) => {
      const normalizedType =
        q.type === 'choice' || q.type === 'scale' || q.type === 'text' ? q.type : 'text';
      const cleanedOptions = Array.isArray(q.options)
        ? q.options.map((o) => String(o).trim()).filter(Boolean).slice(0, 10)
        : [];
      const finalType =
        normalizedType === 'choice' && cleanedOptions.length < 2 ? 'text' : normalizedType;
      return {
        label: q.label.trim().slice(0, 220),
        type: finalType,
        required: q.required !== false,
        options: finalType === 'choice' ? cleanedOptions : [],
      };
    });
}

export async function transcribeInterviewAudio(input: {
  audioBase64: string;
  mimeType: string;
  question?: string;
  personName?: string;
}): Promise<{ transcript: string; model: string }> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    throw new AiApiError(
      503,
      'GEMINI_API_KEY가 설정되지 않았습니다. Settings > Secrets 패널에서 API 키를 확인해 주세요.',
    );
  }
  const aiV1Beta = new GoogleGenAI({
    apiKey,
    apiVersion: 'v1beta',
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
  const aiDefault = getAiClient();

  const cleanMimeType = input.mimeType.split(';')[0].trim().toLowerCase() || 'audio/webm';
  const prompt = [
    '첨부된 오디오 파일의 실제 음성 발화만 한국어로 정확하게 받아적으세요.',
    '규칙:',
    '- 오디오에서 실제로 들린 말만 문장 부호를 살려 그대로 작성하세요.',
    '- 들리는 말이 없거나 배경 소음/무음뿐이면 정확히 "(인식된 음성이 없습니다)"라고만 출력하세요.',
    '- 설명, 인사말, 질문 반복, 타임스탬프, 파일 누락 안내는 절대 출력하지 마세요.',
  ].join('\n');

  const audioPart = {
    inlineData: {
      mimeType: cleanMimeType,
      data: input.audioBase64,
    },
  };

  const attempts: Array<{ model: string; client: GoogleGenAI; delayBeforeMs: number }> = [
    { model: TRANSCRIBE_MODEL, client: aiV1Beta, delayBeforeMs: 0 },
    { model: FALLBACK_MODEL, client: aiV1Beta, delayBeforeMs: 250 },
    { model: FALLBACK_MODEL, client: aiDefault, delayBeforeMs: 800 },
    { model: PRIMARY_MODEL, client: aiV1Beta, delayBeforeMs: 500 },
  ];

  let lastInfo: ParsedAiError | null = null;

  for (const attempt of attempts) {
    if (attempt.delayBeforeMs > 0) {
      await sleep(attempt.delayBeforeMs);
    }
    try {
      const response = await attempt.client.models.generateContent({
        model: attempt.model,
        contents: {
          parts: [audioPart, { text: prompt }],
        },
      });
      const text = (response.text ?? '').trim();
      if (!text) {
        console.warn(`[STT] Empty text from ${attempt.model} (mime=${cleanMimeType}, b64len=${input.audioBase64.length})`);
        lastInfo = { status: 502, statusText: 'EMPTY_TRANSCRIPT', rawMessage: 'Empty transcript returned' };
        continue;
      }
      if (
        text.includes('첨부되어 있지 않') ||
        text.includes('음성 파일을 함께') ||
        text.includes('업로드해 주시면')
      ) {
        console.warn(`[STT] Rejected non-audio message from ${attempt.model} (mime=${cleanMimeType})`);
        lastInfo = { status: 502, statusText: 'AUDIO_NOT_PARSED', rawMessage: 'Model did not parse audio inlineData' };
        continue;
      }
      return { transcript: text, model: attempt.model };
    } catch (err) {
      const info = inspectAiError(err);
      console.warn(`[STT] Error from ${attempt.model} (mime=${cleanMimeType}): status=${info.status} ${info.statusText} ${info.rawMessage}`);
      lastInfo = info;
      if (info.status === 401 || info.status === 403) {
        throw toUserFriendlyAiError(info);
      }
      // Allow fallback if model returns 404/400 (unsupported format/model) or retryable 503/429
      if (info.status !== 404 && info.status !== 400 && !isRetryableStatus(info)) {
        throw toUserFriendlyAiError(info);
      }
    }
  }

  throw toUserFriendlyAiError(
    lastInfo ?? { status: 503, statusText: 'UNAVAILABLE', rawMessage: 'All transcription attempts exhausted' },
  );
}

export interface SentimentPoint {
  index: number;
  label: string;
  speaker: string;
  excerpt: string;
  sentimentScore: number;
  positiveRatio: number;
  negativeRatio: number;
  neutralRatio: number;
  emotionLabel: '긍정' | '중립' | '부정' | '복합';
  trigger: string;
}

export interface SentimentTrendOutput {
  scopeTitle: string;
  overallScore: number;
  positiveShare: number;
  negativeShare: number;
  neutralShare: number;
  trendDirection: '상승' | '하락' | '혼조' | '안정';
  summary: string;
  turningPoints: string[];
  points: SentimentPoint[];
  analyzedAt: string;
}

export async function analyzeInterviewSentimentTrend(input: {
  scopeTitle: string;
  mode: 'all' | 'single';
  entries: Array<{ id: string; speaker: string; timestamp?: string; text: string }>;
}): Promise<SentimentTrendOutput> {
  const formatted = input.entries
    .slice(0, 20)
    .map(
      (e, idx) =>
        `[기록 #${idx + 1}] 대상자: ${e.speaker}${e.timestamp ? ` (${e.timestamp})` : ''}\n내용:\n${e.text.slice(0, 2200)}`,
    )
    .join('\n\n---\n\n');

  const prompt = [
    '당신은 정성 인터뷰 데이터에서 고객의 감정 변화(Sentiment Trajectory)를 정밀하게 추적하는 UX 리서치 분석가입니다.',
    `분석 범위: ${input.scopeTitle} (${input.mode === 'all' ? '여러 대상자·인터뷰 흐름 비교' : '단일 대상자 인터뷰 내 발화 구간별 감정 변화'})`,
    '',
    '[수집된 인터뷰 텍스트]',
    formatted,
    '',
    '작성 규칙:',
    '- points: 입력된 인터뷰 텍스트를 시간순 또는 문맥 흐름 순서대로 최소 3개에서 최대 14개의 구간으로 나누어 감정 변화를 추적하세요.',
    '  - 만약 입력된 기록이 1~2개뿐이라면 각 기록 내부의 문장/Q&A/주제 전환 단위로 4~8개 구간으로 세분화하여 감정 곡선이 드러나게 하세요.',
    '  - sentimentScore: -100(매우 강한 부정/불만/좌절) ~ +100(매우 강한 긍정/기대/만족) 사이의 정수. 중립은 0 전후.',
    '  - positiveRatio, negativeRatio, neutralRatio: 합이 100이 되는 0~100 정수.',
    '  - emotionLabel: 반드시 "긍정", "중립", "부정", "복합" 중 하나.',
    '  - label: 그래프 X축에 표시할 짧은 라벨 (예: "김OO #1", "구간 2 · 비용", 최대 14자).',
    '  - excerpt: 해당 구간 감정을 가장 잘 드러내는 실제 발화/인용 요약 (한국어 70자 이내).',
    '  - trigger: 그 감정을 유발한 구체적 원인(불편 요소, 대안의 한계, 기대 가치 등).',
    '- overallScore: 전체 평균 감성 점수 (-100 ~ +100 정수).',
    '- positiveShare, negativeShare, neutralShare: 전체 텍스트 기준 긍정/부정/중립 비율 (합 100).',
    '- trendDirection: 흐름이 후반부로 갈수록 좋아지면 "상승", 나빠지면 "하락", 등락이 크면 "혼조", 변동이 적으면 "안정".',
    '- turningPoints: 고객의 감정이 크게 반전되거나 급락·급등한 핵심 변곡점 2~4가지.',
    '- summary: 전체 고객 감정 추이와 제품 검증 시사점을 2~3문장으로 요약.',
  ].join('\n');

  const parsed = await callGeminiJson<Omit<SentimentTrendOutput, 'scopeTitle' | 'analyzedAt'>>({
    contents: prompt,
    parseFallbackMsg: '인터뷰 감정 추이 분석 결과를 해석하지 못했어요. 다시 시도해 주세요.',
    responseSchema: {
      type: Type.OBJECT,
      properties: {
        overallScore: { type: Type.INTEGER },
        positiveShare: { type: Type.INTEGER },
        negativeShare: { type: Type.INTEGER },
        neutralShare: { type: Type.INTEGER },
        trendDirection: { type: Type.STRING, description: '상승, 하락, 혼조, 안정 중 하나' },
        summary: { type: Type.STRING },
        turningPoints: { type: Type.ARRAY, items: { type: Type.STRING } },
        points: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              index: { type: Type.INTEGER },
              label: { type: Type.STRING },
              speaker: { type: Type.STRING },
              excerpt: { type: Type.STRING },
              sentimentScore: { type: Type.INTEGER },
              positiveRatio: { type: Type.INTEGER },
              negativeRatio: { type: Type.INTEGER },
              neutralRatio: { type: Type.INTEGER },
              emotionLabel: { type: Type.STRING, description: '긍정, 중립, 부정, 복합 중 하나' },
              trigger: { type: Type.STRING },
            },
            required: [
              'index',
              'label',
              'speaker',
              'excerpt',
              'sentimentScore',
              'positiveRatio',
              'negativeRatio',
              'neutralRatio',
              'emotionLabel',
              'trigger',
            ],
          },
        },
      },
      required: [
        'overallScore',
        'positiveShare',
        'negativeShare',
        'neutralShare',
        'trendDirection',
        'summary',
        'turningPoints',
        'points',
      ],
    },
  });

  const clampInt = (v: unknown, min: number, max: number) =>
    Math.max(min, Math.min(max, Math.round(Number(v) || 0)));

  const normalizedPoints: SentimentPoint[] = (parsed.points ?? []).slice(0, 16).map((p, idx) => {
    const pos = clampInt(p.positiveRatio, 0, 100);
    const neg = clampInt(p.negativeRatio, 0, 100);
    const rawNeu = clampInt(p.neutralRatio, 0, 100);
    const total = pos + neg + rawNeu || 100;
    const pNorm = Math.round((pos / total) * 100);
    const nNorm = Math.round((neg / total) * 100);
    const uNorm = Math.max(0, 100 - pNorm - nNorm);

    return {
      index: idx + 1,
      label: String(p.label ?? `구간 ${idx + 1}`).trim().slice(0, 20),
      speaker: String(p.speaker ?? '대상자').trim().slice(0, 40),
      excerpt: String(p.excerpt ?? '').trim().slice(0, 140),
      sentimentScore: clampInt(p.sentimentScore, -100, 100),
      positiveRatio: pNorm,
      negativeRatio: nNorm,
      neutralRatio: uNorm,
      emotionLabel:
        p.emotionLabel === '긍정' ||
        p.emotionLabel === '부정' ||
        p.emotionLabel === '중립' ||
        p.emotionLabel === '복합'
          ? p.emotionLabel
          : '중립',
      trigger: String(p.trigger ?? '').trim().slice(0, 180),
    };
  });

  const rawPos = clampInt(parsed.positiveShare, 0, 100);
  const rawNeg = clampInt(parsed.negativeShare, 0, 100);
  const rawNeu = clampInt(parsed.neutralShare, 0, 100);
  const shareTotal = rawPos + rawNeg + rawNeu || 100;
  const positiveShare = Math.round((rawPos / shareTotal) * 100);
  const negativeShare = Math.round((rawNeg / shareTotal) * 100);
  const neutralShare = Math.max(0, 100 - positiveShare - negativeShare);

  const dir = parsed.trendDirection;
  const trendDirection =
    dir === '상승' || dir === '하락' || dir === '혼조' || dir === '안정' ? dir : '혼조';

  return {
    scopeTitle: input.scopeTitle,
    overallScore: clampInt(parsed.overallScore, -100, 100),
    positiveShare,
    negativeShare,
    neutralShare,
    trendDirection,
    summary: String(parsed.summary ?? '').trim(),
    turningPoints: (parsed.turningPoints ?? []).map((t) => String(t).trim()).filter(Boolean).slice(0, 5),
    points: normalizedPoints,
    analyzedAt: new Date().toISOString(),
  };
}

export type SummaryStyle = 'concise' | 'bullet' | 'action';

export interface TextSummaryOutput {
  headline: string;
  summary: string;
  keyPoints: string[];
  keywords: string[];
  actionItems: string[];
  originalChars: number;
  summaryChars: number;
  style: SummaryStyle;
  summarizedAt: string;
}

export async function summarizeResearchText(input: {
  text: string;
  title?: string;
  style?: SummaryStyle;
}): Promise<TextSummaryOutput> {
  const cleanText = input.text.trim();
  const style: SummaryStyle =
    input.style === 'bullet' || input.style === 'action' ? input.style : 'concise';

  const styleGuide =
    style === 'concise'
      ? '핵심을 2~3문장으로 아주 간결하게 압축하고, 불필요한 수식어 없이 결론 위주로 요약하세요.'
      : style === 'bullet'
      ? '주제·맥락별로 빠짐없이 구조화하여 핵심 사실과 사용자 맥락을 정리하세요.'
      : '제품 개선, 고객 검증 가설, 의사결정에 바로 활용할 수 있는 시사점과 다음 액션 중심으로 요약하세요.';

  const prompt = [
    '당신은 고객 인터뷰, 설문 서술형 응답, 리서치 메모를 빠르고 정확하게 압축 정리하는 UX 리서처입니다.',
    input.title ? `[문서/대상자 제목]: ${input.title}` : '',
    `[요약 방식]: ${styleGuide}`,
    '',
    '[원문 텍스트]',
    cleanText,
    '',
    '작성 규칙:',
    '- 원문에 없는 사실이나 수치를 지어내지 마세요.',
    '- headline: 전체 내용을 1문장(50자 내외)으로 관통하는 핵심 한 줄 결론.',
    '- summary: 한국어로 자연스럽게 압축한 요약 본문 (2~4문장).',
    '- keyPoints: 원문에서 추출한 주요 핵심 포인트 3~5가지.',
    '- keywords: 핵심 키워드 3~6개 (각 1~2어절).',
    '- actionItems: 이 내용을 바탕으로 리서처/팀이 확인하거나 실행할 다음 액션 2~3가지.',
  ]
    .filter(Boolean)
    .join('\n');

  const parsed = await callGeminiJson<{
    headline: string;
    summary: string;
    keyPoints: string[];
    keywords: string[];
    actionItems: string[];
  }>({
    contents: prompt,
    parseFallbackMsg: '텍스트 요약 결과를 해석하지 못했어요. 다시 시도해 주세요.',
    responseSchema: {
      type: Type.OBJECT,
      properties: {
        headline: { type: Type.STRING },
        summary: { type: Type.STRING },
        keyPoints: { type: Type.ARRAY, items: { type: Type.STRING } },
        keywords: { type: Type.ARRAY, items: { type: Type.STRING } },
        actionItems: { type: Type.ARRAY, items: { type: Type.STRING } },
      },
      required: ['headline', 'summary', 'keyPoints', 'keywords', 'actionItems'],
    },
  });

  const summaryText = String(parsed.summary ?? '').trim();

  return {
    headline: String(parsed.headline ?? '').trim(),
    summary: summaryText,
    keyPoints: (parsed.keyPoints ?? []).map((v) => String(v).trim()).filter(Boolean).slice(0, 6),
    keywords: (parsed.keywords ?? []).map((v) => String(v).trim()).filter(Boolean).slice(0, 6),
    actionItems: (parsed.actionItems ?? []).map((v) => String(v).trim()).filter(Boolean).slice(0, 4),
    originalChars: cleanText.length,
    summaryChars: summaryText.length,
    style,
    summarizedAt: new Date().toISOString(),
  };
}

export type TemplateFocus = 'both' | 'interview' | 'survey';
export type ValidationStage = '고객검증' | '문제검증' | '솔루션검증';

export interface GeneratedTemplateOutput {
  id: string;
  title: string;
  category: '초기 검증' | '컨셉·제품' | '수익화·이탈' | '스크리닝';
  validationStage: ValidationStage;
  customerArchetype: string;
  valueProposition: string;
  cpfSummary: {
    customerHypothesis: string;
    problemHypothesis: string;
  };
  situation: string;
  whenToUse: string;
  cautionTip: string;
  surveyTitle: string;
  surveyIntro: string;
  interview: Array<{
    stage: string;
    vpcElement: VpcElement;
    hypothesis: string;
    prompt: string;
    purpose: string;
  }>;
  survey: SurveyQuestion[];
  isAiGenerated: true;
  focus: TemplateFocus;
  purposeInput: string;
  audienceInput?: string;
  createdAt: string;
}

export async function generateResearchTemplate(input: {
  purpose: string;
  audience?: string;
  context?: string;
  customerArchetype?: string;
  validationStage?: ValidationStage;
  hypothesis?: string;
  focus?: TemplateFocus;
  count?: number;
}): Promise<GeneratedTemplateOutput> {
  const focus: TemplateFocus =
    input.focus === 'interview' || input.focus === 'survey' ? input.focus : 'both';
  const count = Math.max(4, Math.min(10, Math.round(Number(input.count) || 6)));
  const requestedStage: ValidationStage =
    input.validationStage === '고객검증' ||
    input.validationStage === '문제검증' ||
    input.validationStage === '솔루션검증'
      ? input.validationStage
      : '문제검증';

  const focusInstruction =
    focus === 'interview'
      ? `사용자는 특히 "심층 인터뷰 질문지"를 원합니다. interview 배열에 [문제 탐색 → 문제 강도(숫자·비용) → 기존 대안 → 기대 가치] 흐름 순서대로 정확히 ${count}개의 깊이 있는 인터뷰 질문을 작성하고, survey 배열에는 인터뷰 전·후 보조로 쓸 수 있는 3개의 핵심 설문 문항을 구성하세요.`
      : focus === 'survey'
      ? `사용자는 특히 "설문 조사 항목"을 원합니다. survey 배열에 객관식(choice), 5점 척도(scale), 서술형(text)이 균형 있게 섞인 정확히 ${count}개의 설문 문항을 작성하고, interview 배열에는 설문 응답자 후속 심층 인터뷰용 핵심 질문 3개를 구성하세요.`
      : `사용자는 인터뷰 질문지와 설문 항목을 모두 원합니다. interview 배열에 정확히 ${count}개의 인터뷰 질문을, survey 배열에 정확히 ${count}개의 구조화된 설문 문항을 작성하세요.`;

  const prompt = [
    '당신은 가치제안캔버스(VPC)와 CPF(Customer Problem Fit) 기반 고객검증 인터뷰 및 설문을 설계하는 수석 UX 리서처입니다.',
    '사용자가 입력한 [리서치 목적]과 [검증 단계], [고객 원형]을 바탕으로 실습 01(가설↔질문지 1:1 매핑) 형식의 맞춤형 질문 템플릿을 한국어로 설계하세요.',
    '',
    `[리서치 목적]: ${input.purpose}`,
    `[인터뷰 검증 흐름 단계]: ${requestedStage} (고객검증 / 문제검증 / 솔루션검증 중 선택된 단계에 맞게 가설과 질문을 집중)`,
    input.customerArchetype ? `[우선 탐색 고객 원형]: ${input.customerArchetype}` : '',
    input.audience ? `[대상 고객군 / 응답자]: ${input.audience}` : '',
    input.context ? `[서비스 · 제품 맥락 / 가치제안]: ${input.context}` : '',
    input.hypothesis ? `[사전 가설(CPF)]: ${input.hypothesis}` : '',
    '',
    '필수 반영 방법론 (VPC · CPF 질문지 작성법):',
    `- ${focusInstruction}`,
    '- 질문 작성 3대 원칙을 반드시 지키세요:',
    '  1) 의견을 묻지 말고, 과거 및 현재 경험하고 있는 상황을 물어보기 (비용 / 시간 지출 여부 / 마지막 경험 / 실제 행동 / 실패 경험 / 감정 강도).',
    '  2) 개방형 질문으로 물어보기 ("~드셨나요?" 대신 "어떻게 ~하셨는지 알려주세요").',
    '  3) 평가·의견·미래형("Would you buy/use/pay?", "이 서비스 괜찮은 것 같으세요?", "나오면 쓰실 것 같아요?") 질문은 절대 넣지 마세요.',
    '- 인터뷰 흐름과 판단근거(데이터, 숫자): 고객 특성·JTBD 확인 → 문제 탐색(최근 경험/상황) → 문제 강도 확인(빈도·비용·시간·중요도 숫자 확보) → 기존 대안·대체재 불만 확인 순서를 따르세요.',
    '- title: 이 리서치 목적과 검증 단계가 드러나는 템플릿 제목 (30자 이내).',
    '- category: 반드시 "초기 검증", "컨셉·제품", "수익화·이탈", "스크리닝" 중 가장 적합한 1개를 선택하세요.',
    '- customerArchetype: 최종사용자 / 구매자 / (최종)의사결정자 / 인플루언서 / 추천자 중 핵심 원형 표기.',
    '- valueProposition: 이 리서치가 검증하려는 핵심 가치제안 1문장.',
    '- cpfSummary: customerHypothesis(고객 가설)와 problemHypothesis(문제 가설)를 한 문장씩 구조화.',
    '- situation: 언제 이 템플릿을 꺼내 쓰는지 1문장 요약.',
    '- whenToUse: 고객 원형·인터뷰 규모 안내를 포함한 권장 활용 시점 (1~2문장).',
    '- cautionTip: 질문 3원칙(미래 가정/평가 질문/닫힌 질문 금지) 관점에서 이 목적의 인터뷰어가 특히 주의할 점 (1~2문장).',
    '- interview: 각 항목마다 stage(예: "1. 고객 특성 · JTBD"), vpcElement("JTBD", "Pains", "Pain Relievers", "Gains", "Gain Creators" 중 하나), hypothesis(이 질문으로 검증할 구체적 가설), prompt(비유도 과거·현재 경험 질문), purpose(응답에서 확보할 데이터/숫자 판단근거 및 검증 포인트)를 포함하세요.',
    '- surveyTitle: 응답자가 부담 없이 참여할 명확한 설문 제목 (50자 이내).',
    '- surveyIntro: 설문 목적, 예상 소요 시간(약 2~3분), 익명·연구 목적 외 미사용 안내를 포함한 자연스러운 참여 안내문.',
    '- survey: 각 문항의 type은 반드시 "text", "choice", "scale" 중 하나여야 합니다. 미래 구매 의향("사용하시겠습니까?") 대신 최근 행동 빈도, 소요 시간·비용, 현재 대안, 실제 불편 경험을 묻는 문항으로 구성하세요. type이 "choice"이면 options에 3~5개의 선택지를 넣고, "text"나 "scale"이면 options는 []로 두세요.',
  ]
    .filter(Boolean)
    .join('\n');

  const parsed = await callGeminiJson<{
    title: string;
    category: string;
    customerArchetype: string;
    valueProposition: string;
    cpfSummary: { customerHypothesis: string; problemHypothesis: string };
    situation: string;
    whenToUse: string;
    cautionTip: string;
    surveyTitle: string;
    surveyIntro: string;
    interview: Array<{ stage: string; vpcElement: string; hypothesis: string; prompt: string; purpose: string }>;
    survey: Array<{ label: string; type: string; required: boolean; options: string[] }>;
  }>({
    contents: prompt,
    parseFallbackMsg: 'AI 질문 템플릿 생성 결과를 해석하지 못했어요. 다시 시도해 주세요.',
    responseSchema: {
      type: Type.OBJECT,
      properties: {
        title: { type: Type.STRING },
        category: {
          type: Type.STRING,
          description: '초기 검증, 컨셉·제품, 수익화·이탈, 스크리닝 중 하나',
        },
        customerArchetype: { type: Type.STRING },
        valueProposition: { type: Type.STRING },
        cpfSummary: {
          type: Type.OBJECT,
          properties: {
            customerHypothesis: { type: Type.STRING },
            problemHypothesis: { type: Type.STRING },
          },
          required: ['customerHypothesis', 'problemHypothesis'],
        },
        situation: { type: Type.STRING },
        whenToUse: { type: Type.STRING },
        cautionTip: { type: Type.STRING },
        surveyTitle: { type: Type.STRING },
        surveyIntro: { type: Type.STRING },
        interview: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              stage: { type: Type.STRING },
              vpcElement: {
                type: Type.STRING,
                description: 'JTBD, Pains, Pain Relievers, Gains, Gain Creators 중 하나',
              },
              hypothesis: { type: Type.STRING },
              prompt: { type: Type.STRING },
              purpose: { type: Type.STRING },
            },
            required: ['stage', 'vpcElement', 'hypothesis', 'prompt', 'purpose'],
          },
        },
        survey: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              label: { type: Type.STRING },
              type: { type: Type.STRING, description: 'text, choice, scale 중 하나' },
              required: { type: Type.BOOLEAN },
              options: { type: Type.ARRAY, items: { type: Type.STRING } },
            },
            required: ['label', 'type', 'required', 'options'],
          },
        },
      },
      required: [
        'title',
        'category',
        'customerArchetype',
        'valueProposition',
        'cpfSummary',
        'situation',
        'whenToUse',
        'cautionTip',
        'surveyTitle',
        'surveyIntro',
        'interview',
        'survey',
      ],
    },
  });

  const allowedCategory =
    parsed.category === '초기 검증' ||
    parsed.category === '컨셉·제품' ||
    parsed.category === '수익화·이탈' ||
    parsed.category === '스크리닝'
      ? parsed.category
      : '초기 검증';

  const normalizedInterview = (Array.isArray(parsed.interview) ? parsed.interview : [])
    .filter((item) => item && typeof item.prompt === 'string' && item.prompt.trim().length > 0)
    .slice(0, focus === 'survey' ? 5 : 10)
    .map((item, idx) => ({
      stage: String(item.stage ?? `${idx + 1}. 핵심 질문`).trim().slice(0, 48),
      vpcElement: normalizeVpcElement(item.vpcElement),
      hypothesis: String(item.hypothesis ?? '').trim().slice(0, 220),
      prompt: String(item.prompt).trim().slice(0, 320),
      purpose: String(item.purpose ?? '핵심 경험 및 숫자 판단근거 확인').trim().slice(0, 220),
    }));

  const normalizedSurvey = normalizeQuestions(
    Array.isArray(parsed.survey) ? parsed.survey : [],
  ).slice(0, focus === 'interview' ? 5 : 10);

  if (normalizedInterview.length === 0 && normalizedSurvey.length === 0) {
    throw new AiApiError(502, '질문 템플릿을 충분히 생성하지 못했어요. 목적을 조금 더 구체적으로 적어 시도해 주세요.');
  }

  const randomSuffix = Math.random().toString(36).slice(2, 8);
  return {
    id: `ai-${Date.now().toString(36)}-${randomSuffix}`,
    title: String(parsed.title ?? '').trim().slice(0, 60) || `${input.purpose.trim().slice(0, 24)} · 맞춤 템플릿`,
    category: allowedCategory,
    validationStage: requestedStage,
    customerArchetype:
      String(parsed.customerArchetype ?? '').trim().slice(0, 80) ||
      input.customerArchetype ||
      '최종사용자 · 구매자',
    valueProposition: String(parsed.valueProposition ?? '').trim().slice(0, 240),
    cpfSummary: {
      customerHypothesis: String(parsed.cpfSummary?.customerHypothesis ?? '').trim().slice(0, 240),
      problemHypothesis: String(parsed.cpfSummary?.problemHypothesis ?? '').trim().slice(0, 240),
    },
    situation: String(parsed.situation ?? '').trim().slice(0, 200) || input.purpose.trim().slice(0, 200),
    whenToUse:
      String(parsed.whenToUse ?? '').trim().slice(0, 300) ||
      '고객 원형별로 최소 3~5명을 모집해 문제 탐색 → 강도(숫자) → 기존 대안 순으로 인터뷰를 진행하세요.',
    cautionTip:
      String(parsed.cautionTip ?? '').trim().slice(0, 300) ||
      '의견·평가·미래 가정("Would you") 질문 대신 최근 실제 경험과 소요 시간·지출 비용을 여쭤보세요.',
    surveyTitle:
      String(parsed.surveyTitle ?? '').trim().slice(0, 100) ||
      `${input.purpose.trim().slice(0, 34)} · 고객 리서치 설문`,
    surveyIntro:
      String(parsed.surveyIntro ?? '').trim().slice(0, 2000) ||
      '안녕하세요. 서비스 개선과 고객 경험 파악을 위한 짧은 설문(약 2~3분 소요)입니다. 솔직한 경험과 의견을 들려주시면 큰 도움이 됩니다.',
    interview: normalizedInterview,
    survey: normalizedSurvey,
    isAiGenerated: true,
    focus,
    purposeInput: input.purpose.trim(),
    audienceInput: input.audience?.trim() || undefined,
    createdAt: new Date().toISOString(),
  };
}

export interface InsightReportOutput {
  reportTitle: string;
  executiveSummary: string;
  dataCoverage: string;
  keyInsights: Array<{
    title: string;
    evidence: string;
    implication: string;
    confidence: '높음' | '보통' | '추가 검증 필요';
  }>;
  interviewVsSurveyAlignment: string;
  painPoints: string[];
  userSegments: Array<{
    segment: string;
    characteristics: string;
    opportunity: string;
  }>;
  recommendedActions: Array<{
    priority: '즉시 실행' | '단기 검증' | '후속 탐색';
    action: string;
    rationale: string;
  }>;
  openQuestions: string[];
  generatedAt: string;
}

export async function generateInsightReport(input: {
  topic?: string;
  interviews: Array<{
    speaker: string;
    group?: string;
    status?: string;
    alternative?: string;
    text: string;
  }>;
  surveys: Array<{
    title: string;
    responseCount: number;
    questionsSummary: string;
    sampleResponses: string[];
  }>;
}): Promise<InsightReportOutput> {
  const totalSurveyResponses = input.surveys.reduce((sum, s) => sum + s.responseCount, 0);

  const interviewBlock = input.interviews.length
    ? input.interviews
        .slice(0, 60)
        .map((item, idx) => {
          const meta = [item.group, item.status, item.alternative ? `대안: ${item.alternative}` : '']
            .filter(Boolean)
            .join(' · ');
          return `[인터뷰 #${idx + 1}] ${item.speaker}${meta ? ` (${meta})` : ''}\n${item.text.slice(0, 1800)}`;
        })
        .join('\n\n')
    : '(수집된 인터뷰 기록 없음)';

  const surveyBlock = input.surveys.length
    ? input.surveys
        .slice(0, 15)
        .map((s, idx) => {
          const samples = s.sampleResponses.length
            ? s.sampleResponses.slice(0, 30).join('\n  - ')
            : '(개별 응답 원문 없음)';
          return [
            `[설문 #${idx + 1}] ${s.title} (총 응답 ${s.responseCount}건)`,
            `문항별 집계:\n${s.questionsSummary}`,
            `수집 응답 샘플:\n  - ${samples}`,
          ].join('\n');
        })
        .join('\n\n---\n\n')
    : '(수집된 설문 데이터 없음)';

  const prompt = [
    '당신은 스타트업과 프로덕트 팀을 위해 정성 인터뷰 데이터와 정량/정성 설문 데이터를 교차 분석하여 의사결정용 인사이트 리포트를 작성하는 수석 UX 리서치 리드입니다.',
    '아래 제공된 실제 수집 데이터만을 근거로 핵심 통찰을 요약하고, 구체적인 증거와 제품/비즈니스 실행 제안을 한국어로 정리하세요.',
    '',
    input.topic?.trim() ? `[리서치 주제 / 검증 목표]: ${input.topic.trim()}` : '',
    `[수집 데이터 규모]: 인터뷰 기록 ${input.interviews.length}건, 설문조사 ${input.surveys.length}건 (총 응답 ${totalSurveyResponses}건)`,
    '',
    '=== 수집된 인터뷰 기록 (메모 · 음성 STT) ===',
    interviewBlock,
    '',
    '=== 수집된 설문 데이터 (분포 · 응답 원문) ===',
    surveyBlock,
    '',
    '작성 규칙:',
    '- 제공된 데이터에 없는 수치, 인용, 사실을 절대 지어내지 마세요.',
    '- reportTitle: 이번 리서치 핵심 발견을 압축한 명확한 리포트 제목 (45자 이내).',
    '- executiveSummary: 경영진/팀원이 30초 만에 파악할 수 있는 3~4문장의 종합 결론.',
    '- dataCoverage: 분석에 활용된 인터뷰 및 설문 데이터 규모와 범위를 1문장으로 서술.',
    '- keyInsights: 가장 중요한 핵심 통찰 3~5가지. 각 항목의 evidence에는 실제 인터뷰 화자명·발화 맥락 또는 설문 문항 수치를 구체적으로 인용하고, implication에는 제품/기획 시사점을 적으세요. confidence는 "높음", "보통", "추가 검증 필요" 중 하나를 선택하세요.',
    '- interviewVsSurveyAlignment: 인터뷰 정성 의견과 설문 데이터가 서로 뒷받침하거나 차이를 보이는 지점을 2~3문장으로 비교 분석하세요. (한쪽 데이터만 있는 경우 현재 단일 데이터 기준 해석과 보완 포인트를 명시하세요.)',
    '- painPoints: 반복적으로 드러난 핵심 고객 불편/장애 요인 3~5가지.',
    '- userSegments: 데이터에서 구분되는 주요 사용자 세그먼트/반응군 2~3개 (segment, characteristics, opportunity).',
    '- recommendedActions: 팀이 바로 실행할 후속 액션 3~4가지 (priority는 "즉시 실행", "단기 검증", "후속 탐색" 중 하나, action, rationale).',
    '- openQuestions: 현재 데이터만으로 결론 내리기 어렵거나 추가 검증이 필요한 열린 질문 2~3가지.',
  ]
    .filter(Boolean)
    .join('\n');

  const parsed = await callGeminiJson<Omit<InsightReportOutput, 'generatedAt'>>({
    contents: prompt,
    parseFallbackMsg: 'AI 인사이트 리포트 생성 결과를 해석하지 못했어요. 다시 시도해 주세요.',
    responseSchema: {
      type: Type.OBJECT,
      properties: {
        reportTitle: { type: Type.STRING },
        executiveSummary: { type: Type.STRING },
        dataCoverage: { type: Type.STRING },
        keyInsights: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              evidence: { type: Type.STRING },
              implication: { type: Type.STRING },
              confidence: { type: Type.STRING, description: '높음, 보통, 추가 검증 필요 중 하나' },
            },
            required: ['title', 'evidence', 'implication', 'confidence'],
          },
        },
        interviewVsSurveyAlignment: { type: Type.STRING },
        painPoints: { type: Type.ARRAY, items: { type: Type.STRING } },
        userSegments: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              segment: { type: Type.STRING },
              characteristics: { type: Type.STRING },
              opportunity: { type: Type.STRING },
            },
            required: ['segment', 'characteristics', 'opportunity'],
          },
        },
        recommendedActions: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              priority: { type: Type.STRING, description: '즉시 실행, 단기 검증, 후속 탐색 중 하나' },
              action: { type: Type.STRING },
              rationale: { type: Type.STRING },
            },
            required: ['priority', 'action', 'rationale'],
          },
        },
        openQuestions: { type: Type.ARRAY, items: { type: Type.STRING } },
      },
      required: [
        'reportTitle',
        'executiveSummary',
        'dataCoverage',
        'keyInsights',
        'interviewVsSurveyAlignment',
        'painPoints',
        'userSegments',
        'recommendedActions',
        'openQuestions',
      ],
    },
  });

  return {
    reportTitle: String(parsed.reportTitle ?? '').trim() || '고객 리서치 통합 인사이트 리포트',
    executiveSummary: String(parsed.executiveSummary ?? '').trim(),
    dataCoverage:
      String(parsed.dataCoverage ?? '').trim() ||
      `인터뷰 기록 ${input.interviews.length}건, 설문 ${input.surveys.length}건(응답 ${totalSurveyResponses}건) 기반 분석`,
    keyInsights: (Array.isArray(parsed.keyInsights) ? parsed.keyInsights : [])
      .filter((k) => k && typeof k.title === 'string' && k.title.trim())
      .slice(0, 6)
      .map((k) => ({
        title: k.title.trim(),
        evidence: String(k.evidence ?? '').trim(),
        implication: String(k.implication ?? '').trim(),
        confidence:
          k.confidence === '높음' || k.confidence === '보통' || k.confidence === '추가 검증 필요'
            ? k.confidence
            : '보통',
      })),
    interviewVsSurveyAlignment: String(parsed.interviewVsSurveyAlignment ?? '').trim(),
    painPoints: (parsed.painPoints ?? []).map((p) => String(p).trim()).filter(Boolean).slice(0, 6),
    userSegments: (Array.isArray(parsed.userSegments) ? parsed.userSegments : [])
      .filter((s) => s && typeof s.segment === 'string' && s.segment.trim())
      .slice(0, 4)
      .map((s) => ({
        segment: s.segment.trim(),
        characteristics: String(s.characteristics ?? '').trim(),
        opportunity: String(s.opportunity ?? '').trim(),
      })),
    recommendedActions: (Array.isArray(parsed.recommendedActions) ? parsed.recommendedActions : [])
      .filter((a) => a && typeof a.action === 'string' && a.action.trim())
      .slice(0, 5)
      .map((a) => ({
        priority:
          a.priority === '즉시 실행' || a.priority === '단기 검증' || a.priority === '후속 탐색'
            ? a.priority
            : '단기 검증',
        action: a.action.trim(),
        rationale: String(a.rationale ?? '').trim(),
      })),
    openQuestions: (parsed.openQuestions ?? []).map((q) => String(q).trim()).filter(Boolean).slice(0, 4),
    generatedAt: new Date().toISOString(),
  };
}


