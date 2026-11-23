import { useEffect, useState, type FormEvent } from 'react';
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
import { api, demoStore } from '../lib/api';
import {
  types,
  type Question,
  type Survey,
  type SurveyAnalysis,
  type SurveyKey,
  type SurveySummary,
} from '../lib/research';
import { webtoonSurvey, webtoonTopic } from '../lib/webtoonValidation';
import { getResearchTemplateById, researchTemplates } from '../lib/researchTemplates';
import { questionGuideKey, type QuestionGuide } from '../lib/questionGuide';
import { Modal, saveBlob } from './ResearchUI';

const surveyStore = 'research.survey-keys.v1';
const auth = (s: SurveyKey) => ({ authorization: `Bearer ${s.key}` });
const base = '/api/research';
const message = (e: unknown) => (e instanceof Error ? e.message : '잠시 뒤 다시 시도해 주세요.');

export function useSurveys() {
  const [keys, setKeys] = useState(() => demoStore.get<SurveyKey[]>(surveyStore, []));
  const [summaries, setSummaries] = useState<Record<string, SurveySummary>>({});
  const [error, setError] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const onSync = () => {
      setKeys(demoStore.get<SurveyKey[]>(surveyStore, []));
    };
    window.addEventListener('research-sync-applied', onSync);
    window.addEventListener('storage', onSync);
    return () => {
      window.removeEventListener('research-sync-applied', onSync);
      window.removeEventListener('storage', onSync);
    };
  }, []);

  useEffect(() => {
    if (!keys.length) {
      setSummaries({});
      setError(false);
      return;
    }
    const ctl = new AbortController();
    setLoading(true);
    void Promise.allSettled(
      keys.map((k) => api<SurveySummary>(`${base}/manage/${k.id}`, { headers: auth(k), signal: ctl.signal })),
    ).then((results) => {
      if (ctl.signal.aborted) return;
      setSummaries(
        Object.fromEntries(results.flatMap((r) => (r.status === 'fulfilled' ? [[r.value.id, r.value]] : []))),
      );
      setError(results.some((r) => r.status === 'rejected'));
      setLoading(false);
    });
    return () => ctl.abort();
  }, [keys, refresh]);

  return {
    keys,
    summaries,
    error,
    loading,
    count: Object.values(summaries).reduce((n, s) => n + s.count, 0),
    reload: () => setRefresh((n) => n + 1),
    add: (key: SurveyKey) => {
      const next = [key, ...keys];
      demoStore.set(surveyStore, next);
      setKeys(next);
    },
    removeKey: (id: string) => {
      const next = keys.filter((k) => k.id !== id);
      demoStore.set(surveyStore, next);
      setKeys(next);
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

  async function exportCsv(s: SurveyKey, page: number) {
    setBusy(s.id);
    setError('');
    try {
      const r = await fetch(`${base}/manage/${s.id}/answers.csv?page=${page}`, { headers: auth(s) });
      if (!r.ok) throw new Error('응답을 내보낼 수 없어요. 다시 시도해 주세요.');
      saveBlob(await r.blob(), `설문-응답-${page}.csv`);
      setExporting(null);
      setNotice('설문 응답을 CSV로 내보냈어요.');
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
          closeBuilder();
          setNotice('설문이 배포되었어요! 응답 링크를 복사해 타겟 유저에게 전달해 보세요.');
        }}
      />
    );
  }

  const activeSummary = viewing ? state.summaries[viewing.id] : undefined;

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-[#22213a]">설문조사 · 배포 및 수집</h1>
          <p className="mt-1 text-[13px] text-[#62627a]">
            아이템만 넣으면 설문 문항이 자동으로 만들어지고, 배포 링크로 타겟 유저 응답을 바로 수집해요.
          </p>
        </div>
        <Link
          to="/?view=surveys&new=1"
          className="inline-flex min-h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg bg-[#5b3df5] px-4 text-sm font-semibold text-white hover:bg-[#4b2ee0]"
        >
          <Plus size={16} aria-hidden="true" /> 설문 만들기
        </Link>
      </div>

      <p className="rounded-xl border border-[#e5dcfc] bg-[#f4f0ff] px-4 py-3 text-[13px] text-[#4d30cf]">
        설문을 저장하면 고유 응답 링크가 생성되며, 관리 권한은 이 브라우저에 안전하게 보관돼요. 수집된 응답은 실시간 요약과 CSV 다운로드로 확인할 수 있어요.
      </p>

      <section className="overflow-hidden rounded-2xl border border-[#e9e7f1] bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
          <div>
            <h2 className="text-base font-bold text-[#22213a]">내 설문 {state.keys.length}개</h2>
            <p className="text-[13px] text-[#62627a]">배포된 설문의 문항은 응답 데이터 일관성을 위해 수정되지 않아요.</p>
          </div>
          {state.keys.length > 0 && (
            <button
              type="button"
              disabled={state.loading}
              onClick={state.reload}
              className="inline-flex min-h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-[#e2deee] bg-white px-3 text-xs font-semibold text-[#22213a] hover:bg-[#f7f7fb] disabled:opacity-50"
            >
              <RefreshCw size={14} aria-hidden="true" /> 응답 새로고침
            </button>
          )}
        </div>

        {!state.keys.length && (
          <div className="grid justify-items-center gap-2 border-t border-[#e9e7f1] px-5 py-10 text-center">
            <span className="grid size-11 place-items-center rounded-xl bg-[#f1edff] text-[#5b3df5]">
              <ClipboardList size={22} aria-hidden="true" />
            </span>
            <h3 className="mt-1 text-base font-bold text-[#22213a]">아직 배포한 설문이 없어요</h3>
            <p className="max-w-md text-[13px] text-[#62627a]">
              검증할 아이템을 입력해 맞춤형 설문 문항을 생성하고, 타겟 유저에게 링크를 배포해 보세요.
            </p>
            <Link
              to="/?view=surveys&new=1"
              className="mt-2 inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-[#5b3df5] px-4 text-sm font-semibold text-white hover:bg-[#4b2ee0]"
            >
              <Sparkles size={15} aria-hidden="true" /> 아이템으로 첫 설문 만들기
            </Link>
          </div>
        )}

        <div className="divide-y divide-[#e9e7f1] border-t border-[#e9e7f1]">
          {state.keys.map((k) => {
            const s = state.summaries[k.id];
            return (
              <article key={k.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                <div className="min-w-0">
                  <h3 className="truncate text-base font-bold text-[#22213a]">{k.title}</h3>
                  {s ? (
                    <p className="tnum mt-1 flex flex-wrap items-center gap-2 text-[13px] text-[#62627a]">
                      <span className={`font-semibold ${s.active ? 'text-[#14674d]' : 'text-[#62627a]'}`}>
                        {s.active ? '응답 접수 중' : '접수 종료'}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>{s.questions.length}문항</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-semibold text-[#22213a]">응답 {s.count}건</span>
                    </p>
                  ) : (
                    <p className="mt-1 text-[13px] text-[#62627a]">
                      {state.loading ? '불러오는 중…' : '설문 상태를 불러올 수 없어요.'}
                    </p>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    to={`/?view=analytics&surveyId=${k.id}`}
                    className="inline-flex min-h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-[#d8cef7] bg-[#faf7ff] px-3 text-xs font-semibold text-[#4d30cf] hover:bg-[#eee8ff]"
                  >
                    <BarChart3 size={14} aria-hidden="true" /> D3 분석 대시보드 ({s?.count ?? 0})
                  </Link>
                  <button
                    type="button"
                    disabled={!s}
                    onClick={() => setViewing(k)}
                    className="inline-flex min-h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-[#e2deee] bg-white px-3 text-xs font-semibold text-[#22213a] hover:bg-[#f7f7fb] disabled:opacity-50"
                  >
                    요약 보기
                  </button>
                  <a
                    href={`/survey/${k.id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex min-h-9 shrink-0 items-center gap-1 whitespace-nowrap rounded-lg border border-[#e2deee] bg-white px-3 text-xs font-semibold text-[#22213a] hover:bg-[#f7f7fb]"
                  >
                    응답 화면 <ArrowUpRight size={14} aria-hidden="true" />
                  </a>
                  <button
                    type="button"
                    onClick={() => void copy(k)}
                    className="inline-flex min-h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-[#e2deee] bg-white px-3 text-xs font-semibold text-[#4d30cf] hover:bg-[#f1edff]"
                  >
                    <Link2 size={14} aria-hidden="true" /> 링크 복사
                  </button>
                  <button
                    type="button"
                    disabled={!s || busy === k.id}
                    onClick={() => (s && s.count > 500 ? setExporting(k) : void exportCsv(k, 1))}
                    className="inline-flex min-h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-[#e2deee] bg-white px-3 text-xs font-semibold text-[#22213a] hover:bg-[#f7f7fb] disabled:opacity-50"
                  >
                    <Download size={14} aria-hidden="true" /> CSV
                  </button>
                  {s && (
                    <button
                      type="button"
                      disabled={busy === k.id}
                      onClick={() => (s.active ? setClosing(k) : void toggle(k, true))}
                      className="inline-flex min-h-9 shrink-0 items-center whitespace-nowrap rounded-lg border border-[#e2deee] bg-white px-3 text-xs font-semibold text-[#22213a] hover:bg-[#f7f7fb] disabled:opacity-50"
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

      {state.error && (
        <p className="rounded-lg bg-[#fff0f3] px-3 py-2 text-[13px] text-[#9a2148]" role="alert">
          일부 설문 상태를 읽을 수 없어요. 응답 새로고침을 눌러 주세요.
        </p>
      )}
      {error && !closing && !exporting && (
        <p className="rounded-lg bg-[#fff0f3] px-3 py-2 text-[13px] text-[#9a2148]" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="rounded-lg bg-[#eee9ff] px-3 py-2 text-[13px] font-medium text-[#4d30cf]" role="status">
          {notice}
        </p>
      )}

      {viewing && activeSummary && (
        <Modal title={`설문 결과 · ${activeSummary.title}`} close={() => setViewing(null)} wide>
          <div className="grid gap-4">
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#e9e7f1] bg-[#faf8ff] px-4 py-3">
              <div className="tnum text-sm text-[#22213a]">
                총 수집 응답 <b className="font-bold text-[#5b3df5]">{activeSummary.count}건</b> ·{' '}
                {activeSummary.active ? '현재 접수 중' : '접수 종료됨'}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Link
                  to={`/?view=analytics&surveyId=${viewing.id}`}
                  onClick={() => setViewing(null)}
                  className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-[#d8cef7] bg-white px-3 text-xs font-semibold text-[#4d30cf] hover:bg-[#f5f1ff]"
                >
                  <BarChart3 size={14} aria-hidden="true" /> D3 시각화 대시보드
                </Link>
                <button
                  type="button"
                  disabled={activeSummary.count === 0 || analyzingId === viewing.id}
                  onClick={() => void analyzeResults(viewing)}
                  className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-[#5b3df5] px-3 text-xs font-semibold text-white hover:bg-[#4b2ee0] disabled:opacity-45"
                >
                  <Sparkles size={14} aria-hidden="true" />
                  {analyzingId === viewing.id ? '응답 데이터 분석 중…' : 'AI 응답 분석 요약'}
                </button>
                <button
                  type="button"
                  onClick={() => void exportCsv(viewing, 1)}
                  className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-[#e2deee] bg-white px-3 text-xs font-semibold text-[#22213a]"
                >
                  <Download size={14} aria-hidden="true" /> CSV
                </button>
              </div>
            </div>

            {analysis[viewing.id] && (
              <section className="grid gap-3 rounded-xl border border-[#e2d5fd] bg-[#faf7ff] p-4 text-[13px]">
                <h3 className="flex items-center gap-1.5 text-sm font-bold text-[#4d30cf]">
                  <Sparkles size={15} aria-hidden="true" /> AI 수집 데이터 요약 리포트
                </h3>
                <p className="text-[#22213a]">{analysis[viewing.id].overview}</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <b className="text-xs text-[#4d30cf]">핵심 발견 사항</b>
                    <ul className="mt-1 list-disc space-y-1 pl-4 text-[#22213a]">
                      {analysis[viewing.id].keyFindings.map((f, idx) => (
                        <li key={idx}>{f}</li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <b className="text-xs text-[#4d30cf]">타겟 유저 신호</b>
                    <ul className="mt-1 list-disc space-y-1 pl-4 text-[#22213a]">
                      {analysis[viewing.id].segmentSignals.map((f, idx) => (
                        <li key={idx}>{f}</li>
                      ))}
                    </ul>
                  </div>
                </div>
                <div>
                  <b className="text-xs text-[#4d30cf]">다음 실행 제안</b>
                  <ul className="mt-1 list-disc space-y-1 pl-4 text-[#22213a]">
                    {analysis[viewing.id].recommendations.map((f, idx) => (
                      <li key={idx}>{f}</li>
                    ))}
                  </ul>
                </div>
              </section>
            )}

            {activeSummary.count === 0 ? (
              <div className="grid justify-items-center gap-2 rounded-xl border border-dashed border-[#d8d3ea] py-8 text-center">
                <p className="text-sm font-semibold text-[#22213a]">아직 수집된 응답이 없어요</p>
                <p className="text-xs text-[#62627a]">응답 링크를 복사해 타겟 유저에게 전달하거나, 응답 화면에서 직접 테스트해 보세요.</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void copy(viewing)}
                    className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-[#5b3df5] px-3 text-xs font-semibold text-white"
                  >
                    <Link2 size={14} aria-hidden="true" /> 응답 링크 복사
                  </button>
                  <a
                    href={`/survey/${viewing.id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-[#e2deee] bg-white px-3 text-xs font-semibold text-[#22213a]"
                  >
                    응답 화면 열기 <ArrowUpRight size={14} aria-hidden="true" />
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
                      <div key={qIdx} className="grid gap-2 rounded-xl border border-[#e9e7f1] p-3.5">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <b className="text-sm text-[#22213a]">
                            {qIdx + 1}. {q.label}
                          </b>
                          <span className="tnum font-mono text-xs font-semibold text-[#4d30cf]">
                            평균 {avg} / 5.0 ({nums.length}명)
                          </span>
                        </div>
                        <div className="grid gap-1.5">
                          {[5, 4, 3, 2, 1].map((score) => {
                            const cnt = nums.filter((n) => n === score).length;
                            const pct = nums.length ? Math.round((cnt / nums.length) * 100) : 0;
                            return (
                              <div key={score} className="grid grid-cols-[2.5rem_1fr_4rem] items-center gap-2 text-xs">
                                <span className="tnum text-[#62627a]">{score}점</span>
                                <progress className="meter-progress" value={pct} max={100} />
                                <span className="tnum text-right text-[#22213a]">
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
                      <div key={qIdx} className="grid gap-2 rounded-xl border border-[#e9e7f1] p-3.5">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <b className="text-sm text-[#22213a]">
                            {qIdx + 1}. {q.label}
                          </b>
                          <span className="tnum text-xs text-[#62627a]">{vals.length}건 응답</span>
                        </div>
                        <div className="grid gap-1.5">
                          {q.options.map((opt) => {
                            const cnt = vals.filter((v) => v === opt).length;
                            const pct = vals.length ? Math.round((cnt / vals.length) * 100) : 0;
                            return (
                              <div key={opt} className="grid gap-1 text-xs">
                                <div className="flex justify-between gap-2">
                                  <span className="font-medium text-[#22213a]">{opt}</span>
                                  <span className="tnum text-[#62627a]">
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
                    <div key={qIdx} className="grid gap-2 rounded-xl border border-[#e9e7f1] p-3.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <b className="text-sm text-[#22213a]">
                          {qIdx + 1}. {q.label}
                        </b>
                        <span className="tnum text-xs text-[#62627a]">{vals.length}건 응답</span>
                      </div>
                      {vals.length ? (
                        <ul className="grid max-h-48 gap-1.5 overflow-y-auto">
                          {vals.map((ans, aIdx) => (
                            <li key={aIdx} className="rounded-lg bg-[#f8f8fc] px-3 py-2 text-[13px] text-[#22213a]">
                              {ans}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-xs text-[#62627a]">작성된 응답이 없어요.</p>
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
          <p className="text-sm text-[#62627a]">이 링크로 새 응답을 받지 않아요. 기존 응답은 CSV로 내려받을 수 있어요.</p>
          {error && (
            <p className="mt-2 rounded-lg bg-[#fff0f3] px-3 py-2 text-[13px] text-[#9a2148]" role="alert">
              {error}
            </p>
          )}
          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              disabled={!!busy}
              onClick={() => setClosing(null)}
              className="min-h-10 rounded-lg border border-[#e2deee] bg-white px-4 text-sm font-semibold text-[#22213a]"
            >
              취소
            </button>
            <button
              type="button"
              disabled={!!busy}
              onClick={() => void toggle(closing, false)}
              className="min-h-10 rounded-lg bg-[#5b3df5] px-4 text-sm font-semibold text-white"
            >
              {busy ? '저장 중…' : '접수 종료'}
            </button>
          </div>
        </Modal>
      )}

      {copying && (
        <Modal title="응답 링크 복사" close={() => setCopying('')}>
          <label className="grid gap-2 text-sm font-semibold text-[#22213a]">
            이 주소를 복사해 타겟 유저에게 전달해 주세요.
            <input
              name="survey-link"
              readOnly
              value={copying}
              onFocus={(e) => e.currentTarget.select()}
              className="min-h-10 w-full rounded-lg border border-[#dfdce9] px-3 font-mono text-xs"
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
            className="grid gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              void exportCsv(exporting, Number(new FormData(e.currentTarget).get('page')));
            }}
          >
            <label className="grid gap-1.5 text-sm font-semibold text-[#22213a]">
              500건 단위 파일 번호
              <input
                name="page"
                type="number"
                min="1"
                max={Math.ceil(state.summaries[exporting.id].count / 500)}
                required
                defaultValue="1"
                className="min-h-10 rounded-lg border border-[#dfdce9] px-3 text-sm"
              />
            </label>
            {error && (
              <p className="rounded-lg bg-[#fff0f3] px-3 py-2 text-[13px] text-[#9a2148]" role="alert">
                {error}
              </p>
            )}
            <button
              type="submit"
              disabled={!!busy}
              className="min-h-10 w-fit rounded-lg bg-[#5b3df5] px-4 text-sm font-semibold text-white"
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
  const available = generated
    ? [...templates, { id: 'generated', name: '리서치 가이드에서 생성한 문항', items: generated.survey }]
    : templates;

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
    presetTemplate
      ? presetTemplate.surveyIntro
      : initialTemplate === 'generated' || initialTemplate === 'webtoon'
      ? '안녕하세요. 서비스 개선 및 고객 경험 검증을 위한 짧은 설문(약 2~3분 소요)입니다. 응답 내용은 연구 및 제품 검증 목적 외에는 사용되지 않으며, 원하실 경우 언제든 참여를 중단하실 수 있습니다.'
      : '',
  );
  const [questions, setQuestions] = useState<Question[]>(
    () => available.find((t) => t.id === initialTemplate)?.items ?? blank,
  );

  // AI Item-to-Survey Generator inside the builder
  const [aiItem, setAiItem] = useState(generated?.item ?? '');
  const [aiAudience, setAiAudience] = useState('');
  const [aiGoal, setAiGoal] = useState('고객 문제 검증 및 수요 확인');
  const [aiBusy, setAiBusy] = useState(false);
  const [aiNotice, setAiNotice] = useState(() =>
    presetTemplate
      ? `"${presetTemplate.title}" 상황별 설문 템플릿을 불러왔어요. 아이템에 맞게 문항을 다듬고 바로 배포하세요.`
      : '',
  );

  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);

  function edit(i: number, q: Partial<Question>) {
    setQuestions((old) => old.map((v, n) => (n === i ? { ...v, ...q } : v)));
  }

  async function generateSurveyQuestions() {
    if (aiItem.trim().length < 3) {
      setError('설문 문항을 만들 아이템 설명을 3자 이상 입력해 주세요.');
      return;
    }
    setAiBusy(true);
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
      setIntro(draft.intro);
      setQuestions(draft.questions);
      setAiNotice(`아이템에 맞는 설문 문항 ${draft.questions.length}개를 채웠어요. 아래에서 문항을 확인·수정한 뒤 배포하세요.`);
    } catch (err) {
      setError(message(err));
    } finally {
      setAiBusy(false);
    }
  }

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const s = await api<SurveyKey>(`${base}/surveys`, {
        method: 'POST',
        body: JSON.stringify({
          title,
          intro,
          questions: questions.map((q) => ({
            ...q,
            options: q.options.map((o) => o.trim()).filter(Boolean),
          })),
        }),
      });
      saved(s);
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }

  const inputClass =
    'w-full min-h-10 rounded-lg border border-[#dfdce9] bg-white px-3 py-2 text-sm font-normal text-[#22213a] hover:border-[#b9b0da] focus:border-[#5b3df5]';

  return (
    <div className="grid max-w-4xl gap-4">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-[#22213a]">설문 만들기 및 배포</h1>
        <p className="mt-1 text-[13px] text-[#62627a]">
          검증할 아이템을 입력하면 설문 문항이 자동으로 만들어져요. 문항을 다듬고 타겟 유저에게 링크를 배포하세요.
        </p>
      </div>

      {/* AI Item-to-Survey Generator Card */}
      <section className="grid gap-3 rounded-2xl border border-[#e2d5fd] bg-[#faf7ff] p-5">
        <div className="flex items-start gap-2.5">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-[#eee8ff] text-[#5b3df5]">
            <Sparkles size={18} aria-hidden="true" />
          </span>
          <div>
            <h2 className="text-base font-bold text-[#22213a]">아이템으로 설문 문항 자동 만들기</h2>
            <p className="text-[13px] text-[#62627a]">
              아이템을 입력하면 타겟 유저에게 배포할 설문 제목·참여 안내·서술형/객관식/척도 문항을 바로 구성해 줘요.
            </p>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1 text-[13px] font-semibold text-[#22213a] sm:col-span-2">
            검증할 아이템
            <input
              value={aiItem}
              onChange={(e) => setAiItem(e.target.value)}
              disabled={aiBusy || busy}
              placeholder="예: 프리랜서 디자이너를 위한 견적·정산 자동화 웹 서비스"
              className={inputClass}
            />
          </label>
          <label className="grid gap-1 text-[13px] font-semibold text-[#22213a]">
            타겟 유저 (선택)
            <input
              value={aiAudience}
              onChange={(e) => setAiAudience(e.target.value)}
              disabled={aiBusy || busy}
              placeholder="예: 1~3년 차 프리랜서, 20대 직장인"
              className={inputClass}
            />
          </label>
          <label className="grid gap-1 text-[13px] font-semibold text-[#22213a]">
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
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={aiBusy || busy}
            onClick={() => void generateSurveyQuestions()}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-[#5b3df5] px-4 text-sm font-semibold text-white hover:bg-[#4b2ee0] disabled:opacity-50"
          >
            <Sparkles size={15} aria-hidden="true" />
            {aiBusy ? '설문 문항을 만드는 중…' : '아이템으로 설문 문항 생성'}
          </button>
          <button
            type="button"
            disabled={aiBusy || busy}
            onClick={() => setAiItem('일상 사진과 짧은 글을 4컷 웹툰으로 바꿔 주는 웹·앱')}
            className="text-xs font-bold text-[#5b3df5] hover:underline"
          >
            예시 아이템 넣기
          </button>
        </div>
        {aiNotice && (
          <p className="rounded-lg bg-[#eee9ff] px-3 py-2 text-[13px] font-medium text-[#4d30cf]" role="status">
            {aiNotice}
          </p>
        )}
      </section>

      <form className="grid gap-4 rounded-2xl border border-[#e9e7f1] bg-white p-5" autoComplete="off" onSubmit={submit}>
        <fieldset disabled={busy} className="grid gap-4">
          <label className="grid gap-1.5 text-[13px] font-semibold text-[#22213a]">
            설문 제목 *
            <input
              name="title"
              maxLength={100}
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="예: 업무 도구 이용 경험 연구…"
              className={inputClass}
            />
          </label>
          <label className="grid gap-1.5 text-[13px] font-semibold text-[#22213a]">
            연구 안내 / 참여 동의 내용 *
            <textarea
              name="intro"
              required
              maxLength={3000}
              rows={4}
              value={intro}
              onChange={(e) => setIntro(e.target.value)}
              placeholder="설문 목적, 소요 시간, 자발적 참여, 보관 기간, 철회 가능 범위와 문의 방법…"
              className={`${inputClass} resize-y`}
            />
          </label>
          <p className="text-xs text-[#62627a]">
            제목과 연구 안내는 배포된 응답 링크를 연 타겟 유저에게 표시돼요.
          </p>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#efedf6] pt-3">
            <h2 className="text-base font-bold text-[#22213a]">문항 {questions.length}개</h2>
            <label className="flex items-center gap-2 text-xs font-semibold text-[#62627a]">
              템플릿 추가
              <select
                aria-label="질문 예시"
                value=""
                onChange={(e) => {
                  const q = available.find((t) => t.id === e.target.value)?.items;
                  if (q) setQuestions((old) => (old === blank ? q : old.length + q.length <= 20 ? [...old, ...q] : old));
                }}
                className="min-h-9 rounded-lg border border-[#dfdce9] bg-white px-2.5 text-xs font-normal text-[#22213a]"
              >
                <option value="">예시 선택</option>
                {available.map((t) => (
                  <option key={t.id} value={t.id} disabled={questions !== blank && questions.length + t.items.length > 20}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {questions.map((q, i) => (
            <fieldset key={i} className="grid gap-2.5 rounded-xl border border-[#e9e7f1] p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-[#4d30cf]">문항 {i + 1}</span>
                <button
                  type="button"
                  aria-label={`문항 ${i + 1} 삭제`}
                  disabled={questions.length === 1}
                  onClick={() => setQuestions((old) => old.filter((_, n) => n !== i))}
                  className="grid size-8 place-items-center rounded-lg text-[#62627a] hover:bg-[#fff0f3] hover:text-[#a6214e] disabled:opacity-40"
                >
                  <Trash2 size={16} aria-hidden="true" />
                </button>
              </div>
              <div className="grid gap-2.5 sm:grid-cols-[minmax(0,1fr)_140px]">
                <label className="grid gap-1 text-xs font-semibold text-[#22213a]">
                  질문 *
                  <input
                    name={`label-${i}`}
                    required
                    maxLength={220}
                    value={q.label}
                    onChange={(e) => edit(i, { label: e.target.value })}
                    className={inputClass}
                  />
                </label>
                <label className="grid gap-1 text-xs font-semibold text-[#22213a]">
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
                <label className="grid gap-1 text-xs font-semibold text-[#22213a]">
                  선택지 * (한 줄에 하나씩, 2~10개)
                  <textarea
                    rows={3}
                    name={`options-${i}`}
                    required
                    value={q.options.join('\n')}
                    onChange={(e) => edit(i, { options: e.target.value.split('\n') })}
                    className={`${inputClass} resize-y`}
                  />
                </label>
              )}
              {q.type === 'scale' && <p className="text-xs text-[#62627a]">1 전혀 그렇지 않다 / 5 매우 그렇다</p>}
              <label className="flex w-fit items-center gap-2 text-xs font-medium text-[#22213a]">
                <input
                  type="checkbox"
                  name={`required-${i}`}
                  checked={q.required}
                  onChange={(e) => edit(i, { required: e.target.checked })}
                  className="size-4 accent-[#5b3df5]"
                />
                필수 응답
              </label>
            </fieldset>
          ))}

          <button
            type="button"
            disabled={questions.length >= 20}
            onClick={() => setQuestions((old) => [...old, ...blank])}
            className="inline-flex min-h-10 w-fit items-center gap-1.5 rounded-lg border border-[#e2deee] bg-white px-4 text-sm font-semibold text-[#22213a] hover:bg-[#f7f7fb] disabled:opacity-50"
          >
            <Plus size={16} aria-hidden="true" /> 문항 추가
          </button>
        </fieldset>

        {error && (
          <p className="rounded-lg bg-[#fff0f3] px-3 py-2 text-[13px] text-[#9a2148]" role="alert">
            {error}
          </p>
        )}
        <p className="text-xs text-[#62627a]">배포를 시작하면 데이터 일관성을 위해 문항은 수정할 수 없어요.</p>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => setConfirmCancel(true)}
            className="min-h-10 rounded-lg border border-[#e2deee] bg-white px-4 text-sm font-semibold text-[#22213a] hover:bg-[#f7f7fb]"
          >
            취소
          </button>
          <button
            type="submit"
            disabled={busy}
            className="min-h-10 rounded-lg bg-[#5b3df5] px-5 text-sm font-semibold text-white hover:bg-[#4b2ee0] disabled:opacity-50"
          >
            {busy ? '설문 배포 중…' : '설문 배포 및 응답 받기 시작'}
          </button>
        </div>
      </form>

      {confirmCancel && (
        <Modal title="설문 작성을 그만둘까요?" close={() => setConfirmCancel(false)}>
          <p className="text-sm text-[#62627a]">지금까지 입력한 내용은 저장되지 않아요.</p>
          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setConfirmCancel(false)}
              className="min-h-10 rounded-lg border border-[#e2deee] bg-white px-4 text-sm font-semibold text-[#22213a]"
            >
              계속 작성
            </button>
            <button
              type="button"
              onClick={cancel}
              className="min-h-10 rounded-lg bg-[#a6214e] px-4 text-sm font-semibold text-white"
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
    setBusy(true);
    setError('');
    try {
      await api(`${base}/surveys/${id}/responses`, {
        method: 'POST',
        body: JSON.stringify({
          consent: data.get('consent') === 'on',
          answers: survey.questions.map((_, i) => String(data.get(`q${i}`) ?? '')),
        }),
      });
      setDone(true);
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }

  const inputClass =
    'w-full min-h-10 rounded-lg border border-[#dfdce9] bg-white px-3 py-2 text-sm text-[#22213a] hover:border-[#b9b0da] focus:border-[#5b3df5]';

  return (
    <div className="min-h-dvh bg-[#f7f7fb] px-4 py-8 text-[#22213a]">
      <header className="mx-auto mb-4 flex max-w-2xl items-center gap-2.5">
        <span className="grid size-9 place-items-center rounded-xl bg-[#5b3df5] text-white">
          <AudioLines size={18} aria-hidden="true" />
        </span>
        <b className="font-display text-lg font-extrabold">리서치랩</b>
      </header>

      <main className="mx-auto max-w-2xl rounded-2xl border border-[#e9e7f1] bg-white p-6 sm:p-8">
        {!survey ? (
          <div className="grid gap-2">
            <h1 className="font-display text-2xl font-bold">연구 설문</h1>
            <p className="text-sm text-[#62627a]" role={error ? 'alert' : 'status'}>
              {error || '설문을 불러오는 중…'}
            </p>
          </div>
        ) : done ? (
          <div className="grid gap-3 py-4">
            <span className="grid size-11 place-items-center rounded-xl bg-[#e6f7ef] text-[#176b50]">
              <CircleCheck size={24} aria-hidden="true" />
            </span>
            <h1 className="font-display text-2xl font-bold text-[#22213a]">응답을 제출했어요</h1>
            <p className="text-sm text-[#62627a]">소중한 시간을 내어 참여해 주셔서 감사합니다.</p>
          </div>
        ) : (
          <div className="grid gap-5">
            <div>
              <p className="inline-flex items-center gap-1.5 text-xs font-bold text-[#5b3df5]">
                <ListChecks size={14} aria-hidden="true" /> 고객 검증 · 연구 설문
              </p>
              <h1 className="mt-2 font-display text-2xl font-bold tracking-tight text-[#22213a]">{survey.title}</h1>
            </div>

            {!survey.active ? (
              <p className="rounded-xl border border-[#e9e7f1] bg-[#f8f8fc] p-4 text-sm text-[#62627a]">
                이 설문은 응답 접수를 종료했어요.
              </p>
            ) : (
              <form className="grid gap-4" autoComplete="off" onSubmit={submit}>
                <section className="grid gap-2.5 rounded-xl border border-[#e5dcfc] bg-[#f8f5ff] p-4">
                  <h2 className="text-sm font-bold text-[#22213a]">참여 안내</h2>
                  <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-[#22213a]">{survey.intro}</p>
                  <p className="text-xs text-[#62627a]">이름이나 연락처 등 개인을 알아볼 수 있는 정보는 답변에 적지 마세요.</p>
                  <label className="mt-1 flex items-center gap-2 text-[13px] font-semibold text-[#22213a]">
                    <input type="checkbox" name="consent" required className="size-4 accent-[#5b3df5]" />
                    안내를 읽었으며 자발적으로 참여하는 데 동의합니다. *
                  </label>
                </section>

                {survey.questions.map((q, i) => (
                  <fieldset key={i} className="grid gap-2 rounded-xl border border-[#e9e7f1] p-4">
                    <legend className="px-1 text-sm font-bold text-[#22213a]">
                      <span className="text-[#5b3df5]">{i + 1}.</span> {q.label} {q.required ? '*' : ''}
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
                      <div className="grid gap-1.5">
                        <div className="flex justify-between text-xs text-[#62627a]">
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
                  <p className="rounded-lg bg-[#fff0f3] px-3 py-2 text-[13px] text-[#9a2148]" role="alert">
                    {error}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={busy}
                  className="min-h-11 w-fit rounded-lg bg-[#5b3df5] px-6 text-sm font-semibold text-white hover:bg-[#4b2ee0] disabled:opacity-50"
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
