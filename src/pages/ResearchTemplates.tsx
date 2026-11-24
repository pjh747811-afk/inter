import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import {
  ArrowRight,
  BookmarkCheck,
  BookmarkPlus,
  BookOpen,
  Check,
  ClipboardList,
  Copy,
  Download,
  MessageSquareText,
  Search,
  Sparkles,
  Trash2,
  Wand2,
} from 'lucide-react';
import { api } from '../lib/api';
import { exportResearchTemplateCsv } from '../lib/researchCsv';
import { useQuestionVault } from '../lib/questionVault';
import { types } from '../lib/research';
import {
  researchTemplates,
  templateCategories,
  useCustomTemplates,
  type ResearchTemplate,
  type TemplateCategory,
  type TemplateFocus,
  type ValidationStage,
} from '../lib/researchTemplates';
import { saasUi } from './ResearchUI';

type TemplateFilter = TemplateCategory | 'AI 맞춤';

const PURPOSE_PRESETS: Array<{
  label: string;
  purpose: string;
  focus: TemplateFocus;
  validationStage: ValidationStage;
  customerArchetype: string;
  hypothesis?: string;
}> = [
  {
    label: 'VPC · CPF 고객검증',
    purpose: '가치제안캔버스(VPC) 고객 프로필을 기반으로 핵심 문제의 발생 빈도, 시간·비용 강도, 기존 대안 불만을 사실(Fact)과 숫자로 검증',
    focus: 'both',
    validationStage: '문제검증',
    customerArchetype: '최종사용자',
    hypothesis: '타겟 고객은 기존 해결 방식의 반복 불편과 시간·비용 손실 때문에 핵심 문제를 겪고 있을 것이다.',
  },
  {
    label: '문제·수요 검증',
    purpose: '타겟 고객이 이 문제를 실제로 얼마나 자주 겪고, 현재 대안에 어떤 시간·비용 불만을 느끼는지 검증',
    focus: 'both',
    validationStage: '문제검증',
    customerArchetype: '최종사용자',
  },
  {
    label: '온보딩·이탈 원인',
    purpose: '신규 가입 또는 첫 체험 직후 핵심 기능을 쓰지 않고 이탈하는 결정적 병목과 기대 불일치 파악',
    focus: 'interview',
    validationStage: '고객검증',
    customerArchetype: '최종사용자',
  },
  {
    label: '가격·유료 전환',
    purpose: '유료 요금제 도입 전 적정 가격 수용 범위와 무료에서 유료로 전환하게 만드는 핵심 조건 확인',
    focus: 'both',
    validationStage: '솔루션검증',
    customerArchetype: '구매자',
  },
  {
    label: '대상자 사전 스크리닝',
    purpose: '심층 인터뷰 대상자 모집 전 최근 행동 빈도와 고객 원형 기준으로 핵심 타겟 응답자를 선별',
    focus: 'survey',
    validationStage: '고객검증',
    customerArchetype: '최종사용자 · 의사결정자',
  },
];

const VALIDATION_STAGES: Array<{ value: ValidationStage; label: string }> = [
  { value: '고객검증', label: '고객검증 (고객 특성 · JTBD)' },
  { value: '문제검증', label: '문제검증 (문제 강도 · 대안)' },
  { value: '솔루션검증', label: '솔루션검증 (가치제안 · 전환)' },
];

const ARCHETYPE_OPTIONS = [
  '최종사용자',
  '구매자',
  '(최종)의사결정자',
  '최종사용자 · 구매자',
  '인플루언서 · 추천자',
] as const;

const FOCUS_OPTIONS: Array<{ value: TemplateFocus; label: string; hint: string }> = [
  { value: 'both', label: '인터뷰 + 설문 모두', hint: 'VPC·가설 기반 인터뷰와 정량 설문을 함께 설계' },
  { value: 'interview', label: '인터뷰 질문지 중심', hint: '문제 탐색 → 강도(숫자) → 기존 대안 순의 심층 질문 중심' },
  { value: 'survey', label: '설문 항목 중심', hint: '과거 행동 빈도·비용·척도·서술형이 균형 잡힌 설문 중심' },
];

