import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import {
  ArrowUpRight,
  AudioLines,
  BarChart3,
  CircleCheck,
  ClipboardList,
  Download,
  Link2,
  ListChecks,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { ApiError, api, demoStore } from '../lib/api';
import {
  types,
  type Question,
  type Survey,
  type SurveyAnalysis,
  type SurveyKey,
  type SurveySummary,
} from '../lib/research';
import { webtoonSurvey, webtoonTopic } from '../lib/webtoonValidation';
import { getResearchTemplateById, readCustomTemplates, researchTemplates } from '../lib/researchTemplates';
import { questionGuideKey, type QuestionGuide } from '../lib/questionGuide';
import { Modal, saasUi, saveBlob } from './ResearchUI';

const surveyStore = 'research.survey-keys.v1';
const surveyPingKey = 'research.survey-last-submit.v1';
const surveyChannelName = 'research-survey-events';
const auth = (s: SurveyKey) => ({ authorization: `Bearer ${s.key}` });
const base = '/api/research';
const message = (e: unknown) => (e instanceof Error ? e.message : '잠시 뒤 다시 시도해 주세요.');

const DEFAULT_SURVEY_INTRO =
  '안녕하세요. 본 설문은 서비스 개선 및 고객 경험 검증을 위한 짧은 설문(약 2~3분 소요)입니다. 모든 응답은 연구 목적 외에는 사용되지 않으며, 원하실 경우 언제든 참여를 중단하실 수 있습니다.';

function notifySurveySubmitted(surveyId: string) {
  try {
    localStorage.setItem(surveyPingKey, JSON.stringify({ surveyId, at: Date.now() }));
  } catch {
    // Ignore storage quota errors
  }
  try {
    if (typeof BroadcastChannel !== 'undefined') {
      const ch = new BroadcastChannel(surveyChannelName);
      ch.postMessage({ type: 'survey-response', surveyId });
      ch.close();
    }
  } catch {
    // Ignore BroadcastChannel errors
  }
}

export function useSurveys() {
  const [keys, setKeys] = useState(() => demoStore.get<SurveyKey[]>(surveyStore, []));
  const [summaries, setSummaries] = useState<Record<string, SurveySummary>>({});
  const [missingIds, setMissingIds] = useState<string[]>([]);
  const [error, setError] = useState(false);
  const [refresh, setRefresh] = useState({ seq: 0, silent: false });
  const [loading, setLoading] = useState(false);

  const keysRef = useRef(keys);
  keysRef.current = keys;

  useEffect(() => {
    const onSync = () => {
      setKeys(demoStore.get<SurveyKey[]>(surveyStore, []));
      setRefresh((r) => ({ seq: r.seq + 1, silent: true }));
    };
    const onStorage = (ev: StorageEvent) => {
      if (ev.key === surveyStore) {
        setKeys(demoStore.get<SurveyKey[]>(surveyStore, []));
      }
      if (!ev.key || ev.key === surveyStore || ev.key === surveyPingKey) {
        setRefresh((r) => ({ seq: r.seq + 1, silent: true }));
      }
    };
    const onFocusOrVisible = () => {
      if (document.visibilityState === 'hidden') return;
      if (keysRef.current.length > 0) {
        setRefresh((r) => ({ seq: r.seq + 1, silent: true }));
      }
    };

    let ch: BroadcastChannel | null = null;
    try {
      if (typeof BroadcastChannel !== 'undefined') {
        ch = new BroadcastChannel(surveyChannelName);
        ch.onmessage = () => {
          setRefresh((r) => ({ seq: r.seq + 1, silent: true }));
        };
      }
    } catch {
      // Ignore BroadcastChannel errors
    }

    window.addEventListener('research-sync-applied', onSync);
    window.addEventListener('storage', onStorage);
    window.addEventListener('focus', onFocusOrVisible);
    document.addEventListener('visibilitychange', onFocusOrVisible);
    return () => {
      ch?.close();
      window.removeEventListener('research-sync-applied', onSync);
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('focus', onFocusOrVisible);
      document.removeEventListener('visibilitychange', onFocusOrVisible);
    };
  }, []);

  // Real-time server SSE subscription so responses from other tabs/mobile/devices appear immediately
  useEffect(() => {
    if (!keys.length || typeof EventSource === 'undefined') return;
    const es = new EventSource(`${base}/events`);
    const triggerRefresh = (ev: MessageEvent) => {
      try {
        const data = JSON.parse(ev.data) as { surveyId?: string };
        if (!data.surveyId || keysRef.current.some((k) => k.id === data.surveyId)) {
          setRefresh((r) => ({ seq: r.seq + 1, silent: true }));
        }
      } catch {
        setRefresh((r) => ({ seq: r.seq + 1, silent: true }));
      }
    };
    es.addEventListener('survey-response', triggerRefresh);
    es.addEventListener('survey-updated', triggerRefresh);
    return () => es.close();
  }, [keys.length]);

  useEffect(() => {
    if (!keys.length) {
      setSummaries({});
      setMissingIds([]);
      setError(false);
      setLoading(false);
      return;
    }
    const ctl = new AbortController();
    if (!refresh.silent) {
      setLoading(true);
    }
    void Promise.allSettled(
      keys.map((k) => api<SurveySummary>(`${base}/manage/${k.id}`, { headers: auth(k), signal: ctl.signal })),
    ).then((results) => {
      if (ctl.signal.aborted) return;
      const nextMissing: string[] = [];
      let hasTransientError = false;
      results.forEach((r, idx) => {
        if (r.status === 'rejected') {
          if (r.reason instanceof ApiError && r.reason.status === 404) {
            nextMissing.push(keys[idx].id);
          } else {
            hasTransientError = true;
          }
        }
      });
      setSummaries(
        Object.fromEntries(results.flatMap((r) => (r.status === 'fulfilled' ? [[r.value.id, r.value]] : []))),
      );
      setMissingIds(nextMissing);
      setError(hasTransientError);
      setLoading(false);
    });
    return () => ctl.abort();
  }, [keys, refresh]);

  return {
    keys,
    summaries,
    missingIds,
    error,
    loading,
    count: Object.values(summaries).reduce((n, s) => n + s.count, 0),
    reload: (silent = false) => setRefresh((r) => ({ seq: r.seq + 1, silent })),
    add: (key: SurveyKey) => {
      const next = [key, ...keys.filter((k) => k.id !== key.id)];
      demoStore.set(surveyStore, next);
      setKeys(next);
    },
    removeKey: (id: string) => {
      const next = keys.filter((k) => k.id !== id);
      demoStore.set(surveyStore, next);
      setKeys(next);
    },
    pruneMissing: () => {
      if (!missingIds.length) return;
      const missingSet = new Set(missingIds);
      const next = keys.filter((k) => !missingSet.has(k.id));
      demoStore.set(surveyStore, next);
      setKeys(next);
      setMissingIds([]);
    },
  };
}

export function Surveys({ state }: { state: ReturnType<typeof useSurveys> }) {
  const [params, setParams] = useSearchParams();
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [exporting, setExporting] = useState<SurveyKey | null>(null);
  const [closing, setClosing] = useState<SurveyKey | null>(null);
  const [viewing, setViewing] = useState<SurveyKey | null>(null);
  const [copying, setCopying] = useState('');
  const [analysis, setAnalysis] = useState<Record<string, SurveyAnalysis>>({});
  const [analyzingId, setAnalyzingId] = useState('');
  const [justPublished, setJustPublished] = useState<SurveyKey | null>(null);

  const closeBuilder = () => setParams({ view: 'surveys' });
  const link = (s: SurveyKey) => `${window.location.origin}/survey/${s.id}`;

  async function copy(s: SurveyKey) {
    try {
      await navigator.clipboard.writeText(link(s));
      setNotice('배포용 응답 링크를 복사했어요. 타겟 유저에게 공유해 보세요.');
    } catch {
      setCopying(link(s));
    }
  }

  async function toggle(s: SurveyKey, active: boolean) {
    setBusy(s.id);
    setError('');
    try {
      await api(`${base}/manage/${s.id}`, {
        method: 'PATCH',
        headers: auth(s),
        body: JSON.stringify({ active }),
      });
      setClosing(null);
      state.reload();
      setNotice(active ? '다시 응답을 받아요.' : '응답 접수를 종료했어요.');
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy('');
    }
  }

  async function exportCsv(s: SurveyKey, page?: number) {
    setBusy(s.id);
    setError('');
    try {
      const query = page ? `page=${page}` : 'all=1';
      const r = await fetch(`${base}/manage/${s.id}/answers.csv?${query}`, { headers: auth(s) });
      if (!r.ok) throw new Error('응답을 내보낼 수 없어요. 다시 시도해 주세요.');
      saveBlob(await r.blob(), `설문응답원문-${s.id}${page ? `-${page}` : ''}.csv`);
      setExporting(null);
      setNotice('수집된 설문 응답 원문을 CSV로 내보냈어요.');
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy('');
    }
  }

  async function analyzeResults(s: SurveyKey) {
    setAnalyzingId(s.id);
    setError('');
    try {
      const result = await api<SurveyAnalysis>(`${base}/manage/${s.id}/analyze`, {
        method: 'POST',
        headers: auth(s),
      });
      setAnalysis((prev) => ({ ...prev, [s.id]: result }));
    } catch (e) {
      setError(message(e));
    } finally {
      setAnalyzingId('');
    }
  }

  if (params.has('new')) {
    return (
      <SurveyBuilder
        key={params.get('template') ?? ''}
        initialTemplate={params.get('template')}
        cancel={closeBuilder}
        saved={(s) => {
          state.add(s);
          setJustPublished(s);
          closeBuilder();
          setNotice(`"${s.title}" 설문이 자동 배포되어 바로 응답을 받을 수 있어요.`);
        }}
      />
    );
  }

  const activeSummary = viewing ? state.summaries[viewing.id] : undefined;

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className={saasUi.pageTitle}>설문조사 · 배포 및 수집</h1>
          <p className={saasUi.pageSubtitle}>
            아이템만 넣으면 설문 문항 생성부터 배포·응답 링크 발급까지 한 번에 자동화돼요.
          </p>
        </div>
        <Link to="/?view=surveys&new=1" className={saasUi.btnPrimary}>
          <Plus size={18} aria-hidden="true" /> 설문 만들기
        </Link>
      </div>

      {justPublished && (
        <section
          className="grid gap-3.5 rounded-2xl border border-[#b7e2d1] bg-[#edf9f4] p-5"
          role="status"
        >
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="flex items-center gap-1.5 text-[14px] font-bold text-[#14674d]">
                <CircleCheck size={17} aria-hidden="true" /> 설문 배포 및 응답 받기 시작됨
              </p>
              <h2 className="mt-1 text-[18px] font-bold text-[#17162b]">{justPublished.title}</h2>
              <p className="mt-1 break-all font-mono text-[14px] text-[#3b5249]">{link(justPublished)}</p>
            </div>
            <button
              type="button"
              onClick={() => setJustPublished(null)}
              className="text-[14px] font-semibold text-[#14674d] hover:underline"
            >
              닫기
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void copy(justPublished)}
              className="inline-flex min-h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl bg-[#14674d] px-4 text-[14px] font-semibold text-white transition-colors hover:bg-[#0f523d]"
            >
              <Link2 size={15} aria-hidden="true" /> 응답 링크 복사
            </button>
            <a
              href={`/survey/${justPublished.id}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-10 shrink-0 items-center gap-1 whitespace-nowrap rounded-xl border border-[#b7e2d1] bg-white px-3.5 text-[14px] font-semibold text-[#14674d] transition-colors hover:bg-[#f6fcf9]"
            >
              응답 화면 바로 열기 <ArrowUpRight size={15} aria-hidden="true" />
            </a>
            <Link
              to={`/?view=analytics&surveyId=${justPublished.id}`}
              className="inline-flex min-h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl border border-[#b7e2d1] bg-white px-3.5 text-[14px] font-semibold text-[#17162b] transition-colors hover:bg-[#f6fcf9]"
            >
              <BarChart3 size={15} aria-hidden="true" /> D3 분석 대시보드
            </Link>
          </div>
        </section>
      )}

      {notice && !justPublished && (
        <p className="rounded-xl border border-[#dfd7fb] bg-[#efeaff] px-4 py-2.5 text-[15px] font-medium text-[#4125cc]" role="status">
          {notice}
        </p>
      )}
      {error && !closing && !exporting && (
        <p className="rounded-xl border border-[#f2ccd7] bg-[#fff5f7] px-4 py-2.5 text-[15px] text-[#9f1d45]" role="alert">
          {error}
        </p>
      )}
      {state.error && (
        <p className="rounded-xl border border-[#f2ccd7] bg-[#fff5f7] px-4 py-2.5 text-[15px] text-[#9f1d45]" role="alert">
          일부 설문 상태를 읽을 수 없어요. 응답 새로고침을 눌러 주세요.
        </p>
      )}
      {state.missingIds.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#f2ccd7] bg-[#fff5f7] px-4 py-2.5 text-[15px] text-[#9f1d45]">
          <span>이전에 기록된 설문 {state.missingIds.length}건을 서버에서 찾을 수 없어요.</span>
          <button
            type="button"
            onClick={state.pruneMissing}
            className="shrink-0 font-bold underline hover:no-underline"
          >
            목록에서 정리하기
          </button>
        </div>
      )}

      <p className="rounded-2xl border border-[#dfd7fb] bg-[#f8f6ff] px-4.5 py-3.5 text-[15px] text-[#4125cc]">
        설문을 배포하면 고유 응답 링크가 즉시 발급되며, 수집된 응답은 실시간 요약과 D3 차트, CSV 다운로드로 확인할 수 있어요.
      </p>

      <section className={`overflow-hidden ${saasUi.card}`}>
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 sm:px-6">
          <div>
            <h2 className={saasUi.sectionTitle}>내 설문 {state.keys.length}개</h2>
            <p className="mt-0.5 text-[14px] text-[#565570]">배포된 설문의 문항은 응답 데이터 일관성을 위해 수정되지 않아요.</p>
          </div>
          {state.keys.length > 0 && (
            <button
              type="button"
              disabled={state.loading}
              onClick={() => state.reload()}
              className={saasUi.btnCompactSecondary}
            >
              <RefreshCw size={15} aria-hidden="true" /> 응답 새로고침
            </button>
          )}
        </div>

        {!state.keys.length && (
          <div className="grid justify-items-center gap-2.5 border-t border-[#e6e3f0] px-5 py-12 text-center">
            <span className="grid size-12 place-items-center rounded-xl bg-[#efeaff] text-[#4c2ee6]">
              <ClipboardList size={24} aria-hidden="true" />
            </span>
            <h3 className="mt-1 text-[18px] font-bold text-[#17162b]">아직 배포한 설문이 없어요</h3>
            <p className="max-w-md text-[15px] text-[#565570]">
              검증할 아이템을 입력해 맞춤형 설문 문항을 생성하고, 타겟 유저에게 링크를 배포해 보세요.
            </p>
            <Link to="/?view=surveys&new=1" className={`mt-2 ${saasUi.btnPrimary}`}>
              <Sparkles size={16} aria-hidden="true" /> 아이템으로 첫 설문 만들기
            </Link>
          </div>
        )}

        <div className="divide-y divide-[#e6e3f0] border-t border-[#e6e3f0]">
          {state.keys.map((k) => {
            const s = state.summaries[k.id];
            return (
              <article key={k.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4.5 sm:px-6">
                <div className="min-w-0">
                  <h3 className="truncate text-[18px] font-bold text-[#17162b]">{k.title}</h3>
                  {s ? (
                    <p className="tnum mt-1 flex flex-wrap items-center gap-2 text-[14px] text-[#565570]">
                      <span className={`font-semibold ${s.active ? 'text-[#14674d]' : 'text-[#565570]'}`}>
                        {s.active ? '응답 접수 중' : '접수 종료'}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>{s.questions.length}문항</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-semibold text-[#17162b]">응답 {s.count}건</span>
                    </p>
                  ) : (
                    <p className="mt-1 text-[14px] text-[#565570]">
                      {state.loading ? '불러오는 중…' : '설문 상태를 불러올 수 없어요.'}
                    </p>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    to={`/?view=analytics&surveyId=${k.id}`}
                    className={saasUi.btnCompactSoft}
                  >
                    <BarChart3 size={15} aria-hidden="true" /> D3 분석 대시보드 ({s?.count ?? 0})
                  </Link>
                  <button
                    type="button"
                    disabled={!s}
                    onClick={() => setViewing(k)}
                    className={saasUi.btnCompactSecondary}
                  >
                    요약 보기
                  </button>
                  <a
                    href={`/survey/${k.id}`}
                    target="_blank"
                    rel="noreferrer"
                    className={saasUi.btnCompactSecondary}
                  >
                    응답 화면 <ArrowUpRight size={15} aria-hidden="true" />
                  </a>
                  <button
                    type="button"
                    onClick={() => void copy(k)}
                    className={saasUi.btnCompactSoft}
                  >
                    <Link2 size={15} aria-hidden="true" /> 링크 복사
                  </button>
                  <button
                    type="button"
                    disabled={!s || s.count === 0 || busy === k.id}
                    onClick={() => void exportCsv(k)}
                    className={saasUi.btnCompactSecondary}
                  >
                    <Download size={15} aria-hidden="true" /> 응답 원문 CSV
                  </button>
                  {s && (
                    <button
                      type="button"
                      disabled={busy === k.id}
                      onClick={() => (s.active ? setClosing(k) : void toggle(k, true))}
                      className={saasUi.btnCompactSecondary}
                    >
                      {s.active ? '접수 종료' : '접수 재개'}
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </section>

      {viewing && activeSummary && (
        <Modal title={`설문 결과 · ${activeSummary.title}`} close={() => setViewing(null)} wide>
          <div className="grid gap-4">
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#dfd7fb] bg-[#f8f6ff] px-4 py-3.5">
              <div className="tnum text-[15px] text-[#17162b]">
                총 수집 응답 <b className="font-bold text-[#4c2ee6]">{activeSummary.count}건</b> ·{' '}
                {activeSummary.active ? '현재 접수 중' : '접수 종료됨'}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Link
                  to={`/?view=analytics&surveyId=${viewing.id}`}
                  onClick={() => setViewing(null)}
                  className={saasUi.btnCompactSoft}
                >
                  <BarChart3 size={15} aria-hidden="true" /> D3 시각화 대시보드
                </Link>
                <button
                  type="button"
                  disabled={activeSummary.count === 0 || analyzingId === viewing.id}
                  onClick={() => void analyzeResults(viewing)}
                  className={saasUi.btnCompactPrimary}
                >
                  <Sparkles size={15} aria-hidden="true" />
                  {analyzingId === viewing.id ? '응답 데이터 분석 중…' : 'AI 응답 분석 요약'}
                </button>
                <button
                  type="button"
                  disabled={activeSummary.count === 0 || busy === viewing.id}
                  onClick={() => void exportCsv(viewing)}
                  className={saasUi.btnCompactSecondary}
                >
                  <Download size={15} aria-hidden="true" /> 응답 원문 CSV
                </button>
              </div>
            </div>

            {analysis[viewing.id] && (
              <section className="grid gap-3.5 rounded-xl border border-[#dfd7fb] bg-[#f8f6ff] p-4.5 text-[15px]">
                <h3 className="flex items-center gap-1.5 text-[16px] font-bold text-[#4125cc]">
                  <Sparkles size={16} aria-hidden="true" /> AI 수집 데이터 요약 리포트
                </h3>
                <p className="leading-relaxed text-[#17162b]">{analysis[viewing.id].overview}</p>
                <div className="grid gap-3.5 sm:grid-cols-2">
                  <div>
                    <b className="text-[14px] text-[#4125cc]">핵심 발견 사항</b>
                    <ul className="mt-1.5 list-disc space-y-1.5 pl-4 text-[#17162b]">
                      {analysis[viewing.id].keyFindings.map((f, idx) => (
                        <li key={idx}>{f}</li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <b className="text-[14px] text-[#4125cc]">타겟 유저 신호</b>
                    <ul className="mt-1.5 list-disc space-y-1.5 pl-4 text-[#17162b]">
                      {analysis[viewing.id].segmentSignals.map((f, idx) => (
                        <li key={idx}>{f}</li>
                      ))}
                    </ul>
                  </div>
                </div>
                <div>
                  <b className="text-[14px] text-[#4125cc]">다음 실행 제안</b>
                  <ul className="mt-1.5 list-disc space-y-1.5 pl-4 text-[#17162b]">
                    {analysis[viewing.id].recommendations.map((f, idx) => (
                      <li key={idx}>{f}</li>
                    ))}
                  </ul>
                </div>
              </section>
            )}

            {activeSummary.count === 0 ? (
              <div className="grid justify-items-center gap-2 rounded-xl border border-dashed border-[#dcd8e8] py-8 text-center">
                <p className="text-[16px] font-semibold text-[#17162b]">아직 수집된 응답이 없어요</p>
                <p className="text-[14px] text-[#565570]">응답 링크를 복사해 타겟 유저에게 전달하거나, 응답 화면에서 직접 테스트해 보세요.</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void copy(viewing)}
                    className={saasUi.btnCompactPrimary}
                  >
                    <Link2 size={15} aria-hidden="true" /> 응답 링크 복사
                  </button>
                  <a
                    href={`/survey/${viewing.id}`}
                    target="_blank"
                    rel="noreferrer"
                    className={saasUi.btnCompactSecondary}
                  >
                    응답 화면 열기 <ArrowUpRight size={15} aria-hidden="true" />
                  </a>
                </div>
              </div>
            ) : (
              <div className="grid gap-3">
                {activeSummary.questions.map((q, qIdx) => {
                  const vals = activeSummary.responses.map((r) => r.answers[qIdx] ?? '').filter(Boolean);
                  if (q.type === 'scale') {
                    const nums = vals.map(Number).filter((n) => n >= 1 && n <= 5);
                    const avg = nums.length ? (nums.reduce((a, b) => a + b, 0) / nums.length).toFixed(2) : '0.00';
                    return (
                      <div key={qIdx} className="grid gap-2.5 rounded-xl border border-[#e6e3f0] p-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <b className="text-[16px] text-[#17162b]">
                            {qIdx + 1}. {q.label}
                          </b>
                          <span className="tnum font-mono text-[14px] font-semibold text-[#4125cc]">
                            평균 {avg} / 5.0 ({nums.length}명)
                          </span>
                        </div>
                        <div className="grid gap-2">
                          {[5, 4, 3, 2, 1].map((score) => {
                            const cnt = nums.filter((n) => n === score).length;
                            const pct = nums.length ? Math.round((cnt / nums.length) * 100) : 0;
                            return (
                              <div key={score} className="grid grid-cols-[3rem_1fr_4.5rem] items-center gap-2 text-[14px]">
                                <span className="tnum text-[#565570]">{score}점</span>
                                <progress className="meter-progress" value={pct} max={100} />
                                <span className="tnum text-right text-[#17162b]">
                                  {cnt}명 ({pct}%)
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  }

                  if (q.type === 'choice') {
                    return (
                      <div key={qIdx} className="grid gap-2.5 rounded-xl border border-[#e6e3f0] p-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <b className="text-[16px] text-[#17162b]">
                            {qIdx + 1}. {q.label}
                          </b>
                          <span className="tnum text-[14px] text-[#565570]">{vals.length}건 응답</span>
                        </div>
                        <div className="grid gap-2">
                          {q.options.map((opt) => {
                            const cnt = vals.filter((v) => v === opt).length;
                            const pct = vals.length ? Math.round((cnt / vals.length) * 100) : 0;
                            return (
                              <div key={opt} className="grid gap-1 text-[14px]">
                                <div className="flex justify-between gap-2">
                                  <span className="font-medium text-[#17162b]">{opt}</span>
                                  <span className="tnum text-[#565570]">
                                    {cnt}명 ({pct}%)
                                  </span>
                                </div>
                                <progress className="meter-progress meter-alt" value={pct} max={100} />
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div key={qIdx} className="grid gap-2.5 rounded-xl border border-[#e6e3f0] p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <b className="text-[16px] text-[#17162b]">
                          {qIdx + 1}. {q.label}
                        </b>
                        <span className="tnum text-[14px] text-[#565570]">{vals.length}건 응답</span>
                      </div>
                      {vals.length ? (
                        <ul className="grid max-h-48 gap-1.5 overflow-y-auto">
                          {vals.map((ans, aIdx) => (
                            <li key={aIdx} className="rounded-lg bg-[#f8f7fc] px-3.5 py-2.5 text-[15px] text-[#17162b]">
                              {ans}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-[14px] text-[#565570]">작성된 응답이 없어요.</p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </Modal>
      )}

      {closing && (
        <Modal
          title="응답 접수를 종료할까요?"
          close={() => {
            if (!busy) setClosing(null);
          }}
        >
          <p className="text-[15px] text-[#565570]">이 링크로 새 응답을 받지 않아요. 기존 응답은 CSV로 내려받을 수 있어요.</p>
          {error && (
            <p className="mt-2 rounded-xl border border-[#f2ccd7] bg-[#fff5f7] px-3.5 py-2.5 text-[15px] text-[#9f1d45]" role="alert">
              {error}
            </p>
          )}
          <div className="mt-5 flex justify-end gap-2">
            <button
              type="button"
              disabled={!!busy}
              onClick={() => setClosing(null)}
              className={saasUi.btnSecondary}
            >
              취소
            </button>
            <button
              type="button"
              disabled={!!busy}
              onClick={() => void toggle(closing, false)}
              className={saasUi.btnPrimary}
            >
              {busy ? '저장 중…' : '접수 종료'}
            </button>
          </div>
        </Modal>
      )}

      {copying && (
        <Modal title="응답 링크 복사" close={() => setCopying('')}>
          <label className={saasUi.labelText}>
            이 주소를 복사해 타겟 유저에게 전달해 주세요.
            <input
              name="survey-link"
              readOnly
              value={copying}
              onFocus={(e) => e.currentTarget.select()}
              className={`${saasUi.input} font-mono text-[14px]`}
            />
          </label>
        </Modal>
      )}

      {exporting && state.summaries[exporting.id] && (
        <Modal
          title="응답 CSV 내보내기"
          close={() => {
            if (!busy) setExporting(null);
          }}
        >
          <form
            className="grid gap-3.5"
            onSubmit={(e) => {
              e.preventDefault();
              void exportCsv(exporting, Number(new FormData(e.currentTarget).get('page')));
            }}
          >
            <label className={saasUi.labelText}>
              500건 단위 파일 번호
              <input
                name="page"
                type="number"
                min="1"
                max={Math.ceil(state.summaries[exporting.id].count / 500)}
                required
                defaultValue="1"
                className={saasUi.input}
              />
            </label>
            {error && (
              <p className="rounded-xl border border-[#f2ccd7] bg-[#fff5f7] px-3.5 py-2.5 text-[15px] text-[#9f1d45]" role="alert">
                {error}
              </p>
            )}
            <button
              type="submit"
              disabled={!!busy}
              className={`${saasUi.btnPrimary} w-fit`}
            >
              파일 내려받기
            </button>
          </form>
        </Modal>
      )}
    </div>
  );
}

const blank: Question[] = [{ label: '', type: 'text', required: true, options: [] }];
const templates = [
  {
    id: 'screening',
    name: '인터뷰 사전 스크리닝',
    items: [
      {
        label: '최근 한 달 내 이 문제를 겪은 적이 있나요?',
        type: 'choice',
        required: true,
        options: ['있어요', '없어요'],
      },
      { label: '현재 이 문제를 어떻게 해결하시나요?', type: 'text', required: true, options: [] },
    ],
  },
  {
    id: 'academic',
    name: '연구용 만족도',
    items: [
      { label: '이 서비스는 사용하기 쉬웠다.', type: 'scale', required: true, options: [] },
      { label: '이 서비스는 필요한 작업을 수행하는 데 도움이 되었다.', type: 'scale', required: true, options: [] },
      { label: '이용 경험에 대해 덧붙이고 싶은 의견이 있나요?', type: 'text', required: false, options: [] },
    ],
  },
  { id: 'webtoon', name: `${webtoonTopic}`, items: webtoonSurvey },
  ...researchTemplates.map((t) => ({
    id: `preset:${t.id}`,
    name: `${t.title} (${t.category})`,
    items: t.survey,
  })),
] satisfies { id: string; name: string; items: Question[] }[];

function SurveyBuilder({
  initialTemplate,
  cancel,
  saved,
}: {
  initialTemplate: string | null;
  cancel: () => void;
  saved: (s: SurveyKey) => void;
}) {
  const generated = demoStore.get<QuestionGuide | null>(questionGuideKey, null);
  const presetTemplate =
    initialTemplate && initialTemplate.startsWith('preset:')
      ? getResearchTemplateById(initialTemplate.slice('preset:'.length))
      : undefined;
  const customTemplates = readCustomTemplates();
  const available = [
    ...(generated ? [{ id: 'generated', name: '리서치 가이드에서 생성한 문항', items: generated.survey }] : []),
    ...customTemplates.map((t) => ({
      id: `preset:${t.id}`,
      name: `AI 맞춤 · ${t.title}`,
      items: t.survey,
    })),
    ...templates,
  ];

  const [title, setTitle] = useState(() =>
    presetTemplate
      ? presetTemplate.surveyTitle
      : initialTemplate === 'generated' && generated
      ? `${generated.item.slice(0, 36)} · 고객검증 설문`
      : initialTemplate === 'webtoon'
      ? '일상을 웹툰으로 · 고객검증 설문'
      : '',
  );
  const [intro, setIntro] = useState(() =>
    presetTemplate ? presetTemplate.surveyIntro : DEFAULT_SURVEY_INTRO,
  );
  const [questions, setQuestions] = useState<Question[]>(
    () => presetTemplate?.survey ?? available.find((t) => t.id === initialTemplate)?.items ?? blank,
  );

  // AI Item-to-Survey Generator inside the builder
  const [aiItem, setAiItem] = useState(generated?.item ?? '');
  const [aiAudience, setAiAudience] = useState('');
  const [aiGoal, setAiGoal] = useState('고객 문제 검증 및 수요 확인');
  const [aiBusy, setAiBusy] = useState(false);
  const [aiStatusText, setAiStatusText] = useState('');
  const [aiNotice, setAiNotice] = useState(() =>
    presetTemplate
      ? `"${presetTemplate.title}" 상황별 설문 템플릿을 불러왔어요. 바로 배포하거나 문항을 다듬어 보세요.`
      : '',
  );

  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);

  function edit(i: number, q: Partial<Question>) {
    setQuestions((old) =>
      old.map((v, n) => {
        if (n !== i) return v;
        const next = { ...v, ...q };
        if (q.type === 'choice') {
          const validOptions = (next.options ?? []).map((o) => o.trim()).filter(Boolean);
          if (validOptions.length < 2) {
            next.options = ['매우 그렇다', '보통이다', '그렇지 않다'];
          }
        }
        return next;
      }),
    );
  }

  function applyPresetTemplate(templateId: string) {
    const preset = getResearchTemplateById(templateId);
    if (preset) {
      setTitle(preset.surveyTitle);
      setIntro(preset.surveyIntro);
      setQuestions(preset.survey.map((q) => ({ ...q, options: [...q.options] })));
      setError('');
      setAiNotice(`"${preset.title}" 템플릿 문항 ${preset.survey.length}개를 바로 채웠어요. 아래에서 즉시 배포할 수 있어요.`);
      return;
    }
    const local = available.find((t) => t.id === templateId);
    if (local) {
      setTitle((prev) => prev.trim() || `${local.name} · 설문`);
      setIntro((prev) => prev.trim() || DEFAULT_SURVEY_INTRO);
      setQuestions(local.items.map((q) => ({ ...q, options: [...q.options] })));
      setError('');
      setAiNotice(`"${local.name}" 문항 ${local.items.length}개를 채웠어요. 바로 배포할 수 있어요.`);
    }
  }

  function sanitizeQuestionsForSubmit(rawList: Question[]): {
    ok: true;
    questions: Question[];
  } | {
    ok: false;
    error: string;
  } {
    const nonEmpty = rawList.filter((q) => q.label.trim().length > 0);
    if (nonEmpty.length === 0) {
      return { ok: false, error: '최소 1개의 설문 질문을 입력해 주세요.' };
    }
    const cleaned: Question[] = [];
    for (let idx = 0; idx < nonEmpty.length; idx++) {
      const q = nonEmpty[idx];
      const label = q.label.trim().slice(0, 220);
      if (q.type === 'choice') {
        const rawOpts = q.options.map((o) => o.trim()).filter(Boolean);
        const splitOpts =
          rawOpts.length === 1 && /[,/]/.test(rawOpts[0])
            ? rawOpts[0]
                .split(/[,/]/)
                .map((s) => s.trim())
                .filter(Boolean)
            : rawOpts;
        const uniqueOpts = Array.from(new Set(splitOpts)).slice(0, 10);
        if (uniqueOpts.length < 2) {
          return { ok: false, error: `${idx + 1}번 객관식 문항은 선택지를 2개 이상 입력해 주세요.` };
        }
        cleaned.push({ label, type: 'choice', required: q.required, options: uniqueOpts });
      } else {
        cleaned.push({ label, type: q.type, required: q.required, options: [] });
      }
    }
    return { ok: true, questions: cleaned };
  }

  async function generateSurveyQuestions() {
    if (aiItem.trim().length < 3) {
      setError('설문 문항을 만들 아이템 설명을 3자 이상 입력해 주세요.');
      return;
    }
    setAiBusy(true);
    setAiStatusText('AI가 설문 문항을 생성하고 있어요…');
    setError('');
    setAiNotice('');
    try {
      const draft = await api<{ title: string; intro: string; questions: Question[] }>(
        `${base}/generate-survey`,
        {
          method: 'POST',
          body: JSON.stringify({ item: aiItem, audience: aiAudience, goal: aiGoal }),
        },
      );
      setTitle(draft.title);
      setIntro(draft.intro || DEFAULT_SURVEY_INTRO);
      setQuestions(draft.questions);
      setAiNotice(`아이템에 맞는 설문 문항 ${draft.questions.length}개를 채웠어요. 아래에서 확인 후 바로 배포하세요.`);
    } catch (err) {
      setError(message(err));
    } finally {
      setAiBusy(false);
      setAiStatusText('');
    }
  }

  async function generateAndDeploySurvey() {
    if (aiItem.trim().length < 3) {
      setError('자동 생성 후 배포할 아이템 설명을 3자 이상 입력해 주세요.');
      return;
    }
    setAiBusy(true);
    setBusy(true);
    setError('');
    setAiNotice('');
    try {
      setAiStatusText('1/2 · 아이템 맞춤 설문 문항 생성 중…');
      const draft = await api<{ title: string; intro: string; questions: Question[] }>(
        `${base}/generate-survey`,
        {
          method: 'POST',
          body: JSON.stringify({ item: aiItem, audience: aiAudience, goal: aiGoal }),
        },
      );
      const safeTitle = draft.title.trim() || `${aiItem.trim().slice(0, 36)} · 고객검증 설문`;
      const safeIntro = draft.intro.trim() || DEFAULT_SURVEY_INTRO;
      setTitle(safeTitle);
      setIntro(safeIntro);
      setQuestions(draft.questions);

      setAiStatusText('2/2 · 설문 배포 및 응답 링크 발급 중…');
      const created = await api<SurveyKey>(`${base}/surveys`, {
        method: 'POST',
        body: JSON.stringify({
          title: safeTitle,
          intro: safeIntro,
          questions: draft.questions,
        }),
      });
      saved(created);
    } catch (err) {
      setError(message(err));
    } finally {
      setAiBusy(false);
      setBusy(false);
      setAiStatusText('');
    }
  }

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');

    const hasQuestionText = questions.some((q) => q.label.trim().length > 0);
    if (!hasQuestionText) {
      if (aiItem.trim().length >= 3) {
        await generateAndDeploySurvey();
        return;
      }
      setError('상단 "검증할 아이템"을 입력하거나, 아래 설문 질문을 1개 이상 작성해 주세요.');
      return;
    }

    const validated = sanitizeQuestionsForSubmit(questions);
    if (!validated.ok) {
      setError(validated.error);
      return;
    }

    const today = new Date();
    const fallbackTitle = `${aiItem.trim().slice(0, 32) || '고객 검증 설문'} (${today.getMonth() + 1}/${today.getDate()})`;
    const finalTitle = title.trim() || fallbackTitle;
    const finalIntro = intro.trim() || DEFAULT_SURVEY_INTRO;

    setTitle(finalTitle);
    setIntro(finalIntro);
    setBusy(true);
    try {
      const s = await api<SurveyKey>(`${base}/surveys`, {
        method: 'POST',
        body: JSON.stringify({
          title: finalTitle,
          intro: finalIntro,
          questions: validated.questions,
        }),
      });
      saved(s);
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  }

  const inputClass = saasUi.input;
  const hasBlankPlaceholderOnly = questions.length === 1 && !questions[0].label.trim();

  return (
    <div className="grid max-w-4xl gap-5">
      <div>
        <h1 className={saasUi.pageTitle}>설문 만들기 및 자동 배포</h1>
        <p className={saasUi.pageSubtitle}>
          아이템만 입력하면 설문 문항 생성부터 배포 링크 발급까지 한 번에 자동화돼요. 템플릿으로 바로 시작할 수도 있어요.
        </p>
      </div>

      {/* AI Item-to-Survey Generator Card */}
      <section className={`grid gap-4 ${saasUi.cardSoft} p-5 sm:p-6`}>
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#efeaff] text-[#4c2ee6]">
            <Sparkles size={20} aria-hidden="true" />
          </span>
          <div>
            <h2 className={saasUi.sectionTitle}>원클릭 AI 설문 생성 · 자동 배포</h2>
            <p className="mt-0.5 text-[15px] text-[#565570]">
              검증할 아이템을 넣고 &quot;자동 생성 후 즉시 배포&quot;를 누르면 문항 생성과 응답 링크 발급이 한 번에 완료돼요.
            </p>
          </div>
        </div>
        <div className="grid gap-3.5 sm:grid-cols-2">
          <label className={`${saasUi.labelText} sm:col-span-2`}>
            검증할 아이템
            <input
              value={aiItem}
              onChange={(e) => setAiItem(e.target.value)}
              disabled={aiBusy || busy}
              placeholder="예: 프리랜서 디자이너를 위한 견적·정산 자동화 웹 서비스"
              className={inputClass}
            />
          </label>
          <label className={saasUi.labelText}>
            타겟 유저 (선택)
            <input
              value={aiAudience}
              onChange={(e) => setAiAudience(e.target.value)}
              disabled={aiBusy || busy}
              placeholder="예: 1~3년 차 프리랜서, 20대 직장인"
              className={inputClass}
            />
          </label>
          <label className={saasUi.labelText}>
            설문 목적 (선택)
            <select
              value={aiGoal}
              onChange={(e) => setAiGoal(e.target.value)}
              disabled={aiBusy || busy}
              className={inputClass}
            >
              <option>고객 문제 검증 및 수요 확인</option>
              <option>인터뷰 대상자 사전 스크리닝</option>
              <option>시제품(MVP) 만족도 및 지불 의향 조사</option>
              <option>논문·학술 실증 설문</option>
            </select>
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            disabled={aiBusy || busy}
            onClick={() => void generateAndDeploySurvey()}
            className={saasUi.btnPrimary}
          >
            <Sparkles size={16} aria-hidden="true" />
            {aiBusy ? aiStatusText || '자동 생성 및 배포 중…' : '아이템으로 자동 생성 후 즉시 배포'}
          </button>
          <button
            type="button"
            disabled={aiBusy || busy}
            onClick={() => void generateSurveyQuestions()}
            className={saasUi.btnSoft}
          >
            문항만 먼저 생성
          </button>
          <button
            type="button"
            disabled={aiBusy || busy}
            onClick={() => setAiItem('일상 사진과 짧은 글을 4컷 웹툰으로 바꿔 주는 웹·앱')}
            className="text-[14px] font-bold text-[#4c2ee6] hover:underline"
          >
            예시 아이템 넣기
          </button>
        </div>
        {aiNotice && (
          <p className="rounded-xl border border-[#dfd7fb] bg-[#efeaff] px-4 py-2.5 text-[15px] font-medium text-[#4125cc]" role="status">
            {aiNotice}
          </p>
        )}
      </section>

      {/* Quick 1-click template bar */}
      <section className={`flex flex-wrap items-center gap-2 ${saasUi.card} px-5 py-3.5`}>
        <span className="text-[14px] font-bold text-[#565570]">상황별 원클릭 불러오기</span>
        {[
          ['problem-discovery', '고객 문제 검증'],
          ['value-proposition', '가치 제안 테스트'],
          ['usability-mvp', '사용성 · MVP'],
          ['target-screening', '사전 스크리닝'],
        ].map(([id, label]) => (
          <button
            key={id}
            type="button"
            disabled={aiBusy || busy}
            onClick={() => applyPresetTemplate(id)}
            className="inline-flex min-h-9 shrink-0 items-center whitespace-nowrap rounded-xl border border-[#dcd8e8] bg-[#f8f7fc] px-3.5 text-[14px] font-semibold text-[#17162b] transition-colors hover:border-[#cfc1f3] hover:bg-[#efeaff] hover:text-[#4125cc]"
          >
            {label}
          </button>
        ))}
      </section>

      <form
        className={`grid gap-4 ${saasUi.card} p-5 sm:p-6`}
        autoComplete="off"
        noValidate
        onSubmit={submit}
      >
        <fieldset disabled={busy || aiBusy} className="grid gap-4">
          <label className={saasUi.labelText}>
            <span>
              설문 제목 <span className="font-normal text-[#565570]">(비워 두면 자동 생성돼요)</span>
            </span>
            <input
              name="title"
              maxLength={100}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="예: 업무 도구 이용 경험 연구…"
              className={inputClass}
            />
          </label>
          <label className={saasUi.labelText}>
            <span>
              연구 안내 / 참여 동의 내용 <span className="font-normal text-[#565570]">(기본 동의 문구가 자동 입력돼요)</span>
            </span>
            <textarea
              name="intro"
              maxLength={3000}
              rows={3}
              value={intro}
              onChange={(e) => setIntro(e.target.value)}
              placeholder="설문 목적, 소요 시간, 자발적 참여, 보관 기간, 철회 가능 범위…"
              className={`${inputClass} resize-y`}
            />
          </label>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#e6e3f0] pt-4">
            <h2 className={saasUi.sectionTitle}>문항 {questions.length}개</h2>
            <label className="flex items-center gap-2 text-[14px] font-semibold text-[#565570]">
              템플릿 추가
              <select
                aria-label="질문 예시"
                value=""
                onChange={(e) => {
                  const q = available.find((t) => t.id === e.target.value)?.items;
                  if (q) {
                    const cloned = q.map((item) => ({ ...item, options: [...item.options] }));
                    setQuestions((old) =>
                      hasBlankPlaceholderOnly ? cloned : old.length + cloned.length <= 20 ? [...old, ...cloned] : old,
                    );
                  }
                }}
                className={saasUi.select}
              >
                <option value="">예시 선택</option>
                {available.map((t) => (
                  <option
                    key={t.id}
                    value={t.id}
                    disabled={!hasBlankPlaceholderOnly && questions.length + t.items.length > 20}
                  >
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {questions.map((q, i) => (
            <fieldset key={i} className="grid gap-3 rounded-xl border border-[#e6e3f0] p-4 sm:p-4.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[14px] font-bold text-[#4125cc]">문항 {i + 1}</span>
                <button
                  type="button"
                  aria-label={`문항 ${i + 1} 삭제`}
                  disabled={questions.length === 1}
                  onClick={() => setQuestions((old) => old.filter((_, n) => n !== i))}
                  className="grid size-9 place-items-center rounded-xl text-[#565570] transition-colors hover:bg-[#fff5f7] hover:text-[#b01e4a] disabled:opacity-40"
                >
                  <Trash2 size={17} aria-hidden="true" />
                </button>
              </div>
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_160px]">
                <label className={saasUi.labelText}>
                  질문 *
                  <input
                    name={`label-${i}`}
                    maxLength={220}
                    value={q.label}
                    onChange={(e) => edit(i, { label: e.target.value })}
                    placeholder="질문 내용을 입력하거나 상단에서 아이템으로 자동 생성하세요"
                    className={inputClass}
                  />
                </label>
                <label className={saasUi.labelText}>
                  응답 유형
                  <select
                    name={`type-${i}`}
                    value={q.type}
                    onChange={(e) => edit(i, { type: e.target.value as Question['type'] })}
                    className={inputClass}
                  >
                    {Object.entries(types).map(([key, label]) => (
                      <option value={key} key={key}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              {q.type === 'choice' && (
                <label className={saasUi.labelText}>
                  선택지 * (한 줄에 하나씩, 2~10개)
                  <textarea
                    rows={3}
                    name={`options-${i}`}
                    value={q.options.join('\n')}
                    onChange={(e) => edit(i, { options: e.target.value.split('\n') })}
                    className={`${inputClass} resize-y`}
                  />
                </label>
              )}
              {q.type === 'scale' && <p className="text-[14px] text-[#565570]">1 전혀 그렇지 않다 / 5 매우 그렇다</p>}
              <label className="flex w-fit items-center gap-2 text-[14px] font-medium text-[#17162b]">
                <input
                  type="checkbox"
                  name={`required-${i}`}
                  checked={q.required}
                  onChange={(e) => edit(i, { required: e.target.checked })}
                  className="size-4 accent-[#4c2ee6]"
                />
                필수 응답
              </label>
            </fieldset>
          ))}

          <button
            type="button"
            disabled={questions.length >= 20}
            onClick={() => setQuestions((old) => [...old, { label: '', type: 'text', required: true, options: [] }])}
            className={`${saasUi.btnSecondary} w-fit`}
          >
            <Plus size={17} aria-hidden="true" /> 문항 추가
          </button>
        </fieldset>

        {error && (
          <p className="rounded-xl border border-[#f2ccd7] bg-[#fff5f7] px-4 py-2.5 text-[15px] text-[#9f1d45]" role="alert">
            {error}
          </p>
        )}
        <p className="text-[14px] text-[#565570]">
          문항이 비어 있어도 상단에 &quot;검증할 아이템&quot;을 적어 두셨다면 아래 버튼을 눌렀을 때 자동으로 문항을 만들어 배포해요.
        </p>
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            disabled={busy || aiBusy}
            onClick={() => setConfirmCancel(true)}
            className={saasUi.btnSecondary}
          >
            취소
          </button>
          <button
            type="submit"
            disabled={busy || aiBusy}
            className={saasUi.btnPrimary}
          >
            {busy ? (aiStatusText || '설문 배포 중…') : '설문 배포 및 응답 받기 시작'}
          </button>
        </div>
      </form>

      {confirmCancel && (
        <Modal title="설문 작성을 그만둘까요?" close={() => setConfirmCancel(false)}>
          <p className="text-[15px] text-[#565570]">지금까지 입력한 내용은 저장되지 않아요.</p>
          <div className="mt-5 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setConfirmCancel(false)}
              className={saasUi.btnSecondary}
            >
              계속 작성
            </button>
            <button
              type="button"
              onClick={cancel}
              className={saasUi.btnDanger}
            >
              작성 취소
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

export function SurveyResponse() {
  const { id } = useParams();
  return <ResponseForm key={id} id={id ?? ''} />;
}

function ResponseForm({ id }: { id: string }) {
  const [survey, setSurvey] = useState<Survey>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const ctl = new AbortController();
    void api<Survey>(`${base}/surveys/${id}`, { signal: ctl.signal })
      .then(setSurvey)
      .catch((e) => {
        if (!ctl.signal.aborted) setError(message(e));
      });
    return () => ctl.abort();
  }, [id]);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!survey) return;
    const data = new FormData(e.currentTarget);
    const consent = data.get('consent') === 'on';
    const answers = survey.questions.map((_, i) => String(data.get(`q${i}`) ?? '').trim());

    if (!consent) {
      setError('참여 안내를 확인하고 자발적 참여 동의에 체크해 주세요.');
      return;
    }
    for (let i = 0; i < survey.questions.length; i++) {
      if (survey.questions[i].required && !answers[i]) {
        setError(`${i + 1}번 필수 문항에 응답해 주세요.`);
        return;
      }
    }

    setBusy(true);
    setError('');
    try {
      await api(`${base}/surveys/${id}/responses`, {
        method: 'POST',
        body: JSON.stringify({ consent, answers }),
      });
      notifySurveySubmitted(id);
      setDone(true);
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }

  const inputClass = saasUi.input;

  return (
    <div className="min-h-dvh bg-[#f6f6fb] px-4 py-8 text-[#17162b]">
      <header className="mx-auto mb-5 flex max-w-2xl items-center gap-3">
        <span className="grid size-10 place-items-center rounded-xl bg-[#4c2ee6] text-white shadow-[0_1px_2px_rgba(76,46,230,0.2)]">
          <AudioLines size={20} aria-hidden="true" />
        </span>
        <b className="font-display text-[20px] font-extrabold tracking-tight text-[#17162b]">리서치랩</b>
      </header>

      <main className={`mx-auto max-w-2xl ${saasUi.card} p-6 sm:p-8`}>
        {!survey ? (
          <div className="grid gap-2">
            <h1 className={saasUi.pageTitle}>연구 설문</h1>
            <p className="text-[15px] text-[#565570]" role={error ? 'alert' : 'status'}>
              {error || '설문을 불러오는 중…'}
            </p>
          </div>
        ) : done ? (
          <div className="grid gap-4 py-4">
            <span className="grid size-12 place-items-center rounded-xl bg-[#e6f7ef] text-[#14674d]">
              <CircleCheck size={26} aria-hidden="true" />
            </span>
            <div>
              <h1 className={saasUi.pageTitle}>응답을 제출했어요</h1>
              <p className="mt-1.5 text-[15px] leading-relaxed text-[#565570]">
                응답이 서버에 안전하게 수집되어 설문 분석 대시보드와 CSV에 즉시 반영되었어요.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => {
                  setDone(false);
                  setError('');
                }}
                className={saasUi.btnSecondary}
              >
                추가 응답 작성하기
              </button>
              <Link to={`/?view=analytics&surveyId=${id}`} className={saasUi.btnPrimary}>
                <BarChart3 size={16} aria-hidden="true" /> 수집된 응답 · 분석 대시보드 보기
              </Link>
            </div>
          </div>
        ) : (
          <div className="grid gap-5">
            <div>
              <p className="inline-flex items-center gap-1.5 text-[14px] font-bold text-[#4c2ee6]">
                <ListChecks size={16} aria-hidden="true" /> 고객 검증 · 연구 설문
              </p>
              <h1 className={`mt-2 ${saasUi.pageTitle}`}>{survey.title}</h1>
            </div>

            {!survey.active ? (
              <p className="rounded-xl border border-[#e6e3f0] bg-[#f8f7fc] p-4.5 text-[15px] text-[#565570]">
                이 설문은 응답 접수를 종료했어요.
              </p>
            ) : (
              <form className="grid gap-4" autoComplete="off" noValidate onSubmit={submit}>
                <section className="grid gap-2.5 rounded-xl border border-[#dfd7fb] bg-[#f8f6ff] p-4.5">
                  <h2 className="text-[16px] font-bold text-[#17162b]">참여 안내</h2>
                  <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-[#17162b]">{survey.intro}</p>
                  <p className="text-[14px] text-[#565570]">이름이나 연락처 등 개인을 알아볼 수 있는 정보는 답변에 적지 마세요.</p>
                  <label className="mt-1 flex items-center gap-2 text-[15px] font-semibold text-[#17162b]">
                    <input type="checkbox" name="consent" required className="size-4 accent-[#4c2ee6]" />
                    안내를 읽었으며 자발적으로 참여하는 데 동의합니다. *
                  </label>
                </section>

                {survey.questions.map((q, i) => (
                  <fieldset key={i} className="grid gap-2.5 rounded-xl border border-[#e6e3f0] p-4.5">
                    <legend className="px-1 text-[16px] font-bold text-[#17162b]">
                      <span className="text-[#4c2ee6]">{i + 1}.</span> {q.label} {q.required ? '*' : ''}
                    </legend>
                    {q.type === 'text' ? (
                      <textarea
                        name={`q${i}`}
                        aria-label={`${i + 1}번 응답`}
                        rows={3}
                        maxLength={1500}
                        required={q.required}
                        className={`${inputClass} resize-y`}
                      />
                    ) : q.type === 'scale' ? (
                      <div className="grid gap-2">
                        <div className="flex justify-between text-[14px] text-[#565570]">
                          <span>1 전혀 그렇지 않다</span>
                          <span>5 매우 그렇다</span>
                        </div>
                        <select
                          name={`q${i}`}
                          aria-label={`${i + 1}번 점수`}
                          defaultValue=""
                          required={q.required}
                          className={inputClass}
                        >
                          <option value="">점수 선택</option>
                          {[1, 2, 3, 4, 5].map((n) => (
                            <option key={n} value={n}>
                              {n}점
                            </option>
                          ))}
                        </select>
                      </div>
                    ) : (
                      <select
                        name={`q${i}`}
                        aria-label={`${i + 1}번 선택`}
                        defaultValue=""
                        required={q.required}
                        className={inputClass}
                      >
                        <option value="">응답 선택</option>
                        {q.options.map((o) => (
                          <option key={o} value={o}>
                            {o}
                          </option>
                        ))}
                      </select>
                    )}
                  </fieldset>
                ))}

                {error && (
                  <p className="rounded-xl border border-[#f2ccd7] bg-[#fff5f7] px-4 py-2.5 text-[15px] text-[#9f1d45]" role="alert">
                    {error}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={busy}
                  className={`${saasUi.btnPrimary} w-fit px-6`}
                >
                  {busy ? '제출 중…' : '응답 제출'}
                </button>
              </form>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
