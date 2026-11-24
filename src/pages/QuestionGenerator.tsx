import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import {
  ArrowRight,
  BookmarkCheck,
  CheckCircle2,
  ClipboardCheck,
  Copy,
  Download,
  FileSearch,
  FolderPlus,
  RotateCcw,
  Sparkles,
  Star,
} from 'lucide-react';
import { api, demoStore } from '../lib/api';
import { exportInterviewAnalysisCsv, exportQuestionGuideCsv } from '../lib/researchCsv';
import {
  interviewAnalysisKey,
  questionGuideKey,
  type InterviewAnalysis,
  type QuestionGuide,
} from '../lib/questionGuide';
import {
  saveAnalysisToVault,
  saveGuideToVault,
  useQuestionVault,
  type VaultQuestionKind,
} from '../lib/questionVault';
import { types, type Person } from '../lib/research';
import { MyQuestionVault } from './MyQuestionVault';
import { saasUi } from './ResearchUI';

const itemExample = '일상 사진과 짧은 글을 4컷 웹툰으로 바꿔 주는 웹·앱';
const medicalB2bExample = {
  item: '시술 피로도와 환자 감염률을 낮추는 부착형 일회용 초음파 패치',
  audience: '중심정맥 혈관 주사·삽관 시술을 하는 외과 및 응급의학과 의사',
  customerArchetype: '최종사용자',
  hypothesis:
    '삽관 시 한 손으로 프로브를 조정하는 외과 의사는 프로브 조정 여부에 따라 높아지는 감염 위험과 피로를 피하고 싶을 것이다.',
  valueProposition:
    '시술 피로도를 20% 이상 감소시키고, 환자 감염률을 기존 기기 대비 65% 줄여주는 부착형 일회용 초음파 패치',
};
const CUSTOMER_ARCHETYPES = ['최종사용자', '구매자', '(최종)의사결정자', '인플루언서 · 추천자'] as const;

const analysisSampleQuestions = [
  '1. 이런 일상 웹툰 변환 앱이 나오면 사용하실 의향이 있나요?',
  '2. 최근 일주일 동안 일상에서 사진이나 글로 기록을 남긴 순간은 언제였고, 어떻게 정리했나요?',
  '3. 기록을 SNS에 올리려다 편집이 귀찮아서 포기했던 적이 있나요?',
  '4. 월 4,900원 구독료가 비싸지 않고 적당하다고 생각하시나요?',
].join('\n');
const analysisSampleNotes = [
  '- 김OO(30대/마케터): 주 3회 인스타 스토리 올리는데 사진 고르고 텍스트 배치하는 데 20분씩 걸려 결국 갤러리에만 쌓아둠. 유료 템플릿 앱(월 3,300원) 구독 중.',
  '- 이OO(20대/대학생): 친구들과 카톡방에 밈처럼 공유하고 싶을 때가 많음. 내 얼굴 사진이 그대로 나가는 게 부담스러워 일러스트/만화풍이면 바로 공유할 것 같다고 답함.',
].join('\n');

