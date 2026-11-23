import type { Question, SurveyKeyword, SurveyResponseRow, SurveySummary } from './research';

export interface DistributionBucket {
  label: string;
  count: number;
  pct: number;
}

export interface QuestionDistribution {
  questionIndex: number;
  label: string;
  type: Question['type'];
  answeredCount: number;
  totalCount: number;
  buckets: DistributionBucket[];
  averageScore?: number;
  medianScore?: number;
  textSamples?: string[];
  avgLength?: number;
}

export interface TimelinePoint {
  key: string;
  label: string;
  count: number;
  cumulative: number;
}

export interface ExtractedKeyword {
  word: string;
  count: number;
  sentiment: '긍정' | '중립' | '개선요청';
  responseIndices: number[];
  sampleQuotes: string[];
}

const STOPWORDS = new Set([
  '그리고',
  '하지만',
  '그러나',
  '그래서',
  '때문에',
  '때문',
  '정도',
  '경우',
  '부분',
  '생각',
  '느낌',
  '조금',
  '약간',
  '매우',
  '정말',
  '진짜',
  '너무',
  '아주',
  '많이',
  '자주',
  '항상',
  '가끔',
  '그냥',
  '거의',
  '가장',
  '제일',
  '현재',
  '지금',
  '최근',
  '보통',
  '주로',
  '직접',
  '따로',
  '같이',
  '함께',
  '다시',
  '계속',
  '바로',
  '먼저',
  '이미',
  '아직',
  '전혀',
  '별로',
  '대부분',
  '여러',
  '모든',
  '다른',
  '같은',
  '이런',
  '저런',
  '그런',
  '어떤',
  '무엇',
  '어떻게',
  '이것',
  '저것',
  '그것',
  '여기',
  '거기',
  '저기',
  '우리',
  '저희',
  '사람',
  '사람들',
  '사용',
  '이용',
  '합니다',
  '입니다',
  '습니다',
  '있어요',
  '없어요',
  '해요',
  '했어요',
  '같아요',
  '네요',
  '세요',
  '에서',
  '으로',
  '하고',
  '하는',
  '있는',
  '없는',
  '되는',
  '해서',
  '하면',
  '하고요',
  '하는데',
  '있는데',
  '없는데',
  '같습니다',
  '있습니다',
  '없습니다',
  '좋겠어요',
  '좋겠습니다',
  '합니다만',
  'the',
  'and',
  'for',
  'with',
  'that',
  'this',
  'from',
  'have',
  'not',
  'are',
  'was',
]);

const SUFFIX_PATTERNS = [
  /(입니다|습니다|했어요|있어요|없어요|같아요|거든요|잖아요|인데요|네요|세요|해요|한다|했다|된다|됐다)$/,
  /(에서는|으로는|이라도|까지는|부터는|처럼은|에게는|한테는|보다는)$/,
  /(에서|으로|에게|한테|부터|까지|처럼|보다|하고|이나|이며|에도|에는|으로도|과는|와는)$/,
  /(은|는|이|가|을|를|에|의|로|와|과|도|만|요)$/,
];

const POSITIVE_HINTS = ['편리', '좋', '만족', '유용', '빠르', '깔끔', '쉽', '추천', '도움', '기대', '재미', '완벽'];
const NEGATIVE_HINTS = ['불편', '복잡', '어렵', '느리', '비싸', '부족', '아쉽', '문제', '오류', '번거', '귀찮', '포기', '부담', '개선'];

function inferSentiment(word: string, quotes: string[]): ExtractedKeyword['sentiment'] {
  const haystack = `${word} ${quotes.join(' ')}`;
  const posHits = POSITIVE_HINTS.filter((h) => haystack.includes(h)).length;
  const negHits = NEGATIVE_HINTS.filter((h) => haystack.includes(h)).length;
  if (negHits > posHits) return '개선요청';
  if (posHits > negHits) return '긍정';
  return '중립';
}

function normalizeToken(raw: string): string {
  let token = raw.trim().toLowerCase();
  if (/^[가-힣]+$/.test(token)) {
    for (const pattern of SUFFIX_PATTERNS) {
      if (token.length >= 3) {
        const stripped = token.replace(pattern, '');
        if (stripped.length >= 2) {
          token = stripped;
        }
      }
    }
  }
  return token;
}

