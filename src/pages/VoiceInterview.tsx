import { useEffect, useRef, useState } from 'react';
import {
  AudioLines,
  Check,
  CheckCircle2,
  Copy,
  Download,
  FileText,
  Mic,
  Pencil,
  RotateCcw,
  Sparkles,
  Square,
  Trash2,
} from 'lucide-react';
import { api, demoStore } from '../lib/api';
import {
  blobToBase64,
  deleteVoiceAnswer,
  listVoiceAnswers,
  saveVoiceAnswer,
  type VoiceAnswer,
} from '../lib/interviewAudio';
import { questionGuideKey, type QuestionGuide } from '../lib/questionGuide';
import { interviewPrompts, type Person } from '../lib/research';
import { isLiveSpeechSupported, startLiveSpeech, type LiveSpeechController } from '../lib/speechStt';
import { webtoonInterview, webtoonTopic } from '../lib/webtoonValidation';
import { Modal, saveBlob } from './ResearchUI';

const limitSeconds = 30 * 60;
const limitBytes = 18 * 1024 * 1024;
const dates = new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium', timeStyle: 'short' });
const clock = (seconds: number) =>
  `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
const release = (stream: MediaStream) => stream.getTracks().forEach((track) => track.stop());

function micError(error: unknown) {
  if (error instanceof DOMException) {
    if (['NotAllowedError', 'SecurityError'].includes(error.name))
      return '마이크를 사용할 수 없어요. 브라우저에서 마이크를 허용해 주세요. 미리보기에서 허용이 막히면 앱을 브라우저 탭에서 직접 열어 주세요.';
    if (error.name === 'NotFoundError') return '마이크를 찾지 못했어요. 마이크를 연결한 뒤 다시 시작해 주세요.';
    if (error.name === 'NotReadableError')
      return '마이크를 열지 못했어요. 다른 앱에서 마이크를 사용 중인지 확인해 주세요.';
  }
  return '녹음을 시작하지 못했어요. 마이크와 브라우저 설정을 확인해 주세요.';
}

function formatRecordEntry(answer: VoiceAnswer, transcript: string): string {
  return [
    `[음성 인터뷰 STT · ${dates.format(answer.recordedAt)} · ${clock(answer.seconds)}]`,
    `Q. ${answer.question}`,
    `A. ${transcript}`,
  ].join('\n');
}

export function VoiceInterview({
  person,
  close,
  onSaveTranscript,
}: {
  person: Person;
  close: () => void;
  onSaveTranscript?: (personId: string, entryText: string) => void;
}) {
  const [generated] = useState(() => demoStore.get<QuestionGuide | null>(questionGuideKey, null));
  const [answers, setAnswers] = useState<VoiceAnswer[]>([]);
  const [loading, setLoading] = useState(true);
  const [phase, setPhase] = useState<'idle' | 'permission' | 'recording' | 'stopping' | 'transcribing'>('idle');
  const [seconds, setSeconds] = useState(0);
  const [question, setQuestion] = useState('');
  const [consent, setConsent] = useState(false);
  const [autoSttAndSave, setAutoSttAndSave] = useState(true);
  const [liveFinal, setLiveFinal] = useState('');
  const [liveInterim, setLiveInterim] = useState('');
  const [liveSpeechActive, setLiveSpeechActive] = useState(false);

  const [draft, setDraft] = useState<VoiceAnswer | null>(null);
  const [busy, setBusy] = useState(false);
  const [transcribingIds, setTranscribingIds] = useState<Record<string, boolean>>({});
  const [editingId, setEditingId] = useState('');
  const [editingText, setEditingText] = useState('');
  const [copiedId, setCopiedId] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [confirm, setConfirm] = useState<'close' | 'draft' | VoiceAnswer | null>(null);

  const active = useRef<MediaRecorder | null>(null);
  const liveSpeechRef = useRef<LiveSpeechController | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const vizCleanupRef = useRef<(() => void) | null>(null);
  const session = useRef(0);
  const started = useRef(0);
  const autoModeRef = useRef(autoSttAndSave);
  autoModeRef.current = autoSttAndSave;

  const recorderInUse = phase === 'permission' || phase === 'recording' || phase === 'stopping';
  const supported =
    typeof window !== 'undefined' &&
    window.isSecureContext &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof MediaRecorder === 'function';
  const liveSupported = isLiveSpeechSupported();

  const personId = person.id;
  useEffect(() => {
    let ignore = false;
    void listVoiceAnswers(personId)
      .then((items) => {
        if (!ignore) setAnswers(items);
      })
      .catch(() => {
        if (!ignore) setError('저장된 녹음을 읽을 수 없어요. 브라우저의 사이트 저장 공간을 확인해 주세요.');
      })
      .finally(() => {
        if (!ignore) setLoading(false);
      });
    return () => {
      ignore = true;
      session.current++;
      liveSpeechRef.current?.stop();
      liveSpeechRef.current = null;
      vizCleanupRef.current?.();
      vizCleanupRef.current = null;
      if (active.current) {
        release(active.current.stream);
        active.current = null;
      }
    };
  }, [personId]);

  function startWaveform(stream: MediaStream) {
    vizCleanupRef.current?.();
    vizCleanupRef.current = null;

    if (typeof AudioContext === 'undefined') return;
    try {
      const ctx = new AudioContext();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 64;
      source.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);
      let raf = 0;

      const draw = () => {
        const canvas = canvasRef.current;
        if (canvas) {
          const g = canvas.getContext('2d');
          if (g) {
            analyser.getByteFrequencyData(data);
            const w = canvas.width;
            const h = canvas.height;
            g.clearRect(0, 0, w, h);
            const bars = 28;
            const gap = 3;
            const barW = Math.max(2, (w - gap * (bars - 1)) / bars);
            for (let i = 0; i < bars; i++) {
              const val = data[i % data.length] ?? 0;
              const barH = Math.max(4, Math.round((val / 255) * (h - 6)));
              const x = i * (barW + gap);
              const y = Math.round((h - barH) / 2);
              g.fillStyle = val > 25 ? '#5b3df5' : '#cfc1f3';
              g.fillRect(x, y, barW, barH);
            }
          }
        }
        raf = window.requestAnimationFrame(draw);
      };
      raf = window.requestAnimationFrame(draw);

      vizCleanupRef.current = () => {
        window.cancelAnimationFrame(raf);
        try {
          source.disconnect();
          void ctx.close();
        } catch {
          // Ignore audio context teardown error
        }
      };
    } catch {
      // Visualizer optional if AudioContext blocked
    }
  }

  function stop() {
    const media = active.current;
    if (media?.state === 'recording') {
      setPhase('stopping');
      media.stop();
    }
  }

  useEffect(() => {
    if (phase !== 'recording') return;
    const timer = window.setInterval(() => {
      const elapsed = (performance.now() - started.current) / 1000;
      setSeconds(Math.min(limitSeconds, Math.floor(elapsed)));
      if (elapsed >= limitSeconds) stop();
    }, 250);
    return () => window.clearInterval(timer);
  }, [phase]);

  useEffect(() => {
    if (!recorderInUse && !draft && !busy && phase !== 'transcribing') return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [recorderInUse, draft, busy, phase]);

  async function transcribeAndUpdate(
    target: VoiceAnswer,
    options: { autoSyncToRecord: boolean },
  ): Promise<VoiceAnswer | null> {
    if (target.audio.size > limitBytes) {
      setError('녹음 파일이 18MB를 초과해 한 번에 STT 변환할 수 없어요. 파일을 내려받아 보관해 주세요.');
      return null;
    }

    setTranscribingIds((prev) => ({ ...prev, [target.id]: true }));
    setError('');
    try {
      const audioBase64 = await blobToBase64(target.audio);
      const res = await api<{ transcript: string; model: string }>('/api/research/transcribe-audio', {
        method: 'POST',
        body: JSON.stringify({
          audioBase64,
          mimeType: target.audio.type || 'audio/webm',
          question: target.question,
          personName: person.name,
        }),
      });

      const cleanText = res.transcript.trim();
      const emptySpeech = !cleanText || cleanText.includes('인식된 음성이 없습니다');
      const shouldSync = Boolean(options.autoSyncToRecord && onSaveTranscript && !emptySpeech && !target.syncedToRecord);

      const updated: VoiceAnswer = {
        ...target,
        transcript: cleanText,
        transcribedAt: Date.now(),
        sttEngine: 'gemini',
        syncedToRecord: target.syncedToRecord || shouldSync,
      };

      await saveVoiceAnswer(updated);
      setAnswers((old) => old.map((a) => (a.id === updated.id ? updated : a)));

      if (shouldSync && onSaveTranscript) {
        onSaveTranscript(person.id, formatRecordEntry(updated, cleanText));
        setNotice(`음성을 텍스트로 변환하고 '${person.name}' 인터뷰 기록 공간에 자동으로 저장했어요.`);
      } else if (emptySpeech) {
        setNotice('녹음은 저장했지만 발화된 음성이 뚜렷하게 인식되지 않았어요.');
      } else {
        setNotice('음성을 텍스트로 변환해 저장했어요.');
      }
      return updated;
    } catch (err) {
      setError(
        err instanceof Error
          ? `STT 변환 오류: ${err.message}`
          : '음성을 텍스트로 변환하지 못했어요. 아래 카드에서 다시 시도해 주세요.',
      );
      return null;
    } finally {
      setTranscribingIds((prev) => {
        const next = { ...prev };
        delete next[target.id];
        return next;
      });
    }
  }

  async function start() {
    if (!supported || !consent || draft || recorderInUse || phase === 'transcribing') return;
    const attempt = ++session.current;
    let stream: MediaStream | undefined;
    setError('');
    setNotice('');
    setSeconds(0);
    setLiveFinal('');
    setLiveInterim('');
    setLiveSpeechActive(false);
    setPhase('permission');

    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (attempt !== session.current) {
        release(stream);
        return;
      }

      let media: MediaRecorder;
      try {
        media = new MediaRecorder(stream, { audioBitsPerSecond: 96000 });
      } catch {
        media = new MediaRecorder(stream);
      }

      const chunks: Blob[] = [];
      let bytes = 0;
      const time = Date.now();
      const label = question.trim() || '인터뷰 답변';

      media.ondataavailable = ({ data }) => {
        if (attempt !== session.current || !data.size) return;
        chunks.push(data);
        bytes += data.size;
        if (bytes >= limitBytes) stop();
      };

      media.onstop = () => {
        const capturedLive = liveSpeechRef.current?.stop() ?? '';
        liveSpeechRef.current = null;
        setLiveSpeechActive(false);
        vizCleanupRef.current?.();
        vizCleanupRef.current = null;
        release(media.stream);

        if (attempt !== session.current) return;
        active.current = null;
        setConsent(false);

        const audio = new Blob(chunks, { type: media.mimeType || chunks[0]?.type || 'audio/webm' });
        if (!audio.size) {
          setPhase('idle');
          setError('저장할 소리가 없어요. 마이크를 확인한 뒤 다시 녹음해 주세요.');
          return;
        }

        const duration = Math.max(1, Math.min(limitSeconds, Math.round((performance.now() - started.current) / 1000)));
        const newAnswer: VoiceAnswer = {
          id: crypto.randomUUID(),
          personId,
          question: label,
          recordedAt: time,
          seconds: duration,
          audio,
          ...(capturedLive ? { transcript: capturedLive, transcribedAt: Date.now(), sttEngine: 'browser' as const } : {}),
        };

        if (autoModeRef.current) {
          setPhase('transcribing');
          void (async () => {
            try {
              await saveVoiceAnswer(newAnswer);
              setAnswers((old) => [newAnswer, ...old]);
              setNotice('녹음을 저장했어요. AI로 음성을 텍스트(STT) 변환하고 있어요…');
              await transcribeAndUpdate(newAnswer, { autoSyncToRecord: true });
            } catch {
              setDraft(newAnswer);
              setError('브라우저 저장소 쓰기에 실패해 임시 녹음 상태로 전환했어요. 내려받기 또는 다시 저장해 주세요.');
            } finally {
              setPhase('idle');
            }
          })();
        } else {
          setPhase('idle');
          setDraft(newAnswer);
          setNotice('녹음을 마쳤어요. 들어 본 뒤 저장 및 STT 변환을 진행해 주세요.');
        }
      };

      media.onerror = () => {
        liveSpeechRef.current?.stop();
        liveSpeechRef.current = null;
        setLiveSpeechActive(false);
        vizCleanupRef.current?.();
        vizCleanupRef.current = null;
        release(media.stream);
        if (attempt !== session.current) return;
        session.current++;
        active.current = null;
        setPhase('idle');
        setConsent(false);
        setError('녹음이 중단됐어요. 마이크를 확인한 뒤 다시 시도해 주세요.');
      };

      active.current = media;
      started.current = performance.now();
      startWaveform(stream);

      const liveCtl = startLiveSpeech({
        lang: 'ko-KR',
        onUpdate: (finalText, interimText) => {
          if (attempt !== session.current) return;
          setLiveFinal(finalText);
          setLiveInterim(interimText);
        },
      });
      if (liveCtl) {
        liveSpeechRef.current = liveCtl;
        setLiveSpeechActive(true);
      }

      media.start(1000);
      setPhase('recording');
    } catch (e) {
      if (stream) release(stream);
      if (attempt === session.current) {
        active.current = null;
        setPhase('idle');
        setError(micError(e));
      }
    }
  }

  async function saveDraftAndTranscribe() {
    if (!draft) return;
    setBusy(true);
    setError('');
    try {
      await saveVoiceAnswer(draft);
      const savedItem = draft;
      setAnswers((old) => [savedItem, ...old]);
      setDraft(null);
      await transcribeAndUpdate(savedItem, { autoSyncToRecord: Boolean(onSaveTranscript) });
    } catch {
      setError('브라우저에 저장하지 못했어요. 녹음 파일을 내려받아 보관할 수 있어요.');
    } finally {
      setBusy(false);
    }
  }

  function syncAnswerToRecord(answer: VoiceAnswer, customText?: string) {
    const text = (customText ?? answer.transcript ?? '').trim();
    if (!text || !onSaveTranscript) return;
    onSaveTranscript(person.id, formatRecordEntry(answer, text));
    const updated: VoiceAnswer = { ...answer, transcript: text, syncedToRecord: true };
    void saveVoiceAnswer(updated).then(() => {
      setAnswers((old) => old.map((a) => (a.id === updated.id ? updated : a)));
      setNotice(`'${person.name}'의 인터뷰 기록 공간에 텍스트를 저장했어요.`);
    });
  }

  async function saveEditedTranscript(answer: VoiceAnswer) {
    const clean = editingText.trim();
    const updated: VoiceAnswer = {
      ...answer,
      transcript: clean,
      transcribedAt: Date.now(),
    };
    await saveVoiceAnswer(updated);
    setAnswers((old) => old.map((a) => (a.id === updated.id ? updated : a)));
    setEditingId('');
    setNotice('변환된 텍스트를 수정해 저장했어요.');
  }

  async function copyTranscript(id: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      window.setTimeout(() => setCopiedId((curr) => (curr === id ? '' : curr)), 1800);
    } catch {
      setNotice('클립보드 복사가 제한된 환경이에요. 텍스트 편집을 열어 직접 복사해 주세요.');
    }
  }

  async function accept() {
    if (confirm === 'close') {
      close();
      return;
    }
    if (confirm === 'draft') {
      setDraft(null);
      setConfirm(null);
      setError('');
      setNotice('저장하지 않은 녹음을 버렸어요.');
      return;
    }
    if (!confirm) return;
    setBusy(true);
    setError('');
    try {
      await deleteVoiceAnswer(confirm.id);
      setAnswers((old) => old.filter((a) => a.id !== confirm.id));
      setConfirm(null);
      setNotice('음성 답변을 삭제했어요.');
    } catch {
      setError('녹음을 삭제하지 못했어요. 잠시 뒤 다시 시도해 주세요.');
    } finally {
      setBusy(false);
    }
  }

  function requestClose() {
    if (busy) return;
    if (phase === 'stopping' || phase === 'transcribing') {
      setNotice('음성을 텍스트로 변환·저장하고 있어요. 잠시만 기다려 주세요.');
      return;
    }
    if (recorderInUse || draft) setConfirm('close');
    else close();
  }

  return (
    <Modal title="실시간 음성 인터뷰 · 자동 STT" close={requestClose} wide>
      <div className="grid gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#f1edff] text-[#5b3df5]">
              <AudioLines size={19} aria-hidden="true" />
            </span>
            <div>
              <h3 className="text-base font-bold text-[#22213a]">{person.name}</h3>
              <p className="text-[13px] text-[#62627a]">
                마이크로 인터뷰를 실시간 녹음하고, 음성을 텍스트(STT)로 변환해 기록 공간에 자동 저장해요.
              </p>
            </div>
          </div>
          {person.desc && <span className="text-xs font-medium text-[#62627a]">{person.desc}</span>}
        </div>

        {confirm && (
          <section className="grid gap-2 rounded-xl border border-[#f2d0d9] bg-[#fff5f7] p-3.5" aria-label="녹음 삭제 확인">
            <b className="text-sm text-[#22213a]">
              {confirm === 'close' ? '저장하지 않고 닫을까요?' : confirm === 'draft' ? '이 녹음을 버릴까요?' : '저장한 답변을 삭제할까요?'}
            </b>
            <p className="text-[13px] text-[#62627a]">이 녹음은 다시 불러올 수 없어요.</p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => setConfirm(null)}
                className="min-h-9 rounded-lg border border-[#e2deee] bg-white px-3 text-xs font-semibold text-[#22213a]"
              >
                계속하기
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void accept()}
                className="min-h-9 rounded-lg bg-[#a6214e] px-3 text-xs font-semibold text-white"
              >
                {confirm === 'close' ? '저장하지 않고 닫기' : confirm === 'draft' ? '녹음 버리기' : '음성 답변 삭제'}
              </button>
            </div>
          </section>
        )}

        <div className="grid gap-3 rounded-xl border border-[#e5dcfc] bg-[#faf8ff] p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1.5 text-[13px] font-semibold text-[#22213a]">
              인터뷰 질문 <span className="sr-only">(선택)</span>
              <input
                name="voice-question"
                autoComplete="off"
                maxLength={220}
                disabled={recorderInUse || phase === 'transcribing' || !!draft || !!confirm}
                placeholder="질문을 직접 입력해도 돼요…"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                className="min-h-10 w-full rounded-lg border border-[#dfdce9] bg-white px-3 py-2 text-sm font-normal text-[#22213a]"
              />
            </label>
            <label className="grid gap-1.5 text-[13px] font-semibold text-[#22213a]">
              추천 질문 불러오기
              <select
                name="voice-prompt"
                value=""
                disabled={recorderInUse || phase === 'transcribing' || !!draft || !!confirm}
                onChange={(e) => {
                  if (e.target.value) setQuestion(e.target.value);
                }}
                className="min-h-10 w-full rounded-lg border border-[#dfdce9] bg-white px-3 py-2 text-sm font-normal text-[#22213a]"
              >
                <option value="">질문 예시 선택</option>
                {generated && (
                  <optgroup label="리서치 가이드에서 만든 질문">
                    {generated.interview.map(({ stage, prompt }, i) => (
                      <option key={stage} value={prompt}>
                        {i + 1}. {stage} — {prompt}
                      </option>
                    ))}
                  </optgroup>
                )}
                <optgroup label="기본 고객검증">
                  {interviewPrompts.map((prompt, i) => (
                    <option key={prompt} value={prompt}>
                      {i + 1}. {prompt}
                    </option>
                  ))}
                </optgroup>
                <optgroup label={webtoonTopic}>
                  {webtoonInterview.map(({ stage, prompt }, i) => (
                    <option key={stage} value={prompt}>
                      {i + 1}. {stage} — {prompt}
                    </option>
                  ))}
                </optgroup>
              </select>
            </label>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <div className="flex items-center gap-2 text-[13px] font-bold text-[#4d30cf]" role="status">
              {phase === 'recording' && <span className="size-2.5 animate-pulse rounded-full bg-[#a6214e]" aria-hidden="true" />}
              {phase === 'permission'
                ? '마이크 권한을 기다리는 중…'
                : phase === 'recording'
                ? '실시간 녹음 및 음성 인식 중'
                : phase === 'stopping'
                ? '녹음을 정리하는 중…'
                : phase === 'transcribing'
                ? 'AI STT 텍스트 변환 및 기록 자동 저장 중…'
                : draft
                ? '저장 전 녹음'
                : '녹음 대기'}
            </div>
            <div className="tnum font-mono text-2xl font-bold text-[#22213a]" aria-label="녹음 시간">
              {clock(draft?.seconds ?? seconds)}
            </div>
          </div>

          {phase === 'recording' && (
            <div className="grid gap-2.5 rounded-xl border border-[#dfd4fb] bg-white p-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-[11px] font-bold text-[#4d30cf]">마이크 입력 파형</span>
                <span className="text-[11px] text-[#62627a]">
                  {liveSpeechActive
                    ? '실시간 자막 인식 중'
                    : liveSupported
                    ? '종료 후 AI 고정밀 STT 실행'
                    : '녹음 종료 후 AI 고정밀 STT 실행'}
                </span>
              </div>
              <canvas
                ref={canvasRef}
                width={520}
                height={36}
                aria-hidden="true"
                className="h-9 w-full rounded-lg bg-[#faf7ff]"
              />
              <div className="min-h-14 rounded-lg border border-[#efedf6] bg-[#faf9fd] px-3 py-2 text-[13px] leading-relaxed text-[#22213a]">
                {liveFinal || liveInterim ? (
                  <p>
                    <span>{liveFinal}</span>
                    {liveInterim && <span className="ml-1 text-[#736e8a]">{liveInterim}</span>}
                  </p>
                ) : (
                  <p className="text-xs text-[#62627a]">
                    {liveSpeechActive
                      ? '말씀하시면 실시간 텍스트가 여기에 표시되고, 녹음을 마치면 AI가 전체 문장을 정밀 변환해 저장해요.'
                      : '녹음이 진행 중이에요. 녹음을 끝내면 AI가 음성을 텍스트로 변환해 기록 공간에 자동으로 저장해요.'}
                  </p>
                )}
              </div>
            </div>
          )}

          {phase === 'transcribing' && (
            <div className="grid gap-1.5 rounded-xl border border-[#d8cef7] bg-white p-3 text-[13px] text-[#4d30cf]" role="status">
              <div className="flex items-center gap-2 font-semibold">
                <Sparkles size={15} className="animate-spin" aria-hidden="true" />
                녹음된 음성을 한국어 텍스트로 변환(STT)하고 인터뷰 기록 공간에 저장하고 있어요…
              </div>
              {(liveFinal || liveInterim) && (
                <p className="text-xs text-[#62627a]">실시간 초안: {[liveFinal, liveInterim].filter(Boolean).join(' ')}</p>
              )}
            </div>
          )}

          {!supported && (
            <p className="rounded-lg bg-[#fff0f3] px-3 py-2 text-[13px] text-[#9a2148]" role="alert">
              이 화면에서는 마이크를 사용할 수 없어요. 앱을 브라우저 탭에서 직접 열거나 최신 브라우저를 사용해 주세요.
            </p>
          )}

          {!recorderInUse && phase !== 'transcribing' && !draft && (
            <div className="grid gap-2.5">
              <label className="flex min-h-8 items-center gap-2 text-[13px] font-medium text-[#22213a]">
                <input
                  type="checkbox"
                  name="recording-consent"
                  disabled={!supported || !!confirm}
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                  className="size-4 accent-[#5b3df5]"
                />
                참여자가 음성 녹음 및 텍스트 변환에 동의했어요.
              </label>
              <label className="flex min-h-8 items-center gap-2 text-xs font-medium text-[#54546d]">
                <input
                  type="checkbox"
                  name="auto-stt-save"
                  disabled={!supported || !!confirm}
                  checked={autoSttAndSave}
                  onChange={(e) => setAutoSttAndSave(e.target.checked)}
                  className="size-4 accent-[#5b3df5]"
                />
                녹음 종료 즉시 음성을 텍스트로 변환(STT)해 인터뷰 기록 공간에 자동 저장
              </label>
              <button
                type="button"
                disabled={!supported || !consent || !!confirm}
                onClick={() => void start()}
                className="inline-flex min-h-10 w-fit items-center gap-2 rounded-lg bg-[#5b3df5] px-4 text-sm font-semibold text-white hover:bg-[#4b2ee0] disabled:opacity-50"
              >
                <Mic size={16} aria-hidden="true" /> 실시간 녹음 시작
              </button>
            </div>
          )}

          {phase === 'recording' && (
            <button
              type="button"
              disabled={!!confirm}
              onClick={stop}
              className="inline-flex min-h-10 w-fit items-center gap-2 rounded-lg bg-[#a6214e] px-4 text-sm font-semibold text-white hover:bg-[#8c1b41]"
            >
              <Square size={14} aria-hidden="true" /> 녹음 끝내고 자동 변환·저장
            </button>
          )}

          {phase === 'permission' && (
            <button
              type="button"
              disabled={!!confirm}
              onClick={() => {
                session.current++;
                setPhase('idle');
              }}
              className="min-h-10 w-fit rounded-lg border border-[#e2deee] bg-white px-4 text-sm font-semibold text-[#22213a]"
            >
              마이크 요청 취소
            </button>
          )}

          {draft && (
            <div className="grid gap-2.5">
              <AudioPlayer answer={draft} />
              {draft.transcript && (
                <div className="rounded-lg border border-[#efedf6] bg-white px-3 py-2 text-xs text-[#22213a]">
                  <b className="text-[#4d30cf]">실시간 인식 초안:</b> {draft.transcript}
                </div>
              )}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={busy || !!confirm}
                  onClick={() => void saveDraftAndTranscribe()}
                  className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-[#5b3df5] px-4 text-sm font-semibold text-white hover:bg-[#4b2ee0] disabled:opacity-50"
                >
                  <Sparkles size={15} aria-hidden="true" />
                  {busy ? '변환·저장 중…' : '음성 저장 + STT 변환·기록 반영'}
                </button>
                <button
                  type="button"
                  disabled={busy || !!confirm}
                  onClick={() => downloadAnswer(draft)}
                  className="min-h-10 rounded-lg border border-[#e2deee] bg-white px-4 text-sm font-semibold text-[#22213a]"
                >
                  내려받기
                </button>
                <button
                  type="button"
                  disabled={busy || !!confirm}
                  onClick={() => setConfirm('draft')}
                  className="min-h-10 px-2 text-sm font-semibold text-[#a6214e] hover:underline"
                >
                  녹음 버리기
                </button>
              </div>
            </div>
          )}

          <p className="text-[12px] text-[#62627a]">
            오디오 파일은 이 브라우저에만 보관되며, STT 변환 시에만 AI 서버로 음성 데이터가 전달돼 텍스트가 생성됩니다.
          </p>
        </div>

        {error && (
          <p className="rounded-lg bg-[#fff0f3] px-3 py-2 text-[13px] text-[#9a2148]" role="alert">
            {error}
          </p>
        )}
        {notice && (
          <p className="rounded-lg bg-[#f1edff] px-3 py-2 text-[13px] font-medium text-[#4d30cf]" role="status">
            {notice}
          </p>
        )}

        <section className="grid gap-2.5" aria-label="저장된 음성 답변 및 STT 기록">
          <h3 className="text-sm font-bold text-[#22213a]">저장된 음성 답변 · STT 변환 기록 {answers.length}개</h3>
          {loading ? (
            <p className="text-[13px] text-[#62627a]">불러오는 중…</p>
          ) : answers.length === 0 ? (
            <p className="text-[13px] text-[#62627a]">아직 저장된 답변이 없어요.</p>
          ) : (
            <ul className="grid gap-2.5">
              {answers.map((a) => {
                const isTranscribing = Boolean(transcribingIds[a.id]);
                const isEditing = editingId === a.id;
                return (
                  <li key={a.id} className="grid gap-2.5 rounded-xl border border-[#e9e7f1] bg-white p-3.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <b className="block truncate text-sm text-[#22213a]">{a.question}</b>
                        <small className="tnum flex flex-wrap items-center gap-1.5 text-xs text-[#62627a]">
                          <time dateTime={new Date(a.recordedAt).toISOString()}>{dates.format(a.recordedAt)}</time>
                          <span aria-hidden="true">·</span>
                          <span>{clock(a.seconds)}</span>
                          {a.transcript && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="font-semibold text-[#4d30cf]">
                                {a.sttEngine === 'gemini' ? 'AI STT 완료' : '실시간 초안'}
                              </span>
                            </>
                          )}
                          {a.syncedToRecord && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="inline-flex items-center gap-1 font-semibold text-[#14674d]">
                                <CheckCircle2 size={12} aria-hidden="true" /> 기록 공간 저장됨
                              </span>
                            </>
                          )}
                        </small>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <button
                          type="button"
                          aria-label={`${a.question} 녹음 내려받기`}
                          onClick={() => downloadAnswer(a)}
                          className="grid size-8 place-items-center rounded-lg text-[#62627a] hover:bg-[#f1edff] hover:text-[#4d30cf]"
                        >
                          <Download size={16} aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          aria-label={`${a.question} 녹음 삭제`}
                          disabled={busy || !!confirm || recorderInUse || isTranscribing}
                          onClick={() => setConfirm(a)}
                          className="grid size-8 place-items-center rounded-lg text-[#62627a] hover:bg-[#fff0f3] hover:text-[#a6214e]"
                        >
                          <Trash2 size={16} aria-hidden="true" />
                        </button>
                      </div>
                    </div>

                    <AudioPlayer answer={a} />

                    <div className="grid gap-2 rounded-lg border border-[#efedf6] bg-[#faf9fd] p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="inline-flex items-center gap-1.5 text-xs font-bold text-[#22213a]">
                          <FileText size={13} className="text-[#5b3df5]" aria-hidden="true" />
                          변환된 인터뷰 텍스트 (STT)
                        </span>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <button
                            type="button"
                            disabled={isTranscribing}
                            onClick={() => void transcribeAndUpdate(a, { autoSyncToRecord: !a.syncedToRecord })}
                            className="inline-flex min-h-7 items-center gap-1 rounded-md border border-[#d8cef7] bg-white px-2.5 text-[11px] font-semibold text-[#4d30cf] hover:bg-[#f1edff] disabled:opacity-50"
                          >
                            {isTranscribing ? (
                              '변환 중…'
                            ) : a.transcript ? (
                              <>
                                <RotateCcw size={11} aria-hidden="true" /> AI 재변환
                              </>
                            ) : (
                              <>
                                <Sparkles size={11} aria-hidden="true" /> AI 텍스트 변환
                              </>
                            )}
                          </button>

                          {a.transcript && !isEditing && (
                            <>
                              <button
                                type="button"
                                onClick={() => void copyTranscript(a.id, a.transcript ?? '')}
                                className="inline-flex min-h-7 items-center gap-1 rounded-md border border-[#e2deee] bg-white px-2.5 text-[11px] font-semibold text-[#22213a] hover:bg-[#f7f7fb]"
                              >
                                {copiedId === a.id ? (
                                  <>
                                    <Check size={11} className="text-[#14674d]" aria-hidden="true" /> 복사됨
                                  </>
                                ) : (
                                  <>
                                    <Copy size={11} aria-hidden="true" /> 복사
                                  </>
                                )}
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingId(a.id);
                                  setEditingText(a.transcript ?? '');
                                }}
                                className="inline-flex min-h-7 items-center gap-1 rounded-md border border-[#e2deee] bg-white px-2.5 text-[11px] font-semibold text-[#22213a] hover:bg-[#f7f7fb]"
                              >
                                <Pencil size={11} aria-hidden="true" /> 편집
                              </button>
                              {onSaveTranscript && !a.syncedToRecord && (
                                <button
                                  type="button"
                                  onClick={() => syncAnswerToRecord(a)}
                                  className="inline-flex min-h-7 items-center gap-1 rounded-md bg-[#5b3df5] px-2.5 text-[11px] font-semibold text-white hover:bg-[#4b2ee0]"
                                >
                                  기록 공간에 저장
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </div>

                      {isEditing ? (
                        <div className="grid gap-2">
                          <textarea
                            rows={3}
                            value={editingText}
                            onChange={(e) => setEditingText(e.target.value)}
                            className="w-full rounded-lg border border-[#5b3df5] bg-white px-3 py-2 text-[13px] text-[#22213a]"
                          />
                          <div className="flex flex-wrap justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => setEditingId('')}
                              className="min-h-8 rounded-lg border border-[#e2deee] bg-white px-3 text-xs font-semibold text-[#22213a]"
                            >
                              취소
                            </button>
                            <button
                              type="button"
                              onClick={() => void saveEditedTranscript(a)}
                              className="min-h-8 rounded-lg bg-[#5b3df5] px-3 text-xs font-semibold text-white"
                            >
                              텍스트 저장
                            </button>
                            {onSaveTranscript && (
                              <button
                                type="button"
                                onClick={() => {
                                  void saveEditedTranscript(a).then(() => syncAnswerToRecord(a, editingText));
                                }}
                                className="min-h-8 rounded-lg border border-[#5b3df5] bg-[#faf7ff] px-3 text-xs font-semibold text-[#4d30cf]"
                              >
                                수정본 기록 공간에 반영
                              </button>
                            )}
                          </div>
                        </div>
                      ) : isTranscribing ? (
                        <p className="text-xs text-[#4d30cf]">음성 데이터를 분석하여 텍스트로 변환하고 있어요…</p>
                      ) : a.transcript ? (
                        <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-[#22213a]">{a.transcript}</p>
                      ) : (
                        <p className="text-xs text-[#62627a]">
                          아직 변환된 텍스트가 없어요. 우측의 &lsquo;AI 텍스트 변환&rsquo; 버튼을 눌러 텍스트로 바꿀 수 있어요.
                        </p>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </Modal>
  );
}

function AudioPlayer({ answer }: { answer: VoiceAnswer }) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    const src = URL.createObjectURL(answer.audio);
    setUrl(src);
    return () => URL.revokeObjectURL(src);
  }, [answer.audio]);

  return (
    <audio controls preload="metadata" src={url || undefined} aria-label={`${answer.question} 녹음 재생`} className="h-10 w-full">
      이 브라우저에서는 녹음을 재생할 수 없어요. 파일을 내려받아 주세요.
    </audio>
  );
}

function downloadAnswer(answer: VoiceAnswer) {
  const type = answer.audio.type.toLowerCase();
  const extension = type.includes('mp4') ? 'm4a' : type.includes('ogg') ? 'ogg' : type.includes('wav') ? 'wav' : 'webm';
  saveBlob(answer.audio, `인터뷰-음성-${answer.id.slice(0, 8)}.${extension}`);
}
