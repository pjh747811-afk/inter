import type { VoiceAnswer } from './interviewAudio';
import type { InterviewAnalysis, QuestionGuide } from './questionGuide';
import { types, type Person, type SurveyAnalysis, type SurveySummary } from './research';
import type { ResearchTemplate } from './researchTemplates';
import type {
  ExtractedKeyword,
  QuestionDistribution,
  TimelinePoint,
} from './surveyAnalytics';
import type { SentimentTrendOutput } from '../pages/InterviewSentimentPanel';
import type { TextSummaryOutput } from '../pages/TextSummarizer';
import { download } from '../pages/ResearchUI';

type CsvCell = string | number | boolean | null | undefined;
type CsvRow = CsvCell[];

function dateStamp(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}

function safeFileSlug(raw: string, fallback: string): string {
  const cleaned = raw
    .trim()
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, '-')
    .slice(0, 32);
  return cleaned || fallback;
}

function formatDateTime(ts: number | string | undefined): string {
  if (!ts) return '';
  if (typeof ts === 'number') {
    const d = new Date(ts);
    return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 16).replace('T', ' ');
  }
  return ts.slice(0, 16).replace('T', ' ');
}

export function exportQuestionGuideCsv(guide: QuestionGuide): string {
  const rows: CsvRow[] = [
    ['검증 아이템', guide.item],
    [],
    ['구분', '단계/문항유형', '질문/내용', '핵심목표/확인포인트', '선택지/필수여부'],
  ];

  if (guide.analysis) {
    rows.push(['검증 분석', '핵심 검증 목표', guide.analysis.coreGoal, '', '']);
    guide.analysis.keyHypotheses.forEach((h, idx) => {
      rows.push(['검증 분석', `우선 검증 가설 ${idx + 1}`, h, '', '']);
    });
    rows.push(['검증 분석', '질문 설계 진단', guide.analysis.questionAudit, '', '']);
    guide.analysis.interviewTips.forEach((tip, idx) => {
      rows.push(['검증 분석', `인터뷰 진행 팁 ${idx + 1}`, tip, '', '']);
    });
  }

  guide.interview.forEach((q, idx) => {
    rows.push([
      '인터뷰 질문',
      `${idx + 1}. ${q.stage}`,
      q.prompt,
      q.purpose ?? '',
      '',
    ]);
  });

  guide.survey.forEach((q, idx) => {
    rows.push([
      '설문 문항',
      `${idx + 1}. ${types[q.type]}`,
      q.label,
      '',
      `${q.required ? '필수' : '선택'}${q.options.length ? ` · ${q.options.join(' / ')}` : ''}`,
    ]);
  });

  const filename = `리서치가이드-${safeFileSlug(guide.item, '질문설계')}-${dateStamp()}.csv`;
  download(rows, filename);
  return filename;
}

export function exportInterviewAnalysisCsv(analysis: InterviewAnalysis): string {
  const rows: CsvRow[] = [
    ['검증 아이템', analysis.item],
    ['종합 요약', analysis.summary],
    ['검증 진단', analysis.validationReadiness],
    [],
    ['분류', '원본 질문 / 항목', '판정 / 세부 구분', '진단 / 인사이트 내용', '개선 질문 / 실행 제안', '확인 지표'],
  ];

  analysis.questionReviews.forEach((qr, idx) => {
    rows.push([
      `질문 진단 #${idx + 1}`,
      qr.original,
      qr.verdict,
      qr.diagnosis,
      qr.improved,
      qr.insightGoal,
    ]);
  });

  analysis.insights.painPoints.forEach((item, idx) => {
    rows.push(['핵심 인사이트', `페인포인트 ${idx + 1}`, '', item, '', '']);
  });
  analysis.insights.currentAlternatives.forEach((item, idx) => {
    rows.push(['핵심 인사이트', `현재 대안 ${idx + 1}`, '', item, '', '']);
  });
  rows.push(['핵심 인사이트', '지불 의향 · 전환 장벽', '', analysis.insights.willingnessToPay, '', '']);
  analysis.insights.keyPatterns.forEach((item, idx) => {
    rows.push(['핵심 인사이트', `발견 패턴 ${idx + 1}`, '', item, '', '']);
  });
  analysis.insights.nextActions.forEach((item, idx) => {
    rows.push(['다음 검증 액션', `액션 ${idx + 1}`, '', '', item, '']);
  });

  const filename = `인터뷰분석-${safeFileSlug(analysis.item, '리포트')}-${dateStamp()}.csv`;
  download(rows, filename);
  return filename;
}