export function computeQuestionDistributions(
  questions: Question[],
  responses: SurveyResponseRow[],
): QuestionDistribution[] {
  return questions.map((q, qIdx) => {
    const rawAnswers = responses.map((r) => (r.answers[qIdx] ?? '').trim());
    const nonEmpty = rawAnswers.filter(Boolean);

    if (q.type === 'choice') {
      const counts = new Map<string, number>();
      for (const opt of q.options) {
        counts.set(opt, 0);
      }
      for (const ans of nonEmpty) {
        counts.set(ans, (counts.get(ans) ?? 0) + 1);
      }
      const denom = nonEmpty.length || 1;
      const buckets: DistributionBucket[] = Array.from(counts.entries()).map(([label, count]) => ({
        label,
        count,
        pct: Math.round((count / denom) * 100),
      }));

      return {
        questionIndex: qIdx,
        label: q.label,
        type: q.type,
        answeredCount: nonEmpty.length,
        totalCount: responses.length,
        buckets,
      };
    }

    if (q.type === 'scale') {
      const nums = nonEmpty.map(Number).filter((n) => Number.isFinite(n) && n >= 1 && n <= 5);
      const denom = nums.length || 1;
      const buckets: DistributionBucket[] = [5, 4, 3, 2, 1].map((score) => {
        const count = nums.filter((n) => n === score).length;
        return {
          label: `${score}점`,
          count,
          pct: Math.round((count / denom) * 100),
        };
      });
      const averageScore = nums.length ? Number((nums.reduce((a, b) => a + b, 0) / nums.length).toFixed(2)) : 0;
      const sorted = [...nums].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      const medianScore =
        sorted.length === 0
          ? 0
          : sorted.length % 2 === 1
          ? sorted[mid]
          : Number(((sorted[mid - 1] + sorted[mid]) / 2).toFixed(1));

      return {
        questionIndex: qIdx,
        label: q.label,
        type: q.type,
        answeredCount: nums.length,
        totalCount: responses.length,
        buckets,
        averageScore,
        medianScore,
      };
    }

    // Text question: bucket by answer length distribution
    const lengths = nonEmpty.map((a) => a.length);
    const avgLength = lengths.length ? Math.round(lengths.reduce((a, b) => a + b, 0) / lengths.length) : 0;
    const shortCount = lengths.filter((l) => l <= 20).length;
    const midCount = lengths.filter((l) => l > 20 && l <= 60).length;
    const longCount = lengths.filter((l) => l > 60).length;
    const denom = nonEmpty.length || 1;

    return {
      questionIndex: qIdx,
      label: q.label,
      type: q.type,
      answeredCount: nonEmpty.length,
      totalCount: responses.length,
      buckets: [
        { label: '짧은 응답 (20자 이하)', count: shortCount, pct: Math.round((shortCount / denom) * 100) },
        { label: '보통 응답 (21~60자)', count: midCount, pct: Math.round((midCount / denom) * 100) },
        { label: '상세 응답 (61자 이상)', count: longCount, pct: Math.round((longCount / denom) * 100) },
      ],
      textSamples: nonEmpty,
      avgLength,
    };
  });
}

export function computeResponseTimeline(responses: SurveyResponseRow[]): TimelinePoint[] {
  if (!responses.length) return [];

  const parsedDates = responses
    .map((r) => new Date(r.createdAt))
    .filter((d) => !Number.isNaN(d.getTime()))
    .sort((a, b) => a.getTime() - b.getTime());

  if (!parsedDates.length) return [];

  const uniqueDays = new Set(parsedDates.map((d) => d.toISOString().slice(0, 10)));
  const useHourly = uniqueDays.size <= 1;

  const grouped = new Map<string, { label: string; count: number }>();
  for (const d of parsedDates) {
    const key = useHourly ? d.toISOString().slice(0, 13) : d.toISOString().slice(0, 10);
    const label = useHourly
      ? `${String(d.getHours()).padStart(2, '0')}시`
      : `${d.getMonth() + 1}/${d.getDate()}`;
    const existing = grouped.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      grouped.set(key, { label, count: 1 });
    }
  }

  let running = 0;
  return Array.from(grouped.entries()).map(([key, item]) => {
    running += item.count;
    return {
      key,
      label: item.label,
      count: item.count,
      cumulative: running,
    };
  });
}

