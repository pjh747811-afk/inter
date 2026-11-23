import { useEffect, useMemo, useRef, useState } from 'react';
import * as d3 from 'd3';
import {
  Activity,
  BarChart3,
  Download,
  MessageSquareQuote,
  RotateCcw,
  Sparkles,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import { api, demoStore } from '../lib/api';
import { listAllVoiceAnswers, type VoiceAnswer } from '../lib/interviewAudio';
import { exportSentimentTrendCsv } from '../lib/researchCsv';
import type { Person } from '../lib/research';

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

interface StoredSentimentCache {
  fingerprint: string;
  result: SentimentTrendOutput;
}

const SENTIMENT_CACHE_KEY = 'research.sentiment-trend.v1';

function useContainerWidth(ref: React.RefObject<HTMLDivElement | null>, fallback = 620): number {
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

function pointColor(label: SentimentPoint['emotionLabel'], score: number): string {
  if (label === '긍정' || score >= 20) return '#1f8a65';
  if (label === '부정' || score <= -20) return '#a6214e';
  if (label === '복합') return '#d97724';
  return '#5b3df5';
}

function emotionTextClass(label: SentimentPoint['emotionLabel'], score: number): string {
  if (label === '긍정' || score >= 20) return 'text-[#14674d]';
  if (label === '부정' || score <= -20) return 'text-[#a6214e]';
  if (label === '복합') return 'text-[#8b4d17]';
  return 'text-[#4d30cf]';
}

function truncateLabel(text: string, maxLen: number): string {
  return text.length > maxLen ? `${text.slice(0, maxLen - 1)}…` : text;
}

function computeFingerprint(scope: string, entries: Array<{ id: string; text: string }>): string {
  const raw = `${scope}::${entries.map((e) => `${e.id}:${e.text.length}`).join('|')}`;
  let hash = 0;
  for (let i = 0; i < raw.length; i++) {
    hash = (hash * 31 + raw.charCodeAt(i)) | 0;
  }
  return `${scope}:${entries.length}:${hash}`;
}

export function InterviewSentimentPanel({ people }: { people: Person[] }) {
  const [voiceAnswers, setVoiceAnswers] = useState<VoiceAnswer[]>([]);
  const [scope, setScope] = useState<string>('all');
  const [chartView, setChartView] = useState<'line' | 'ratio'>('line');
  const [activeIdx, setActiveIdx] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [cacheMap, setCacheMap] = useState<Record<string, StoredSentimentCache>>(() =>
    demoStore.get<Record<string, StoredSentimentCache>>(SENTIMENT_CACHE_KEY, {}),
  );

  const chartBoxRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const chartWidth = useContainerWidth(chartBoxRef, 640);

  useEffect(() => {
    const onSync = () => {
      setCacheMap(demoStore.get<Record<string, StoredSentimentCache>>(SENTIMENT_CACHE_KEY, {}));
    };
    window.addEventListener('research-sync-applied', onSync);
    return () => window.removeEventListener('research-sync-applied', onSync);
  }, []);

  useEffect(() => {
    let ignore = false;
    void listAllVoiceAnswers()
      .then((rows) => {
        if (!ignore) setVoiceAnswers(rows);
      })
      .catch(() => {
        // IndexedDB optional if unavailable
      });
    return () => {
      ignore = true;
    };
  }, [people]);

  const collectedEntries = useMemo(() => {
    const map = new Map<string, { id: string; speaker: string; timestamp?: string; text: string }>();

    for (const p of people) {
      const trimmed = p.note.trim();
      if (!trimmed) continue;
      map.set(p.id, {
        id: p.id,
        speaker: `${p.name} (${p.group})`,
        timestamp: p.date ? p.date.replace('T', ' ') : undefined,
        text: trimmed,
      });
    }

    // Include any unsynced STT transcripts from IndexedDB voice answers
    for (const va of voiceAnswers) {
      const t = va.transcript?.trim();
      if (!t || va.syncedToRecord) continue;
      const person = people.find((p) => p.id === va.personId);
      const speaker = person ? `${person.name} (${person.group})` : '음성 인터뷰 참여자';
      const existing = map.get(va.personId);
      const line = `[음성 STT] Q. ${va.question}\nA. ${t}`;
      if (existing) {
        if (!existing.text.includes(t)) {
          existing.text = `${existing.text}\n\n${line}`;
        }
      } else {
        map.set(va.personId, {
          id: va.personId,
          speaker,
          timestamp: new Date(va.recordedAt).toISOString().slice(0, 16).replace('T', ' '),
          text: line,
        });
      }
    }

    return Array.from(map.values());
  }, [people, voiceAnswers]);

  const scopedEntries = useMemo(() => {
    if (scope === 'all') return collectedEntries;
    return collectedEntries.filter((e) => e.id === scope);
  }, [collectedEntries, scope]);

  const scopeTitle = useMemo(() => {
    if (scope === 'all') return `전체 인터뷰 통합 (${collectedEntries.length}명)`;
    return scopedEntries[0]?.speaker ?? '선택된 대상자';
  }, [scope, collectedEntries.length, scopedEntries]);

  const currentFingerprint = useMemo(
    () => computeFingerprint(scope, scopedEntries),
    [scope, scopedEntries],
  );

  const cachedEntry = cacheMap[scope];
  const result = cachedEntry?.result ?? null;
  const isStale = Boolean(cachedEntry && cachedEntry.fingerprint !== currentFingerprint);

  useEffect(() => {
    if (result && activeIdx >= result.points.length) {
      setActiveIdx(0);
    }
  }, [result, activeIdx]);

  async function runAnalysis() {
    if (scopedEntries.length === 0) {
      setError('감정 추이를 분석할 인터뷰 텍스트가 아직 없어요.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const data = await api<SentimentTrendOutput>('/api/research/analyze-sentiment-trend', {
        method: 'POST',
        body: JSON.stringify({
          scopeTitle,
          mode: scope === 'all' && scopedEntries.length > 1 ? 'all' : 'single',
          entries: scopedEntries,
        }),
      });
      const nextCache: Record<string, StoredSentimentCache> = {
        ...cacheMap,
        [scope]: { fingerprint: currentFingerprint, result: data },
      };
      setCacheMap(nextCache);
      demoStore.set(SENTIMENT_CACHE_KEY, nextCache);
      setActiveIdx(0);
    } catch (err) {
      setError(err instanceof Error ? err.message : '감정 추이 분석에 실패했어요. 다시 시도해 주세요.');
    } finally {
      setBusy(false);
    }
  }

  // Draw D3 Sentiment Chart
  useEffect(() => {
    const svgEl = svgRef.current;
    if (!svgEl || !result || result.points.length === 0) return;

    const svg = d3.select(svgEl);
    svg.selectAll('*').remove();

    const points = result.points;
    const width = Math.max(320, chartWidth);
    const height = 270;
    const margin = { top: 24, right: 24, bottom: 48, left: 46 };
    const innerW = width - margin.left - margin.right;
    const innerH = height - margin.top - margin.bottom;

    svg.attr('viewBox', `0 0 ${width} ${height}`).attr('width', width).attr('height', height);

    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

    if (chartView === 'line') {
      const x = d3
        .scalePoint<number>()
        .domain(points.map((_, i) => i))
        .range([12, Math.max(24, innerW - 12)])
        .padding(0.2);

      const y = d3.scaleLinear().domain([-100, 100]).range([innerH, 0]);
      const zeroY = y(0);

      // Horizontal reference grid lines
      const ticks = [100, 50, 0, -50, -100];
      g.selectAll('line.grid-y')
        .data(ticks)
        .join('line')
        .attr('x1', 0)
        .attr('x2', innerW)
        .attr('y1', (d) => y(d))
        .attr('y2', (d) => y(d))
        .attr('stroke', (d) => (d === 0 ? '#9f99b8' : '#efedf6'))
        .attr('stroke-width', (d) => (d === 0 ? 1.5 : 1))
        .attr('stroke-dasharray', (d) => (d === 0 ? '4 4' : 'none'));

      // Y-axis labels
      g.selectAll('text.y-label')
        .data(ticks)
        .join('text')
        .attr('x', -8)
        .attr('y', (d) => y(d) + 4)
        .attr('text-anchor', 'end')
        .attr('font-size', 11)
        .attr('font-family', 'ui-monospace, monospace')
        .attr('fill', (d) => (d > 0 ? '#14674d' : d < 0 ? '#a6214e' : '#62627a'))
        .text((d) => (d > 0 ? `+${d}` : String(d)));

      // Positive / negative region labels
      g.append('text')
        .attr('x', 6)
        .attr('y', 14)
        .attr('font-size', 10)
        .attr('font-weight', 700)
        .attr('fill', '#1f8a65')
        .text('긍정 영역 (+)');

      g.append('text')
        .attr('x', 6)
        .attr('y', innerH - 6)
        .attr('font-size', 10)
        .attr('font-weight', 700)
        .attr('fill', '#a6214e')
        .text('부정 영역 (-)');

      // Clip paths for diverging positive/negative area fills
      const defs = svg.append('defs');
      const posClipId = `pos-clip-${scope}`;
      const negClipId = `neg-clip-${scope}`;

      defs
        .append('clipPath')
        .attr('id', posClipId)
        .append('rect')
        .attr('x', 0)
        .attr('y', 0)
        .attr('width', innerW)
        .attr('height', Math.max(0, zeroY));

      defs
        .append('clipPath')
        .attr('id', negClipId)
        .append('rect')
        .attr('x', 0)
        .attr('y', zeroY)
        .attr('width', innerW)
        .attr('height', Math.max(0, innerH - zeroY));

      const area = d3
        .area<SentimentPoint>()
        .x((_, i) => x(i) ?? 0)
        .y0(zeroY)
        .y1((d) => y(d.sentimentScore))
        .curve(d3.curveMonotoneX);

      g.append('path')
        .datum(points)
        .attr('clip-path', `url(#${posClipId})`)
        .attr('fill', 'rgba(31, 138, 101, 0.16)')
        .attr('d', area);

      g.append('path')
        .datum(points)
        .attr('clip-path', `url(#${negClipId})`)
        .attr('fill', 'rgba(166, 33, 78, 0.14)')
        .attr('d', area);

      // Trajectory line
      const line = d3
        .line<SentimentPoint>()
        .x((_, i) => x(i) ?? 0)
        .y((d) => y(d.sentimentScore))
        .curve(d3.curveMonotoneX);

      g.append('path')
        .datum(points)
        .attr('fill', 'none')
        .attr('stroke', '#5b3df5')
        .attr('stroke-width', 2.5)
        .attr('d', line);

      // Data points
      const nodes = g
        .selectAll('g.node')
        .data(points)
        .join('g')
        .attr('class', 'cursor-pointer')
        .attr('transform', (d, i) => `translate(${x(i) ?? 0},${y(d.sentimentScore)})`)
        .on('mouseenter', (_ev, d) => {
          const idx = points.indexOf(d);
          if (idx >= 0) setActiveIdx(idx);
        })
        .on('click', (_ev, d) => {
          const idx = points.indexOf(d);
          if (idx >= 0) setActiveIdx(idx);
        });

      nodes
        .append('circle')
        .attr('r', (_d, i) => (i === activeIdx ? 11 : 0))
        .attr('fill', 'rgba(91, 61, 245, 0.15)');

      nodes
        .append('circle')
        .attr('r', (_d, i) => (i === activeIdx ? 6.5 : 5))
        .attr('fill', (d) => pointColor(d.emotionLabel, d.sentimentScore))
        .attr('stroke', '#ffffff')
        .attr('stroke-width', 2);

      nodes
        .append('text')
        .attr('y', (d) => (d.sentimentScore >= 0 ? -12 : 18))
        .attr('text-anchor', 'middle')
        .attr('font-size', 10)
        .attr('font-weight', 700)
        .attr('font-family', 'ui-monospace, monospace')
        .attr('fill', (d) => pointColor(d.emotionLabel, d.sentimentScore))
        .text((d) => (d.sentimentScore > 0 ? `+${d.sentimentScore}` : String(d.sentimentScore)));

      // X-axis labels
      const maxChars = points.length > 8 ? 8 : 12;
      g.selectAll('text.x-label')
        .data(points)
        .join('text')
        .attr('x', (_d, i) => x(i) ?? 0)
        .attr('y', innerH + 20)
        .attr('text-anchor', 'middle')
        .attr('font-size', 11)
        .attr('font-weight', (_d, i) => (i === activeIdx ? 700 : 500))
        .attr('fill', (_d, i) => (i === activeIdx ? '#4d30cf' : '#62627a'))
        .text((d) => truncateLabel(d.label, maxChars));
    } else {
      // Stacked Positive / Neutral / Negative ratio bars per segment
      const x = d3
        .scaleBand<number>()
        .domain(points.map((_, i) => i))
        .range([0, innerW])
        .padding(0.28);

      const y = d3.scaleLinear().domain([0, 100]).range([innerH, 0]);

      [0, 25, 50, 75, 100].forEach((tick) => {
        g.append('line')
          .attr('x1', 0)
          .attr('x2', innerW)
          .attr('y1', y(tick))
          .attr('y2', y(tick))
          .attr('stroke', '#efedf6')
          .attr('stroke-width', 1);

        g.append('text')
          .attr('x', -8)
          .attr('y', y(tick) + 4)
          .attr('text-anchor', 'end')
          .attr('font-size', 11)
          .attr('font-family', 'ui-monospace, monospace')
          .attr('fill', '#62627a')
          .text(`${tick}%`);
      });

      const groups = g
        .selectAll('g.bar-col')
        .data(points)
        .join('g')
        .attr('class', 'cursor-pointer')
        .attr('transform', (_d, i) => `translate(${x(i) ?? 0},0)`)
        .on('mouseenter', (_ev, d) => {
          const idx = points.indexOf(d);
          if (idx >= 0) setActiveIdx(idx);
        })
        .on('click', (_ev, d) => {
          const idx = points.indexOf(d);
          if (idx >= 0) setActiveIdx(idx);
        });

      const bw = x.bandwidth();

      // Active highlight border
      groups
        .append('rect')
        .attr('x', -3)
        .attr('y', -3)
        .attr('width', bw + 6)
        .attr('height', innerH + 6)
        .attr('rx', 6)
        .attr('fill', 'none')
        .attr('stroke', (_d, i) => (i === activeIdx ? '#5b3df5' : 'transparent'))
        .attr('stroke-width', 1.5);

      // Positive bottom
      groups
        .append('rect')
        .attr('x', 0)
        .attr('y', (d) => y(d.positiveRatio))
        .attr('width', bw)
        .attr('height', (d) => Math.max(0, innerH - y(d.positiveRatio)))
        .attr('fill', '#1f8a65');

      // Neutral middle
      groups
        .append('rect')
        .attr('x', 0)
        .attr('y', (d) => y(d.positiveRatio + d.neutralRatio))
        .attr('width', bw)
        .attr('height', (d) => Math.max(0, y(d.positiveRatio) - y(d.positiveRatio + d.neutralRatio)))
        .attr('fill', '#d5d0e8');

      // Negative top
      groups
        .append('rect')
        .attr('x', 0)
        .attr('y', 0)
        .attr('width', bw)
        .attr('height', (d) => Math.max(0, y(d.positiveRatio + d.neutralRatio)))
        .attr('fill', '#a6214e');

      const maxChars = points.length > 8 ? 8 : 12;
      g.selectAll('text.x-label')
        .data(points)
        .join('text')
        .attr('x', (_d, i) => (x(i) ?? 0) + bw / 2)
        .attr('y', innerH + 20)
        .attr('text-anchor', 'middle')
        .attr('font-size', 11)
        .attr('font-weight', (_d, i) => (i === activeIdx ? 700 : 500))
        .attr('fill', (_d, i) => (i === activeIdx ? '#4d30cf' : '#62627a'))
        .text((d) => truncateLabel(d.label, maxChars));
    }
  }, [result, chartWidth, chartView, activeIdx, scope]);

  const selectedPoint = result?.points[activeIdx] ?? result?.points[0];

  return (
    <section
      aria-label="고객 감정 추이 시각화"
      className="grid gap-4 rounded-2xl border border-[#e2d5fd] bg-white p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-[#eee8ff] text-[#5b3df5]">
            <Activity size={18} aria-hidden="true" />
          </span>
          <div>
            <h2 className="font-display text-lg font-bold text-[#22213a]">고객 감정 추이 시각화</h2>
            <p className="text-[13px] text-[#62627a]">
              수집된 인터뷰 텍스트(음성 STT · 인사이트 메모)를 분석해 긍정·부정 감정 변화를 그래프로 추적해요.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="감정 추이 분석 대상 선택"
            value={scope}
            onChange={(e) => {
              setScope(e.target.value);
              setError('');
            }}
            className="min-h-9 rounded-lg border border-[#dfdce9] bg-white px-3 text-xs font-medium text-[#22213a]"
          >
            <option value="all">전체 인터뷰 통합 추이 ({collectedEntries.length}명)</option>
            {collectedEntries.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.speaker} 상세 추이
              </option>
            ))}
          </select>

          <button
            type="button"
            disabled={busy || scopedEntries.length === 0}
            onClick={() => void runAnalysis()}
            className="inline-flex min-h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg bg-[#5b3df5] px-3.5 text-xs font-semibold text-white hover:bg-[#4b2ee0] disabled:opacity-50"
          >
            <Sparkles size={14} aria-hidden="true" />
            {busy ? '감정 추이 분석 중…' : result ? '감정 추이 다시 분석' : '감정 추이 분석하기'}
          </button>

          {result && (
            <button
              type="button"
              onClick={() => exportSentimentTrendCsv(result)}
              className="inline-flex min-h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-[#e2deee] bg-white px-3 text-xs font-semibold text-[#22213a] hover:bg-[#f7f7fb]"
            >
              <Download size={14} aria-hidden="true" /> 감정 추이 CSV
            </button>
          )}
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#f5c7d3] bg-[#fff0f3] px-3 py-2 text-[13px] text-[#9a2148]"
        >
          <span>{error}</span>
          <button
            type="button"
            disabled={busy}
            onClick={() => void runAnalysis()}
            className="inline-flex min-h-8 items-center gap-1 rounded-md border border-[#e6a4b7] bg-white px-2.5 text-xs font-bold text-[#9a2148] hover:bg-[#fff8fa]"
          >
            <RotateCcw size={12} aria-hidden="true" /> 다시 시도
          </button>
        </div>
      )}

      {isStale && result && !busy && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#e5dcfc] bg-[#faf7ff] px-3 py-2 text-xs text-[#4d30cf]">
          <span>새로운 인터뷰 기록이 반영되었어요. 최신 텍스트 기준으로 다시 분석할 수 있어요.</span>
          <button
            type="button"
            onClick={() => void runAnalysis()}
            className="font-bold underline"
          >
            지금 업데이트
          </button>
        </div>
      )}

      {!result && !busy ? (
        <div className="grid justify-items-center gap-2.5 rounded-xl border border-dashed border-[#d8d3ea] bg-[#faf9fd] px-5 py-8 text-center">
          <p className="text-sm font-semibold text-[#22213a]">
            {scopedEntries.length > 0
              ? `분석 가능한 인터뷰 텍스트 ${scopedEntries.length}건이 준비되어 있어요`
              : '아직 분석할 인터뷰 텍스트가 없어요'}
          </p>
          <p className="max-w-lg text-xs text-[#62627a]">
            {scopedEntries.length > 0
              ? "'감정 추이 분석하기' 버튼을 누르면 인터뷰 흐름에 따른 긍정·부정 감정 점수 곡선과 감정 변곡점을 D3 그래프로 시각화해 드려요."
              : '실시간 음성 녹음(STT)을 진행하거나 대상자의 핵심 인사이트 메모를 기록하면 감정 추이를 그래프로 분석할 수 있어요.'}
          </p>
        </div>
      ) : busy && !result ? (
        <p className="rounded-xl border border-[#efedf6] bg-[#faf9fd] px-4 py-8 text-center text-sm font-medium text-[#4d30cf]" role="status">
          인터뷰 발화의 긍정·부정 감정 점수 변화와 변곡점을 추출하고 있어요…
        </p>
      ) : (
        result && (
          <div className="grid gap-4">
            {/* 4-Metric Summary Strip */}
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <div className="rounded-xl border border-[#efedf6] bg-[#faf9fd] px-3.5 py-3">
                <span className="text-xs font-medium text-[#62627a]">평균 감성 지수</span>
                <div
                  className={`tnum mt-1 font-display text-2xl font-extrabold ${
                    result.overallScore >= 15
                      ? 'text-[#14674d]'
                      : result.overallScore <= -15
                      ? 'text-[#a6214e]'
                      : 'text-[#22213a]'
                  }`}
                >
                  {result.overallScore > 0 ? `+${result.overallScore}` : result.overallScore}
                  <small className="ml-1 text-xs font-semibold text-[#62627a]">/ 100</small>
                </div>
              </div>

              <div className="rounded-xl border border-[#efedf6] bg-[#faf9fd] px-3.5 py-3">
                <span className="text-xs font-medium text-[#62627a]">긍정 발화 비중</span>
                <div className="tnum mt-1 font-display text-2xl font-extrabold text-[#14674d]">
                  {result.positiveShare}
                  <small className="ml-0.5 text-xs font-semibold text-[#62627a]">%</small>
                </div>
              </div>

              <div className="rounded-xl border border-[#efedf6] bg-[#faf9fd] px-3.5 py-3">
                <span className="text-xs font-medium text-[#62627a]">부정·불만 비중</span>
                <div className="tnum mt-1 font-display text-2xl font-extrabold text-[#a6214e]">
                  {result.negativeShare}
                  <small className="ml-0.5 text-xs font-semibold text-[#62627a]">%</small>
                </div>
              </div>

              <div className="rounded-xl border border-[#efedf6] bg-[#faf9fd] px-3.5 py-3">
                <span className="text-xs font-medium text-[#62627a]">감정 변화 추세</span>
                <div className="mt-1 flex items-center gap-1.5 font-display text-xl font-extrabold text-[#22213a]">
                  {result.trendDirection === '상승' ? (
                    <TrendingUp size={19} className="text-[#14674d]" aria-hidden="true" />
                  ) : result.trendDirection === '하락' ? (
                    <TrendingDown size={19} className="text-[#a6214e]" aria-hidden="true" />
                  ) : (
                    <Activity size={19} className="text-[#5b3df5]" aria-hidden="true" />
                  )}
                  <span>{result.trendDirection}</span>
                </div>
              </div>
            </div>

            {/* Chart Header & View Toggle */}
            <div className="grid gap-3 rounded-xl border border-[#e9e7f1] p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-bold text-[#22213a]">{result.scopeTitle} · 감정 변화 그래프</h3>
                  <p className="text-xs text-[#62627a]">
                    각 지점을 클릭하거나 마우스를 올리면 해당 발화 인용과 감정 유발 요인을 확인할 수 있어요.
                  </p>
                </div>

                <div className="flex items-center gap-1 rounded-lg border border-[#e6e3f0] bg-[#faf9fd] p-1" role="tablist">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={chartView === 'line'}
                    onClick={() => setChartView('line')}
                    className={`inline-flex min-h-7 shrink-0 items-center gap-1 whitespace-nowrap rounded-md px-2.5 text-xs font-semibold ${
                      chartView === 'line' ? 'bg-[#5b3df5] text-white' : 'text-[#54546d] hover:text-[#22213a]'
                    }`}
                  >
                    <Activity size={13} aria-hidden="true" /> 감정 추이 곡선
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={chartView === 'ratio'}
                    onClick={() => setChartView('ratio')}
                    className={`inline-flex min-h-7 shrink-0 items-center gap-1 whitespace-nowrap rounded-md px-2.5 text-xs font-semibold ${
                      chartView === 'ratio' ? 'bg-[#5b3df5] text-white' : 'text-[#54546d] hover:text-[#22213a]'
                    }`}
                  >
                    <BarChart3 size={13} aria-hidden="true" /> 긍정·부정 비율
                  </button>
                </div>
              </div>

              {chartView === 'ratio' && (
                <div className="flex flex-wrap items-center gap-4 text-xs text-[#62627a]">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="size-2.5 rounded-sm bg-[#1f8a65]" aria-hidden="true" /> 긍정
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="size-2.5 rounded-sm bg-[#d5d0e8]" aria-hidden="true" /> 중립
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="size-2.5 rounded-sm bg-[#a6214e]" aria-hidden="true" /> 부정
                  </span>
                </div>
              )}

              <div ref={chartBoxRef} className="w-full overflow-x-auto">
                <svg ref={svgRef} role="img" aria-label="고객 인터뷰 긍정 부정 감정 추이 D3 차트" className="block" />
              </div>

              {selectedPoint && (
                <div className="grid gap-1.5 rounded-lg border border-[#e5dcfc] bg-[#faf7ff] px-3.5 py-3 text-[13px]">
                  <div className="tnum flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <b className="text-sm text-[#22213a]">{selectedPoint.label}</b>
                      <span className="text-[#62627a]">· {selectedPoint.speaker}</span>
                      <span className={`font-bold ${emotionTextClass(selectedPoint.emotionLabel, selectedPoint.sentimentScore)}`}>
                        · {selectedPoint.emotionLabel} (
                        {selectedPoint.sentimentScore > 0 ? `+${selectedPoint.sentimentScore}` : selectedPoint.sentimentScore}점)
                      </span>
                    </div>
                    <span className="font-mono text-[11px] text-[#62627a]">
                      긍정 {selectedPoint.positiveRatio}% · 중립 {selectedPoint.neutralRatio}% · 부정 {selectedPoint.negativeRatio}%
                    </span>
                  </div>
                  <p className="flex items-start gap-1.5 font-medium text-[#22213a]">
                    <MessageSquareQuote size={15} className="mt-0.5 shrink-0 text-[#5b3df5]" aria-hidden="true" />
                    <span>&ldquo;{selectedPoint.excerpt}&rdquo;</span>
                  </p>
                  <p className="text-xs text-[#54546d]">
                    <b className="font-semibold text-[#4d30cf]">감정 요인:</b> {selectedPoint.trigger}
                  </p>
                </div>
              )}
            </div>

            {/* Summary & Turning Points */}
            <div className="grid gap-3 rounded-xl border border-[#efedf6] bg-[#faf8ff] p-4 text-[13px] md:grid-cols-2">
              <div className="grid gap-1.5 content-start">
                <b className="text-xs font-bold text-[#4d30cf]">전체 감정 흐름 요약</b>
                <p className="leading-relaxed text-[#22213a]">{result.summary}</p>
                <span className="tnum text-[11px] text-[#62627a]">
                  분석 시각: {result.analyzedAt.slice(0, 16).replace('T', ' ')}
                </span>
              </div>
              <div className="grid gap-1.5 content-start">
                <b className="text-xs font-bold text-[#4d30cf]">주요 감정 변곡점</b>
                <ul className="list-disc space-y-1 pl-4 text-[#22213a]">
                  {result.turningPoints.map((tp, idx) => (
                    <li key={idx}>{tp}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )
      )}
    </section>
  );
}
