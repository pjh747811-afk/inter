import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import * as d3 from 'd3';
import {
  ArrowUpRight,
  BarChart3,
  Check,
  ClipboardList,
  Download,
  FileDown,
  FilterX,
  Hash,
  Link2,
  Plus,
  RefreshCw,
  RotateCcw,
  Sparkles,
  TrendingUp,
} from 'lucide-react';
import { api, demoStore } from '../lib/api';
import { exportSurveyPdfReport } from '../lib/pdfReport';
import { exportSurveyAnalyticsCsv, exportSurveyRawResponsesCsv } from '../lib/researchCsv';
import {
  types,
  type SurveyAnalysis,
  type SurveyKey,
  type SurveySummary,
} from '../lib/research';
import {
  computeOverallScaleAverage,
  computeQuestionDistributions,
  computeResponseTimeline,
  extractSurveyKeywords,
  type DistributionBucket,
  type ExtractedKeyword,
  type TimelinePoint,
} from '../lib/surveyAnalytics';
import { saasUi, saveBlob } from './ResearchUI';
import type { useSurveys } from './Surveys';

const base = '/api/research';
const CHART_PALETTE = ['#4c2ee6', '#356bc9', '#19825f', '#d97724', '#b01e4a', '#745cf0', '#238280'];

function sentimentColor(sentiment: ExtractedKeyword['sentiment']): string {
  if (sentiment === '긍정') return '#19825f';
  if (sentiment === '개선요청') return '#b01e4a';
  return '#4c2ee6';
}

function sentimentSoftBg(sentiment: ExtractedKeyword['sentiment']): string {
  if (sentiment === '긍정') return '#e6f7ef';
  if (sentiment === '개선요청') return '#fff0f3';
  return '#efeaff';
}

function sentimentText(sentiment: ExtractedKeyword['sentiment']): string {
  if (sentiment === '긍정') return '#14674d';
  if (sentiment === '개선요청') return '#9f1d45';
  return '#4125cc';
}

function useContainerWidth(ref: React.RefObject<HTMLDivElement | null>, fallback = 480): number {
  const [width, setWidth] = useState(fallback);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      const next = Math.round(el.getBoundingClientRect().width);
      if (next > 0) setWidth(next);
    };
    update();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);

  return width;
}

function truncateLabel(text: string, maxLen: number): string {
  return text.length > maxLen ? `${text.slice(0, maxLen - 1)}…` : text;
}

function highlightMatch(text: string, keyword: string) {
  if (!keyword.trim()) return text;
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const parts = text.split(new RegExp(`(${escaped})`, 'gi'));
  return parts.map((part, idx) =>
    part.toLowerCase() === keyword.toLowerCase() ? (
      <mark key={idx} className="rounded bg-[#efeaff] px-1 font-semibold text-[#4125cc]">
        {part}
      </mark>
    ) : (
      <span key={idx}>{part}</span>
    ),
  );
}