export function extractSurveyKeywords(
  survey: Pick<SurveySummary, 'questions' | 'responses'>,
  aiKeywords?: SurveyKeyword[],
): ExtractedKeyword[] {
  const { questions, responses } = survey;
  if (!responses.length) return [];

  const textIndices = questions
    .map((q, idx) => (q.type === 'text' ? idx : -1))
    .filter((idx) => idx >= 0);
  const targetIndices =
    textIndices.length > 0
      ? textIndices
      : questions.map((q, idx) => (q.type === 'choice' ? idx : -1)).filter((idx) => idx >= 0);

  const tokenMap = new Map<
    string,
    { count: number; responseSet: Set<number>; quotes: string[] }
  >();

  responses.forEach((resp, rIdx) => {
    const seenInResponse = new Set<string>();
    const combinedText = targetIndices
      .map((qIdx) => (resp.answers[qIdx] ?? '').trim())
      .filter(Boolean)
      .join(' ');

    if (!combinedText) return;

    const rawTokens = combinedText.match(/[가-힣]{2,}|[A-Za-z]{3,}/g) ?? [];
    for (const raw of rawTokens) {
      const normalized = normalizeToken(raw);
      if (normalized.length < 2 || STOPWORDS.has(normalized)) continue;
      // Count total occurrences across responses
      const entry = tokenMap.get(normalized) ?? {
        count: 0,
        responseSet: new Set<number>(),
        quotes: [],
      };
      entry.count += 1;
      if (!seenInResponse.has(normalized)) {
        seenInResponse.add(normalized);
        entry.responseSet.add(rIdx);
        if (entry.quotes.length < 3) {
          entry.quotes.push(combinedText.slice(0, 120));
        }
      }
      tokenMap.set(normalized, entry);
    }
  });

  const aiLookup = new Map<string, SurveyKeyword>();
  if (aiKeywords?.length) {
    for (const ak of aiKeywords) {
      aiLookup.set(ak.word.trim().toLowerCase(), ak);
    }
  }

  const localResults: ExtractedKeyword[] = Array.from(tokenMap.entries()).map(([word, data]) => {
    const aiMatch = aiLookup.get(word.toLowerCase());
    return {
      word: aiMatch?.word ?? word,
      count: Math.max(data.count, aiMatch?.count ?? 0),
      sentiment: aiMatch?.sentiment ?? inferSentiment(word, data.quotes),
      responseIndices: Array.from(data.responseSet),
      sampleQuotes: data.quotes,
    };
  });

  // Include AI-only compound keywords (e.g., "가격 부담") if they match any responses
  if (aiKeywords?.length) {
    for (const ak of aiKeywords) {
      const key = ak.word.trim().toLowerCase();
      if (!tokenMap.has(key) && !localResults.some((item) => item.word.toLowerCase() === key)) {
        const matchedIndices: number[] = [];
        const quotes: string[] = [];
        responses.forEach((resp, rIdx) => {
          const full = resp.answers.join(' ');
          if (full.toLowerCase().includes(key)) {
            matchedIndices.push(rIdx);
            if (quotes.length < 3) quotes.push(full.slice(0, 120));
          }
        });
        localResults.push({
          word: ak.word.trim(),
          count: ak.count,
          sentiment: ak.sentiment,
          responseIndices: matchedIndices,
          sampleQuotes: quotes,
        });
      }
    }
  }

  return localResults
    .sort((a, b) => b.count - a.count || b.responseIndices.length - a.responseIndices.length)
    .slice(0, 18);
}

export function computeOverallScaleAverage(distributions: QuestionDistribution[]): number | null {
  const scaleQuestions = distributions.filter((d) => d.type === 'scale' && d.answeredCount > 0);
  if (!scaleQuestions.length) return null;
  const sum = scaleQuestions.reduce((acc, q) => acc + (q.averageScore ?? 0), 0);
  return Number((sum / scaleQuestions.length).toFixed(2));
}