export function exportCollectedInterviewsCsv(people: Person[], voiceAnswers: VoiceAnswer[]): string {
  const personById = new Map(people.map((p) => [p.id, p]));
  const rows: CsvRow[] = [
    [
      '기록 출처',
      '대상자 이름',
      '특징',
      '그룹',
      '진행 상태',
      '현재 대안',
      '섭외 경로',
      '일시',
      '질문 / 구분',
      '수집된 인터뷰 텍스트',
      '비고 (예시/STT방식)',
    ],
  ];

  for (const p of people) {
    if (!p.note.trim() && p.sample) continue;
    if (!p.note.trim()) continue;
    rows.push([
      '인사이트 기록 공간',
      p.name,
      p.desc,
      p.group,
      p.status,
      p.alternative,
      p.source,
      formatDateTime(p.date),
      '핵심 인사이트 · 인터뷰 메모',
      p.note.trim(),
      p.sample ? '예시 데이터' : '실제 기록',
    ]);
  }

  for (const va of voiceAnswers) {
    const p = personById.get(va.personId);
    const transcript = va.transcript?.trim() ?? '';
    rows.push([
      '음성 인터뷰 STT',
      p?.name ?? '미지정 대상자',
      p?.desc ?? '',
      p?.group ?? '',
      p?.status ?? '',
      p?.alternative ?? '',
      p?.source ?? '',
      formatDateTime(va.recordedAt),
      va.question,
      transcript || '(STT 미변환 녹음)',
      `${va.seconds}초 · ${va.sttEngine === 'gemini' ? 'AI STT' : va.sttEngine === 'browser' ? '실시간 초안' : '미변환'}${
        va.syncedToRecord ? ' · 기록공간 반영됨' : ''
      }`,
    ]);
  }

  const filename = `수집된-인터뷰-텍스트-${dateStamp()}.csv`;
  download(rows, filename);
  return filename;
}

export function exportVoiceAnswersCsv(person: Person, answers: VoiceAnswer[]): string {
  const rows: CsvRow[] = [
    ['대상자', '그룹', '질문', '녹음 일시', '길이(초)', 'STT 방식', '기록공간 반영', '변환된 인터뷰 텍스트'],
    ...answers.map((a) => [
      person.name,
      person.group,
      a.question,
      formatDateTime(a.recordedAt),
      a.seconds,
      a.sttEngine === 'gemini' ? 'AI STT' : a.sttEngine === 'browser' ? '실시간 초안' : '미변환',
      a.syncedToRecord ? '반영됨' : '미반영',
      a.transcript?.trim() || '',
    ]),
  ];
  const filename = `음성STT기록-${safeFileSlug(person.name, '인터뷰')}-${dateStamp()}.csv`;
  download(rows, filename);
  return filename;
}

export function exportSentimentTrendCsv(trend: SentimentTrendOutput): string {
  const rows: CsvRow[] = [
    ['분석 범위', trend.scopeTitle],
    ['평균 감성 지수 (-100~100)', trend.overallScore],
    ['긍정 발화 비중 (%)', trend.positiveShare],
    ['부정·불만 비중 (%)', trend.negativeShare],
    ['중립 비중 (%)', trend.neutralShare],
    ['감정 변화 추세', trend.trendDirection],
    ['전체 감정 흐름 요약', trend.summary],
    ['주요 감정 변곡점', trend.turningPoints.join(' | ')],
    ['분석 시각', formatDateTime(trend.analyzedAt)],
    [],
    ['순번', '구간 라벨', '발화자', '감정 분류', '감성 점수', '긍정(%)', '중립(%)', '부정(%)', '대표 발화 인용', '감정 유발 요인'],
    ...trend.points.map((pt, idx) => [
      pt.index ?? idx + 1,
      pt.label,
      pt.speaker,
      pt.emotionLabel,
      pt.sentimentScore,
      pt.positiveRatio,
      pt.neutralRatio,
      pt.negativeRatio,
      pt.excerpt,
      pt.trigger,
    ]),
  ];

  const filename = `감정추이분석-${safeFileSlug(trend.scopeTitle, '인터뷰')}-${dateStamp()}.csv`;
  download(rows, filename);
  return filename;
}

