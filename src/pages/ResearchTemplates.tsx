import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import {
  ArrowRight,
  BookOpen,
  Check,
  ClipboardList,
  Copy,
  MessageSquareText,
  Search,
  Sparkles,
} from 'lucide-react';
import {
  researchTemplates,
  templateCategories,
  type ResearchTemplate,
  type TemplateCategory,
} from '../lib/researchTemplates';
import { types } from '../lib/research';

export function ResearchTemplates({
  onUseInGuide,
}: {
  onUseInGuide: (template: ResearchTemplate, mode: 'generate' | 'analyze') => void;
}) {
  const [category, setCategory] = useState<TemplateCategory>('전체');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState(researchTemplates[0].id);
  const [previewTab, setPreviewTab] = useState<'interview' | 'survey'>('interview');
  const [copiedId, setCopiedId] = useState('');
  const [fallbackCopy, setFallbackCopy] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return researchTemplates.filter((t) => {
      if (category !== '전체' && t.category !== category) return false;
      if (!q) return true;
      const haystack = [
        t.title,
        t.category,
        t.situation,
        t.whenToUse,
        ...t.interview.map((i) => `${i.stage} ${i.prompt} ${i.purpose}`),
        ...t.survey.map((s) => `${s.label} ${s.options.join(' ')}`),
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [category, query]);

  const selected = filtered.find((t) => t.id === selectedId) ?? filtered[0] ?? researchTemplates[0];

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

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-[#22213a]">상황별 리서치 질문 템플릿</h1>
          <p className="mt-1 text-[13px] text-[#62627a]">
            고객 문제 검증부터 가치 제안·가격·이탈 분석까지, 상황별 인터뷰 질문과 설문 문항을 바로 불러와 활용해요.
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

      {/* Category Filter Bar + Search */}
      <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#e9e7f1] bg-white px-4 py-3">
        <div className="flex flex-wrap items-center gap-1" role="tablist" aria-label="템플릿 상황 분류">
          {templateCategories.map((cat) => {
            const active = category === cat;
            return (
              <button
                key={cat}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setCategory(cat)}
                className={`min-h-9 shrink-0 whitespace-nowrap rounded-lg px-3 text-xs font-semibold transition-colors ${
                  active
                    ? 'bg-[#eee8ff] font-bold text-[#4d30cf]'
                    : 'text-[#54546d] hover:bg-[#f6f4fd] hover:text-[#22213a]'
                }`}
              >
                {cat}
              </button>
            );
          })}
        </div>

        <label className="flex min-h-9 w-full items-center gap-2 rounded-lg border border-[#e4e1ec] bg-[#faf9fd] px-3 text-[#62627a] focus-within:border-[#5b3df5] sm:w-64">
          <Search size={15} aria-hidden="true" />
          <input
            type="search"
            aria-label="질문 템플릿 검색"
            placeholder="상황, 질문 키워드 검색…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full border-0 bg-transparent text-[13px] text-[#22213a] outline-none"
          />
        </label>
      </section>

      {filtered.length === 0 ? (
        <section className="grid justify-items-center gap-2 rounded-2xl border border-[#e9e7f1] bg-white px-5 py-12 text-center">
          <p className="text-sm font-semibold text-[#22213a]">검색 조건에 맞는 질문 템플릿이 없어요.</p>
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
                상황별 라이브러리 <span className="tnum font-mono text-[#4d30cf]">({filtered.length})</span>
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
                      <div className="flex items-center justify-between gap-2">
                        <span className={`text-sm font-bold ${active ? 'text-[#4d30cf]' : 'text-[#22213a]'}`}>
                          {t.title}
                        </span>
                        <span className="shrink-0 text-[11px] font-semibold text-[#62627a]">{t.category}</span>
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
            <div className="grid gap-2 border-b border-[#efedf6] pb-4">
              <div className="tnum flex flex-wrap items-center gap-2 text-xs text-[#62627a]">
                <span className="font-bold text-[#4d30cf]">{selected.category}</span>
                <span aria-hidden="true">·</span>
                <span>인터뷰 {selected.interview.length}문항</span>
                <span aria-hidden="true">·</span>
                <span>설문 {selected.survey.length}문항</span>
              </div>
              <h2 className="font-display text-xl font-extrabold tracking-tight text-[#22213a]">{selected.title}</h2>
              <p className="text-[13px] text-[#22213a]">{selected.whenToUse}</p>
              <p className="rounded-xl border border-[#e8ddfb] bg-[#faf7ff] px-3.5 py-2.5 text-xs leading-relaxed text-[#4d30cf]">
                <b className="font-bold">인터뷰 핵심 팁:</b> {selected.cautionTip}
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
                  onClick={() => onUseInGuide(selected, 'generate')}
                  className="inline-flex min-h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-[#d8cef7] bg-[#faf7ff] px-3.5 text-xs font-semibold text-[#4d30cf] hover:bg-[#eee8ff]"
                >
                  <Sparkles size={14} aria-hidden="true" />
                  내 아이템에 맞게 AI 맞춤화
                </button>
                <button
                  type="button"
                  onClick={() => onUseInGuide(selected, 'analyze')}
                  className="inline-flex min-h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-[#e2deee] bg-white px-3.5 text-xs font-semibold text-[#22213a] hover:bg-[#f7f7fb]"
                >
                  <BookOpen size={14} aria-hidden="true" />
                  질문·메모 분석기에 불러오기
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
                  className={`inline-flex min-h-8 items-center gap-1.5 whitespace-nowrap rounded-md px-3 text-xs font-semibold transition-colors ${
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
                  className={`inline-flex min-h-8 items-center gap-1.5 whitespace-nowrap rounded-md px-3 text-xs font-semibold transition-colors ${
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
                  return (
                    <li key={idx} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3.5">
                      <div className="min-w-0 flex-1">
                        <div className="tnum text-xs font-bold text-[#4d30cf]">{item.stage}</div>
                        <p className="mt-1 text-sm font-medium leading-relaxed text-[#22213a]">{item.prompt}</p>
                        <p className="mt-1 text-xs text-[#62627a]">확인 포인트: {item.purpose}</p>
                      </div>
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
                            <Copy size={12} aria-hidden="true" /> 질문 복사
                          </>
                        )}
                      </button>
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
                  {selected.survey.map((q, idx) => (
                    <li key={idx} className="grid gap-1 px-4 py-3.5">
                      <div className="tnum flex flex-wrap items-center justify-between gap-2">
                        <span className="text-sm font-semibold text-[#22213a]">
                          {idx + 1}. {q.label}
                        </span>
                        <span className="shrink-0 text-xs font-medium text-[#62627a]">
                          {types[q.type]} · {q.required ? '필수' : '선택'}
                        </span>
                      </div>
                      {q.options.length > 0 && (
                        <p className="text-xs text-[#62627a]">선택지: {q.options.join(' / ')}</p>
                      )}
                      {q.type === 'scale' && (
                        <p className="text-xs text-[#62627a]">척도: 1(전혀 그렇지 않다) ~ 5(매우 그렇다)</p>
                      )}
                    </li>
                  ))}
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