export function QuestionGenerator({
  close,
  editingSurvey,
  initialMode = 'generate',
  initialQuestionsText = '',
  initialNotesText = '',
  people = [],
  onSaveInsight,
}: {
  close: () => void;
  editingSurvey: boolean;
  initialMode?: 'generate' | 'analyze' | 'vault';
  initialQuestionsText?: string;
  initialNotesText?: string;
  people?: Person[];
  onSaveInsight?: (personId: string, summaryText: string) => void;
}) {
  const [mode, setMode] = useState<'generate' | 'analyze' | 'vault'>(initialMode);
  const vault = useQuestionVault();
  const navigate = useNavigate();

  // Mode 1: Generate questions & survey from item
  const [result, setResult] = useState(() => demoStore.get<QuestionGuide | null>(questionGuideKey, null));
  const [item, setItem] = useState(result?.item ?? '');
  const [audience, setAudience] = useState('');
  const [customerArchetype, setCustomerArchetype] = useState<string>('최종사용자');
  const [hypothesis, setHypothesis] = useState('');
  const [valueProposition, setValueProposition] = useState('');
  const [draftQuestions, setDraftQuestions] = useState(() =>
    initialMode === 'generate' && initialQuestionsText ? initialQuestionsText : '',
  );

  // Mode 2: Analyze & organize interview questions and notes
  const [analysisResult, setAnalysisResult] = useState(() =>
    demoStore.get<InterviewAnalysis | null>(interviewAnalysisKey, null),
  );
  const [analyzeItem, setAnalyzeItem] = useState(analysisResult?.item ?? result?.item ?? '');
  const [analyzeQuestions, setAnalyzeQuestions] = useState(() =>
    initialMode === 'analyze' && initialQuestionsText ? initialQuestionsText : '',
  );
  const [analyzeNotes, setAnalyzeNotes] = useState(() =>
    initialMode === 'analyze' && initialNotesText ? initialNotesText : '',
  );
  const [targetPersonId, setTargetPersonId] = useState('');

  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [copyText, setCopyText] = useState('');
  const heading = useRef<HTMLHeadingElement>(null);
  const analysisHeading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    const onSync = () => {
      setResult(demoStore.get<QuestionGuide | null>(questionGuideKey, null));
      setAnalysisResult(demoStore.get<InterviewAnalysis | null>(interviewAnalysisKey, null));
    };
    window.addEventListener('research-sync-applied', onSync);
    return () => window.removeEventListener('research-sync-applied', onSync);
  }, []);

  async function generate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (item.trim().length < 3) {
      setError('검증할 아이템을 3자 이상 입력해 주세요.');
      return;
    }
    setBusy(true);
    setError('');
    setNotice('');
    setCopyText('');
    try {
      const guide = await api<QuestionGuide>('/api/research/question-guide', {
        method: 'POST',
        body: JSON.stringify({
          item,
          audience,
          customerArchetype,
          hypothesis,
          valueProposition,
          draftQuestions,
        }),
      });
      demoStore.set(questionGuideKey, guide);
      const saved = saveGuideToVault(guide);
      setResult(guide);
      if (!analyzeItem.trim()) setAnalyzeItem(guide.item);
      setNotice(
        `VPC·CPF 가설 기반 검증 분석과 인터뷰 ${guide.interview.length}문항·설문 ${guide.survey.length}문항을 만들었어요.${
          saved.addedCount > 0 ? ` (나의 질문함에 ${saved.addedCount}문항 자동 저장됨)` : ''
        }`,
      );
      requestAnimationFrame(() => heading.current?.focus());
    } catch (err) {
      setError(err instanceof Error ? err.message : '질문을 만들지 못했어요. 잠시 뒤 다시 시도해 주세요.');
    } finally {
      setBusy(false);
    }
  }

  async function runAnalyze(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (analyzeItem.trim().length < 2) {
      setError('검증할 아이템을 입력해 주세요.');
      return;
    }
    if (analyzeQuestions.trim().length < 3 && analyzeNotes.trim().length < 5) {
      setError('분석할 인터뷰 질문이나 인터뷰 메모를 입력해 주세요.');
      return;
    }
    setBusy(true);
    setError('');
    setNotice('');
    setCopyText('');
    try {
      const analyzed = await api<InterviewAnalysis>('/api/research/analyze-interview', {
        method: 'POST',
        body: JSON.stringify({
          item: analyzeItem,
          questions: analyzeQuestions,
          notes: analyzeNotes,
        }),
      });
      demoStore.set(interviewAnalysisKey, analyzed);
      const saved = saveAnalysisToVault(analyzed);
      setAnalysisResult(analyzed);
      setNotice(
        `인터뷰 질문과 내용을 자동으로 분석해서 정리했어요.${
          saved.addedCount > 0 ? ` (개선 질문 ${saved.addedCount}개 질문함 저장됨)` : ''
        }`,
      );
      requestAnimationFrame(() => analysisHeading.current?.focus());
    } catch (err) {
      setError(err instanceof Error ? err.message : '인터뷰 분석에 실패했어요. 잠시 뒤 다시 시도해 주세요.');
    } finally {
      setBusy(false);
    }
  }

  async function copyQuestions(guide: QuestionGuide) {
    const text = [
      `[검증 아이템] ${guide.item}`,
      guide.cpfHypothesis
        ? `\n[CPF 가설 구조]\n- 고객 원형: ${guide.cpfHypothesis.customerArchetype}\n- 고객 가설: ${guide.cpfHypothesis.customerHypothesis}\n- 문제 가설: ${guide.cpfHypothesis.problemHypothesis}${
            guide.cpfHypothesis.valueProposition ? `\n- 가치제안: ${guide.cpfHypothesis.valueProposition}` : ''
          }`
        : '',
      guide.analysis ? `\n[핵심 검증 목표]\n${guide.analysis.coreGoal}` : '',
      guide.analysis ? `\n[질문 설계 진단]\n${guide.analysis.questionAudit}` : '',
      '\n[VPC · 가설 기반 인터뷰 질문]',
      ...guide.interview.map(({ stage, vpcElement, hypothesis: h, prompt, purpose, metricSignal }, i) =>
        `${i + 1}. [${stage}${vpcElement ? ` · ${vpcElement}` : ''}] ${prompt}${
          h ? `\n   - 연계 가설: ${h}` : ''
        }${purpose ? `\n   - 확인 포인트: ${purpose}` : ''}${
          metricSignal ? `\n   - 판단근거(숫자/사실): ${metricSignal}` : ''
        }`,
      ),
      '\n[설문 문항]',
      ...guide.survey.map(
        (q, i) =>
          `${i + 1}. (${types[q.type]}) ${q.label}${q.options.length ? `\n   선택지: ${q.options.join(' / ')}` : ''}`,
      ),
    ]
      .filter(Boolean)
      .join('\n');
    try {
      await navigator.clipboard.writeText(text);
      setNotice('질문지 및 분석 요약 전체를 복사했어요.');
    } catch {
      setCopyText(text);
    }
  }

  function formatAnalysisReport(a: InterviewAnalysis): string {
    return [
      `[아이템] ${a.item}`,
      `[종합 요약] ${a.summary}`,
      `[검증 진단] ${a.validationReadiness}`,
      '',
      '[질문별 3원칙 진단 및 개선]',
      ...a.questionReviews.map(
        (q, i) =>
          `${i + 1}. (${q.verdict}${q.violatedPrinciple ? ` · ${q.violatedPrinciple}` : ''}) ${q.original}\n   진단: ${q.diagnosis}\n   개선 질문: ${q.improved}`,
      ),
      ...(a.insights.factPatternInsights?.length
        ? [
            '',
            '[Fact → Pattern → Insight 가설 검증]',
            ...a.insights.factPatternInsights.map(
              (f, i) =>
                `${i + 1}. [${f.painGainTag} / ${f.verdict}]\n   Fact(사실): ${f.fact}\n   Pattern(패턴): ${f.pattern}\n   Insight(해석): ${f.insight}`,
            ),
          ]
        : []),
      '',
      '[주요 페인포인트]',
      ...a.insights.painPoints.map((p) => `- ${p}`),
      '',
      '[현재 대안]',
      ...a.insights.currentAlternatives.map((p) => `- ${p}`),
      '',
      `[지불 의향 / 전환 장벽] ${a.insights.willingnessToPay}`,
      '',
      '[핵심 패턴]',
      ...a.insights.keyPatterns.map((p) => `- ${p}`),
      '',
      '[다음 검증 액션]',
      ...a.insights.nextActions.map((p) => `- ${p}`),
      ...(a.checklist?.length
        ? [
            '',
            '[인스트럭터 체크리스트 점검]',
            ...a.checklist.map((c) => `- [${c.status}] ${c.item}: ${c.note}`),
          ]
        : []),
    ].join('\n');
  }

  async function copyAnalysisReport(a: InterviewAnalysis) {
    const text = formatAnalysisReport(a);
    try {
      await navigator.clipboard.writeText(text);
      setNotice('정리된 인터뷰 분석 리포트를 복사했어요.');
    } catch {
      setCopyText(text);
    }
  }

  function loadPeopleNotes() {
    const withNotes = people.filter((p) => p.note.trim());
    if (!withNotes.length) {
      setNotice('기록된 인사이트 메모가 있는 대상자가 아직 없어요.');
      return;
    }
    const merged = withNotes
      .map((p) => `- ${p.name}(${p.group}${p.alternative ? ` · 대안: ${p.alternative}` : ''}): ${p.note}`)
      .join('\n');
    setAnalyzeNotes(merged);
    setNotice(`대상자 ${withNotes.length}명의 인사이트 메모를 불러왔어요.`);
  }

  function isFavorited(text: string): boolean {
    const clean = text.trim();
    return Boolean(vault.questions.find((q) => q.text.trim() === clean)?.favorite);
  }

  function toggleFavoriteItem(input: {
    text: string;
    kind: VaultQuestionKind;
    itemTopic: string;
    stageOrType: string;
    purpose?: string;
    options?: string[];
  }) {
    const clean = input.text.trim();
    const existing = vault.questions.find((q) => q.text.trim() === clean);
    if (existing) {
      vault.toggleQuestionFavorite(existing.id);
    } else {
      vault.addQuestion({ ...input, favorite: true });
    }
  }

  function saveGuideAsRoutine(guide: QuestionGuide) {
    const steps = [
      ...guide.interview.map((it) => ({
        text: it.prompt,
        kind: 'interview' as const,
        stage: it.stage,
        purpose: it.purpose,
      })),
      ...guide.survey.map((sq) => ({
        text: sq.label,
        kind: 'survey' as const,
        stage: types[sq.type],
      })),
    ];
    vault.addRoutine({
      name: `${guide.item.slice(0, 26)} · 검증 루틴`,
      description: guide.analysis?.coreGoal ?? '리서치 가이드에서 저장한 고객검증 질문 세트',
      favorite: true,
      steps,
    });
    setNotice('생성된 질문 세트를 나의 질문함 리서치 루틴으로 저장했어요.');
  }

  function saveAnalysisAsRoutine(a: InterviewAnalysis) {
    const steps = a.questionReviews.map((qr) => ({
      text: qr.improved,
      kind: 'interview' as const,
      stage: `개선 질문 (${qr.verdict})`,
      purpose: qr.insightGoal,
    }));
    if (!steps.length) return;
    vault.addRoutine({
      name: `${a.item.slice(0, 26)} · 개선 인터뷰 루틴`,
      description: a.summary,
      favorite: true,
      steps,
    });
    setNotice('개선된 인터뷰 질문 세트를 나의 질문함 리서치 루틴으로 저장했어요.');
  }

  return (
    <section
      className={`${saasUi.cardSoft} mb-5 grid gap-5 p-5 sm:p-6`}
      aria-label="AI 리서치 질문 생성 및 인터뷰 자동 분석"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-[#efeaff] text-[#4c2ee6]">
            <Sparkles size={20} aria-hidden="true" />
          </span>
          <div>
            <h3 className={saasUi.sectionTitle}>AI 리서치 분석 · 질문 설계</h3>
            <p className="mt-0.5 text-[15px] leading-relaxed text-[#565570]">
              아이템과 질문을 넣으면 자동으로 분석해 정리하고, 바로 배포 가능한 설문 문항까지 생성해요.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1 rounded-xl border border-[#dcd8e8] bg-white p-1" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'generate'}
            onClick={() => {
              setMode('generate');
              setError('');
              setNotice('');
            }}
            className={`min-h-10 shrink-0 whitespace-nowrap rounded-lg px-3.5 text-[14px] font-semibold transition-colors ${
              mode === 'generate' ? 'bg-[#4c2ee6] text-white' : 'text-[#565570] hover:text-[#17162b]'
            }`}
          >
            아이템 → 질문·설문 생성
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'analyze'}
            onClick={() => {
              setMode('analyze');
              setError('');
              setNotice('');
            }}
            className={`min-h-10 shrink-0 whitespace-nowrap rounded-lg px-3.5 text-[14px] font-semibold transition-colors ${
              mode === 'analyze' ? 'bg-[#4c2ee6] text-white' : 'text-[#565570] hover:text-[#17162b]'
            }`}
          >
            질문·메모 자동 분석 정리
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'vault'}
            onClick={() => {
              setMode('vault');
              setError('');
              setNotice('');
            }}
            className={`inline-flex min-h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-3.5 text-[14px] font-semibold transition-colors ${
              mode === 'vault' ? 'bg-[#4c2ee6] text-white' : 'text-[#565570] hover:text-[#17162b]'
            }`}
          >
            <BookmarkCheck size={15} aria-hidden="true" />
            나의 질문함 <span className="tnum font-mono">({vault.questions.length})</span>
          </button>
        </div>
      </div>

      {mode === 'generate' ? (
        <>
          <div className="rounded-xl border border-[#dfd7fb] bg-white px-4 py-3 text-[14px] text-[#44435c]">
            <div className="font-bold text-[#4125cc]">VPC · CPF 고객검증 질문 설계 3대 원칙 & 순서</div>
            <p className="mt-1 leading-relaxed">
              <b className="text-[#17162b]">① 의견 대신 과거·현재 경험</b>(비용·시간·실패·마지막 행동) ·{' '}
              <b className="text-[#17162b]">② 개방형 질문</b> ·{' '}
              <b className="text-[#17162b]">③ 평가/"Would you?" 미래형 금지</b> ·{' '}
              흐름: 문제 탐색 → 문제 강도(숫자·데이터) → 기존 대안 확인
            </p>
          </div>

          <form className="grid gap-3.5" autoComplete="off" onSubmit={generate}>
            <fieldset disabled={busy} className="grid gap-3.5">
              <label className={saasUi.labelText}>
                검증할 아이템 *
                <textarea
                  name="item"
                  rows={2}
                  minLength={3}
                  maxLength={300}
                  required
                  value={item}
                  onChange={(e) => setItem(e.target.value)}
                  placeholder="예: 시술 피로도와 환자 감염률을 낮추는 부착형 일회용 초음파 패치…"
                  className={`${saasUi.input} resize-y`}
                />
              </label>
              <div className="flex flex-wrap items-center gap-4">
                <button
                  type="button"
                  onClick={() => setItem(itemExample)}
                  className="text-[14px] font-bold text-[#4c2ee6] hover:underline"
                >
                  웹툰 앱 예시 입력
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setItem(medicalB2bExample.item);
                    setAudience(medicalB2bExample.audience);
                    setCustomerArchetype(medicalB2bExample.customerArchetype);
                    setHypothesis(medicalB2bExample.hypothesis);
                    setValueProposition(medicalB2bExample.valueProposition);
                  }}
                  className="text-[14px] font-bold text-[#4125cc] hover:underline"
                >
                  일회용 초음파 패치 B2B 예시 채우기
                </button>
              </div>
              <details
                open={Boolean(draftQuestions || hypothesis || valueProposition)}
                className="rounded-xl border border-[#dfd7fb] bg-white px-4 py-3"
              >
                <summary className="cursor-pointer text-[15px] font-bold text-[#4125cc]">
                  고객 원형 · CPF 가설(Who/Problem) · 가치제안 · 기존 질문 함께 분석하기 (선택)
                </summary>
                <div className="mt-3.5 grid gap-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className={saasUi.labelText}>
                      고객 원형 (Customer Archetype)
                      <select
                        name="customerArchetype"
                        value={customerArchetype}
                        onChange={(e) => setCustomerArchetype(e.target.value)}
                        className={`w-full ${saasUi.select}`}
                      >
                        {CUSTOMER_ARCHETYPES.map((arch) => (
                          <option key={arch} value={arch}>
                            {arch}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className={saasUi.labelText}>
                      타겟 고객군 (Who)
                      <input
                        name="audience"
                        maxLength={200}
                        value={audience}
                        onChange={(e) => setAudience(e.target.value)}
                        placeholder="예: 초음파 삽관 시술을 하는 외과·응급의학과 의사"
                        className={saasUi.input}
                      />
                    </label>
                  </div>
                  <label className={saasUi.labelText}>
                    CPF 핵심 가설 (고객 가설 · 문제 가설)
                    <textarea
                      name="hypothesis"
                      rows={2}
                      maxLength={350}
                      value={hypothesis}
                      onChange={(e) => setHypothesis(e.target.value)}
                      placeholder="예: 한 손으로 프로브를 조정하는 외과 의사는 감염 위험과 시술 피로도를 줄이고 싶을 것이다"
                      className={saasUi.input}
                    />
                  </label>
                  <label className={saasUi.labelText}>
                    가치제안 (Value Proposition)
                    <input
                      name="valueProposition"
                      maxLength={300}
                      value={valueProposition}
                      onChange={(e) => setValueProposition(e.target.value)}
                      placeholder="예: 시술 피로도 20% 감소 및 감염 위험을 낮추는 부착형 일회용 패치"
                      className={saasUi.input}
                    />
                  </label>
                  <label className={saasUi.labelText}>
                    미리 생각해 둔 인터뷰 질문 (원칙 1~3 위반 여부를 진단해 드려요)
                    <textarea
                      name="draftQuestions"
                      rows={2}
                      maxLength={2000}
                      value={draftQuestions}
                      onChange={(e) => setDraftQuestions(e.target.value)}
                      placeholder="예: 이런 앱이 있으면 쓰실 건가요? 얼마면 결제하실 건가요?"
                      className={saasUi.input}
                    />
                  </label>
                </div>
              </details>
            </fieldset>

            <p className="text-[14px] text-[#565570]">
              입력 내용은 VPC·CPF 가설 설계와 AI 질문 생성에 활용돼요. 개인 식별 정보나 민감한 기밀은 제외해 주세요.
            </p>
            {error && (
              <div
                role="alert"
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#f2ccd7] bg-[#fff5f7] px-4 py-2.5 text-[15px] text-[#9f1d45]"
              >
                <span>{error}</span>
                <button
                  type="submit"
                  disabled={busy}
                  className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-[#e6a4b7] bg-white px-3 text-[13px] font-bold text-[#9f1d45] hover:bg-[#fff8fa]"
                >
                  <RotateCcw size={14} aria-hidden="true" /> 다시 시도
                </button>
              </div>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="submit"
                disabled={busy}
                className={saasUi.btnPrimary}
              >
                <Sparkles size={16} aria-hidden="true" />
                {busy ? 'VPC·CPF 질문지를 설계하는 중…' : 'VPC·CPF 검증 분석 · 인터뷰 · 설문 생성'}
              </button>
            </div>
          </form>

          {busy && (
            <p className="text-[15px] font-semibold text-[#4125cc]" role="status">
              가치제안캔버스(VPC)와 CPF 가설을 연결해 비유도 인터뷰 질문과 설문 문항을 설계하고 있어요.
            </p>
          )}
          {!busy && notice && (
            <p className="rounded-xl bg-[#efeaff] px-4 py-2.5 text-[15px] font-semibold text-[#4125cc]" role="status">
              {notice}
            </p>
          )}

          {result && (
            <section className={`${saasUi.card} grid gap-5 p-5`}>
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#e6e3f0] pb-3.5">
                <p className="text-[16px] font-bold text-[#4125cc]">{result.item}</p>
                <span className="text-[14px] font-semibold text-[#565570]">
                  인터뷰 {result.interview.length}문항 · 설문 {result.survey.length}문항
                </span>
              </div>

              {result.cpfHypothesis && (
                <div className="grid gap-2.5 rounded-xl border border-[#d6cbf8] bg-[#faf8ff] p-4 text-[15px]">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-bold text-[#17162b]">CPF 가설 (Customer Problem Fit)</span>
                    <span className="font-bold text-[#4125cc]">고객 원형: {result.cpfHypothesis.customerArchetype}</span>
                  </div>
                  <p className="leading-relaxed text-[#17162b]">
                    <b className="font-bold text-[#4125cc]">고객 가설:</b> {result.cpfHypothesis.customerHypothesis}
                  </p>
                  <p className="leading-relaxed text-[#17162b]">
                    <b className="font-bold text-[#4125cc]">문제 가설:</b> {result.cpfHypothesis.problemHypothesis}
                  </p>
                  {result.cpfHypothesis.valueProposition && (
                    <p className="leading-relaxed text-[#565570]">
                      <b className="font-bold text-[#17162b]">가치제안:</b> {result.cpfHypothesis.valueProposition}
                    </p>
                  )}
                </div>
              )}

              {result.analysis && (
                <div className="grid gap-3 rounded-xl border border-[#e6e3f0] bg-[#f8f6ff] p-4 text-[15px]">
                  <div className="flex items-center gap-2 font-bold text-[#17162b]">
                    <FileSearch size={17} className="text-[#4c2ee6]" aria-hidden="true" />
                    아이템 검증 분석 및 질문 3원칙 진단
                  </div>
                  <p className="leading-relaxed text-[#17162b]">
                    <b className="font-bold text-[#4125cc]">핵심 검증 목표:</b> {result.analysis.coreGoal}
                  </p>
                  <div>
                    <b className="font-bold text-[#4125cc]">VPC 우선 검증 가설:</b>
                    <ul className="mt-1.5 list-disc space-y-1 pl-5 leading-relaxed text-[#17162b]">
                      {result.analysis.keyHypotheses.map((h, i) => (
                        <li key={i}>{h}</li>
                      ))}
                    </ul>
                  </div>
                  <p className="leading-relaxed text-[#17162b]">
                    <b className="font-bold text-[#4125cc]">질문 3원칙 진단:</b> {result.analysis.questionAudit}
                  </p>
                </div>
              )}

              <div>
                <h4 ref={heading} tabIndex={-1} className="mb-2.5 text-[16px] font-bold text-[#17162b]">
                  VPC · 가설 연계 인터뷰 질문지 {result.interview.length}개
                </h4>
                <ol className="grid gap-2.5">
                  {result.interview.map(({ stage, vpcElement, hypothesis: qHypothesis, prompt, purpose, metricSignal }, idx) => {
                    const fav = isFavorited(prompt);
                    return (
                      <li key={idx} className="flex items-start justify-between gap-3 rounded-xl border border-[#e6e3f0] px-4 py-3.5">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2 text-[13px] font-bold">
                            <span className="text-[#4125cc]">{stage}</span>
                            {vpcElement && (
                              <span className="rounded-md border border-[#d6cbf8] bg-[#f6f3ff] px-2 py-0.5 text-[#4125cc]">
                                {vpcElement}
                              </span>
                            )}
                          </div>
                          {qHypothesis && (
                            <p className="mt-1 text-[14px] font-semibold text-[#565570]">가설: {qHypothesis}</p>
                          )}
                          <p className="mt-1 text-[15px] font-bold leading-relaxed text-[#17162b]">{prompt}</p>
                          {purpose && <p className="mt-1 text-[14px] text-[#565570]">확인 포인트: {purpose}</p>}
                          {metricSignal && (
                            <p className="mt-0.5 text-[14px] font-medium text-[#14674d]">판단근거(데이터·숫자): {metricSignal}</p>
                          )}
                        </div>
                        <button
                          type="button"
                          aria-label={fav ? '즐겨찾기 해제' : '질문함 즐겨찾기 추가'}
                          onClick={() =>
                            toggleFavoriteItem({
                              text: prompt,
                              kind: 'interview',
                              itemTopic: result.item,
                              stageOrType: vpcElement ? `${stage} · ${vpcElement}` : stage,
                              purpose: purpose ?? qHypothesis,
                            })
                          }
                          className={`mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg border transition-colors ${
                            fav
                              ? 'border-[#f4d7ad] bg-[#fff7ea] text-[#d97724]'
                              : 'border-[#e6e3f0] bg-white text-[#8a86a0] hover:border-[#cfc5f3] hover:text-[#d97724]'
                          }`}
                        >
                          <Star size={15} fill={fav ? 'currentColor' : 'none'} aria-hidden="true" />
                        </button>
                      </li>
                    );
                  })}
                </ol>
              </div>

              <div>
                <h4 className="mb-2.5 text-[16px] font-bold text-[#17162b]">
                  배포용 설문 문항 {result.survey.length}개
                </h4>
                <ol className="grid gap-2.5">
                  {result.survey.map((q, idx) => {
                    const fav = isFavorited(q.label);
                    return (
                      <li key={idx} className="flex items-start justify-between gap-3 rounded-xl border border-[#e6e3f0] px-4 py-3">
                        <div className="min-w-0 flex-1">
                          <p className="text-[15px] font-medium leading-relaxed text-[#17162b]">
                            {idx + 1}. {q.label}
                          </p>
                          <p className="mt-1 text-[14px] text-[#565570]">
                            {types[q.type]} · {q.required ? '필수' : '선택'}
                            {q.options.length ? ` · 선택지: ${q.options.join(' / ')}` : ''}
                          </p>
                        </div>
                        <button
                          type="button"
                          aria-label={fav ? '즐겨찾기 해제' : '질문함 즐겨찾기 추가'}
                          onClick={() =>
                            toggleFavoriteItem({
                              text: q.label,
                              kind: 'survey',
                              itemTopic: result.item,
                              stageOrType: types[q.type],
                              options: q.options,
                            })
                          }
                          className={`mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg border transition-colors ${
                            fav
                              ? 'border-[#f4d7ad] bg-[#fff7ea] text-[#d97724]'
                              : 'border-[#e6e3f0] bg-white text-[#8a86a0] hover:border-[#cfc5f3] hover:text-[#d97724]'
                          }`}
                        >
                          <Star size={15} fill={fav ? 'currentColor' : 'none'} aria-hidden="true" />
                        </button>
                      </li>
                    );
                  })}
                </ol>
              </div>

              <p className="text-[14px] text-[#565570]">
                AI 초안이에요. 실제 배포 전 문항이 한 번에 하나만 묻는지, 유도 표현이 없는지 검토해 주세요.
              </p>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => void copyQuestions(result)}
                  className={saasUi.btnCompactSecondary}
                >
                  <Copy size={15} aria-hidden="true" /> 전체 질문 복사
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const file = exportQuestionGuideCsv(result);
                    setNotice(`리서치 가이드 분석 및 질문을 CSV(${file})로 다운로드했어요.`);
                  }}
                  className={saasUi.btnCompactSecondary}
                >
                  <Download size={15} aria-hidden="true" /> CSV 다운로드
                </button>
                <button
                  type="button"
                  onClick={() => saveGuideAsRoutine(result)}
                  className={saasUi.btnCompactSoft}
                >
                  <FolderPlus size={15} aria-hidden="true" /> 리서치 루틴으로 저장
                </button>
                {editingSurvey ? (
                  <button
                    type="button"
                    onClick={close}
                    className={saasUi.btnCompactPrimary}
                  >
                    설문 작성으로 돌아가기
                  </button>
                ) : (
                  <Link
                    to="/?view=surveys&new=1&template=generated"
                    onClick={close}
                    className={saasUi.btnCompactPrimary}
                  >
                    설문 초안으로 배포하기 <ArrowRight size={15} aria-hidden="true" />
                  </Link>
                )}
              </div>
            </section>
          )}
        </>
      ) : mode === 'analyze' ? (
        <>
          <form className="grid gap-3.5" autoComplete="off" onSubmit={runAnalyze}>
            <fieldset disabled={busy} className="grid gap-3.5">
              <label className={saasUi.labelText}>
                검증할 아이템 *
                <input
                  name="analyze-item"
                  required
                  maxLength={300}
                  value={analyzeItem}
                  onChange={(e) => setAnalyzeItem(e.target.value)}
                  placeholder="예: 일상 사진과 짧은 글을 4컷 웹툰으로 바꿔 주는 웹·앱"
                  className={saasUi.input}
                />
              </label>

              <label className={saasUi.labelText}>
                인터뷰 질문 입력 *
                <textarea
                  name="analyze-questions"
                  rows={4}
                  maxLength={4000}
                  value={analyzeQuestions}
                  onChange={(e) => setAnalyzeQuestions(e.target.value)}
                  placeholder="인터뷰에서 물어볼 질문(또는 이미 물어본 질문)을 줄바꿈으로 입력하세요. 각 질문의 유도 위험과 개선안을 자동으로 진단해 정리해요."
                  className={`${saasUi.input} resize-y`}
                />
              </label>

              <label className={saasUi.labelText}>
                인터뷰 답변 / 관찰 메모 (선택)
                <textarea
                  name="analyze-notes"
                  rows={3}
                  maxLength={6000}
                  value={analyzeNotes}
                  onChange={(e) => setAnalyzeNotes(e.target.value)}
                  placeholder="실제 고객 인터뷰 답변이나 메모가 있다면 함께 붙여넣어 주세요. 핵심 페인포인트·대안·지불의향·패턴까지 자동으로 정리해 드려요."
                  className={`${saasUi.input} resize-y`}
                />
              </label>

              <div className="flex flex-wrap items-center gap-3.5">
                <button
                  type="button"
                  onClick={() => {
                    setAnalyzeItem(itemExample);
                    setAnalyzeQuestions(analysisSampleQuestions);
                    setAnalyzeNotes(analysisSampleNotes);
                  }}
                  className="text-[14px] font-bold text-[#4c2ee6] hover:underline"
                >
                  질문·메모 예시 채우기
                </button>
                {people.some((p) => p.note.trim()) && (
                  <button
                    type="button"
                    onClick={loadPeopleNotes}
                    className="text-[14px] font-bold text-[#4125cc] hover:underline"
                  >
                    등록된 대상자 인사이트 불러오기
                  </button>
                )}
              </div>
            </fieldset>

            {error && (
              <div
                role="alert"
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#f2ccd7] bg-[#fff5f7] px-4 py-2.5 text-[15px] text-[#9f1d45]"
              >
                <span>{error}</span>
                <button
                  type="submit"
                  disabled={busy}
                  className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-[#e6a4b7] bg-white px-3 text-[13px] font-bold text-[#9f1d45] hover:bg-[#fff8fa]"
                >
                  <RotateCcw size={14} aria-hidden="true" /> 다시 시도
                </button>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="submit"
                disabled={busy}
                className={saasUi.btnPrimary}
              >
                <ClipboardCheck size={17} aria-hidden="true" />
                {busy ? '질문과 내용을 분석·정리하는 중…' : '자동 분석해서 정리하기'}
              </button>
            </div>
          </form>

          {!busy && notice && (
            <p className="rounded-xl bg-[#efeaff] px-4 py-2.5 text-[15px] font-semibold text-[#4125cc]" role="status">
              {notice}
            </p>
          )}

          {analysisResult && (
            <section className={`${saasUi.card} grid gap-5 p-5`}>
              <div className="border-b border-[#e6e3f0] pb-3.5">
                <h4 ref={analysisHeading} tabIndex={-1} className="text-[17px] font-bold text-[#17162b]">
                  자동 분석 및 정리 리포트 · {analysisResult.item}
                </h4>
                <p className="mt-1.5 text-[15px] leading-relaxed text-[#17162b]">{analysisResult.summary}</p>
                <p className="mt-1 text-[14px] font-semibold text-[#4125cc]">
                  검증 진단: {analysisResult.validationReadiness}
                </p>
              </div>

              <div className="grid gap-3">
                <h5 className="text-[15px] font-bold text-[#17162b]">
                  1. 질문 3원칙 적합성 진단 및 개선 ({analysisResult.questionReviews.length}개)
                </h5>
                {analysisResult.questionReviews.map((qr, i) => {
                  const fav = isFavorited(qr.improved);
                  return (
                    <div key={i} className="grid gap-1.5 rounded-xl border border-[#e6e3f0] p-3.5 text-[15px]">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-bold text-[#17162b]">{qr.original}</span>
                        <div className="flex items-center gap-2">
                          {qr.violatedPrinciple && (
                            <span className="text-[13px] font-semibold text-[#565570]">{qr.violatedPrinciple}</span>
                          )}
                          <span
                            className={`text-[14px] font-bold ${
                              qr.verdict === '적합'
                                ? 'text-[#14674d]'
                                : qr.verdict === '유도 위험'
                                ? 'text-[#b01e4a]'
                                : 'text-[#8b4d17]'
                            }`}
                          >
                            {qr.verdict}
                          </span>
                          <button
                            type="button"
                            aria-label={fav ? '개선 질문 즐겨찾기 해제' : '개선 질문 즐겨찾기 추가'}
                            onClick={() =>
                              toggleFavoriteItem({
                                text: qr.improved,
                                kind: 'interview',
                                itemTopic: analysisResult.item,
                                stageOrType: `개선 질문 (${qr.verdict})`,
                                purpose: qr.insightGoal,
                              })
                            }
                            className={`grid size-7 shrink-0 place-items-center rounded-lg border transition-colors ${
                              fav
                                ? 'border-[#f4d7ad] bg-[#fff7ea] text-[#d97724]'
                                : 'border-[#e6e3f0] bg-white text-[#8a86a0] hover:border-[#cfc5f3] hover:text-[#d97724]'
                            }`}
                          >
                            <Star size={14} fill={fav ? 'currentColor' : 'none'} aria-hidden="true" />
                          </button>
                        </div>
                      </div>
                      <p className="text-[14px] text-[#565570]">진단: {qr.diagnosis}</p>
                      <p className="text-[15px] font-semibold text-[#4125cc]">개선 질문: {qr.improved}</p>
                      <p className="text-[14px] text-[#565570]">확인 지표: {qr.insightGoal}</p>
                    </div>
                  );
                })}
              </div>

              {analysisResult.insights.factPatternInsights && analysisResult.insights.factPatternInsights.length > 0 && (
                <div className="grid gap-3 rounded-xl border border-[#dfd7fb] bg-white p-4 text-[15px]">
                  <h5 className="text-[16px] font-bold text-[#17162b]">
                    2. Fact(사실) → Pattern(패턴) → Insight(해석) · 가설 판정
                  </h5>
                  <div className="grid gap-2.5">
                    {analysisResult.insights.factPatternInsights.map((fp, idx) => (
                      <div key={idx} className="grid gap-1.5 rounded-xl border border-[#e6e3f0] bg-[#faf9fd] p-3.5">
                        <div className="flex flex-wrap items-center justify-between gap-2 text-[13px] font-bold">
                          <span className="text-[#4125cc]">{fp.painGainTag}</span>
                          <span
                            className={
                              fp.verdict.includes('Pass')
                                ? 'text-[#14674d]'
                                : fp.verdict.includes('Fail')
                                ? 'text-[#b01e4a]'
                                : 'text-[#8b4d17]'
                            }
                          >
                            {fp.verdict}
                          </span>
                        </div>
                        <p className="text-[14px] text-[#17162b]">
                          <b className="text-[#4125cc]">① Fact:</b> {fp.fact}
                        </p>
                        <p className="text-[14px] text-[#17162b]">
                          <b className="text-[#4125cc]">② Pattern:</b> {fp.pattern}
                        </p>
                        <p className="text-[15px] font-semibold text-[#17162b]">
                          <b className="text-[#4125cc]">③ Insight:</b> {fp.insight}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid gap-3.5 rounded-xl border border-[#e6e3f0] bg-[#f8f6ff] p-4 text-[15px]">
                <h5 className="text-[16px] font-bold text-[#17162b]">3. 핵심 검증 인사이트 정리</h5>
                <div className="grid gap-3.5 sm:grid-cols-2">
                  <div>
                    <b className="text-[14px] text-[#4125cc]">주요 페인포인트</b>
                    <ul className="mt-1.5 list-disc space-y-1 pl-5 leading-relaxed text-[#17162b]">
                      {analysisResult.insights.painPoints.map((p, i) => (
                        <li key={i}>{p}</li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <b className="text-[14px] text-[#4125cc]">현재 사용 중인 대안</b>
                    <ul className="mt-1.5 list-disc space-y-1 pl-5 leading-relaxed text-[#17162b]">
                      {analysisResult.insights.currentAlternatives.map((p, i) => (
                        <li key={i}>{p}</li>
                      ))}
                    </ul>
                  </div>
                </div>
                <div>
                  <b className="text-[14px] text-[#4125cc]">지불 의향 · 전환 장벽 신호</b>
                  <p className="mt-1 leading-relaxed text-[#17162b]">{analysisResult.insights.willingnessToPay}</p>
                </div>
                <div className="grid gap-3.5 sm:grid-cols-2">
                  <div>
                    <b className="text-[14px] text-[#4125cc]">발견된 패턴</b>
                    <ul className="mt-1.5 list-disc space-y-1 pl-5 leading-relaxed text-[#17162b]">
                      {analysisResult.insights.keyPatterns.map((p, i) => (
                        <li key={i}>{p}</li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <b className="text-[14px] text-[#4125cc]">다음 검증 액션</b>
                    <ul className="mt-1.5 list-disc space-y-1 pl-5 leading-relaxed text-[#17162b]">
                      {analysisResult.insights.nextActions.map((p, i) => (
                        <li key={i}>{p}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>

              {analysisResult.checklist && analysisResult.checklist.length > 0 && (
                <div className="grid gap-2.5 rounded-xl border border-[#e6e3f0] bg-white p-4 text-[14px]">
                  <h5 className="text-[15px] font-bold text-[#17162b]">4. 인터뷰 점검 체크리스트</h5>
                  <ul className="grid gap-2">
                    {analysisResult.checklist.map((chk, idx) => (
                      <li key={idx} className="flex flex-wrap items-start justify-between gap-2 border-b border-[#f0edf7] pb-2 last:border-b-0 last:pb-0">
                        <div className="min-w-0 flex-1">
                          <span className="font-bold text-[#17162b]">{chk.item}</span>
                          {chk.note && <p className="mt-0.5 text-[#565570]">{chk.note}</p>}
                        </div>
                        <span
                          className={`shrink-0 font-bold ${
                            chk.status === '충족'
                              ? 'text-[#14674d]'
                              : chk.status === '보완 필요'
                              ? 'text-[#8b4d17]'
                              : 'text-[#7c7a94]'
                          }`}
                        >
                          {chk.status}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => void copyAnalysisReport(analysisResult)}
                  className={saasUi.btnCompactSecondary}
                >
                  <Copy size={15} aria-hidden="true" /> 정리 리포트 복사
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const file = exportInterviewAnalysisCsv(analysisResult);
                    setNotice(`인터뷰 질문·메모 분석 결과를 CSV(${file})로 다운로드했어요.`);
                  }}
                  className={saasUi.btnCompactSecondary}
                >
                  <Download size={15} aria-hidden="true" /> 분석 결과 CSV
                </button>
                {analysisResult.questionReviews.length > 0 && (
                  <button
                    type="button"
                    onClick={() => saveAnalysisAsRoutine(analysisResult)}
                    className={saasUi.btnCompactSoft}
                  >
                    <FolderPlus size={15} aria-hidden="true" /> 개선 질문 루틴으로 저장
                  </button>
                )}
                {onSaveInsight && people.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      aria-label="인사이트를 저장할 대상자 선택"
                      value={targetPersonId}
                      onChange={(e) => setTargetPersonId(e.target.value)}
                      className="min-h-10 rounded-xl border border-[#dcd8e8] bg-white px-3 text-[14px] text-[#17162b]"
                    >
                      <option value="">대상자 메모에 반영할 사람 선택</option>
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
                        onSaveInsight(
                          targetPersonId,
                          `[AI 분석 요약] ${analysisResult.summary}\n• 페인포인트: ${analysisResult.insights.painPoints.join(', ')}\n• 다음 액션: ${analysisResult.insights.nextActions.join(', ')}`,
                        );
                        setNotice('선택한 대상자의 핵심 인사이트에 분석 내용을 저장했어요.');
                      }}
                      className={saasUi.btnCompactPrimary}
                    >
                      <CheckCircle2 size={15} aria-hidden="true" /> 인사이트 저장
                    </button>
                  </div>
                )}
              </div>
            </section>
          )}
        </>
      ) : (
        <MyQuestionVault
          onApplyQuestions={(questionsText, targetMode, itemTopic) => {
            if (targetMode === 'analyze') {
              setAnalyzeQuestions((prev) => {
                if (!prev.trim() || questionsText.includes('\n')) return questionsText;
                if (prev.includes(questionsText.trim())) return prev;
                return `${prev.trim()}\n${questionsText}`;
              });
              if (itemTopic && itemTopic !== '직접 등록' && itemTopic !== '나의 질문' && !analyzeItem.trim()) {
                setAnalyzeItem(itemTopic);
              }
            } else {
              setDraftQuestions(questionsText);
            }
            setMode(targetMode);
            setError('');
            setNotice('나의 질문함에서 질문을 불러왔어요.');
          }}
          onCreateSurvey={(routineName, items) => {
            const guidePayload: QuestionGuide = {
              item: routineName,
              interview: [],
              survey: items.map((it) => {
                const matched = vault.questions.find((q) => q.text.trim() === it.label.trim());
                const options = it.options ?? matched?.options ?? [];
                return {
                  label: it.label,
                  type: options.length >= 2 ? 'choice' : 'text',
                  required: true,
                  options: options.length >= 2 ? options : [],
                };
              }),
            };
            demoStore.set(questionGuideKey, guidePayload);
            close();
            navigate('/?view=surveys&new=1&template=generated');
          }}
        />
      )}

      {copyText && (
        <label className={saasUi.labelText}>
          아래 내용을 직접 복사해 주세요.
          <textarea
            rows={6}
            value={copyText}
            readOnly
            onFocus={(e) => e.currentTarget.select()}
            className={`${saasUi.input} font-mono text-[14px]`}
          />
        </label>
      )}
    </section>
  );
}
