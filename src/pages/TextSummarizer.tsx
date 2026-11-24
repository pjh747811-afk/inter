import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  Check,
  CheckCircle2,
  Copy,
  Download,
  FileText,
  RotateCcw,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { api, demoStore } from '../lib/api';
import { listAllVoiceAnswers, type VoiceAnswer } from '../lib/interviewAudio';
import { exportTextSummaryCsv } from '../lib/researchCsv';
import type { Person } from '../lib/research';
import { saasUi } from './ResearchUI';

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

const LAST_SUMMARY_KEY = 'research.text-summary.v1';

const styleOptions: Array<{ id: SummaryStyle; label: string; desc: string }> = [
  { id: 'concise', label: '핵심 3줄 요약', desc: '결론 중심으로 짧고 빠르게 압축' },
  { id: 'bullet', label: '포인트별 구조화', desc: '맥락과 근거를 항목별로 정리' },
  { id: 'action', label: '검증·실행 중심', desc: '제품 개선 및 후속 액션 위주' },
];

const sampleInterviewText = [
  '[참여자 인터뷰 녹취 예시]',
  'Q. 최근 일주일 동안 일상 기록을 남기려다 포기했던 순간이 있나요?',
  'A. 주말에 카페 갔을 때 사진은 10장 넘게 찍었는데, 인스타 스토리에 올리려고 문구 쓰고 스티커 붙이고 크기 맞추다 보니까 20분이 넘게 걸리더라고요. 결국 피곤해서 그냥 갤러리에만 묵혀두고 안 올렸어요.',
  'Q. 현재 사용 중인 앱에서 가장 아쉬운 점은 무엇인가요?',
  'A. 템플릿 앱을 월 3,300원 내고 쓰는데 매번 사진 고르고 문구를 내가 직접 다 써야 해서 손이 많이 가요. 내 얼굴 사진이 그대로 나가는 것도 부담스러워서 가볍게 만화나 일러스트 느낌으로 자동 변환되면 친구들 카톡방에도 바로 공유할 것 같아요.',
].join('\n');