export function exportTextSummaryCsv(summary: TextSummaryOutput, title?: string): string {
  const styleLabel =
    summary.style === 'concise'
      ? '핵심 3줄 요약'
      : summary.style === 'bullet'
      ? '포인트별 구조화'
      : '검증·실행 중심';

  const rows: CsvRow[] = [
    ['구분', '내용'],
    ['제목 / 대상', title?.trim() || '텍스트 요약'],
    ['요약 형식', styleLabel],
    ['원문 글자수', summary.originalChars],
    ['요약 글자수', summary.summaryChars],
    ['한 줄 핵심 결론', summary.headline],
    ['요약 본문', summary.summary],
    ...summary.keyPoints.map((kp, i) => [`핵심 포인트 ${i + 1}`, kp]),
    ['핵심 키워드', summary.keywords.join(', ')],
    ...summary.actionItems.map((act, i) => [`후속 실행 제안 ${i + 1}`, act]),
    ['요약 시각', formatDateTime(summary.summarizedAt)],
  ];

  const filename = `텍스트요약-${safeFileSlug(title || summary.headline, '요약')}-${dateStamp()}.csv`;
  download(rows, filename);
  return filename;
}

export function exportSurveyRawResponsesCsv(summary: SurveySummary): string {
  const ordered = [...summary.responses].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const rows: CsvRow[] = [
    ['응답 번호', '응답 ID', '제출 시각', '참여 동의', ...summary.questions.map((q, i) => `Q${i + 1}. ${q.label}`)],
    ...ordered.map((r, idx) => [
      `#${idx + 1}`,
      r.id,
      formatDateTime(r.createdAt),
      '동의',
      ...summary.questions.map((_, qIdx) => r.answers[qIdx] ?? ''),
    ]),
  ];

  const filename = `설문응답원문-${safeFileSlug(summary.title, summary.id)}-${dateStamp()}.csv`;
  download(rows, filename);
  return filename;
}

export function exportSurveyAnalyticsCsv(input: {
  summary: SurveySummary;
  distributions: QuestionDistribution[];
  keywords: ExtractedKeyword[];
  timeline: TimelinePoint[];
  overallScaleAvg: number | null;
  aiAnalysis?: SurveyAnalysis;
}): string {
  const { summary, distributions, keywords, timeline, overallScaleAvg, aiAnalysis } = input;
  const rows: CsvRow[] = [
    ['설문 제목', summary.title],
    ['설문 소개', summary.intro],
    ['총 수집 응답(건)', summary.count],
    ['접수 상태', summary.active ? '응답 접수 중' : '접수 종료'],
    ['5점 척도 전체 평균', overallScaleAvg !== null ? overallScaleAvg.toFixed(2) : '해당 없음'],
    ['추출 키워드 수', keywords.length],
    [],
    ['[1. 문항별 응답 분포]', '문항', '문항 유형', '응답 수', '항목 / 척도 / 길이 구간', '빈도(건)', '비율(%)', '통계/원문 요약'],
  ];

  for (const dist of distributions) {
    const statText =
      dist.type === 'scale' && dist.averageScore
        ? `평균 ${dist.averageScore.toFixed(2)} / 중앙 ${dist.medianScore ?? 0}`
        : dist.type === 'text' && dist.avgLength !== undefined
        ? `평균 길이 ${dist.avgLength}자`
        : '';
    for (const bucket of dist.buckets) {
      rows.push([
        `Q${dist.questionIndex + 1}`,
        dist.label,
        types[dist.type],
        `${dist.answeredCount}/${dist.totalCount}`,
        bucket.label,
        bucket.count,
        bucket.pct,
        statText,
      ]);
    }
    if (dist.type === 'text' && dist.textSamples && dist.textSamples.length > 0) {
      dist.textSamples.forEach((txt, sIdx) => {
        rows.push([
          `Q${dist.questionIndex + 1} 서술응답`,
          dist.label,
          '서술형 원문',
          `#${sIdx + 1}`,
          '',
          '',
          '',
          txt,
        ]);
      });
    }
  }

  rows.push([]);
  rows.push(['[2. 키워드 추출 및 감성]', '언급 횟수', '감성 분류', '포함 응답 수', '대표 인용문']);
  if (keywords.length) {
    for (const kw of keywords) {
      rows.push([kw.word, kw.count, kw.sentiment, kw.responseIndices.length, kw.sampleQuotes.join(' / ')]);
    }
  } else {
    rows.push(['추출된 텍스트 키워드 없음', 0, '', 0, '']);
  }

  rows.push([]);
  rows.push(['[3. 시간별 응답 추이]', '시간/일자', '신규 응답(건)', '누적 응답(건)']);
  for (const pt of timeline) {
    rows.push([pt.key, pt.label, pt.count, pt.cumulative]);
  }

  if (aiAnalysis) {
    rows.push([]);
    rows.push(['[4. AI 응답 심층 분석]', '내용']);
    rows.push(['종합 요약', aiAnalysis.overview]);
    aiAnalysis.keyFindings.forEach((f, idx) => rows.push([`핵심 발견 ${idx + 1}`, f]));
    aiAnalysis.segmentSignals.forEach((s, idx) => rows.push([`세그먼트 신호 ${idx + 1}`, s]));
    aiAnalysis.recommendations.forEach((r, idx) => rows.push([`후속 실행 제안 ${idx + 1}`, r]));
  }

  const orderedResponses = [...summary.responses].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  rows.push([]);
  rows.push([
    '[5. 응답별 수집 원문 내역]',
    '응답 ID',
    '제출 시각',
    ...summary.questions.map((q, i) => `Q${i + 1}. ${q.label}`),
  ]);
  orderedResponses.forEach((resp, idx) => {
    rows.push([
      `응답 #${idx + 1}`,
      resp.id,
      formatDateTime(resp.createdAt),
      ...summary.questions.map((_, qIdx) => resp.answers[qIdx] ?? ''),
    ]);
  });

  const filename = `설문분석결과-${safeFileSlug(summary.title, summary.id)}-${dateStamp()}.csv`;
  download(rows, filename);
  return filename;
}

