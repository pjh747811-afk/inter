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
} from '../lib/researchTemplates';

type TemplateFilter = TemplateCategory | 'AI 맞춤';

const PURPOSE_PRESETS = [
  {
    label: '문제·수요 검증',
    purpose: '타겟 고객이 이 문제를 실제로 얼마나 자주 겪고, 현재 대안에 어떤 시간·비용 불만을 느끼는지 검증',
    focus: 'both' as TemplateFocus,
  },
  {
    label: '온보딩·이탈 원인',
    purpose: '신규 가입 또는 첫 체험 직후 핵심 기능을 쓰지 않고 이탈하는 결정적 병목과 기대 불일치 파악',
    focus: 'interview' as TemplateFocus,
  },
  {
    label: '가격·유료 전환',
    purpose: '유료 요금제 도입 전 적정 가격 수용 범위와 무료에서 유료로 전환하게 만드는 핵심 조건 확인',
    focus: 'both' as TemplateFocus,
  },
  {
    label: '대상자 사전 스크리닝',
    purpose: '심층 인터뷰 대상자 모집 전 최근 행동 빈도와 역할 기준으로 핵심 타겟 응답자를 선별',
    focus: 'survey' as TemplateFocus,
  },
];

const FOCUS_OPTIONS: Array<{ value: TemplateFocus; label: string; hint: string }> = [
  { value: 'both', label: '인터뷰 + 설문 모두', hint: '심층 인터뷰와 정량 설문을 함께 설계' },
  { value: 'interview', label: '인터뷰 질문지 중심', hint: '과거 경험·행동을 파고드는 인터뷰 중심' },
  { value: 'survey', label: '설문 항목 중심', hint: '객관식·척도·서술형이 균형 잡힌 설문 중심' },
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
        `"${created.title}" 질문 템플릿을 생성해 라이브러리에 저장했어요. (인터뷰 ${created.interview.length}문항 · 설문 ${created.survey.length}문항)`,
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
      `상황: ${t.situation}`,
      `주의할 점: ${t.cautionTip}`,
      '',
      ...t.interview.map(
        (item, idx) => `${idx + 1}. [${item.stage}] ${item.prompt}\n   - 확인 포인트: ${item.purpose}`,
      ),
    ].join('\n');
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

  const inputClass =
    'w-full rounded-lg border border-[#dfdce9] bg-white px-3 py-2 text-sm text-[#22213a] hover:border-[#b9b0da] focus:border-[#5b3df5] focus:outline-none';

  return (
    <div className="grid gap-5">
      {/* Page Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-[#22213a]">
            질문 템플릿 생성기 · 라이브러리
          </h1>
          <p className="mt-1 text-[13px] text-[#62627a]">
            리서치 목적을 입력하면 AI가 맞춤형 인터뷰 질문지와 설문 항목을 추천해 드려요.
          </p>
        </div>

        <Link
          to={`/?view=surveys&new=1&template=preset:${selected.id}`}
          className="inline-flex min-h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg bg-[#5b3df5] px-4 text-sm font-semibold text-white hover:bg-[#4b2ee0]"
        >
          <ClipboardList size={15} aria-hidden="true" />
          선택 템플릿으로 설문 만들기
        </Link>
      </div>

      {/* AI Question Template Generator */}
      <section
        aria-labelledby="template-generator-heading"
        className="grid gap-4 rounded-2xl border border-[#ddd2fc] bg-[#faf7ff] p-5"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#eee8ff] text-[#4d30cf]">
              <Wand2 size={19} aria-hidden="true" />
            </span>
            <div>
              <h2 id="template-generator-heading" className="text-base font-bold text-[#22213a]">
                AI 질문 템플릿 생성기
              </h2>
              <p className="mt-0.5 text-[13px] text-[#595472]">
                지금 확인하고 싶은 리서치 목적을 적으면 인터뷰 흐름과 설문 문항을 목적에 맞게 자동 추천합니다.
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
                  setGenError('');
                }}
                className="min-h-8 shrink-0 whitespace-nowrap rounded-lg border border-[#dfd5fb] bg-white px-2.5 text-xs font-semibold text-[#4d30cf] hover:bg-[#eee8ff] disabled:opacity-50"
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>

        <form onSubmit={handleGenerateTemplate} className="grid gap-3.5">
          <label className="grid gap-1.5 text-[13px] font-semibold text-[#22213a]">
            리서치 목적 (필수)
            <textarea
              rows={2}
              maxLength={500}
              value={purpose}
              disabled={generating}
              onChange={(e) => setPurpose(e.target.value)}
              placeholder="예: 무료 체험 사용자의 유료 구독 전환을 가로막는 이유와 결제 직전 망설임 요소 파악"
              className={`${inputClass} resize-y`}
            />
          </label>

          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_160px]">
            <label className="grid gap-1.5 text-[13px] font-semibold text-[#22213a]">
              대상 고객 · 응답자 (선택)
              <input
                type="text"
                maxLength={200}
                value={audience}
                disabled={generating}
                onChange={(e) => setAudience(e.target.value)}
                placeholder="예: 월 1회 이상 프로젝트 관리를 하는 1인 사업자"
                className={`${inputClass} min-h-10`}
              />
            </label>

            <label className="grid gap-1.5 text-[13px] font-semibold text-[#22213a]">
              제품 · 서비스 맥락 (선택)
              <input
                type="text"
                maxLength={500}
                value={context}
                disabled={generating}
                onChange={(e) => setContext(e.target.value)}
                placeholder="예: 모바일 기반 프리랜서 견적서 및 일정 관리 앱"
                className={`${inputClass} min-h-10`}
              />
            </label>

            <label className="grid gap-1.5 text-[13px] font-semibold text-[#22213a]">
              추천 문항 수
              <select
                value={count}
                disabled={generating}
                onChange={(e) => setCount(Number(e.target.value))}
                className={`${inputClass} min-h-10`}
              >
                <option value={5}>핵심 5문항</option>
                <option value={6}>표준 6문항</option>
                <option value={8}>심층 8문항</option>
              </select>
            </label>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#e8defc] pt-3">
            <div className="grid gap-1">
              <div
                className="flex flex-wrap items-center gap-1 rounded-lg border border-[#dfd5fb] bg-white p-1"
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
                      className={`min-h-8 shrink-0 whitespace-nowrap rounded-md px-3 text-xs font-semibold transition-colors ${
                        active
                          ? 'bg-[#5b3df5] text-white'
                          : 'text-[#54546d] hover:bg-[#f6f3ff] hover:text-[#22213a]'
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
              <span className="text-[11px] text-[#62627a]">
                {FOCUS_OPTIONS.find((o) => o.value === focus)?.hint}
              </span>
            </div>

            <button
              type="submit"
              disabled={generating}
              className="inline-flex min-h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg bg-[#5b3df5] px-5 text-sm font-semibold text-white hover:bg-[#4b2ee0] disabled:opacity-55"
            >
              <Sparkles size={15} aria-hidden="true" />
              {generating ? '목적에 맞는 템플릿 생성 중…' : 'AI 질문 템플릿 생성'}
            </button>
          </div>
        </form>

        {genError && (
          <p
            role="alert"
            className="rounded-lg border border-[#f5c7d0] bg-[#fff3f5] px-3.5 py-2.5 text-[13px] font-medium text-[#9f233f]"
          >
            {genError}
          </p>
        )}

        {statusNotice && (
          <p
            role="status"
            className="rounded-lg border border-[#d6c9fa] bg-[#eee8ff] px-3.5 py-2.5 text-[13px] font-medium text-[#4d30cf]"
          >
            {statusNotice}
          </p>
        )}
      </section>

      {/* Category Filter Bar + Search */}
      <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#e9e7f1] bg-white px-4 py-3">
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
                className={`tnum min-h-9 shrink-0 whitespace-nowrap rounded-lg px-3 text-xs font-semibold transition-colors ${
                  active
                    ? 'bg-[#eee8ff] font-bold text-[#4d30cf]'
                    : 'text-[#54546d] hover:bg-[#f6f4fd] hover:text-[#22213a]'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        <label className="flex min-h-9 w-full items-center gap-2 rounded-lg border border-[#e4e1ec] bg-[#faf9fd] px-3 text-[#62627a] focus-within:border-[#5b3df5] sm:w-64">
          <Search size={15} aria-hidden="true" />
          <input
            type="search"
            aria-label="질문 템플릿 검색"
            placeholder="상황, 목적, 질문 키워드 검색…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full border-0 bg-transparent text-[13px] text-[#22213a] outline-none"
          />
        </label>
      </section>

      {filtered.length === 0 ? (
        <section className="grid justify-items-center gap-2 rounded-2xl border border-[#e9e7f1] bg-white px-5 py-12 text-center">
          <p className="text-sm font-semibold text-[#22213a]">
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
            className="mt-1 inline-flex min-h-9 items-center rounded-lg border border-[#e2deee] bg-white px-3 text-xs font-semibold text-[#4d30cf] hover:bg-[#f7f7fb]"
          >
            전체 템플릿 보기
          </button>
        </section>
      ) : (
        <div className="grid items-start gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
          {/* Left List: Template Catalog */}
          <aside className="overflow-hidden rounded-2xl border border-[#e9e7f1] bg-white" aria-label="상황별 템플릿 목록">
            <div className="border-b border-[#efedf6] px-4 py-3">
              <h2 className="text-xs font-bold tracking-wide text-[#62627a]">
                템플릿 라이브러리 <span className="tnum font-mono text-[#4d30cf]">({filtered.length})</span>
              </h2>
            </div>
            <ul className="divide-y divide-[#efedf6]">
              {filtered.map((t) => {
                const active = t.id === selected.id;
                return (
                  <li key={t.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(t.id)}
                      className={`grid w-full gap-1 px-4 py-3.5 text-left transition-colors ${
                        active ? 'bg-[#f6f3ff]' : 'bg-white hover:bg-[#faf9fd]'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className={`text-sm font-bold leading-snug ${active ? 'text-[#4d30cf]' : 'text-[#22213a]'}`}>
                          {t.title}
                        </span>
                        <span className="shrink-0 pt-0.5 text-[11px] font-semibold text-[#62627a]">
                          {t.isAiGenerated ? `AI 맞춤 · ${t.category}` : t.category}
                        </span>
                      </div>
                      <p className="line-clamp-2 text-xs leading-relaxed text-[#62627a]">{t.situation}</p>
                      <p className="tnum mt-0.5 text-[11px] text-[#7c7894]">
                        인터뷰 {t.interview.length}문항 · 설문 {t.survey.length}문항
                      </p>
                    </button>
                  </li>
                );
              })}
            </ul>
          </aside>

          {/* Right Panel: Selected Template Detail & Quick Actions */}
          <section className="grid min-w-0 gap-4 rounded-2xl border border-[#e9e7f1] bg-white p-5">
            <div className="grid gap-2.5 border-b border-[#efedf6] pb-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="tnum flex flex-wrap items-center gap-2 text-xs text-[#62627a]">
                  {selected.isAiGenerated && (
                    <>
                      <span className="font-bold text-[#4d30cf]">AI 목적 맞춤 생성</span>
                      <span aria-hidden="true">·</span>
                    </>
                  )}
                  <span className="font-bold text-[#4d30cf]">{selected.category}</span>
                  <span aria-hidden="true">·</span>
                  <span>인터뷰 {selected.interview.length}문항</span>
                  <span aria-hidden="true">·</span>
                  <span>설문 {selected.survey.length}문항</span>
                </div>

                {selected.isAiGenerated && (
                  <button
                    type="button"
                    onClick={() => handleDeleteCustom(selected)}
                    className="inline-flex min-h-8 shrink-0 items-center gap-1 whitespace-nowrap rounded-lg border border-[#f2d0d7] bg-white px-2.5 text-xs font-semibold text-[#9f233f] hover:bg-[#fff3f5]"
                  >
                    <Trash2 size={13} aria-hidden="true" />
                    템플릿 삭제
                  </button>
                )}
              </div>

              <h2 className="font-display text-xl font-extrabold tracking-tight text-[#22213a]">{selected.title}</h2>
              {selected.purposeInput && (
                <p className="text-xs leading-relaxed text-[#4d30cf]">
                  <b className="font-bold">입력한 리서치 목적:</b> {selected.purposeInput}
                  {selected.audienceInput ? ` · 대상: ${selected.audienceInput}` : ''}
                </p>
              )}
              <p className="text-[13px] leading-relaxed text-[#22213a]">{selected.whenToUse}</p>
              <p className="rounded-xl border border-[#e8ddfb] bg-[#faf7ff] px-3.5 py-2.5 text-xs leading-relaxed text-[#4d30cf]">
                <b className="font-bold">리서치 설계 팁:</b> {selected.cautionTip}
              </p>

              {/* Direct Application Actions */}
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <Link
                  to={`/?view=surveys&new=1&template=preset:${selected.id}`}
                  className="inline-flex min-h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg bg-[#5b3df5] px-4 text-xs font-semibold text-white hover:bg-[#4b2ee0]"
                >
                  <ClipboardList size={14} aria-hidden="true" />
                  이 템플릿으로 설문 만들기
                  <ArrowRight size={14} aria-hidden="true" />
                </Link>
                <button
                  type="button"
                  onClick={saveAllSelectedToVault}
                  className="inline-flex min-h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-[#d8cef7] bg-[#faf7ff] px-3.5 text-xs font-semibold text-[#4d30cf] hover:bg-[#eee8ff]"
                >
                  <BookmarkPlus size={14} aria-hidden="true" />
                  전체 질문함에 저장
                </button>
                <button
                  type="button"
                  onClick={() => onUseInGuide(selected, 'generate')}
                  className="inline-flex min-h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-[#e2deee] bg-white px-3.5 text-xs font-semibold text-[#22213a] hover:bg-[#f7f7fb]"
                >
                  <Sparkles size={14} className="text-[#5b3df5]" aria-hidden="true" />
                  리서치 가이드 AI 맞춤화
                </button>
                <button
                  type="button"
                  onClick={() => onUseInGuide(selected, 'analyze')}
                  className="inline-flex min-h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-[#e2deee] bg-white px-3.5 text-xs font-semibold text-[#22213a] hover:bg-[#f7f7fb]"
                >
                  <BookOpen size={14} aria-hidden="true" />
                  질문·메모 분석기에 넣기
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const file = exportResearchTemplateCsv(selected);
                    setStatusNotice(`"${selected.title}" 템플릿을 CSV(${file})로 다운로드했어요.`);
                  }}
                  className="inline-flex min-h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-[#e2deee] bg-white px-3.5 text-xs font-semibold text-[#22213a] hover:bg-[#f7f7fb]"
                >
                  <Download size={14} aria-hidden="true" />
                  CSV 내보내기
                </button>
              </div>
            </div>

            {/* Preview Switcher: Interview vs Survey */}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1 rounded-lg border border-[#e6e3f0] bg-[#faf9fd] p-1" role="tablist">
                <button
                  type="button"
                  role="tab"
                  aria-selected={previewTab === 'interview'}
                  onClick={() => setPreviewTab('interview')}
                  className={`inline-flex min-h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-3 text-xs font-semibold transition-colors ${
                    previewTab === 'interview' ? 'bg-[#5b3df5] text-white' : 'text-[#54546d] hover:text-[#22213a]'
                  }`}
                >
                  <MessageSquareText size={13} aria-hidden="true" />
                  인터뷰 질문 ({selected.interview.length})
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={previewTab === 'survey'}
                  onClick={() => setPreviewTab('survey')}
                  className={`inline-flex min-h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-3 text-xs font-semibold transition-colors ${
                    previewTab === 'survey' ? 'bg-[#5b3df5] text-white' : 'text-[#54546d] hover:text-[#22213a]'
                  }`}
                >
                  <ClipboardList size={13} aria-hidden="true" />
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
                className="inline-flex min-h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-[#e2deee] bg-white px-3 text-xs font-semibold text-[#22213a] hover:bg-[#f7f7fb]"
              >
                {copiedId === `${selected.id}-${previewTab}` ? (
                  <>
                    <Check size={14} className="text-[#14674d]" aria-hidden="true" /> 복사 완료
                  </>
                ) : (
                  <>
                    <Copy size={14} aria-hidden="true" />
                    {previewTab === 'interview' ? '인터뷰 질문 전체 복사' : '설문 문항 전체 복사'}
                  </>
                )}
              </button>
            </div>

            {previewTab === 'interview' ? (
              <ol className="grid divide-y divide-[#efedf6] rounded-xl border border-[#efedf6]">
                {selected.interview.map((item, idx) => {
                  const rowKey = `${selected.id}-q-${idx}`;
                  const inVault = vaultTextSet.has(item.prompt.trim());
                  return (
                    <li key={idx} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3.5">
                      <div className="min-w-0 flex-1">
                        <div className="tnum text-xs font-bold text-[#4d30cf]">{item.stage}</div>
                        <p className="mt-1 text-sm font-medium leading-relaxed text-[#22213a]">{item.prompt}</p>
                        <p className="mt-1 text-xs text-[#62627a]">확인 포인트: {item.purpose}</p>
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
                          className={`inline-flex min-h-8 shrink-0 items-center gap-1 whitespace-nowrap rounded-lg border px-2.5 text-[11px] font-semibold transition-colors ${
                            inVault
                              ? 'border-[#d6c9fa] bg-[#eee8ff] text-[#4d30cf]'
                              : 'border-[#e6e3f0] bg-white text-[#54546d] hover:border-[#cfc1f3] hover:text-[#4d30cf]'
                          }`}
                        >
                          {inVault ? (
                            <>
                              <BookmarkCheck size={12} aria-hidden="true" /> 질문함 저장됨
                            </>
                          ) : (
                            <>
                              <BookmarkPlus size={12} aria-hidden="true" /> 질문함
                            </>
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => void copyText(rowKey, item.prompt)}
                          className="inline-flex min-h-8 shrink-0 items-center gap-1 whitespace-nowrap rounded-lg border border-[#e6e3f0] bg-[#faf9fd] px-2.5 text-[11px] font-semibold text-[#54546d] hover:border-[#cfc1f3] hover:text-[#4d30cf]"
                        >
                          {copiedId === rowKey ? (
                            <>
                              <Check size={12} className="text-[#14674d]" aria-hidden="true" /> 복사됨
                            </>
                          ) : (
                            <>
                              <Copy size={12} aria-hidden="true" /> 복사
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
                <div className="rounded-xl border border-[#efedf6] bg-[#faf9fd] px-4 py-3 text-[13px]">
                  <div className="font-bold text-[#22213a]">{selected.surveyTitle}</div>
                  <p className="mt-1 text-xs leading-relaxed text-[#62627a]">{selected.surveyIntro}</p>
                </div>

                <ol className="grid divide-y divide-[#efedf6] rounded-xl border border-[#efedf6]">
                  {selected.survey.map((q, idx) => {
                    const rowKey = `${selected.id}-sq-${idx}`;
                    const inVault = vaultTextSet.has(q.label.trim());
                    return (
                      <li key={idx} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3.5">
                        <div className="min-w-0 flex-1 grid gap-1">
                          <div className="tnum flex flex-wrap items-center gap-2">
                            <span className="text-sm font-semibold text-[#22213a]">
                              {idx + 1}. {q.label}
                            </span>
                            <span className="text-xs font-medium text-[#62627a]">
                              {types[q.type]} · {q.required ? '필수' : '선택'}
                            </span>
                          </div>
                          {q.options.length > 0 && (
                            <p className="text-xs text-[#62627a]">선택지: {q.options.join(' / ')}</p>
                          )}
                          {q.type === 'scale' && (
                            <p className="text-xs text-[#62627a]">척도: 1(전혀 그렇지 않다) ~ 5(매우 그렇다)</p>
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
                            className={`inline-flex min-h-8 shrink-0 items-center gap-1 whitespace-nowrap rounded-lg border px-2.5 text-[11px] font-semibold transition-colors ${
                              inVault
                                ? 'border-[#d6c9fa] bg-[#eee8ff] text-[#4d30cf]'
                                : 'border-[#e6e3f0] bg-white text-[#54546d] hover:border-[#cfc1f3] hover:text-[#4d30cf]'
                            }`}
                          >
                            {inVault ? (
                              <>
                                <BookmarkCheck size={12} aria-hidden="true" /> 질문함 저장됨
                              </>
                            ) : (
                              <>
                                <BookmarkPlus size={12} aria-hidden="true" /> 질문함
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
                            className="inline-flex min-h-8 shrink-0 items-center gap-1 whitespace-nowrap rounded-lg border border-[#e6e3f0] bg-[#faf9fd] px-2.5 text-[11px] font-semibold text-[#54546d] hover:border-[#cfc1f3] hover:text-[#4d30cf]"
                          >
                            {copiedId === rowKey ? (
                              <>
                                <Check size={12} className="text-[#14674d]" aria-hidden="true" /> 복사됨
                              </>
                            ) : (
                              <>
                                <Copy size={12} aria-hidden="true" /> 복사
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
              <label className="grid gap-1.5 text-xs font-semibold text-[#22213a]">
                아래 내용을 직접 복사해 주세요.
                <textarea
                  rows={5}
                  readOnly
                  value={fallbackCopy}
                  onFocus={(e) => e.currentTarget.select()}
                  className="w-full rounded-lg border border-[#dfdce9] bg-white px-3 py-2 font-mono text-xs text-[#22213a]"
                />
              </label>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