export function ResearchTemplates({
  onUseInGuide,
}: {
  onUseInGuide: (template: ResearchTemplate, mode: 'generate' | 'analyze') => void;
}) {
  const { customTemplates, addTemplate, removeTemplate } = useCustomTemplates();
  const { questions: vaultQuestions, addQuestion } = useQuestionVault();

  const allTemplates = useMemo(
    () => [...customTemplates, ...researchTemplates],
    [customTemplates],
  );

  // Generator state
  const [purpose, setPurpose] = useState('');
  const [audience, setAudience] = useState('');
  const [context, setContext] = useState('');
  const [validationStage, setValidationStage] = useState<ValidationStage>('문제검증');
  const [customerArchetype, setCustomerArchetype] = useState<string>('최종사용자');
  const [hypothesis, setHypothesis] = useState('');
  const [focus, setFocus] = useState<TemplateFocus>('both');
  const [count, setCount] = useState(6);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState('');
  const [statusNotice, setStatusNotice] = useState('');

  // Library state
  const [category, setCategory] = useState<TemplateFilter>('전체');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState(() => allTemplates[0]?.id ?? researchTemplates[0].id);
  const [previewTab, setPreviewTab] = useState<'interview' | 'survey'>('interview');
  const [copiedId, setCopiedId] = useState('');
  const [fallbackCopy, setFallbackCopy] = useState('');

  const vaultTextSet = useMemo(
    () => new Set(vaultQuestions.map((q) => q.text.trim())),
    [vaultQuestions],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return allTemplates.filter((t) => {
      if (category === 'AI 맞춤') {
        if (!t.isAiGenerated) return false;
      } else if (category !== '전체' && t.category !== category) {
        return false;
      }
      if (!q) return true;
      const haystack = [
        t.title,
        t.category,
        t.situation,
        t.whenToUse,
        t.purposeInput ?? '',
        t.audienceInput ?? '',
        ...t.interview.map((i) => `${i.stage} ${i.prompt} ${i.purpose}`),
        ...t.survey.map((s) => `${s.label} ${s.options.join(' ')}`),
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [allTemplates, category, query]);

  const selected = filtered.find((t) => t.id === selectedId) ?? filtered[0] ?? allTemplates[0];

  async function handleGenerateTemplate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const cleanPurpose = purpose.trim();
    if (cleanPurpose.length < 3) {
      setGenError('추천받을 질문 템플릿의 리서치 목적을 3자 이상 입력해 주세요.');
      return;
    }

    setGenerating(true);
    setGenError('');
    setStatusNotice('');
    try {
      const created = await api<ResearchTemplate>('/api/research/generate-template', {
        method: 'POST',
        body: JSON.stringify({
          purpose: cleanPurpose,
          audience: audience.trim() || undefined,
          context: context.trim() || undefined,
          customerArchetype: customerArchetype || undefined,
          validationStage,
          hypothesis: hypothesis.trim() || undefined,
          focus,
          count,
        }),
      });
      addTemplate(created);
      setCategory('전체');
      setQuery('');
      setSelectedId(created.id);
      setPreviewTab(focus === 'survey' ? 'survey' : 'interview');
      setStatusNotice(
        `"${created.title}" VPC·CPF 질문 템플릿을 생성해 라이브러리에 저장했어요. (인터뷰 ${created.interview.length}문항 · 설문 ${created.survey.length}문항)`,
      );
    } catch (err) {
      setGenError(err instanceof Error ? err.message : '질문 템플릿을 생성하지 못했어요. 잠시 후 다시 시도해 주세요.');
    } finally {
      setGenerating(false);
    }
  }

  async function copyText(id: string, text: string) {
    setFallbackCopy('');
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId((curr) => (curr === id ? '' : curr)), 2000);
    } catch {
      setFallbackCopy(text);
    }
  }

  function formatInterviewCopy(t: ResearchTemplate): string {
    return [
      `[${t.title}] 인터뷰 질문 가이드 (${t.interview.length}문항)`,
      t.validationStage ? `검증 단계: ${t.validationStage}` : '',
      t.customerArchetype ? `고객 원형: ${t.customerArchetype}` : '',
      t.cpfSummary
        ? `CPF 고객 가설: ${t.cpfSummary.customerHypothesis}\nCPF 문제 가설: ${t.cpfSummary.problemHypothesis}`
        : '',
      `상황: ${t.situation}`,
      `주의할 점: ${t.cautionTip}`,
      '',
      ...t.interview.map(
        (item, idx) =>
          `${idx + 1}. [${item.stage}${item.vpcElement ? ` · ${item.vpcElement}` : ''}] ${item.prompt}${
            item.hypothesis ? `\n   - 연계 가설: ${item.hypothesis}` : ''
          }\n   - 확인 포인트: ${item.purpose}`,
      ),
    ]
      .filter(Boolean)
      .join('\n');
  }

  function formatSurveyCopy(t: ResearchTemplate): string {
    return [
      `[${t.title}] 설문 문항 (${t.survey.length}문항)`,
      `설문 제목: ${t.surveyTitle}`,
      '',
      ...t.survey.map(
        (q, idx) =>
          `${idx + 1}. (${types[q.type]} · ${q.required ? '필수' : '선택'}) ${q.label}${
            q.options.length ? `\n   선택지: ${q.options.join(' / ')}` : ''
          }`,
      ),
    ].join('\n');
  }

  function saveSingleToVault(input: {
    text: string;
    kind: 'interview' | 'survey';
    stageOrType: string;
    purpose?: string;
    options?: string[];
  }) {
    addQuestion({
      text: input.text,
      kind: input.kind,
      itemTopic: selected.title,
      stageOrType: input.stageOrType,
      purpose: input.purpose,
      options: input.options,
      favorite: true,
    });
    setStatusNotice('선택한 문항을 나의 질문함에 저장했어요.');
  }

  function saveAllSelectedToVault() {
    let added = 0;
    for (const item of selected.interview) {
      if (!vaultTextSet.has(item.prompt.trim())) added++;
      addQuestion({
        text: item.prompt,
        kind: 'interview',
        itemTopic: selected.title,
        stageOrType: item.stage,
        purpose: item.purpose,
      });
    }
    for (const q of selected.survey) {
      if (!vaultTextSet.has(q.label.trim())) added++;
      addQuestion({
        text: q.label,
        kind: 'survey',
        itemTopic: selected.title,
        stageOrType: types[q.type],
        options: q.options,
      });
    }
    setStatusNotice(
      added > 0
        ? `"${selected.title}"의 문항 ${added}개를 나의 질문함에 새로 저장했어요.`
        : `"${selected.title}"의 모든 문항이 이미 나의 질문함에 저장되어 있어요.`,
    );
  }

  function handleDeleteCustom(tpl: ResearchTemplate) {
    removeTemplate(tpl.id);
    const remaining = allTemplates.filter((item) => item.id !== tpl.id);
    if (remaining[0]) {
      setSelectedId(remaining[0].id);
    }
    setStatusNotice(`"${tpl.title}" AI 생성 템플릿을 삭제했어요.`);
  }

  const filterTabs: Array<{ id: TemplateFilter; label: string }> = [
    { id: '전체', label: '전체' },
    { id: 'AI 맞춤', label: `AI 맞춤 (${customTemplates.length})` },
    ...templateCategories.filter((c) => c !== '전체').map((c) => ({ id: c as TemplateFilter, label: c })),
  ];

  return (
    <div className="grid gap-6">
      {/* Page Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className={saasUi.pageTitle}>질문 템플릿 생성기 · 라이브러리</h1>
          <p className={saasUi.pageSubtitle}>
            리서치 목적을 입력하면 AI가 맞춤형 인터뷰 질문지와 설문 항목을 추천해 드려요.
          </p>
        </div>

        <Link
          to={`/?view=surveys&new=1&template=preset:${selected.id}`}
          className={saasUi.btnPrimary}
        >
          <ClipboardList size={16} aria-hidden="true" />
          선택 템플릿으로 설문 만들기
        </Link>
      </div>

      {/* AI Question Template Generator */}
      <section
        aria-labelledby="template-generator-heading"
        className={`${saasUi.cardSoft} grid gap-4 p-5 sm:p-6`}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-[#efeaff] text-[#4125cc]">
              <Wand2 size={20} aria-hidden="true" />
            </span>
            <div>
              <h2 id="template-generator-heading" className={saasUi.sectionTitle}>
                AI 질문 템플릿 생성기
              </h2>
              <p className="mt-0.5 text-[15px] leading-relaxed text-[#565570]">
                VPC·CPF 가설(고객검증·문제검증·솔루션검증)과 질문 3원칙(경험 묻기·개방형·평가 금지)에 맞춰 질문지와 설문을 자동 추천합니다.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {PURPOSE_PRESETS.map((preset) => (
              <button
                key={preset.label}
                type="button"
                disabled={generating}
                onClick={() => {
                  setPurpose(preset.purpose);
                  setFocus(preset.focus);
                  setValidationStage(preset.validationStage);
                  setCustomerArchetype(preset.customerArchetype);
                  if (preset.hypothesis) setHypothesis(preset.hypothesis);
                  setGenError('');
                }}
                className="min-h-9 shrink-0 whitespace-nowrap rounded-xl border border-[#d6cbf8] bg-white px-3 text-[13px] font-semibold text-[#4125cc] transition-colors hover:bg-[#efeaff] disabled:opacity-50"
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-[#dfd7fb] bg-white px-4 py-2.5 text-[14px] text-[#44435c]">
          <b className="text-[#4125cc]">설계 원칙:</b> ① 의견 대신 과거·현재 경험(비용·시간·실패·행동) · ② 개방형 질문 · ③ "Would you/괜찮나요?" 평가 금지 · ④ 문제 탐색 → 강도(숫자) → 기존 대안 순 구성
        </div>

        <form onSubmit={handleGenerateTemplate} className="grid gap-4">
          <label className={saasUi.labelText}>
            리서치 목적 (필수)
            <textarea
              rows={2}
              maxLength={500}
              value={purpose}
              disabled={generating}
              onChange={(e) => setPurpose(e.target.value)}
              placeholder="예: 무료 체험 사용자의 유료 구독 전환을 가로막는 이유와 결제 직전 망설임 요소 파악"
              className={`${saasUi.input} resize-y`}
            />
          </label>

          <div className="grid gap-3.5 lg:grid-cols-2">
            <label className={saasUi.labelText}>
              검증 흐름 단계 (인터뷰 구조)
              <select
                value={validationStage}
                disabled={generating}
                onChange={(e) => setValidationStage(e.target.value as ValidationStage)}
                className={`w-full ${saasUi.select}`}
              >
                {VALIDATION_STAGES.map((st) => (
                  <option key={st.value} value={st.value}>
                    {st.label}
                  </option>
                ))}
              </select>
            </label>

            <label className={saasUi.labelText}>
              고객 원형 (Customer Archetype)
              <select
                value={customerArchetype}
                disabled={generating}
                onChange={(e) => setCustomerArchetype(e.target.value)}
                className={`w-full ${saasUi.select}`}
              >
                {ARCHETYPE_OPTIONS.map((arch) => (
                  <option key={arch} value={arch}>
                    {arch}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="grid gap-3.5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_175px]">
            <label className={saasUi.labelText}>
              대상 고객군 · 응답자 (선택)
              <input
                type="text"
                maxLength={200}
                value={audience}
                disabled={generating}
                onChange={(e) => setAudience(e.target.value)}
                placeholder="예: 월 1회 이상 프로젝트 관리를 하는 1인 사업자"
                className={saasUi.input}
              />
            </label>

            <label className={saasUi.labelText}>
              가치제안 · 제품 맥락 (선택)
              <input
                type="text"
                maxLength={500}
                value={context}
                disabled={generating}
                onChange={(e) => setContext(e.target.value)}
                placeholder="예: 모바일 기반 프리랜서 견적서 및 일정 관리 앱"
                className={saasUi.input}
              />
            </label>

            <label className={saasUi.labelText}>
              추천 문항 수
              <select
                value={count}
                disabled={generating}
                onChange={(e) => setCount(Number(e.target.value))}
                className={saasUi.input}
              >
                <option value={5}>핵심 5문항</option>
                <option value={6}>표준 6문항</option>
                <option value={8}>심층 8문항</option>
              </select>
            </label>
          </div>

          <label className={saasUi.labelText}>
            검증하려는 CPF 핵심 가설 (선택)
            <input
              type="text"
              maxLength={350}
              value={hypothesis}
              disabled={generating}
              onChange={(e) => setHypothesis(e.target.value)}
              placeholder="예: [고객] 1인 사업자는 [문제] 수기 정산·견적 오류로 매주 2시간 이상 낭비하는 불편을 겪고 있을 것이다"
              className={saasUi.input}
            />
          </label>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#e2dafc] pt-3.5">
            <div className="grid gap-1.5">
              <div
                className="flex flex-wrap items-center gap-1 rounded-xl border border-[#d6cbf8] bg-white p-1"
                role="radiogroup"
                aria-label="추천 템플릿 구성"
              >
                {FOCUS_OPTIONS.map((opt) => {
                  const active = focus === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      disabled={generating}
                      onClick={() => setFocus(opt.value)}
                      className={`min-h-10 shrink-0 whitespace-nowrap rounded-lg px-3.5 text-[14px] font-semibold transition-colors ${
                        active
                          ? 'bg-[#4c2ee6] text-white'
                          : 'text-[#44435c] hover:bg-[#f6f3ff] hover:text-[#17162b]'
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
              <span className="text-[13px] text-[#565570]">
                {FOCUS_OPTIONS.find((o) => o.value === focus)?.hint}
              </span>
            </div>

            <button
              type="submit"
              disabled={generating}
              className={saasUi.btnPrimary}
            >
              <Sparkles size={16} aria-hidden="true" />
              {generating ? '목적에 맞는 템플릿 생성 중…' : 'AI 질문 템플릿 생성'}
            </button>
          </div>
        </form>

        {genError && (
          <p
            role="alert"
            className="rounded-xl border border-[#f2ccd7] bg-[#fff5f7] px-4 py-2.5 text-[15px] font-medium text-[#9f1d45]"
          >
            {genError}
          </p>
        )}

        {statusNotice && (
          <p
            role="status"
            className="rounded-xl border border-[#d6cbf8] bg-[#efeaff] px-4 py-2.5 text-[15px] font-semibold text-[#4125cc]"
          >
            {statusNotice}
          </p>
        )}
      </section>

      {/* Category Filter Bar + Search */}
      <section className={`${saasUi.card} flex flex-wrap items-center justify-between gap-3 px-4 py-3.5`}>
        <div className="flex flex-wrap items-center gap-1" role="tablist" aria-label="템플릿 상황 분류">
          {filterTabs.map((tab) => {
            const active = category === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setCategory(tab.id)}
                className={`tnum min-h-10 shrink-0 whitespace-nowrap rounded-xl px-3.5 text-[14px] font-semibold transition-colors ${
                  active
                    ? 'bg-[#efeaff] font-bold text-[#4125cc]'
                    : 'text-[#44435c] hover:bg-[#f6f4fd] hover:text-[#17162b]'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        <label className="flex min-h-10 w-full items-center gap-2 rounded-xl border border-[#dcd8e8] bg-[#faf9fd] px-3.5 text-[#565570] focus-within:border-[#4c2ee6] sm:w-68">
          <Search size={16} aria-hidden="true" />
          <input
            type="search"
            aria-label="질문 템플릿 검색"
            placeholder="상황, 목적, 질문 키워드 검색…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full border-0 bg-transparent text-[15px] text-[#17162b] placeholder:text-[#7c7a94] outline-none"
          />
        </label>
      </section>

      {filtered.length === 0 ? (
        <section className={`${saasUi.card} grid justify-items-center gap-2.5 px-5 py-12 text-center`}>
          <p className="text-[16px] font-bold text-[#17162b]">
            {category === 'AI 맞춤'
              ? '아직 AI로 생성한 맞춤 질문 템플릿이 없어요. 위 생성기에 리서치 목적을 입력해 보세요.'
              : '검색 조건에 맞는 질문 템플릿이 없어요.'}
          </p>
          <button
            type="button"
            onClick={() => {
              setCategory('전체');
              setQuery('');
            }}
            className={`${saasUi.btnCompactSoft} mt-1`}
          >
            전체 템플릿 보기
          </button>
        </section>
      ) : (
        <div className="grid items-start gap-5 lg:grid-cols-[340px_minmax(0,1fr)]">
          {/* Left List: Template Catalog */}
          <aside className={`${saasUi.card} overflow-hidden`} aria-label="상황별 템플릿 목록">
            <div className="border-b border-[#e6e3f0] px-4 py-3.5">
              <h2 className="text-[14px] font-bold tracking-wide text-[#565570]">
                템플릿 라이브러리 <span className="tnum font-mono text-[#4125cc]">({filtered.length})</span>
              </h2>
            </div>
            <ul className="divide-y divide-[#e6e3f0]">
              {filtered.map((t) => {
                const active = t.id === selected.id;
                return (
                  <li key={t.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(t.id)}
                      className={`grid w-full gap-1.5 px-4 py-4 text-left transition-colors ${
                        active ? 'bg-[#f6f3ff]' : 'bg-white hover:bg-[#faf9fd]'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className={`text-[15px] font-bold leading-snug ${active ? 'text-[#4125cc]' : 'text-[#17162b]'}`}>
                          {t.title}
                        </span>
                        <span className="shrink-0 pt-0.5 text-[13px] font-semibold text-[#565570]">
                          {t.isAiGenerated ? `AI 맞춤 · ${t.category}` : t.category}
                        </span>
                      </div>
                      <p className="line-clamp-2 text-[13px] leading-relaxed text-[#565570]">{t.situation}</p>
                      <p className="tnum mt-0.5 text-[13px] font-medium text-[#7c7a94]">
                        인터뷰 {t.interview.length}문항 · 설문 {t.survey.length}문항
                      </p>
                    </button>
                  </li>
                );
              })}
            </ul>
          </aside>

          {/* Right Panel: Selected Template Detail & Quick Actions */}
          <section className={`${saasUi.card} grid min-w-0 gap-5 p-5 sm:p-6`}>
            <div className="grid gap-3 border-b border-[#e6e3f0] pb-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="tnum flex flex-wrap items-center gap-2 text-[14px] text-[#565570]">
                  {selected.isAiGenerated && (
                    <>
                      <span className="font-bold text-[#4125cc]">AI 목적 맞춤 생성</span>
                      <span aria-hidden="true">·</span>
                    </>
                  )}
                  <span className="font-bold text-[#4125cc]">{selected.category}</span>
                  {selected.validationStage && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="font-semibold text-[#17162b]">{selected.validationStage}</span>
                    </>
                  )}
                  {selected.customerArchetype && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span>원형: {selected.customerArchetype}</span>
                    </>
                  )}
                  <span aria-hidden="true">·</span>
                  <span>인터뷰 {selected.interview.length}문항</span>
                  <span aria-hidden="true">·</span>
                  <span>설문 {selected.survey.length}문항</span>
                </div>

                {selected.isAiGenerated && (
                  <button
                    type="button"
                    onClick={() => handleDeleteCustom(selected)}
                    className="inline-flex min-h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl border border-[#f2ccd7] bg-white px-3 text-[13px] font-semibold text-[#9f1d45] hover:bg-[#fff5f7]"
                  >
                    <Trash2 size={14} aria-hidden="true" />
                    템플릿 삭제
                  </button>
                )}
              </div>

              <h2 className="font-display text-[22px] font-extrabold tracking-tight text-[#17162b] sm:text-[24px]">
                {selected.title}
              </h2>
              {selected.purposeInput && (
                <p className="text-[14px] leading-relaxed text-[#4125cc]">
                  <b className="font-bold">입력한 리서치 목적:</b> {selected.purposeInput}
                  {selected.audienceInput ? ` · 대상: ${selected.audienceInput}` : ''}
                </p>
              )}
              {(selected.cpfSummary || selected.valueProposition) && (
                <div className="grid gap-1.5 rounded-xl border border-[#e6e3f0] bg-[#faf9fd] px-4 py-3 text-[14px] leading-relaxed">
                  {selected.cpfSummary && (
                    <>
                      <p className="text-[#17162b]">
                        <b className="font-bold text-[#4125cc]">CPF 고객 가설:</b> {selected.cpfSummary.customerHypothesis}
                      </p>
                      <p className="text-[#17162b]">
                        <b className="font-bold text-[#4125cc]">CPF 문제 가설:</b> {selected.cpfSummary.problemHypothesis}
                      </p>
                    </>
                  )}
                  {selected.valueProposition && (
                    <p className="text-[#565570]">
                      <b className="font-bold text-[#17162b]">가치제안:</b> {selected.valueProposition}
                    </p>
                  )}
                </div>
              )}
              <p className="text-[15px] leading-relaxed text-[#17162b]">{selected.whenToUse}</p>
              <p className="rounded-xl border border-[#dfd7fb] bg-[#f8f6ff] px-4 py-3 text-[14px] leading-relaxed text-[#4125cc]">
                <b className="font-bold">질문 3원칙 · 설계 팁:</b> {selected.cautionTip}
              </p>

              {/* Direct Application Actions */}
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <Link
                  to={`/?view=surveys&new=1&template=preset:${selected.id}`}
                  className={saasUi.btnCompactPrimary}
                >
                  <ClipboardList size={15} aria-hidden="true" />
                  이 템플릿으로 설문 만들기
                  <ArrowRight size={15} aria-hidden="true" />
                </Link>
                <button
                  type="button"
                  onClick={saveAllSelectedToVault}
                  className={saasUi.btnCompactSoft}
                >
                  <BookmarkPlus size={15} aria-hidden="true" />
                  전체 질문함에 저장
                </button>
                <button
                  type="button"
                  onClick={() => onUseInGuide(selected, 'generate')}
                  className={saasUi.btnCompactSecondary}
                >
                  <Sparkles size={15} className="text-[#4c2ee6]" aria-hidden="true" />
                  리서치 가이드 AI 맞춤화
                </button>
                <button
                  type="button"
                  onClick={() => onUseInGuide(selected, 'analyze')}
                  className={saasUi.btnCompactSecondary}
                >
                  <BookOpen size={15} aria-hidden="true" />
                  질문·메모 분석기에 넣기
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const file = exportResearchTemplateCsv(selected);
                    setStatusNotice(`"${selected.title}" 템플릿을 CSV(${file})로 다운로드했어요.`);
                  }}
                  className={saasUi.btnCompactSecondary}
                >
                  <Download size={15} aria-hidden="true" />
                  CSV 내보내기
                </button>
              </div>
            </div>

            {/* Preview Switcher: Interview vs Survey */}
            <div className="flex flex-wrap items-center justify-between gap-2.5">
              <div className="flex items-center gap-1 rounded-xl border border-[#e6e3f0] bg-[#faf9fd] p-1" role="tablist">
                <button
                  type="button"
                  role="tab"
                  aria-selected={previewTab === 'interview'}
                  onClick={() => setPreviewTab('interview')}
                  className={`inline-flex min-h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-3.5 text-[14px] font-semibold transition-colors ${
                    previewTab === 'interview' ? 'bg-[#4c2ee6] text-white' : 'text-[#44435c] hover:text-[#17162b]'
                  }`}
                >
                  <MessageSquareText size={14} aria-hidden="true" />
                  인터뷰 질문 ({selected.interview.length})
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={previewTab === 'survey'}
                  onClick={() => setPreviewTab('survey')}
                  className={`inline-flex min-h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-3.5 text-[14px] font-semibold transition-colors ${
                    previewTab === 'survey' ? 'bg-[#4c2ee6] text-white' : 'text-[#44435c] hover:text-[#17162b]'
                  }`}
                >
                  <ClipboardList size={14} aria-hidden="true" />
                  설문 문항 ({selected.survey.length})
                </button>
              </div>

              <button
                type="button"
                onClick={() =>
                  void copyText(
                    `${selected.id}-${previewTab}`,
                    previewTab === 'interview' ? formatInterviewCopy(selected) : formatSurveyCopy(selected),
                  )
                }
                className={saasUi.btnCompactSecondary}
              >
                {copiedId === `${selected.id}-${previewTab}` ? (
                  <>
                    <Check size={15} className="text-[#14674d]" aria-hidden="true" /> 복사 완료
                  </>
                ) : (
                  <>
                    <Copy size={15} aria-hidden="true" />
                    {previewTab === 'interview' ? '인터뷰 질문 전체 복사' : '설문 문항 전체 복사'}
                  </>
                )}
              </button>
            </div>

            {previewTab === 'interview' ? (
              <ol className="grid divide-y divide-[#e6e3f0] rounded-xl border border-[#e6e3f0]">
                {selected.interview.map((item, idx) => {
                  const rowKey = `${selected.id}-q-${idx}`;
                  const inVault = vaultTextSet.has(item.prompt.trim());
                  return (
                    <li key={idx} className="flex flex-wrap items-start justify-between gap-3 px-4 py-4">
                      <div className="min-w-0 flex-1">
                        <div className="tnum flex flex-wrap items-center gap-2 text-[13px] font-bold">
                          <span className="text-[#4125cc]">{item.stage}</span>
                          {item.vpcElement && (
                            <span className="rounded-md border border-[#d6cbf8] bg-[#f6f3ff] px-2 py-0.5 text-[#4125cc]">
                              {item.vpcElement}
                            </span>
                          )}
                        </div>
                        {item.hypothesis && (
                          <p className="mt-1 text-[14px] font-semibold text-[#565570]">가설: {item.hypothesis}</p>
                        )}
                        <p className="mt-1 text-[15px] font-semibold leading-relaxed text-[#17162b]">{item.prompt}</p>
                        <p className="mt-1 text-[14px] text-[#565570]">확인 포인트: {item.purpose}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() =>
                            saveSingleToVault({
                              text: item.prompt,
                              kind: 'interview',
                              stageOrType: item.stage,
                              purpose: item.purpose,
                            })
                          }
                          className={`inline-flex min-h-9 shrink-0 items-center gap-1 whitespace-nowrap rounded-lg border px-3 text-[13px] font-semibold transition-colors ${
                            inVault
                              ? 'border-[#d6cbf8] bg-[#efeaff] text-[#4125cc]'
                              : 'border-[#dcd8e8] bg-white text-[#44435c] hover:border-[#b9b1d4] hover:text-[#4125cc]'
                          }`}
                        >
                          {inVault ? (
                            <>
                              <BookmarkCheck size={13} aria-hidden="true" /> 질문함 저장됨
                            </>
                          ) : (
                            <>
                              <BookmarkPlus size={13} aria-hidden="true" /> 질문함
                            </>
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => void copyText(rowKey, item.prompt)}
                          className="inline-flex min-h-9 shrink-0 items-center gap-1 whitespace-nowrap rounded-lg border border-[#dcd8e8] bg-[#faf9fd] px-3 text-[13px] font-semibold text-[#44435c] hover:border-[#b9b1d4] hover:text-[#4125cc]"
                        >
                          {copiedId === rowKey ? (
                            <>
                              <Check size={13} className="text-[#14674d]" aria-hidden="true" /> 복사됨
                            </>
                          ) : (
                            <>
                              <Copy size={13} aria-hidden="true" /> 복사
                            </>
                          )}
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ol>
            ) : (
              <div className="grid gap-3">
                <div className="rounded-xl border border-[#e6e3f0] bg-[#faf9fd] px-4 py-3.5 text-[15px]">
                  <div className="font-bold text-[#17162b]">{selected.surveyTitle}</div>
                  <p className="mt-1 text-[14px] leading-relaxed text-[#565570]">{selected.surveyIntro}</p>
                </div>

                <ol className="grid divide-y divide-[#e6e3f0] rounded-xl border border-[#e6e3f0]">
                  {selected.survey.map((q, idx) => {
                    const rowKey = `${selected.id}-sq-${idx}`;
                    const inVault = vaultTextSet.has(q.label.trim());
                    return (
                      <li key={idx} className="flex flex-wrap items-start justify-between gap-3 px-4 py-4">
                        <div className="min-w-0 flex-1 grid gap-1">
                          <div className="tnum flex flex-wrap items-center gap-2">
                            <span className="text-[15px] font-semibold text-[#17162b]">
                              {idx + 1}. {q.label}
                            </span>
                            <span className="text-[13px] font-semibold text-[#565570]">
                              {types[q.type]} · {q.required ? '필수' : '선택'}
                            </span>
                          </div>
                          {q.options.length > 0 && (
                            <p className="text-[14px] text-[#565570]">선택지: {q.options.join(' / ')}</p>
                          )}
                          {q.type === 'scale' && (
                            <p className="text-[14px] text-[#565570]">척도: 1(전혀 그렇지 않다) ~ 5(매우 그렇다)</p>
                          )}
                        </div>
                        <div className="flex shrink-0 items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() =>
                              saveSingleToVault({
                                text: q.label,
                                kind: 'survey',
                                stageOrType: types[q.type],
                                options: q.options,
                              })
                            }
                            className={`inline-flex min-h-9 shrink-0 items-center gap-1 whitespace-nowrap rounded-lg border px-3 text-[13px] font-semibold transition-colors ${
                              inVault
                                ? 'border-[#d6cbf8] bg-[#efeaff] text-[#4125cc]'
                                : 'border-[#dcd8e8] bg-white text-[#44435c] hover:border-[#b9b1d4] hover:text-[#4125cc]'
                            }`}
                          >
                            {inVault ? (
                              <>
                                <BookmarkCheck size={13} aria-hidden="true" /> 질문함 저장됨
                              </>
                            ) : (
                              <>
                                <BookmarkPlus size={13} aria-hidden="true" /> 질문함
                              </>
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              void copyText(
                                rowKey,
                                `${q.label}${q.options.length ? `\n선택지: ${q.options.join(' / ')}` : ''}`,
                              )
                            }
                            className="inline-flex min-h-9 shrink-0 items-center gap-1 whitespace-nowrap rounded-lg border border-[#dcd8e8] bg-[#faf9fd] px-3 text-[13px] font-semibold text-[#44435c] hover:border-[#b9b1d4] hover:text-[#4125cc]"
                          >
                            {copiedId === rowKey ? (
                              <>
                                <Check size={13} className="text-[#14674d]" aria-hidden="true" /> 복사됨
                              </>
                            ) : (
                              <>
                                <Copy size={13} aria-hidden="true" /> 복사
                              </>
                            )}
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </div>
            )}

            {fallbackCopy && (
              <label className={saasUi.labelText}>
                아래 내용을 직접 복사해 주세요.
                <textarea
                  rows={5}
                  readOnly
                  value={fallbackCopy}
                  onFocus={(e) => e.currentTarget.select()}
                  className={`${saasUi.input} font-mono text-[14px]`}
                />
              </label>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