export function exportAllResearchBundleCsv(input: {
  people: Person[];
  voiceAnswers: VoiceAnswer[];
  guide: QuestionGuide | null;
  interviewAnalysis: InterviewAnalysis | null;
  sentimentResults: SentimentTrendOutput[];
  textSummary: TextSummaryOutput | null;
  surveySummaries: SurveySummary[];
}): string {
  const personById = new Map(input.people.map((p) => [p.id, p]));
  const rows: CsvRow[] = [
    ['리서치랩 통합 내보내기', `생성 일시: ${formatDateTime(Date.now())}`],
    ['전체 대상자 수', input.people.filter((p) => !p.sample).length, '음성 녹음 수', input.voiceAnswers.length, '설문 수', input.surveySummaries.length],
    [],
    ['[섹션 1. 인터뷰 대상자 및 수집 텍스트]', '이름', '특징', '그룹', '진행 상태', '현재 대안', '섭외 경로', '일시', '핵심 인사이트 / 수집 텍스트'],
  ];

  for (const p of input.people) {
    if (p.sample && !p.note.trim()) continue;
    rows.push([
      p.sample ? '예시 대상자' : '대상자 기록',
      p.name,
      p.desc,
      p.group,
      p.status,
      p.alternative,
      p.source,
      formatDateTime(p.date),
      p.note.trim(),
    ]);
  }

  for (const va of input.voiceAnswers) {
    const p = personById.get(va.personId);
    rows.push([
      '음성 인터뷰 STT',
      p?.name ?? '미지정 대상자',
      p?.desc ?? '',
      p?.group ?? '',
      p?.status ?? '',
      `${va.seconds}초`,
      va.sttEngine ?? '미변환',
      formatDateTime(va.recordedAt),
      `Q. ${va.question}\nA. ${va.transcript?.trim() || '(미변환)'}`,
    ]);
  }

  if (input.guide) {
    rows.push([]);
    rows.push(['[섹션 2. 리서치 가이드 분석]', '검증 아이템', input.guide.item]);
    if (input.guide.analysis) {
      rows.push(['핵심 검증 목표', input.guide.analysis.coreGoal]);
      rows.push(['질문 설계 진단', input.guide.analysis.questionAudit]);
      input.guide.analysis.keyHypotheses.forEach((h, i) => rows.push([`우선 가설 ${i + 1}`, h]));
    }
    input.guide.interview.forEach((q, i) => rows.push([`인터뷰 질문 ${i + 1}`, q.stage, q.prompt, q.purpose ?? '']));
  }

  if (input.interviewAnalysis) {
    rows.push([]);
    rows.push(['[섹션 3. 인터뷰 질문·메모 AI 분석]', '아이템', input.interviewAnalysis.item]);
    rows.push(['종합 요약', input.interviewAnalysis.summary]);
    rows.push(['검증 진단', input.interviewAnalysis.validationReadiness]);
    input.interviewAnalysis.questionReviews.forEach((qr, i) =>
      rows.push([`질문 진단 ${i + 1}`, qr.verdict, qr.original, qr.diagnosis, qr.improved]),
    );
    input.interviewAnalysis.insights.painPoints.forEach((p, i) => rows.push([`페인포인트 ${i + 1}`, p]));
    input.interviewAnalysis.insights.keyPatterns.forEach((p, i) => rows.push([`핵심 패턴 ${i + 1}`, p]));
    input.interviewAnalysis.insights.nextActions.forEach((p, i) => rows.push([`다음 액션 ${i + 1}`, p]));
  }

  if (input.sentimentResults.length > 0) {
    rows.push([]);
    rows.push(['[섹션 4. 감정 추이 분석 결과]', '범위', '평균 지수', '긍정(%)', '부정(%)', '추세', '요약']);
    for (const s of input.sentimentResults) {
      rows.push(['감정 요약', s.scopeTitle, s.overallScore, s.positiveShare, s.negativeShare, s.trendDirection, s.summary]);
      for (const pt of s.points) {
        rows.push(['세부 구간', pt.label, pt.sentimentScore, pt.positiveRatio, pt.negativeRatio, pt.emotionLabel, `${pt.excerpt} (요인: ${pt.trigger})`]);
      }
    }
  }

  if (input.textSummary) {
    rows.push([]);
    rows.push(['[섹션 5. AI 텍스트 요약]', '핵심 결론', input.textSummary.headline]);
    rows.push(['요약 본문', input.textSummary.summary]);
    input.textSummary.keyPoints.forEach((k, i) => rows.push([`핵심 포인트 ${i + 1}`, k]));
    rows.push(['키워드', input.textSummary.keywords.join(', ')]);
    input.textSummary.actionItems.forEach((a, i) => rows.push([`실행 제안 ${i + 1}`, a]));
  }

  if (input.surveySummaries.length > 0) {
    rows.push([]);
    rows.push(['[섹션 6. 설문조사 현황 및 수집 응답]', '설문 제목', '수집 응답 수', '문항 수', '상태']);
    for (const s of input.surveySummaries) {
      rows.push(['설문', s.title, s.count, s.questions.length, s.active ? '진행 중' : '종료']);
      const ordered = [...s.responses].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      if (ordered.length > 0) {
        rows.push(['응답 번호', '제출 시각', ...s.questions.map((q, idx) => `Q${idx + 1}. ${q.label}`)]);
        ordered.forEach((r, idx) => {
          rows.push([`#${idx + 1}`, formatDateTime(r.createdAt), ...s.questions.map((_, qIdx) => r.answers[qIdx] ?? '')]);
        });
      }
    }
  }

  const filename = `리서치랩-전체분석통합-${dateStamp()}.csv`;
  download(rows, filename);
  return filename;
}