export function SurveyAnalytics({ state }: { state: ReturnType<typeof useSurveys> }) {
  const [params, setParams] = useSearchParams();
  const requestedId = params.get('surveyId') ?? '';
  const selectedKey: SurveyKey | undefined =
    state.keys.find((k) => k.id === requestedId) ?? state.keys[0];
  const summary: SurveySummary | undefined = selectedKey ? state.summaries[selectedKey.id] : undefined;

  const surveyAiStoreKey = 'research.survey-ai-analysis.v1';
  const [selectedQuestionIdx, setSelectedQuestionIdx] = useState(0);
  const [keywordChartMode, setKeywordChartMode] = useState<'bubble' | 'bar'>('bubble');
  const [selectedKeyword, setSelectedKeyword] = useState('');
  const [analysisMap, setAnalysisMap] = useState<Record<string, SurveyAnalysis>>(() =>
    demoStore.get<Record<string, SurveyAnalysis>>(surveyAiStoreKey, {}),
  );
  const [analyzing, setAnalyzing] = useState(false);
  const [aiError, setAiError] = useState('');
  const [notice, setNotice] = useState('');
  const [copiedId, setCopiedId] = useState('');
  const [csvBusy, setCsvBusy] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);

  const barSvgRef = useRef<SVGSVGElement | null>(null);
  const donutSvgRef = useRef<SVGSVGElement | null>(null);
  const keywordSvgRef = useRef<SVGSVGElement | null>(null);
  const timelineSvgRef = useRef<SVGSVGElement | null>(null);

  // Refresh latest collected responses when entering analytics or switching surveys
  useEffect(() => {
    setSelectedQuestionIdx(0);
    setSelectedKeyword('');
    setAiError('');
    if (selectedKey?.id) {
      state.reload(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedKey?.id]);

  const distributions = useMemo(
    () => (summary ? computeQuestionDistributions(summary.questions, summary.responses) : []),
    [summary],
  );

  // Pick a sensible default quantitative question when distributions load
  useEffect(() => {
    if (!distributions.length) return;
    if (selectedQuestionIdx >= distributions.length) {
      const firstQuant = distributions.findIndex((d) => d.type === 'choice' || d.type === 'scale');
      setSelectedQuestionIdx(firstQuant >= 0 ? firstQuant : 0);
    }
  }, [distributions, selectedQuestionIdx]);

  const currentAiAnalysis = selectedKey ? analysisMap[selectedKey.id] : undefined;

  const keywords = useMemo(
    () => (summary ? extractSurveyKeywords(summary, currentAiAnalysis?.keywords) : []),
    [summary, currentAiAnalysis?.keywords],
  );

  const timeline = useMemo(
    () => (summary ? computeResponseTimeline(summary.responses) : []),
    [summary],
  );

  const overallScaleAvg = useMemo(
    () => computeOverallScaleAverage(distributions),
    [distributions],
  );

  const activeDistribution = distributions[selectedQuestionIdx] ?? distributions[0];

  const filteredResponses = useMemo(() => {
    if (!summary) return [];
    if (!selectedKeyword.trim()) {
      return summary.responses.map((row, idx) => ({ row, idx }));
    }
    const target = selectedKeyword.trim().toLowerCase();
    const matchedKeyword = keywords.find((k) => k.word.toLowerCase() === target);
    return summary.responses
      .map((row, idx) => ({ row, idx }))
      .filter(({ row, idx }) => {
        if (matchedKeyword?.responseIndices.includes(idx)) return true;
        return row.answers.some((ans) => ans.toLowerCase().includes(target));
      });
  }, [summary, selectedKeyword, keywords]);

  function selectSurvey(id: string) {
    const next = new URLSearchParams(params);
    next.set('view', 'analytics');
    next.set('surveyId', id);
    setParams(next, { replace: true });
  }

  async function copySurveyLink(s: SurveyKey) {
    const url = `${window.location.origin}/survey/${s.id}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(s.id);
      setNotice('배포용 설문 링크를 복사했어요.');
      setTimeout(() => setCopiedId(''), 2000);
    } catch {
      setNotice(`배포 링크: ${url}`);
    }
  }

  async function exportCsv(s: SurveyKey) {
    setCsvBusy(true);
    setAiError('');
    try {
      const r = await fetch(`${base}/manage/${s.id}/answers.csv?all=1`, {
        headers: { authorization: `Bearer ${s.key}` },
      });
      if (!r.ok) throw new Error('CSV 파일을 내려받지 못했어요.');
      saveBlob(await r.blob(), `설문응답원문-${s.id}.csv`);
      setNotice('수집된 설문 응답 원문을 CSV로 저장했어요.');
    } catch (e) {
      if (summary && summary.responses.length > 0) {
        const file = exportSurveyRawResponsesCsv(summary);
        setNotice(`수집된 설문 응답 원문(${file})을 CSV로 저장했어요.`);
      } else {
        setAiError(e instanceof Error ? e.message : 'CSV 내보내기에 실패했어요.');
      }
    } finally {
      setCsvBusy(false);
    }
  }

  async function handleExportPdf() {
    if (!summary || summary.count === 0) return;
    setPdfBusy(true);
    setAiError('');
    setNotice('');
    try {
      const fileName = await exportSurveyPdfReport({
        summary,
        distributions,
        keywords,
        timeline,
        overallScaleAvg,
        aiAnalysis: currentAiAnalysis,
        chartSvgs: {
          bar: barSvgRef.current,
          donut: donutSvgRef.current,
          keyword: keywordSvgRef.current,
          timeline: timelineSvgRef.current,
          activeQuestionLabel: activeDistribution
            ? `Q${activeDistribution.questionIndex + 1}. ${activeDistribution.label}`
            : undefined,
        },
      });
      setNotice(`PDF 리포트(${fileName})를 다운로드했어요.`);
    } catch (e) {
      setAiError(e instanceof Error ? e.message : 'PDF 리포트를 생성하지 못했어요. 다시 시도해 주세요.');
    } finally {
      setPdfBusy(false);
    }
  }

  async function runAiAnalysis() {
    if (!selectedKey || !summary || summary.count === 0) return;
    setAnalyzing(true);
    setAiError('');
    setNotice('');
    try {
      const result = await api<SurveyAnalysis>(`${base}/manage/${selectedKey.id}/analyze`, {
        method: 'POST',
        headers: { authorization: `Bearer ${selectedKey.key}` },
      });
      setAnalysisMap((prev) => {
        const next = { ...prev, [selectedKey.id]: result };
        demoStore.set(surveyAiStoreKey, next, true);
        return next;
      });
      setNotice('AI 응답 심층 분석과 키워드 감성 분류를 완료했어요. 분석 결과 CSV에도 바로 반영돼요.');
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'AI 응답 분석에 실패했어요. 다시 시도해 주세요.');
    } finally {
      setAnalyzing(false);
    }
  }

  if (!state.keys.length) {
    return (
      <div className="grid gap-5">
        <div>
          <h1 className={saasUi.pageTitle}>설문 데이터 분석 대시보드</h1>
          <p className={saasUi.pageSubtitle}>
            수집된 설문 응답 분포, 시간별 추이, 추출 키워드를 D3 차트로 시각화해요.
          </p>
        </div>

        <section className={`${saasUi.card} grid justify-items-center gap-3 px-6 py-12 text-center`}>
          <span className="grid size-13 place-items-center rounded-xl bg-[#efeaff] text-[#4c2ee6]">
            <BarChart3 size={25} aria-hidden="true" />
          </span>
          <h2 className="text-[20px] font-bold text-[#17162b]">분석할 설문이 아직 없어요</h2>
          <p className="max-w-md text-[15px] leading-relaxed text-[#565570]">
            먼저 설문 탭에서 검증할 아이템으로 설문을 생성하고 배포 링크로 응답을 수집하면, 이 대시보드에서 D3 차트로 바로 분석할 수 있어요.
          </p>
          <Link
            to="/?view=surveys&new=1"
            className={`${saasUi.btnPrimary} mt-2`}
          >
            <Plus size={17} aria-hidden="true" /> 아이템으로 첫 설문 만들기
          </Link>
        </section>
      </div>
    );
  }

  return (
    <div className="grid gap-6">
      {/* Header & Controls */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className={saasUi.pageTitle}>설문 데이터 분석 대시보드</h1>
          <p className={saasUi.pageSubtitle}>
            수집된 응답 분포·추이·추출 키워드를 D3 차트로 확인하고, 키워드별로 실제 답변을 필터링해요.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-[14px] font-semibold text-[#565570]">
            <span className="sr-only">분석할 설문 선택</span>
            <select
              aria-label="분석할 설문 선택"
              value={selectedKey?.id ?? ''}
              onChange={(e) => selectSurvey(e.target.value)}
              className="min-h-11 max-w-[300px] rounded-xl border border-[#dcd8e8] bg-white px-3.5 text-[15px] font-semibold text-[#17162b] hover:border-[#b9b1d4] focus:border-[#4c2ee6] focus:outline-none"
            >
              {state.keys.map((k) => {
                const s = state.summaries[k.id];
                return (
                  <option key={k.id} value={k.id}>
                    {k.title} ({s ? `${s.count}건` : '로딩'})
                  </option>
                );
              })}
            </select>
          </label>

          <button
            type="button"
            disabled={state.loading}
            onClick={() => state.reload()}
            className={saasUi.btnCompactSecondary}
          >
            <RefreshCw size={15} aria-hidden="true" /> 새로고침
          </button>

          {selectedKey && (
            <>
              <button
                type="button"
                onClick={() => void copySurveyLink(selectedKey)}
                className={saasUi.btnCompactSoft}
              >
                {copiedId === selectedKey.id ? <Check size={15} aria-hidden="true" /> : <Link2 size={15} aria-hidden="true" />}
                {copiedId === selectedKey.id ? '복사됨' : '링크 복사'}
              </button>
              <a
                href={`/survey/${selectedKey.id}`}
                target="_blank"
                rel="noreferrer"
                className={saasUi.btnCompactSecondary}
              >
                응답 화면 <ArrowUpRight size={15} aria-hidden="true" />
              </a>
              <button
                type="button"
                disabled={!summary || summary.count === 0 || csvBusy}
                onClick={() => void exportCsv(selectedKey)}
                className={saasUi.btnCompactSecondary}
              >
                <Download size={15} aria-hidden="true" /> 응답 원문 CSV
              </button>
              <button
                type="button"
                disabled={!summary || summary.count === 0}
                onClick={() => {
                  if (!summary) return;
                  const file = exportSurveyAnalyticsCsv({
                    summary,
                    distributions,
                    keywords,
                    timeline,
                    overallScaleAvg,
                    aiAnalysis: currentAiAnalysis,
                  });
                  setNotice(`설문 분석 결과 데이터(${file})를 CSV로 저장했어요.`);
                }}
                className={saasUi.btnCompactSecondary}
              >
                <Download size={15} aria-hidden="true" /> 분석 결과 CSV
              </button>
              <button
                type="button"
                disabled={!summary || summary.count === 0 || pdfBusy}
                onClick={() => void handleExportPdf()}
                className={saasUi.btnCompactPrimary}
              >
                <FileDown size={15} aria-hidden="true" />
                {pdfBusy ? 'PDF 생성 중…' : '리포트 내보내기'}
              </button>
            </>
          )}
        </div>
      </div>

      {notice && (
        <p className="rounded-xl bg-[#efeaff] px-4 py-3 text-[15px] font-semibold text-[#4125cc]" role="status">
          {notice}
        </p>
      )}

      {!summary ? (
        <section className={`${saasUi.card} p-8 text-center text-[15px] text-[#565570]`}>
          {state.loading ? '설문 응답 데이터를 불러오는 중…' : '선택한 설문 데이터를 불러올 수 없어요. 새로고침을 눌러 주세요.'}
        </section>
      ) : summary.count === 0 ? (
        <section className="grid justify-items-center gap-3 rounded-2xl border border-dashed border-[#dcd8e8] bg-white px-6 py-12 text-center">
          <span className="grid size-13 place-items-center rounded-xl bg-[#f4f0ff] text-[#4c2ee6]">
            <ClipboardList size={24} aria-hidden="true" />
          </span>
          <h2 className="text-[18px] font-bold text-[#17162b]">"{summary.title}" 설문에 아직 수집된 응답이 없어요</h2>
          <p className="max-w-md text-[15px] leading-relaxed text-[#565570]">
            배포 링크를 타겟 유저에게 공유하거나, 응답 화면을 열어 직접 테스트 응답을 제출하면 즉시 D3 차트와 키워드 분석이 표시돼요.
          </p>
          <div className="mt-1 flex flex-wrap justify-center gap-2.5">
            <button
              type="button"
              onClick={() => selectedKey && void copySurveyLink(selectedKey)}
              className={saasUi.btnPrimary}
            >
              <Link2 size={16} aria-hidden="true" /> 배포 링크 복사하기
            </button>
            <a
              href={`/survey/${summary.id}`}
              target="_blank"
              rel="noreferrer"
              className={saasUi.btnSecondary}
            >
              응답 화면에서 테스트하기 <ArrowUpRight size={16} aria-hidden="true" />
            </a>
          </div>
        </section>
      ) : (
        <>
          {/* KPI Summary Strip */}
          <section aria-label="설문 핵심 지표" className="grid grid-cols-2 gap-3.5 lg:grid-cols-4">
            <div className={`${saasUi.card} px-5 py-4`}>
              <span className="block text-[14px] font-semibold text-[#565570]">총 수집 응답</span>
              <span className="tnum mt-1.5 block font-display text-[28px] font-extrabold text-[#17162b]">
                {summary.count}
                <small className="ml-1 text-[14px] font-semibold text-[#565570]">건</small>
              </span>
              <span className={`mt-1 block text-[13px] font-bold ${summary.active ? 'text-[#14674d]' : 'text-[#565570]'}`}>
                {summary.active ? '응답 접수 중' : '접수 종료됨'}
              </span>
            </div>

            <div className={`${saasUi.card} px-5 py-4`}>
              <span className="block text-[14px] font-semibold text-[#565570]">설문 문항 구성</span>
              <span className="tnum mt-1.5 block font-display text-[28px] font-extrabold text-[#17162b]">
                {summary.questions.length}
                <small className="ml-1 text-[14px] font-semibold text-[#565570]">문항</small>
              </span>
              <span className="tnum mt-1 block text-[13px] text-[#565570]">
                객관식 {summary.questions.filter((q) => q.type === 'choice').length} · 척도{' '}
                {summary.questions.filter((q) => q.type === 'scale').length} · 서술{' '}
                {summary.questions.filter((q) => q.type === 'text').length}
              </span>
            </div>

            <div className={`${saasUi.card} px-5 py-4`}>
              <span className="block text-[14px] font-semibold text-[#565570]">5점 척도 전체 평균</span>
              <span className="tnum mt-1.5 block font-display text-[28px] font-extrabold text-[#4c2ee6]">
                {overallScaleAvg !== null ? overallScaleAvg.toFixed(2) : '—'}
                {overallScaleAvg !== null && (
                  <small className="ml-1 text-[14px] font-semibold text-[#565570]">/ 5.0</small>
                )}
              </span>
              <span className="mt-1 block text-[13px] text-[#565570]">
                {overallScaleAvg !== null ? '척도 문항 기준 평균 점수' : '척도형 문항 없음'}
              </span>
            </div>

            <div className={`${saasUi.card} px-5 py-4`}>
              <span className="block text-[14px] font-semibold text-[#565570]">최다 언급 키워드</span>
              <span className="mt-1.5 block truncate font-display text-[28px] font-extrabold text-[#17162b]">
                {keywords[0]?.word ?? '—'}
              </span>
              <span className="tnum mt-1 block text-[13px] text-[#565570]">
                {keywords.length ? `총 ${keywords.length}개 키워드 추출 · 최다 ${keywords[0].count}회` : '텍스트 응답 대기 중'}
              </span>
            </div>
          </section>

          {/* Row 1: D3 Question Distribution (Bar + Donut) */}
          <section className={`grid gap-4 ${saasUi.card} p-5 sm:p-6`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className={`flex items-center gap-2 ${saasUi.sectionTitle}`}>
                  <BarChart3 size={20} className="text-[#4c2ee6]" aria-hidden="true" />
                  문항별 응답 분포 (D3 차트)
                </h2>
                <p className="mt-1 text-[14px] text-[#565570]">
                  문항을 선택하면 응답 빈도 막대 차트와 비율 도넛 차트를 함께 확인할 수 있어요.
                </p>
              </div>
              {activeDistribution && (
                <span className="tnum text-[14px] font-semibold text-[#4125cc]">
                  {types[activeDistribution.type]} · 응답 {activeDistribution.answeredCount}/{activeDistribution.totalCount}건
                  {activeDistribution.type === 'scale' && activeDistribution.averageScore
                    ? ` · 평균 ${activeDistribution.averageScore.toFixed(2)}점`
                    : ''}
                </span>
              )}
            </div>

            {/* Question Selector Tabs */}
            <div className="flex flex-wrap gap-2" role="tablist" aria-label="분석할 문항 선택">
              {distributions.map((dist, idx) => {
                const active = idx === selectedQuestionIdx;
                return (
                  <button
                    key={idx}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setSelectedQuestionIdx(idx)}
                    className={`min-h-10 rounded-xl border px-3.5 py-2 text-left text-[14px] font-semibold transition-colors ${
                      active
                        ? 'border-[#4c2ee6] bg-[#efeaff] text-[#4125cc]'
                        : 'border-[#dcd8e8] bg-[#f8f7fc] text-[#44435c] hover:border-[#cfc1f3] hover:text-[#17162b]'
                    }`}
                  >
                    <span className="tnum mr-1.5 font-mono">Q{idx + 1}</span>
                    {truncateLabel(dist.label, 24)}
                  </button>
                );
              })}
            </div>

            {activeDistribution && (
              <div className="grid gap-5 border-t border-[#e6e3f0] pt-5 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
                <div className="min-w-0">
                  <h3 className="mb-3 text-[16px] font-bold text-[#17162b]">
                    Q{activeDistribution.questionIndex + 1}. {activeDistribution.label}
                  </h3>
                  <DistributionBarChart buckets={activeDistribution.buckets} externalRef={barSvgRef} />
                </div>
                <div className="min-w-0 rounded-xl border border-[#e6e3f0] bg-[#f8f7fc] p-4 sm:p-5">
                  <h3 className="mb-2 text-[14px] font-bold text-[#565570]">응답 비율 분포</h3>
                  <DistributionDonutChart
                    buckets={activeDistribution.buckets}
                    centerValue={
                      activeDistribution.type === 'scale' && activeDistribution.averageScore
                        ? activeDistribution.averageScore.toFixed(1)
                        : String(activeDistribution.answeredCount)
                    }
                    centerLabel={activeDistribution.type === 'scale' ? '평균 점수' : '응답 수'}
                    externalRef={donutSvgRef}
                  />
                </div>
              </div>
            )}
          </section>

          {/* Row 2: D3 Keyword Extraction + D3 Response Timeline */}
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
            {/* Keyword Extraction D3 Chart */}
            <section className={`grid min-w-0 gap-3.5 ${saasUi.card} p-5 sm:p-6`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className={`flex items-center gap-2 ${saasUi.sectionTitle}`}>
                    <Hash size={19} className="text-[#4c2ee6]" aria-hidden="true" />
                    키워드 추출 시각화 (D3)
                  </h2>
                  <p className="mt-1 text-[14px] text-[#565570]">
                    버블이나 막대를 클릭하면 아래 응답 원문에서 해당 키워드가 포함된 답변만 모아볼 수 있어요.
                  </p>
                </div>

                <div className="flex items-center gap-1 rounded-xl border border-[#dcd8e8] bg-[#f8f7fc] p-1">
                  <button
                    type="button"
                    onClick={() => setKeywordChartMode('bubble')}
                    className={`min-h-9 whitespace-nowrap rounded-lg px-3 text-[14px] font-semibold transition-colors ${
                      keywordChartMode === 'bubble' ? 'bg-[#4c2ee6] text-white' : 'text-[#565570] hover:text-[#17162b]'
                    }`}
                  >
                    버블 차트
                  </button>
                  <button
                    type="button"
                    onClick={() => setKeywordChartMode('bar')}
                    className={`min-h-9 whitespace-nowrap rounded-lg px-3 text-[14px] font-semibold transition-colors ${
                      keywordChartMode === 'bar' ? 'bg-[#4c2ee6] text-white' : 'text-[#565570] hover:text-[#17162b]'
                    }`}
                  >
                    빈도 막대
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 text-[14px] text-[#565570]">
                <div className="flex flex-wrap items-center gap-4">
                  <span className="inline-flex items-center gap-2">
                    <span className="size-3 rounded-sm bg-[#4c2ee6]" aria-hidden="true" /> 중립/핵심어
                  </span>
                  <span className="inline-flex items-center gap-2">
                    <span className="size-3 rounded-sm bg-[#19825f]" aria-hidden="true" /> 긍정 신호
                  </span>
                  <span className="inline-flex items-center gap-2">
                    <span className="size-3 rounded-sm bg-[#b01e4a]" aria-hidden="true" /> 불편/개선요청
                  </span>
                </div>
                {selectedKeyword && (
                  <button
                    type="button"
                    onClick={() => setSelectedKeyword('')}
                    className="inline-flex items-center gap-1.5 font-bold text-[#4125cc] hover:underline"
                  >
                    <FilterX size={15} aria-hidden="true" /> "{selectedKeyword}" 필터 해제
                  </button>
                )}
              </div>

              {keywords.length === 0 ? (
                <div className="grid place-items-center rounded-xl border border-dashed border-[#dcd8e8] py-12 text-center text-[14px] text-[#565570]">
                  서술형·텍스트 응답이 수집되면 주요 키워드를 자동으로 추출해 시각화해요.
                </div>
              ) : keywordChartMode === 'bubble' ? (
                <KeywordPackChart
                  keywords={keywords}
                  selected={selectedKeyword}
                  onSelect={(word) => setSelectedKeyword((prev) => (prev === word ? '' : word))}
                  externalRef={keywordSvgRef}
                />
              ) : (
                <KeywordRankBarChart
                  keywords={keywords.slice(0, 10)}
                  selected={selectedKeyword}
                  onSelect={(word) => setSelectedKeyword((prev) => (prev === word ? '' : word))}
                  externalRef={keywordSvgRef}
                />
              )}
            </section>

            {/* Timeline D3 Chart */}
            <section className={`grid min-w-0 content-start gap-3.5 ${saasUi.card} p-5 sm:p-6`}>
              <div>
                <h2 className={`flex items-center gap-2 ${saasUi.sectionTitle}`}>
                  <TrendingUp size={19} className="text-[#4c2ee6]" aria-hidden="true" />
                  시간별 응답 수집 추이 (D3)
                </h2>
                <p className="mt-1 text-[14px] text-[#565570]">
                  일자 또는 시간대별 신규 응답 수와 누적 응답 흐름을 보여줘요.
                </p>
              </div>
              <ResponseTimelineChart points={timeline} externalRef={timelineSvgRef} />

              {/* Quick Top Keywords Summary */}
              {keywords.length > 0 && (
                <div className="grid gap-2.5 border-t border-[#e6e3f0] pt-3.5">
                  <h3 className="text-[14px] font-bold text-[#565570]">상위 추출 키워드 TOP 6</h3>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {keywords.slice(0, 6).map((kw) => {
                      const active = selectedKeyword === kw.word;
                      return (
                        <button
                          key={kw.word}
                          type="button"
                          onClick={() => setSelectedKeyword(active ? '' : kw.word)}
                          className={`flex min-h-10 items-center justify-between gap-1.5 rounded-xl border px-3 text-[14px] transition-colors ${
                            active
                              ? 'border-[#4c2ee6] bg-[#efeaff] font-bold text-[#4125cc]'
                              : 'border-[#dcd8e8] bg-[#f8f7fc] text-[#17162b] hover:border-[#cfc1f3]'
                          }`}
                        >
                          <span className="truncate font-medium">{kw.word}</span>
                          <span className="tnum shrink-0 font-mono text-[13px] font-bold text-[#4125cc]">
                            {kw.count}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </section>
          </div>

          {/* Row 3: AI Deep Survey Insight Summary */}
          <section className={`grid gap-3.5 ${saasUi.cardSoft} p-5 sm:p-6`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className={`flex items-center gap-2 ${saasUi.sectionTitle}`}>
                  <Sparkles size={19} className="text-[#4c2ee6]" aria-hidden="true" />
                  AI 응답 인사이트 및 키워드 감성 분석
                </h2>
                <p className="mt-1 text-[14px] text-[#565570]">
                  수집된 응답 전체를 AI가 종합 분석해 핵심 발견사항, 세그먼트 신호, 감성별 키워드를 정리해 드려요.
                </p>
              </div>
              <button
                type="button"
                disabled={analyzing || summary.count === 0}
                onClick={() => void runAiAnalysis()}
                className={saasUi.btnPrimary}
              >
                <Sparkles size={16} aria-hidden="true" />
                {analyzing ? 'AI가 응답 데이터를 분석 중…' : currentAiAnalysis ? 'AI 분석 새로고침' : 'AI 분석 실행하기'}
              </button>
            </div>

            {aiError && (
              <div
                role="alert"
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#f2ccd7] bg-[#fff5f7] px-4 py-3 text-[15px] text-[#9f1d45]"
              >
                <span>{aiError}</span>
                <button
                  type="button"
                  onClick={() => void runAiAnalysis()}
                  className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-[#e6a4b7] bg-white px-3 text-[14px] font-bold text-[#9f1d45] hover:bg-[#fff8fa]"
                >
                  <RotateCcw size={14} aria-hidden="true" /> 다시 시도
                </button>
              </div>
            )}

            {currentAiAnalysis && (
              <div className="grid gap-4 rounded-xl border border-[#dfd7fb] bg-white p-5 text-[15px]">
                <p className="leading-relaxed text-[#17162b]">{currentAiAnalysis.overview}</p>
                <div className="grid gap-4 md:grid-cols-3">
                  <div>
                    <b className="text-[14px] font-bold text-[#4125cc]">핵심 발견 사항</b>
                    <ul className="mt-1.5 list-disc space-y-1.5 pl-4 text-[#17162b]">
                      {currentAiAnalysis.keyFindings.map((item, idx) => (
                        <li key={idx}>{item}</li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <b className="text-[14px] font-bold text-[#4125cc]">타겟 유저 신호</b>
                    <ul className="mt-1.5 list-disc space-y-1.5 pl-4 text-[#17162b]">
                      {currentAiAnalysis.segmentSignals.map((item, idx) => (
                        <li key={idx}>{item}</li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <b className="text-[14px] font-bold text-[#4125cc]">후속 실행 제안</b>
                    <ul className="mt-1.5 list-disc space-y-1.5 pl-4 text-[#17162b]">
                      {currentAiAnalysis.recommendations.map((item, idx) => (
                        <li key={idx}>{item}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            )}
          </section>

          {/* Row 4: Collected Responses Table (Keyword-Filterable) */}
          <section className={`overflow-hidden ${saasUi.card}`}>
            <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 sm:px-6">
              <div>
                <h2 className={saasUi.sectionTitle}>
                  수집된 응답 원문{' '}
                  <span className="tnum font-mono text-[16px] text-[#4c2ee6]">
                    {filteredResponses.length}
                    {selectedKeyword ? ` / ${summary.count}` : ''}건
                  </span>
                </h2>
                <p className="mt-0.5 text-[14px] text-[#565570]">
                  {selectedKeyword
                    ? `"${selectedKeyword}" 키워드가 포함된 응답을 필터링해 보고 있어요.`
                    : '위 키워드 차트를 클릭하면 관련 응답만 바로 모아볼 수 있어요.'}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {selectedKeyword && (
                  <button
                    type="button"
                    onClick={() => setSelectedKeyword('')}
                    className={saasUi.btnCompactSoft}
                  >
                    <FilterX size={15} aria-hidden="true" /> 전체 응답 보기
                  </button>
                )}
                {selectedKey && (
                  <button
                    type="button"
                    disabled={summary.count === 0 || csvBusy}
                    onClick={() => void exportCsv(selectedKey)}
                    className={saasUi.btnCompactSecondary}
                  >
                    <Download size={15} aria-hidden="true" /> 응답 원문 CSV
                  </button>
                )}
              </div>
            </div>

            <div className="overflow-x-auto border-t border-[#e6e3f0]" role="region" aria-label="응답 원문 목록" tabIndex={0}>
              <table className="w-full min-w-[640px] border-collapse text-left text-[15px] tnum">
                <thead>
                  <tr className="bg-[#f8f7fc] text-[13px] font-semibold text-[#565570]">
                    <th scope="col" className="py-3 pl-5 pr-3 sm:pl-6">
                      #
                    </th>
                    <th scope="col" className="px-3 py-3">
                      제출 시각
                    </th>
                    {summary.questions.map((q, qIdx) => (
                      <th key={qIdx} scope="col" className="max-w-[240px] px-3 py-3">
                        <span className="block truncate" title={q.label}>
                          Q{qIdx + 1}. {q.label}
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#e6e3f0]">
                  {filteredResponses.map(({ row, idx }) => (
                    <tr key={row.id} className="align-top transition-colors hover:bg-[#faf9ff]">
                      <td className="py-3.5 pl-5 pr-3 font-mono text-[14px] text-[#565570] sm:pl-6">#{idx + 1}</td>
                      <td className="whitespace-nowrap px-3 py-3.5 font-mono text-[14px] text-[#565570]">
                        {row.createdAt.slice(0, 16).replace('T', ' ')}
                      </td>
                      {summary.questions.map((_, qIdx) => (
                        <td key={qIdx} className="max-w-[280px] px-3 py-3.5 text-[#17162b]">
                          {row.answers[qIdx] ? highlightMatch(row.answers[qIdx], selectedKeyword) : '—'}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              {filteredResponses.length === 0 && (
                <p className="px-5 py-8 text-center text-[15px] text-[#565570]">
                  선택한 키워드가 포함된 응답이 없어요. 필터를 해제해 보세요.
                </p>
              )}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* D3 Chart 1: Horizontal Response Distribution Bar Chart             */
/* ------------------------------------------------------------------ */
function DistributionBarChart({
  buckets,
  externalRef,
}: {
  buckets: DistributionBucket[];
  externalRef?: React.MutableRefObject<SVGSVGElement | null>;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const width = useContainerWidth(wrapRef, 480);

  function attachRef(node: SVGSVGElement | null) {
    svgRef.current = node;
    if (externalRef) externalRef.current = node;
  }

  useEffect(() => {
    const svgEl = svgRef.current;
    if (!svgEl || width <= 0) return;

    const svg = d3.select(svgEl);
    svg.selectAll('*').remove();

    const rowHeight = 44;
    const margin = {
      top: 10,
      right: 88,
      bottom: 26,
      left: width < 420 ? 108 : 150,
    };
    const innerW = Math.max(120, width - margin.left - margin.right);
    const innerH = Math.max(132, buckets.length * rowHeight);
    const totalH = innerH + margin.top + margin.bottom;

    svg.attr('width', width).attr('height', totalH).attr('viewBox', `0 0 ${width} ${totalH}`);

    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);
    const maxCount = Math.max(1, d3.max(buckets, (b) => b.count) ?? 1);

    const x = d3.scaleLinear().domain([0, maxCount]).nice().range([0, innerW]);
    const y = d3
      .scaleBand()
      .domain(buckets.map((b) => b.label))
      .range([0, innerH])
      .padding(0.32);

    // Subtle vertical gridlines
    g.append('g')
      .selectAll('line')
      .data(x.ticks(Math.min(5, maxCount)))
      .join('line')
      .attr('x1', (d) => x(d))
      .attr('x2', (d) => x(d))
      .attr('y1', 0)
      .attr('y2', innerH)
      .attr('stroke', '#e6e3f0')
      .attr('stroke-dasharray', '3 3');

    // Bottom axis
    g.append('g')
      .attr('transform', `translate(0,${innerH})`)
      .call(d3.axisBottom(x).ticks(Math.min(5, maxCount)).tickFormat(d3.format('d')))
      .call((axis) => axis.select('.domain').attr('stroke', '#dcd8e8'))
      .call((axis) => axis.selectAll('.tick line').remove())
      .call((axis) => axis.selectAll('text').attr('fill', '#565570').attr('font-size', '13px'));

    // Y labels
    g.selectAll('.y-label')
      .data(buckets)
      .join('text')
      .attr('class', 'y-label')
      .attr('x', -10)
      .attr('y', (d) => (y(d.label) ?? 0) + y.bandwidth() / 2)
      .attr('dy', '0.35em')
      .attr('text-anchor', 'end')
      .attr('fill', '#17162b')
      .attr('font-size', '14px')
      .attr('font-weight', '600')
      .text((d) => truncateLabel(d.label, width < 420 ? 10 : 15));

    // Background track
    g.selectAll('.bar-track')
      .data(buckets)
      .join('rect')
      .attr('class', 'bar-track')
      .attr('x', 0)
      .attr('y', (d) => y(d.label) ?? 0)
      .attr('width', innerW)
      .attr('height', y.bandwidth())
      .attr('rx', 6)
      .attr('fill', '#f4f2fa');

    // Data bars
    const bars = g
      .selectAll('.bar-fill')
      .data(buckets)
      .join('rect')
      .attr('class', 'bar-fill')
      .attr('x', 0)
      .attr('y', (d) => y(d.label) ?? 0)
      .attr('width', (d) => Math.max(d.count > 0 ? 6 : 0, x(d.count)))
      .attr('height', y.bandwidth())
      .attr('rx', 6)
      .attr('fill', (_d, i) => CHART_PALETTE[i % CHART_PALETTE.length]);

    // Value labels
    g.selectAll('.val-label')
      .data(buckets)
      .join('text')
      .attr('class', 'val-label')
      .attr('x', innerW + 8)
      .attr('y', (d) => (y(d.label) ?? 0) + y.bandwidth() / 2)
      .attr('dy', '0.35em')
      .attr('fill', '#17162b')
      .attr('font-size', '14px')
      .attr('font-weight', '700')
      .text((d) => `${d.count}건 (${d.pct}%)`);

    // SVG Tooltip on hover
    const tooltip = svg.append('g').attr('pointer-events', 'none').attr('opacity', 0);
    const tipBg = tooltip
      .append('rect')
      .attr('rx', 8)
      .attr('fill', '#17162b')
      .attr('height', 32);
    const tipText = tooltip
      .append('text')
      .attr('fill', '#ffffff')
      .attr('font-size', '13px')
      .attr('font-weight', '600')
      .attr('y', 21)
      .attr('x', 10);

    bars
      .on('mouseenter', function (_event, d) {
        d3.select(this).attr('opacity', 0.82);
        const label = `${d.label}: ${d.count}명 (${d.pct}%)`;
        tipText.text(label);
        const textLen = Math.max(108, label.length * 8 + 24);
        tipBg.attr('width', textLen);
        const barY = margin.top + (y(d.label) ?? 0) - 36;
        const tx = Math.min(width - textLen - 6, margin.left + Math.max(0, x(d.count) / 2 - textLen / 2));
        tooltip.attr('transform', `translate(${Math.max(4, tx)},${Math.max(4, barY)})`).attr('opacity', 1);
      })
      .on('mouseleave', function () {
        d3.select(this).attr('opacity', 1);
        tooltip.attr('opacity', 0);
      });
  }, [buckets, width]);

  return (
    <div ref={wrapRef} className="w-full overflow-hidden">
      <svg ref={attachRef} className="block w-full" role="img" aria-label="문항별 응답 분포 막대 차트" />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* D3 Chart 2: Donut Chart for Proportion Breakdown                   */
/* ------------------------------------------------------------------ */
function DistributionDonutChart({
  buckets,
  centerValue,
  centerLabel,
  externalRef,
}: {
  buckets: DistributionBucket[];
  centerValue: string;
  centerLabel: string;
  externalRef?: React.MutableRefObject<SVGSVGElement | null>;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const width = useContainerWidth(wrapRef, 320);

  function attachRef(node: SVGSVGElement | null) {
    svgRef.current = node;
    if (externalRef) externalRef.current = node;
  }

  const nonZeroBuckets = useMemo(() => buckets.filter((b) => b.count > 0), [buckets]);

  useEffect(() => {
    const svgEl = svgRef.current;
    if (!svgEl || width <= 0) return;

    const svg = d3.select(svgEl);
    svg.selectAll('*').remove();

    const size = Math.min(200, Math.max(150, width - 20));
    const radius = size / 2 - 8;
    const innerRadius = radius * 0.58;

    svg.attr('width', size).attr('height', size).attr('viewBox', `0 0 ${size} ${size}`);
    const g = svg.append('g').attr('transform', `translate(${size / 2},${size / 2})`);

    if (!nonZeroBuckets.length) {
      g.append('circle').attr('r', radius).attr('fill', 'none').attr('stroke', '#e6e3f0').attr('stroke-width', 16);
      return;
    }

    const pie = d3
      .pie<DistributionBucket>()
      .value((d) => d.count)
      .sort(null)
      .padAngle(0.025);

    const arc = d3.arc<d3.PieArcDatum<DistributionBucket>>().innerRadius(innerRadius).outerRadius(radius).cornerRadius(4);
    const arcHover = d3
      .arc<d3.PieArcDatum<DistributionBucket>>()
      .innerRadius(innerRadius)
      .outerRadius(radius + 5)
      .cornerRadius(4);

    const colorIndexMap = new Map(buckets.map((b, i) => [b.label, CHART_PALETTE[i % CHART_PALETTE.length]]));

    // Center Metric elements updated smoothly on slice hover
    const centerValText = g
      .append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', '-0.1em')
      .attr('fill', '#17162b')
      .attr('font-size', '24px')
      .attr('font-weight', '800')
      .text(centerValue);

    const centerLblText = g
      .append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', '1.4em')
      .attr('fill', '#565570')
      .attr('font-size', '13px')
      .attr('font-weight', '600')
      .text(centerLabel);

    g.selectAll<SVGPathElement, d3.PieArcDatum<DistributionBucket>>('path')
      .data(pie(nonZeroBuckets))
      .join('path')
      .attr('d', arc)
      .attr('fill', (d) => colorIndexMap.get(d.data.label) ?? '#4c2ee6')
      .attr('stroke', '#ffffff')
      .attr('stroke-width', 1.5)
      .attr('cursor', 'pointer')
      .on('mouseenter', function (_event, d) {
        d3.select<SVGPathElement, d3.PieArcDatum<DistributionBucket>>(this)
          .transition()
          .duration(140)
          .attr('d', (datum) => arcHover(datum) ?? '');
        centerValText.text(`${d.data.pct}%`);
        centerLblText.text(truncateLabel(d.data.label, 12));
      })
      .on('mouseleave', function () {
        d3.select<SVGPathElement, d3.PieArcDatum<DistributionBucket>>(this)
          .transition()
          .duration(140)
          .attr('d', (datum) => arc(datum) ?? '');
        centerValText.text(centerValue);
        centerLblText.text(centerLabel);
      });
  }, [buckets, nonZeroBuckets, width, centerValue, centerLabel]);

  return (
    <div ref={wrapRef} className="grid items-center gap-3.5 sm:grid-cols-[auto_minmax(0,1fr)]">
      <div className="flex justify-center">
        <svg ref={attachRef} className="block" role="img" aria-label="문항 응답 비율 도넛 차트" />
      </div>
      <ul className="grid gap-2 text-[14px]">
        {buckets.map((b, i) => (
          <li key={b.label} className="flex items-center justify-between gap-2">
            <span className="flex min-w-0 items-center gap-2 text-[#17162b]">
              <svg width="11" height="11" className="shrink-0" aria-hidden="true">
                <rect width="11" height="11" rx="3" fill={CHART_PALETTE[i % CHART_PALETTE.length]} />
              </svg>
              <span className="truncate">{b.label}</span>
            </span>
            <span className="tnum shrink-0 font-mono text-[13px] font-semibold text-[#565570]">
              {b.count} ({b.pct}%)
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* D3 Chart 3: Packed Bubble Chart for Extracted Keywords             */
/* ------------------------------------------------------------------ */
function KeywordPackChart({
  keywords,
  selected,
  onSelect,
  externalRef,
}: {
  keywords: ExtractedKeyword[];
  selected: string;
  onSelect: (word: string) => void;
  externalRef?: React.MutableRefObject<SVGSVGElement | null>;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const width = useContainerWidth(wrapRef, 520);

  function attachRef(node: SVGSVGElement | null) {
    svgRef.current = node;
    if (externalRef) externalRef.current = node;
  }

  useEffect(() => {
    const svgEl = svgRef.current;
    if (!svgEl || width <= 0 || !keywords.length) return;

    const svg = d3.select(svgEl);
    svg.selectAll('*').remove();

    const height = Math.min(340, Math.max(260, Math.round(width * 0.62)));
    svg.attr('width', width).attr('height', height).attr('viewBox', `0 0 ${width} ${height}`);

    type PackDatum = { name: string; value?: number; dataRef?: ExtractedKeyword; children?: PackDatum[] };
    const rootData: PackDatum = {
      name: 'keywords',
      children: keywords.map((kw) => ({
        name: kw.word,
        value: kw.count,
        dataRef: kw,
      })),
    };

    const root = d3
      .hierarchy<PackDatum>(rootData)
      .sum((d) => d.value ?? 0)
      .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));

    const pack = d3.pack<PackDatum>().size([width - 8, height - 8]).padding(6);
    const leaves = pack(root).leaves();

    const g = svg.append('g').attr('transform', 'translate(4,4)');

    const nodes = g
      .selectAll('g.kw-node')
      .data(leaves)
      .join('g')
      .attr('class', 'kw-node')
      .attr('transform', (d) => `translate(${d.x},${d.y})`)
      .attr('cursor', 'pointer')
      .on('click', (_e, d) => {
        if (d.data.dataRef) onSelect(d.data.dataRef.word);
      });

    nodes
      .append('circle')
      .attr('r', (d) => d.r)
      .attr('fill', (d) => {
        const kw = d.data.dataRef;
        if (!kw) return '#efeaff';
        return selected === kw.word ? sentimentColor(kw.sentiment) : sentimentSoftBg(kw.sentiment);
      })
      .attr('stroke', (d) => {
        const kw = d.data.dataRef;
        return kw ? sentimentColor(kw.sentiment) : '#4c2ee6';
      })
      .attr('stroke-width', (d) => (selected === d.data.dataRef?.word ? 2.5 : 1.25));

    nodes
      .append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', (d) => (d.r >= 28 ? '-0.15em' : '0.32em'))
      .attr('fill', (d) => {
        const kw = d.data.dataRef;
        if (!kw) return '#17162b';
        return selected === kw.word ? '#ffffff' : sentimentText(kw.sentiment);
      })
      .attr('font-size', (d) => (d.r >= 44 ? '15px' : d.r >= 30 ? '13px' : '12px'))
      .attr('font-weight', '700')
      .text((d) => {
        if (d.r < 17) return '';
        const maxChars = d.r >= 42 ? 8 : d.r >= 28 ? 6 : 4;
        return truncateLabel(d.data.name, maxChars);
      });

    nodes
      .filter((d) => d.r >= 28)
      .append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', '1.15em')
      .attr('fill', (d) => {
        const kw = d.data.dataRef;
        if (!kw) return '#565570';
        return selected === kw.word ? '#efeaff' : '#565570';
      })
      .attr('font-size', '12px')
      .attr('font-weight', '600')
      .text((d) => `${d.data.dataRef?.count ?? 0}회`);

    // Hover SVG Tooltip
    const tooltip = svg.append('g').attr('pointer-events', 'none').attr('opacity', 0);
    const tipRect = tooltip.append('rect').attr('rx', 8).attr('fill', '#17162b').attr('height', 32);
    const tipTxt = tooltip
      .append('text')
      .attr('fill', '#ffffff')
      .attr('font-size', '13px')
      .attr('font-weight', '600')
      .attr('x', 10)
      .attr('y', 21);

    nodes
      .on('mouseenter', function (_event, d) {
        const kw = d.data.dataRef;
        if (!kw) return;
        d3.select(this).select('circle').attr('stroke-width', 2.5);
        const msg = `${kw.word} · ${kw.count}회 (${kw.sentiment})`;
        tipTxt.text(msg);
        const w = Math.max(112, msg.length * 8 + 24);
        tipRect.attr('width', w);
        const tx = Math.min(width - w - 6, Math.max(6, d.x - w / 2));
        const ty = Math.max(6, d.y - d.r - 38);
        tooltip.attr('transform', `translate(${tx},${ty})`).attr('opacity', 1);
      })
      .on('mouseleave', function (_event, d) {
        const isSel = selected === d.data.dataRef?.word;
        d3.select(this).select('circle').attr('stroke-width', isSel ? 2.5 : 1.25);
        tooltip.attr('opacity', 0);
      });
  }, [keywords, selected, onSelect, width]);

  return (
    <div ref={wrapRef} className="w-full overflow-hidden rounded-xl border border-[#e6e3f0] bg-[#fcfbfe]">
      <svg ref={attachRef} className="block w-full" role="img" aria-label="추출 키워드 D3 버블 차트" />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* D3 Chart 4: Ranked Keyword Frequency Bar Chart                     */
/* ------------------------------------------------------------------ */
function KeywordRankBarChart({
  keywords,
  selected,
  onSelect,
  externalRef,
}: {
  keywords: ExtractedKeyword[];
  selected: string;
  onSelect: (word: string) => void;
  externalRef?: React.MutableRefObject<SVGSVGElement | null>;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const width = useContainerWidth(wrapRef, 520);

  function attachRef(node: SVGSVGElement | null) {
    svgRef.current = node;
    if (externalRef) externalRef.current = node;
  }

  useEffect(() => {
    const svgEl = svgRef.current;
    if (!svgEl || width <= 0 || !keywords.length) return;

    const svg = d3.select(svgEl);
    svg.selectAll('*').remove();

    const rowHeight = 36;
    const margin = { top: 8, right: 92, bottom: 20, left: 112 };
    const innerW = Math.max(120, width - margin.left - margin.right);
    const innerH = Math.max(144, keywords.length * rowHeight);
    const totalH = innerH + margin.top + margin.bottom;

    svg.attr('width', width).attr('height', totalH).attr('viewBox', `0 0 ${width} ${totalH}`);
    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

    const maxCount = Math.max(1, d3.max(keywords, (k) => k.count) ?? 1);
    const x = d3.scaleLinear().domain([0, maxCount]).nice().range([0, innerW]);
    const y = d3
      .scaleBand()
      .domain(keywords.map((k) => k.word))
      .range([0, innerH])
      .padding(0.28);

    const rows = g
      .selectAll('g.kw-bar-row')
      .data(keywords)
      .join('g')
      .attr('class', 'kw-bar-row')
      .attr('cursor', 'pointer')
      .on('click', (_e, d) => onSelect(d.word));

    rows
      .append('text')
      .attr('x', -10)
      .attr('y', (d) => (y(d.word) ?? 0) + y.bandwidth() / 2)
      .attr('dy', '0.35em')
      .attr('text-anchor', 'end')
      .attr('fill', (d) => (selected === d.word ? '#4125cc' : '#17162b'))
      .attr('font-size', '14px')
      .attr('font-weight', (d) => (selected === d.word ? '800' : '600'))
      .text((d) => truncateLabel(d.word, 10));

    rows
      .append('rect')
      .attr('x', 0)
      .attr('y', (d) => y(d.word) ?? 0)
      .attr('width', innerW)
      .attr('height', y.bandwidth())
      .attr('rx', 5)
      .attr('fill', '#f4f2fa');

    rows
      .append('rect')
      .attr('x', 0)
      .attr('y', (d) => y(d.word) ?? 0)
      .attr('width', (d) => Math.max(6, x(d.count)))
      .attr('height', y.bandwidth())
      .attr('rx', 5)
      .attr('fill', (d) => sentimentColor(d.sentiment))
      .attr('opacity', (d) => (selected && selected !== d.word ? 0.45 : 1));

    rows
      .append('text')
      .attr('x', innerW + 8)
      .attr('y', (d) => (y(d.word) ?? 0) + y.bandwidth() / 2)
      .attr('dy', '0.35em')
      .attr('fill', '#17162b')
      .attr('font-size', '13px')
      .attr('font-weight', '700')
      .text((d) => `${d.count}회 · ${d.sentiment}`);
  }, [keywords, selected, onSelect, width]);

  return (
    <div ref={wrapRef} className="w-full overflow-hidden rounded-xl border border-[#e6e3f0] bg-white p-2.5">
      <svg ref={attachRef} className="block w-full" role="img" aria-label="상위 키워드 빈도 막대 차트" />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* D3 Chart 5: Response Timeline Area & Line Chart                    */
/* ------------------------------------------------------------------ */
function ResponseTimelineChart({
  points,
  externalRef,
}: {
  points: TimelinePoint[];
  externalRef?: React.MutableRefObject<SVGSVGElement | null>;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const width = useContainerWidth(wrapRef, 420);

  function attachRef(node: SVGSVGElement | null) {
    svgRef.current = node;
    if (externalRef) externalRef.current = node;
  }

  useEffect(() => {
    const svgEl = svgRef.current;
    if (!svgEl || width <= 0) return;

    const svg = d3.select(svgEl);
    svg.selectAll('*').remove();

    const height = 224;
    const margin = { top: 20, right: 20, bottom: 32, left: 42 };
    const innerW = Math.max(120, width - margin.left - margin.right);
    const innerH = height - margin.top - margin.bottom;

    svg.attr('width', width).attr('height', height).attr('viewBox', `0 0 ${width} ${height}`);
    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

    if (!points.length) {
      return;
    }

    const x = d3
      .scalePoint()
      .domain(points.map((p) => p.label))
      .range([0, innerW])
      .padding(0.25);

    const maxCum = Math.max(1, d3.max(points, (p) => p.cumulative) ?? 1);
    const y = d3.scaleLinear().domain([0, maxCum]).nice().range([innerH, 0]);

    // Horizontal gridlines
    g.append('g')
      .selectAll('line')
      .data(y.ticks(4))
      .join('line')
      .attr('x1', 0)
      .attr('x2', innerW)
      .attr('y1', (d) => y(d))
      .attr('y2', (d) => y(d))
      .attr('stroke', '#e6e3f0')
      .attr('stroke-dasharray', '3 3');

    g.append('g')
      .call(d3.axisLeft(y).ticks(4).tickFormat(d3.format('d')))
      .call((axis) => axis.select('.domain').remove())
      .call((axis) => axis.selectAll('.tick line').remove())
      .call((axis) => axis.selectAll('text').attr('fill', '#565570').attr('font-size', '13px'));

    g.append('g')
      .attr('transform', `translate(0,${innerH})`)
      .call(d3.axisBottom(x))
      .call((axis) => axis.select('.domain').attr('stroke', '#dcd8e8'))
      .call((axis) => axis.selectAll('.tick line').remove())
      .call((axis) => axis.selectAll('text').attr('fill', '#565570').attr('font-size', '13px'));

    const area = d3
      .area<TimelinePoint>()
      .x((d) => x(d.label) ?? 0)
      .y0(innerH)
      .y1((d) => y(d.cumulative))
      .curve(d3.curveMonotoneX);

    const line = d3
      .line<TimelinePoint>()
      .x((d) => x(d.label) ?? 0)
      .y((d) => y(d.cumulative))
      .curve(d3.curveMonotoneX);

    g.append('path').datum(points).attr('d', area).attr('fill', '#efeaff').attr('opacity', 0.78);
    g.append('path')
      .datum(points)
      .attr('d', line)
      .attr('fill', 'none')
      .attr('stroke', '#4c2ee6')
      .attr('stroke-width', 2.5);

    // Individual bucket bars in background for per-bucket volume
    const barW = Math.min(20, Math.max(8, innerW / Math.max(4, points.length * 2.5)));
    g.selectAll('.bucket-bar')
      .data(points)
      .join('rect')
      .attr('class', 'bucket-bar')
      .attr('x', (d) => (x(d.label) ?? 0) - barW / 2)
      .attr('y', (d) => y(d.count))
      .attr('width', barW)
      .attr('height', (d) => Math.max(2, innerH - y(d.count)))
      .attr('rx', 3)
      .attr('fill', '#356bc9')
      .attr('opacity', 0.36);

    const tooltip = svg.append('g').attr('pointer-events', 'none').attr('opacity', 0);
    const tipBg = tooltip.append('rect').attr('rx', 8).attr('fill', '#17162b').attr('height', 30);
    const tipTxt = tooltip
      .append('text')
      .attr('fill', '#ffffff')
      .attr('font-size', '13px')
      .attr('font-weight', '600')
      .attr('x', 10)
      .attr('y', 20);

    g.selectAll('.point-dot')
      .data(points)
      .join('circle')
      .attr('class', 'point-dot')
      .attr('cx', (d) => x(d.label) ?? 0)
      .attr('cy', (d) => y(d.cumulative))
      .attr('r', 5)
      .attr('fill', '#ffffff')
      .attr('stroke', '#4c2ee6')
      .attr('stroke-width', 2.5)
      .attr('cursor', 'pointer')
      .on('mouseenter', function (_event, d) {
        d3.select(this).attr('r', 7).attr('fill', '#4c2ee6');
        const msg = `${d.label}: 신규 ${d.count}건 · 누적 ${d.cumulative}건`;
        tipTxt.text(msg);
        const w = Math.max(132, msg.length * 7.8 + 24);
        tipBg.attr('width', w);
        const cx = margin.left + (x(d.label) ?? 0);
        const cy = margin.top + y(d.cumulative);
        const tx = Math.min(width - w - 6, Math.max(6, cx - w / 2));
        const ty = Math.max(4, cy - 38);
        tooltip.attr('transform', `translate(${tx},${ty})`).attr('opacity', 1);
      })
      .on('mouseleave', function () {
        d3.select(this).attr('r', 5).attr('fill', '#ffffff');
        tooltip.attr('opacity', 0);
      });
  }, [points, width]);

  return (
    <div ref={wrapRef} className="w-full overflow-hidden">
      <svg ref={attachRef} className="block w-full" role="img" aria-label="시간별 응답 수집 추이 D3 차트" />
      <div className="mt-1.5 flex items-center gap-4 text-[13px] text-[#565570]">
        <span className="inline-flex items-center gap-2">
          <span className="h-0.5 w-3.5 bg-[#4c2ee6]" aria-hidden="true" /> 누적 응답 곡선
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="size-3 rounded-sm bg-[#356bc9]/50" aria-hidden="true" /> 구간별 신규 응답
        </span>
      </div>
    </div>
  );
}