export function TextSummarizer({
  people = [],
  initialTitle = '',
  initialText = '',
  onSaveSummary,
}: {
  people?: Person[];
  initialTitle?: string;
  initialText?: string;
  onSaveSummary?: (personId: string, summaryText: string) => void;
}) {
  const [title, setTitle] = useState(initialTitle);
  const [text, setText] = useState(initialText);
  const [style, setStyle] = useState<SummaryStyle>('concise');
  const [voiceAnswers, setVoiceAnswers] = useState<VoiceAnswer[]>([]);
  const [result, setResult] = useState<TextSummaryOutput | null>(() =>
    demoStore.get<TextSummaryOutput | null>(LAST_SUMMARY_KEY, null),
  );
  const [targetPersonId, setTargetPersonId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const onSync = () => {
      setResult(demoStore.get<TextSummaryOutput | null>(LAST_SUMMARY_KEY, null));
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
        // IndexedDB optional
      });
    return () => {
      ignore = true;
    };
  }, []);

  const peopleWithNotes = useMemo(() => people.filter((p) => p.note.trim().length > 0), [people]);
  const unsyncedVoice = useMemo(
    () => voiceAnswers.filter((v) => v.transcript && v.transcript.trim().length > 0 && !v.syncedToRecord),
    [voiceAnswers],
  );

  function loadAllCollected() {
    const blocks: string[] = [];
    for (const p of peopleWithNotes) {
      blocks.push(`[${p.name} · ${p.group}]\n${p.note.trim()}`);
    }
    for (const v of unsyncedVoice) {
      const person = people.find((p) => p.id === v.personId);
      blocks.push(`[음성 STT · ${person?.name ?? '참여자'}] Q. ${v.question}\nA. ${v.transcript?.trim() ?? ''}`);
    }
    if (!blocks.length) {
      setNotice('불러올 인터뷰 기록이나 STT 텍스트가 아직 없어요.');
      return;
    }
    setTitle(`수집된 인터뷰 기록 전체 (${blocks.length}건)`);
    setText(blocks.join('\n\n---\n\n'));
    setError('');
    setNotice(`수집된 인터뷰 기록 ${blocks.length}건을 원문 입력창에 불러왔어요.`);
  }

  function loadFromPerson(personId: string) {
    if (!personId) return;
    const p = peopleWithNotes.find((item) => item.id === personId);
    if (!p) return;
    setTitle(`${p.name} (${p.group}) 인터뷰 기록`);
    setText(p.note.trim());
    setTargetPersonId(p.id);
    setError('');
    setNotice(`'${p.name}'의 인터뷰 기록을 불러왔어요.`);
  }

  async function runSummarize(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (text.trim().length < 15) {
      setError('요약할 텍스트를 15자 이상 입력해 주세요.');
      return;
    }
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const data = await api<TextSummaryOutput>('/api/research/summarize-text', {
        method: 'POST',
        body: JSON.stringify({
          title: title.trim() || undefined,
          text: text.trim(),
          style,
        }),
      });
      setResult(data);
      demoStore.set(LAST_SUMMARY_KEY, data);
      setNotice('AI 텍스트 요약을 완료했어요.');
    } catch (err) {
      setError(err instanceof Error ? err.message : '텍스트 요약에 실패했어요. 잠시 후 다시 시도해 주세요.');
    } finally {
      setBusy(false);
    }
  }

  function formatSummaryPlain(s: TextSummaryOutput): string {
    return [
      title.trim() ? `[${title.trim()} · AI 요약]` : '[AI 텍스트 요약]',
      `핵심 결론: ${s.headline}`,
      '',
      s.summary,
      '',
      '[핵심 포인트]',
      ...s.keyPoints.map((kp) => `• ${kp}`),
      s.keywords.length ? `\n핵심 키워드: ${s.keywords.join(', ')}` : '',
      s.actionItems.length ? `\n[후속 실행 제안]\n${s.actionItems.map((a) => `- ${a}`).join('\n')}` : '',
    ]
      .filter(Boolean)
      .join('\n');
  }

  async function copySummary() {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(formatSummaryPlain(result));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setNotice('클립보드 복사가 제한된 환경이에요.');
    }
  }

  const compressionPct =
    result && result.originalChars > 0
      ? Math.max(0, Math.round(((result.originalChars - result.summaryChars) / result.originalChars) * 100))
      : 0;

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#efeaff] text-[#4c2ee6]">
            <FileText size={20} aria-hidden="true" />
          </span>
          <div>
            <h3 className={saasUi.sectionTitle}>AI 텍스트 요약</h3>
            <p className="mt-0.5 text-[15px] leading-relaxed text-[#565570]">
              긴 인터뷰 녹취록, STT 텍스트, 서술형 설문 응답을 원하는 형식으로 빠르게 압축 정리해요.
            </p>
          </div>
        </div>
      </div>

      {/* Quick Loaders */}
      <div className={`flex flex-wrap items-center gap-2.5 ${saasUi.cardSoft} px-4 py-3`}>
        <span className="text-[14px] font-bold text-[#4125cc]">빠른 불러오기</span>
        {(peopleWithNotes.length > 0 || unsyncedVoice.length > 0) && (
          <button
            type="button"
            onClick={loadAllCollected}
            className={saasUi.btnCompactSoft}
          >
            수집된 인터뷰 전체 ({peopleWithNotes.length + unsyncedVoice.length}건)
          </button>
        )}
        {peopleWithNotes.length > 0 && (
          <select
            aria-label="특정 대상자 인터뷰 기록 불러오기"
            value=""
            onChange={(e) => loadFromPerson(e.target.value)}
            className="min-h-10 rounded-xl border border-[#dcd8e8] bg-white px-3 text-[14px] text-[#17162b]"
          >
            <option value="">대상자 기록 선택…</option>
            {peopleWithNotes.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.group})
              </option>
            ))}
          </select>
        )}
        <button
          type="button"
          onClick={() => {
            setTitle('일상 웹툰 앱 고객 인터뷰 예시');
            setText(sampleInterviewText);
            setError('');
          }}
          className="min-h-10 px-2 text-[14px] font-bold text-[#4c2ee6] hover:underline"
        >
          예시 녹취록 채우기
        </button>
      </div>

      <form className="grid gap-4" onSubmit={runSummarize}>
        <fieldset disabled={busy} className="grid gap-4">
          <div className="grid gap-3.5 sm:grid-cols-2">
            <label className={saasUi.labelText}>
              제목 / 대상 (선택)
              <input
                value={title}
                maxLength={120}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="예: 김OO 1차 고객 인터뷰"
                className={saasUi.input}
              />
            </label>

            <div className="grid gap-1.5">
              <span className="text-[14px] font-bold text-[#17162b] sm:text-[15px]">요약 형식</span>
              <div className="flex flex-wrap items-center gap-1.5" role="tablist" aria-label="요약 형식 선택">
                {styleOptions.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    role="tab"
                    title={opt.desc}
                    aria-selected={style === opt.id}
                    onClick={() => setStyle(opt.id)}
                    className={`min-h-10 shrink-0 whitespace-nowrap rounded-xl border px-3 text-[14px] font-semibold transition-colors ${
                      style === opt.id
                        ? 'border-[#4c2ee6] bg-[#efeaff] text-[#4125cc]'
                        : 'border-[#dcd8e8] bg-white text-[#44435c] hover:border-[#b9b1d4]'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <label className={saasUi.labelText}>
            <div className="flex items-center justify-between gap-2">
              <span>요약할 원문 텍스트 *</span>
              <div className="flex items-center gap-3 text-[13px] font-normal text-[#565570]">
                <span className="tnum font-mono">{text.trim().length.toLocaleString()} / 15,000자</span>
                {text && (
                  <button
                    type="button"
                    onClick={() => setText('')}
                    className="inline-flex items-center gap-1 text-[13px] font-bold text-[#565570] hover:text-[#b01e4a]"
                  >
                    <Trash2 size={14} aria-hidden="true" /> 비우기
                  </button>
                )}
              </div>
            </div>
            <textarea
              rows={6}
              required
              maxLength={15000}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="인터뷰 녹취록, STT 변환 텍스트, 설문 서술형 응답 모음 등 요약하고 싶은 텍스트를 붙여넣으세요."
              className={`${saasUi.input} resize-y leading-relaxed`}
            />
          </label>
        </fieldset>

        {error && (
          <div
            role="alert"
            className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#f5c7d3] bg-[#fff0f3] px-4 py-3 text-[15px] text-[#9f1d45]"
          >
            <span>{error}</span>
            <button
              type="submit"
              disabled={busy}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-[#e6a4b7] bg-white px-3 text-[14px] font-bold text-[#9f1d45] hover:bg-[#fff8fa]"
            >
              <RotateCcw size={14} aria-hidden="true" /> 다시 시도
            </button>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="submit"
            disabled={busy || text.trim().length < 15}
            className={saasUi.btnPrimary}
          >
            <Sparkles size={16} aria-hidden="true" />
            {busy ? 'AI가 핵심을 요약하는 중…' : 'AI 텍스트 요약하기'}
          </button>
        </div>
      </form>

      {!busy && notice && (
        <p className="rounded-xl bg-[#f4f0ff] px-4 py-3 text-[14px] font-semibold text-[#4125cc]" role="status">
          {notice}
        </p>
      )}

      {result && (
        <section className={`grid gap-4 ${saasUi.card} p-5`}>
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#e6e3f0] pb-3.5">
            <b className="text-[16px] font-bold text-[#4125cc]">
              {styleOptions.find((s) => s.id === result.style)?.label ?? '요약 결과'}
            </b>
            <span className="tnum text-[14px] text-[#565570]">
              원문 {result.originalChars.toLocaleString()}자 → 요약 {result.summaryChars.toLocaleString()}자 ·{' '}
              <b className="font-bold text-[#14674d]">{compressionPct}% 압축</b>
            </span>
          </div>

          <div className="rounded-xl border border-[#e4dcfb] bg-[#f8f6ff] px-4 py-3.5">
            <span className="text-[13px] font-bold text-[#4125cc]">한 줄 핵심 결론</span>
            <p className="mt-1 text-[16px] font-bold text-[#17162b]">{result.headline}</p>
          </div>

          <div className="grid gap-1.5">
            <span className="text-[14px] font-bold text-[#565570]">요약 본문</span>
            <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-[#17162b]">{result.summary}</p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid content-start gap-2">
              <span className="text-[14px] font-bold text-[#4125cc]">핵심 포인트</span>
              <ul className="list-disc space-y-1.5 pl-5 text-[15px] leading-relaxed text-[#17162b]">
                {result.keyPoints.map((kp, idx) => (
                  <li key={idx}>{kp}</li>
                ))}
              </ul>
            </div>

            <div className="grid content-start gap-2">
              <span className="text-[14px] font-bold text-[#4125cc]">후속 검증 · 실행 제안</span>
              <ul className="list-disc space-y-1.5 pl-5 text-[15px] leading-relaxed text-[#17162b]">
                {result.actionItems.map((act, idx) => (
                  <li key={idx}>{act}</li>
                ))}
              </ul>
            </div>
          </div>

          {result.keywords.length > 0 && (
            <p className="text-[14px] text-[#565570]">
              <b className="font-bold text-[#17162b]">핵심 키워드:</b> {result.keywords.join(' · ')}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-2.5 pt-1">
            <button
              type="button"
              onClick={() => void copySummary()}
              className={saasUi.btnCompactSecondary}
            >
              {copied ? (
                <>
                  <Check size={15} className="text-[#14674d]" aria-hidden="true" /> 복사됨
                </>
              ) : (
                <>
                  <Copy size={15} aria-hidden="true" /> 요약 결과 복사
                </>
              )}
            </button>
            <button
              type="button"
              onClick={() => {
                const file = exportTextSummaryCsv(result, title);
                setNotice(`텍스트 요약 결과를 CSV(${file})로 다운로드했어요.`);
              }}
              className={saasUi.btnCompactSecondary}
            >
              <Download size={15} aria-hidden="true" /> 요약 CSV
            </button>

            {onSaveSummary && people.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <select
                  aria-label="요약을 저장할 대상자 선택"
                  value={targetPersonId}
                  onChange={(e) => setTargetPersonId(e.target.value)}
                  className="min-h-10 rounded-xl border border-[#dcd8e8] bg-white px-3 text-[14px] text-[#17162b]"
                >
                  <option value="">대상자 기록에 반영할 사람 선택</option>
                  {people.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.group})
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={!targetPersonId}
                  onClick={() => {
                    if (!targetPersonId) return;
                    onSaveSummary(targetPersonId, formatSummaryPlain(result));
                    setNotice('선택한 대상자의 인터뷰 기록에 요약 내용을 추가했어요.');
                  }}
                  className={saasUi.btnCompactPrimary}
                >
                  <CheckCircle2 size={15} aria-hidden="true" /> 기록에 저장
                </button>
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