export function exportResearchTemplateCsv(template: ResearchTemplate): string {
  const rows: CsvRow[] = [
    ['템플릿 제목', template.title],
    ['카테고리', template.category],
    ['적합한 상황', template.situation],
    ['활용 시점', template.whenToUse],
    ['인터뷰 핵심 팁', template.cautionTip],
    ...(template.purposeInput ? [['입력한 리서치 목적', template.purposeInput]] : []),
    [],
    ['구분', '단계 / 문항 유형', '질문 내용', '확인 포인트 / 선택지', '필수 여부'],
  ];

  template.interview.forEach((item, idx) => {
    rows.push(['인터뷰 질문', `${idx + 1}. ${item.stage}`, item.prompt, item.purpose, '']);
  });

  rows.push(['설문 제목', '', template.surveyTitle, template.surveyIntro, '']);
  template.survey.forEach((q, idx) => {
    rows.push([
      '설문 문항',
      `${idx + 1}. ${types[q.type]}`,
      q.label,
      q.type === 'choice' ? q.options.join(' / ') : q.type === 'scale' ? '1~5점 척도' : '자유 서술',
      q.required ? '필수' : '선택',
    ]);
  });

  const filename = `질문템플릿-${safeFileSlug(template.title, '리서치')}-${dateStamp()}.csv`;
  download(rows, filename);
  return filename;
}

