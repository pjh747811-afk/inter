import { useEffect, useMemo, useState } from 'react';
import { Check, Copy, Download, FileText, Sparkles } from 'lucide-react';
import { api, demoStore } from '../lib/api';
import { listAllVoiceAnswers, type VoiceAnswer } from '../lib/interviewAudio';
import { questionGuideKey, type QuestionGuide } from '../lib/questionGuide';
import { types, type Person, type SurveySummary } from '../lib/research';
import { exportInsightReportCsv } from '../lib/researchCsv';
import { computeQuestionDistributions } from '../lib/surveyAnalytics';
import { saasUi } from './ResearchUI';

export const insightReportKey = 'research.insight-report.v1';

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

const dateFormatter = new Intl.DateTimeFormat('ko-KR', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

function formatReportMarkdown(report: InsightReportOutput): string {
  const lines = [
    `# ${report.reportTitle}`,
    `- 생성 시각: ${dateFormatter.format(new Date(report.generatedAt))}`,
    `- 분석 범위: ${report.dataCoverage}`,
    '',
    '## 핵심 요약',
    report.executiveSummary,
    '',
    '## 인터뷰 · 설문 교차 분석',
    report.interviewVsSurveyAlignment,
    '',
    '## 주요 통찰',
    ...report.keyInsights.map(
      (k, idx) =>
        `${idx + 1}. **${k.title}** (${k.confidence})\n   - 근거: ${k.evidence}\n   - 시사점: ${k.implication}`,
    ),
    '',
    '## 핵심 페인포인트',
    ...report.painPoints.map((p) => `- ${p}`),
    '',
    '## 주요 사용자 세그먼트',
    ...report.userSegments.map((s) => `- **${s.segment}**: ${s.characteristics} → 기회: ${s.opportunity}`),
    '',
    '## 실행 권장 액션',
    ...report.recommendedActions.map((a) => `- [${a.priority}] ${a.action} (${a.rationale})`),
    '',
    '## 추가 검증 질문',
    ...report.openQuestions.map((q) => `- ${q}`),
  ];
  return lines.join('\n');
}

export function AiInsightReportPanel({
  people,
  surveySummaries,
}: {
  people: Person[];
  surveySummaries: SurveySummary[];
}) {
  const [report, setReport] = useState<InsightReportOutput | null>(() =>
    demoStore.get<InsightReportOutput | null>(insightReportKey, null),
  );
  const [voiceAnswers, setVoiceAnswers] = useState<VoiceAnswer[]>([]);
  const [topic, setTopic] = useState(() => demoStore.get<QuestionGuide | null>(questionGuideKey, null)?.item ?? '');
  const [includeSamples, setIncludeSamples] = useState(() => {
    const hasRealPeopleNote = people.some((p) => !p.sample && p.note.trim().length > 0);
    const hasSurveyResponse = surveySummaries.some((s) => s.count > 0);
    return !hasRealPeopleNote && !hasSurveyResponse;
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let active = true;
    const loadVoice = () => {
      void listAllVoiceAnswers()
        .then((rows) => {
          if (active) setVoiceAnswers(rows);
        })
        .catch(() => {});
    };
    loadVoice();

    const onSync = () => {
      setReport(demoStore.get<InsightReportOutput | null>(insightReportKey, null));
      loadVoice();
    };
    window.addEventListener('research-voice-updated', loadVoice);
    window.addEventListener('research-sync-applied', onSync);
    window.addEventListener('storage', onSync);
    return () => {
      active = false;
      window.removeEventListener('research-voice-updated', loadVoice);
      window.removeEventListener('research-sync-applied', onSync);
      window.removeEventListener('storage', onSync);
    };
  }, []);

  const hasSamples = useMemo(() => people.some((p) => p.sample && p.note.trim()), [people]);

  const compiledInterviews = useMemo(() => {
    const voiceByPerson = new Map<string, VoiceAnswer[]>();
    for (const va of voiceAnswers) {
      if (!va.transcript?.trim() || va.transcript.includes('인식된 음성이 없습니다')) continue;
      const list = voiceByPerson.get(va.personId) ?? [];
      list.push(va);
      voiceByPerson.set(va.personId, list);
    }

    const entries: Array<{
      speaker: string;
      group?: string;
      status?: string;
      alternative?: string;
      text: string;
    }> = [];
    const seenPersonIds = new Set<string>();

    for (const p of people) {
      if (p.sample && !includeSamples) continue;
      const noteText = p.note.trim();
      const personVoices = voiceByPerson.get(p.id) ?? [];
      const extraVoiceLines = personVoices
        .filter((v) => {
          const t = v.transcript?.trim() ?? '';
          return t && !noteText.includes(t.slice(0, Math.min(28, t.length)));
        })
        .map((v) => `[음성 STT] Q. ${v.question}\nA. ${v.transcript?.trim() ?? ''}`);

      const combinedText = [noteText, ...extraVoiceLines].filter(Boolean).join('\n\n');
      if (!combinedText) continue;

      seenPersonIds.add(p.id);
      entries.push({
        speaker: p.name,
        group: p.group,
        status: p.status,
        alternative: p.alternative || undefined,
        text: combinedText,
      });
    }

    for (const [personId, list] of voiceByPerson.entries()) {
      if (seenPersonIds.has(personId)) continue;
      const text = list
        .map((v) => `[음성 STT] Q. ${v.question}\nA. ${v.transcript?.trim() ?? ''}`)
        .join('\n\n');
      if (text) {
        entries.push({
          speaker: `음성 기록 (${personId.slice(0, 6)})`,
          text,
        });
      }
    }

    return entries;
  }, [people, voiceAnswers, includeSamples]);

  const compiledSurveys = useMemo(() => {
    return surveySummaries
      .filter((s) => s.count > 0)
      .map((s) => {
        const distributions = computeQuestionDistributions(s.questions, s.responses);
        const questionsSummary = distributions
          .map((d) => {
            const topBuckets = d.buckets
              .filter((b) => b.count > 0)
              .slice(0, 5)
              .map((b) => `${b.label}: ${b.count}명(${b.pct}%)`)
              .join(', ');
            const avgText = d.type === 'scale' && d.averageScore ? ` [평균 ${d.averageScore.toFixed(2)}/5]` : '';
            return `Q${d.questionIndex + 1}(${types[d.type]}) ${d.label}${avgText} -> ${topBuckets || '집계 없음'}`;
          })
          .join('\n');

        const ordered = [...s.responses].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
        const sampleResponses = ordered.slice(0, 35).map((r, idx) => {
          const pairs = s.questions
            .map((q, qIdx) => `Q${qIdx + 1}:${r.answers[qIdx] || '(무응답)'}`)
            .join(' | ');
          return `응답 #${idx + 1}: ${pairs}`;
        });

        return {
          title: s.title,
          responseCount: s.count,
          questionsSummary,
          sampleResponses,
        };
      });
  }, [surveySummaries]);

  const totalSurveyResponses = useMemo(
    () => compiledSurveys.reduce((sum, s) => sum + s.responseCount, 0),
    [compiledSurveys],
  );
  const voiceTranscriptCount = useMemo(
    () =>
      voiceAnswers.filter(
        (v) => Boolean(v.transcript?.trim()) && !v.transcript?.includes('인식된 음성이 없습니다'),
      ).length,
    [voiceAnswers],
  );

  async function handleGenerateReport() {
    if (compiledInterviews.length === 0 && compiledSurveys.length === 0) {
      setError('수집된 인터뷰 기록이나 설문 응답이 1건 이상 있어야 AI 인사이트 리포트를 생성할 수 있어요.');
      return;
    }

    setBusy(true);
    setError('');
    setNotice('');
    try {
      const next = await api<InsightReportOutput>('/api/research/generate-insight-report', {
        method: 'POST',
        body: JSON.stringify({
          topic: topic.trim() || undefined,
          interviews: compiledInterviews,
          surveys: compiledSurveys,
        }),
      });
      setReport(next);
      demoStore.set(insightReportKey, next);
      setNotice('수집된 인터뷰와 설문 데이터를 종합한 AI 인사이트 리포트를 생성했어요.');
    } catch (err) {
      setError(err instanceof Error ? err.message : '인사이트 리포트를 생성하지 못했어요. 잠시 후 다시 시도해 주세요.');
    } finally {
      setBusy(false);
    }
  }

  async function handleCopyMarkdown() {
    if (!report) return;
    try {
      await navigator.clipboard.writeText(formatReportMarkdown(report));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setNotice('클립보드 복사가 제한된 환경이에요. CSV 다운로드를 이용해 주세요.');
    }
  }

  return (
    <section
      aria-labelledby="ai-insight-report-heading"
      className={`grid gap-5 ${saasUi.card} p-5 sm:p-6`}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3.5">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-[#efeaff] text-[#4125cc]">
            <FileText size={21} aria-hidden="true" />
          </span>
          <div>
            <h2 id="ai-insight-report-heading" className={saasUi.sectionTitle}>
              AI 통합 인사이트 리포트
            </h2>
            <p className="mt-1 text-[15px] leading-relaxed text-[#565570]">
              수집된 인터뷰 기록(메모 · 음성 STT)과 설문 응답 데이터를 교차 분석해 핵심 통찰과 실행 제안을 요약해요.
            </p>
            <p className="tnum mt-2 flex flex-wrap items-center gap-2 text-[14px] font-semibold text-[#44435c]">
              <span>분석 대상: 인터뷰 기록 {compiledInterviews.length}건</span>
              <span aria-hidden="true">·</span>
              <span>음성 STT {voiceTranscriptCount}건</span>
              <span aria-hidden="true">·</span>
              <span>
                설문 {compiledSurveys.length}개 (총 응답 {totalSurveyResponses}건)
              </span>
            </p>
          </div>
        </div>

        <button
          type="button"
          disabled={busy || (compiledInterviews.length === 0 && compiledSurveys.length === 0)}
          onClick={() => void handleGenerateReport()}
          className={saasUi.btnPrimary}
        >
          <Sparkles size={16} aria-hidden="true" />
          {busy ? '데이터 교차 분석 중…' : report ? '리포트 새로 생성' : 'AI 인사이트 리포트 생성'}
        </button>
      </div>

      <div className="flex flex-wrap items-end gap-4 border-t border-[#e6e3f0] pt-4">
        <label className="grid min-w-[240px] flex-1 gap-1.5 text-[14px] font-bold text-[#17162b]">
          리서치 주제 · 검증 목표 (선택)
          <input
            type="text"
            maxLength={200}
            value={topic}
            disabled={busy}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="예: 프리랜서 정산 자동화 서비스 초기 문제·수요 검증"
            className={`${saasUi.input} bg-[#faf9fd] focus:bg-white`}
          />
        </label>

        {hasSamples && (
          <label className="flex min-h-11 shrink-0 items-center gap-2 text-[14px] font-semibold text-[#44435c]">
            <input
              type="checkbox"
              checked={includeSamples}
              disabled={busy}
              onChange={(e) => setIncludeSamples(e.target.checked)}
              className="size-4.5 accent-[#4c2ee6]"
            />
            예시 대상자 기록도 포함
          </label>
        )}
      </div>

      {error && (
        <p role="alert" className="rounded-xl border border-[#f5c7d0] bg-[#fff3f5] px-4 py-3 text-[15px] font-medium text-[#9f1d45]">
          {error}
        </p>
      )}

      {notice && (
        <p role="status" className="rounded-xl border border-[#d6c9fa] bg-[#f4f0ff] px-4 py-3 text-[15px] font-medium text-[#4125cc]">
          {notice}
        </p>
      )}

      {!report && !busy && (
        <div className={`${saasUi.inset} px-5 py-6 text-[15px] leading-relaxed text-[#565570]`}>
          상단의 <b className="font-bold text-[#17162b]">AI 인사이트 리포트 생성</b> 버튼을 누르면 수집된 인터뷰 텍스트와 설문 응답 분포·원문을 한데 모아 핵심 통찰, 사용자 세그먼트, 즉시 실행 액션을 한 장의 리포트로 요약해 드립니다.
        </div>
      )}

      {report && (
        <div className="grid gap-5 border-t border-[#e6e3f0] pt-5">
          {/* Report Header & Export Controls */}
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="grid gap-1">
              <h3 className="font-display text-[21px] font-extrabold tracking-tight text-[#17162b]">
                {report.reportTitle}
              </h3>
              <p className="tnum flex flex-wrap items-center gap-2 text-[14px] text-[#565570]">
                <span>생성: {dateFormatter.format(new Date(report.generatedAt))}</span>
                <span aria-hidden="true">·</span>
                <span>{report.dataCoverage}</span>
              </p>
            </div>

            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void handleCopyMarkdown()}
                className={saasUi.btnCompactSecondary}
              >
                {copied ? (
                  <>
                    <Check size={15} className="text-[#14674d]" aria-hidden="true" /> 복사 완료
                  </>
                ) : (
                  <>
                    <Copy size={15} aria-hidden="true" /> 리포트 복사
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={() => {
                  const file = exportInsightReportCsv(report);
                  setNotice(`AI 인사이트 리포트를 CSV(${file})로 다운로드했어요.`);
                }}
                className={saasUi.btnCompactSecondary}
              >
                <Download size={15} aria-hidden="true" /> 리포트 CSV
              </button>
            </div>
          </div>

          {/* Executive Summary + Cross-Analysis */}
          <div className="grid gap-4 lg:grid-cols-2">
            <div className={`grid gap-2 ${saasUi.cardSoft} p-5`}>
              <h4 className="text-[14px] font-extrabold text-[#4125cc]">핵심 요약 (Executive Summary)</h4>
              <p className="text-[15px] leading-relaxed text-[#17162b]">{report.executiveSummary}</p>
            </div>
            <div className={`grid gap-2 ${saasUi.inset} p-5`}>
              <h4 className="text-[14px] font-extrabold text-[#17162b]">인터뷰 · 설문 교차 비교</h4>
              <p className="text-[15px] leading-relaxed text-[#44435c]">{report.interviewVsSurveyAlignment}</p>
            </div>
          </div>

          {/* Key Insights */}
          <div className="grid gap-2.5">
            <h4 className="text-[16px] font-bold text-[#17162b]">주요 통찰 {report.keyInsights.length}가지</h4>
            <ol className="divide-y divide-[#e6e3f0] rounded-xl border border-[#e4e1ef]">
              {report.keyInsights.map((item, idx) => {
                const confColor =
                  item.confidence === '높음'
                    ? 'text-[#14674d]'
                    : item.confidence === '추가 검증 필요'
                    ? 'text-[#9f1d45]'
                    : 'text-[#4125cc]';
                return (
                  <li key={idx} className="grid gap-2 px-5 py-4">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <b className="tnum text-[16px] font-bold text-[#17162b]">
                        0{idx + 1}. {item.title}
                      </b>
                      <span className={`text-[14px] font-bold ${confColor}`}>신뢰도 · {item.confidence}</span>
                    </div>
                    <p className="text-[14px] leading-relaxed text-[#44435c]">
                      <b className="font-bold text-[#17162b]">근거:</b> {item.evidence}
                    </p>
                    <p className="text-[14px] leading-relaxed text-[#4125cc]">
                      <b className="font-bold">시사점:</b> {item.implication}
                    </p>
                  </li>
                );
              })}
            </ol>
          </div>

          {/* Pain Points & User Segments */}
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="grid gap-3 rounded-xl border border-[#e4e1ef] p-5">
              <h4 className="text-[16px] font-bold text-[#17162b]">반복된 고객 페인포인트</h4>
              <ul className="grid gap-2.5 text-[15px] leading-relaxed text-[#17162b]">
                {report.painPoints.map((pain, idx) => (
                  <li key={idx} className="flex items-start gap-2.5">
                    <span className="tnum font-mono text-[14px] font-extrabold text-[#9f1d45]">0{idx + 1}</span>
                    <span>{pain}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="grid gap-3 rounded-xl border border-[#e4e1ef] p-5">
              <h4 className="text-[16px] font-bold text-[#17162b]">발견된 사용자 세그먼트</h4>
              <ul className="divide-y divide-[#e6e3f0]">
                {report.userSegments.map((seg, idx) => (
                  <li key={idx} className="grid gap-1.5 py-3 first:pt-0 last:pb-0">
                    <b className="text-[15px] font-bold text-[#4125cc]">{seg.segment}</b>
                    <p className="text-[14px] leading-relaxed text-[#565570]">{seg.characteristics}</p>
                    <p className="text-[14px] leading-relaxed text-[#17162b]">
                      <b className="font-bold">기회 포인트:</b> {seg.opportunity}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Recommended Actions & Open Questions */}
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
            <div className="grid gap-2.5">
              <h4 className="text-[16px] font-bold text-[#17162b]">다음 실행 권장 액션</h4>
              <ul className="divide-y divide-[#e6e3f0] rounded-xl border border-[#e4e1ef]">
                {report.recommendedActions.map((act, idx) => {
                  const priorityColor =
                    act.priority === '즉시 실행'
                      ? 'text-[#14674d]'
                      : act.priority === '단기 검증'
                      ? 'text-[#4125cc]'
                      : 'text-[#8b4d17]';
                  return (
                    <li key={idx} className="grid gap-1.5 px-5 py-3.5">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <b className="text-[15px] font-bold text-[#17162b]">{act.action}</b>
                        <span className={`shrink-0 text-[14px] font-bold ${priorityColor}`}>{act.priority}</span>
                      </div>
                      <p className="text-[14px] leading-relaxed text-[#565570]">{act.rationale}</p>
                    </li>
                  );
                })}
              </ul>
            </div>

            <div className={`grid gap-3 ${saasUi.inset} p-5`}>
              <h4 className="text-[16px] font-bold text-[#17162b]">추가 확인이 필요한 질문</h4>
              <ul className="grid gap-2.5 text-[14px] leading-relaxed text-[#44435c]">
                {report.openQuestions.map((q, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <span className="font-mono font-bold text-[#4125cc]">Q{idx + 1}.</span>
                    <span>{q}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
