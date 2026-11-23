import { useMemo, useState, type FormEvent } from 'react';
import {
  ArrowRight,
  BookmarkCheck,
  Check,
  ClipboardList,
  Copy,
  FolderPlus,
  Layers,
  Plus,
  Search,
  Star,
  Trash2,
} from 'lucide-react';
import {
  useQuestionVault,
  type ResearchRoutine,
  type VaultQuestion,
  type VaultQuestionKind,
} from '../lib/questionVault';

export function MyQuestionVault({
  onApplyQuestions,
  onCreateSurvey,
}: {
  onApplyQuestions: (questionsText: string, mode: 'generate' | 'analyze', itemTopic?: string) => void;
  onCreateSurvey: (routineName: string, questions: Array<{ label: string; kind: VaultQuestionKind; options?: string[] }>) => void;
}) {
  const vault = useQuestionVault();
  const [subTab, setSubTab] = useState<'questions' | 'routines'>('questions');
  const [filter, setFilter] = useState<'all' | 'favorite' | 'interview' | 'survey'>('all');
  const [search, setSearch] = useState('');
  const [copiedId, setCopiedId] = useState('');
  const [notice, setNotice] = useState('');

  // Add individual question form
  const [showAddQuestion, setShowAddQuestion] = useState(false);
  const [newText, setNewText] = useState('');
  const [newKind, setNewKind] = useState<VaultQuestionKind>('interview');
  const [newTopic, setNewTopic] = useState('');
  const [newFav, setNewFav] = useState(true);

  // Add routine form
  const [showAddRoutine, setShowAddRoutine] = useState(false);
  const [routineName, setRoutineName] = useState('');
  const [routineDesc, setRoutineDesc] = useState('');
  const [routineLines, setRoutineLines] = useState('');

  // Quick assign question to routine
  const [assigningId, setAssigningId] = useState('');

  const favoriteQuestions = useMemo(
    () => vault.questions.filter((q) => q.favorite),
    [vault.questions],
  );

  const filteredQuestions = useMemo(() => {
    const q = search.trim().toLowerCase();
    return [...vault.questions]
      .sort((a, b) => Number(b.favorite) - Number(a.favorite))
      .filter((item) => {
        if (filter === 'favorite' && !item.favorite) return false;
        if (filter === 'interview' && item.kind !== 'interview') return false;
        if (filter === 'survey' && item.kind !== 'survey') return false;
        if (!q) return true;
        return `${item.text} ${item.itemTopic} ${item.stageOrType} ${item.purpose ?? ''}`
          .toLowerCase()
          .includes(q);
      });
  }, [vault.questions, filter, search]);

  const filteredRoutines = useMemo(() => {
    const q = search.trim().toLowerCase();
    return [...vault.routines]
      .sort((a, b) => Number(b.favorite) - Number(a.favorite))
      .filter((r) => {
        if (!q) return true;
        return `${r.name} ${r.description} ${r.steps.map((s) => s.text).join(' ')}`
          .toLowerCase()
          .includes(q);
      });
  }, [vault.routines, search]);

  async function copyText(id: string, text: string, onSuccess?: () => void) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      onSuccess?.();
      setTimeout(() => setCopiedId((curr) => (curr === id ? '' : curr)), 1800);
    } catch {
      setNotice('클립보드 복사가 제한된 환경이에요. 질문을 불러와 직접 복사해 주세요.');
    }
  }

  function handleAddQuestion(e: FormEvent) {
    e.preventDefault();
    if (newText.trim().length < 2) return;
    vault.addQuestion({
      text: newText,
      kind: newKind,
      itemTopic: newTopic || '나의 질문',
      favorite: newFav,
    });
    setNewText('');
    setNewTopic('');
    setShowAddQuestion(false);
    setNotice('질문을 나의 질문함에 저장했어요.');
  }

  function handleAddRoutine(e: FormEvent) {
    e.preventDefault();
    const lines = routineLines
      .split('\n')
      .map((l) => l.trim().replace(/^\d+[.)]\s*/, ''))
      .filter(Boolean);
    if (!routineName.trim() || lines.length === 0) return;
    vault.addRoutine({
      name: routineName,
      description: routineDesc,
      favorite: true,
      steps: lines.map((text, idx) => ({
        text,
        kind: 'interview',
        stage: `${idx + 1}. 단계`,
      })),
    });
    setRoutineName('');
    setRoutineDesc('');
    setRoutineLines('');
    setShowAddRoutine(false);
    setNotice('자주 사용하는 리서치 루틴을 저장했어요.');
  }

  function saveFavoritesAsRoutine() {
    if (!favoriteQuestions.length) return;
    const now = new Date();
    const label = `즐겨찾는 검증 루틴 (${now.getMonth() + 1}/${now.getDate()})`;
    vault.addRoutine({
      name: label,
      description: `즐겨찾기한 질문 ${favoriteQuestions.length}개로 구성한 리서치 루틴`,
      favorite: true,
      steps: favoriteQuestions.map((q) => ({
        text: q.text,
        kind: q.kind,
        stage: q.stageOrType,
        purpose: q.purpose,
      })),
    });
    setSubTab('routines');
    setNotice(`즐겨찾는 질문 ${favoriteQuestions.length}개를 새 리서치 루틴으로 저장했어요.`);
  }

  function runRoutineInAnalyzer(routine: ResearchRoutine) {
    vault.incrementRoutineUse(routine.id);
    const text = routine.steps.map((s, idx) => `${idx + 1}. ${s.text}`).join('\n');
    onApplyQuestions(text, 'analyze');
  }

  const inputClass =
    'w-full rounded-lg border border-[#dfdce9] bg-white px-3 py-2 text-sm font-normal text-[#22213a] hover:border-[#b9b0da] focus:border-[#5b3df5]';

  return (
    <div className="grid gap-4">
      {/* Header & Sub-tab Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#e8ddfb] bg-white px-4 py-3">
        <div className="flex items-center gap-1 rounded-lg border border-[#e6e3f0] bg-[#faf9fd] p-1" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={subTab === 'questions'}
            onClick={() => setSubTab('questions')}
            className={`inline-flex min-h-8 items-center gap-1.5 whitespace-nowrap rounded-md px-3 text-xs font-semibold transition-colors ${
              subTab === 'questions' ? 'bg-[#5b3df5] text-white' : 'text-[#54546d] hover:text-[#22213a]'
            }`}
          >
            <BookmarkCheck size={14} aria-hidden="true" />
            저장된 질문 <span className="tnum font-mono">({vault.questions.length})</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={subTab === 'routines'}
            onClick={() => setSubTab('routines')}
            className={`inline-flex min-h-8 items-center gap-1.5 whitespace-nowrap rounded-md px-3 text-xs font-semibold transition-colors ${
              subTab === 'routines' ? 'bg-[#5b3df5] text-white' : 'text-[#54546d] hover:text-[#22213a]'
            }`}
          >
            <Layers size={14} aria-hidden="true" />
            리서치 루틴 <span className="tnum font-mono">({vault.routines.length})</span>
          </button>
        </div>

        <label className="flex min-h-9 w-full items-center gap-2 rounded-lg border border-[#e4e1ec] bg-[#faf9fd] px-3 text-[#62627a] focus-within:border-[#5b3df5] sm:w-60">
          <Search size={14} aria-hidden="true" />
          <input
            type="search"
            aria-label="질문함 검색"
            placeholder="질문, 아이템, 루틴 검색…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full border-0 bg-transparent text-xs text-[#22213a] outline-none"
          />
        </label>
      </div>

      {notice && (
        <p className="rounded-lg bg-[#eee9ff] px-3 py-2 text-xs font-medium text-[#4d30cf]" role="status">
          {notice}
        </p>
      )}

      {subTab === 'questions' ? (
        <div className="grid gap-3">
          {/* Filter + Quick Actions */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1" role="tablist" aria-label="질문 분류 필터">
              {(
                [
                  ['all', `전체 (${vault.questions.length})`],
                  ['favorite', `★ 즐겨찾기 (${favoriteQuestions.length})`],
                  ['interview', '인터뷰'],
                  ['survey', '설문'],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={filter === key}
                  onClick={() => setFilter(key)}
                  className={`min-h-8 whitespace-nowrap rounded-lg border px-2.5 text-xs font-semibold transition-colors ${
                    filter === key
                      ? 'border-[#5b3df5] bg-[#eee8ff] text-[#4d30cf]'
                      : 'border-[#e6e3f0] bg-white text-[#54546d] hover:border-[#cfc1f3]'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {favoriteQuestions.length > 0 && (
                <button
                  type="button"
                  onClick={saveFavoritesAsRoutine}
                  className="inline-flex min-h-8 shrink-0 items-center gap-1 whitespace-nowrap rounded-lg border border-[#d8cef7] bg-white px-2.5 text-xs font-semibold text-[#4d30cf] hover:bg-[#f5f1ff]"
                >
                  <FolderPlus size={13} aria-hidden="true" /> 즐겨찾기 → 루틴 묶기
                </button>
              )}
              <button
                type="button"
                onClick={() => setShowAddQuestion((v) => !v)}
                className="inline-flex min-h-8 shrink-0 items-center gap-1 whitespace-nowrap rounded-lg bg-[#5b3df5] px-3 text-xs font-semibold text-white hover:bg-[#4b2ee0]"
              >
                <Plus size={13} aria-hidden="true" /> 질문 직접 추가
              </button>
            </div>
          </div>

          {showAddQuestion && (
            <form
              onSubmit={handleAddQuestion}
              className="grid gap-2.5 rounded-xl border border-[#d8cef7] bg-white p-3.5"
            >
              <div className="grid gap-2 sm:grid-cols-[130px_minmax(0,1fr)]">
                <label className="grid gap-1 text-xs font-semibold text-[#22213a]">
                  유형
                  <select
                    value={newKind}
                    onChange={(e) => setNewKind(e.target.value as VaultQuestionKind)}
                    className={inputClass}
                  >
                    <option value="interview">인터뷰 질문</option>
                    <option value="survey">설문 문항</option>
                  </select>
                </label>
                <label className="grid gap-1 text-xs font-semibold text-[#22213a]">
                  주제 / 태그 (선택)
                  <input
                    value={newTopic}
                    onChange={(e) => setNewTopic(e.target.value)}
                    placeholder="예: 가격 검증, 온보딩 인터뷰"
                    className={inputClass}
                  />
                </label>
              </div>
              <label className="grid gap-1 text-xs font-semibold text-[#22213a]">
                질문 내용 *
                <textarea
                  rows={2}
                  required
                  value={newText}
                  onChange={(e) => setNewText(e.target.value)}
                  placeholder="자주 묻거나 즐겨찾기할 리서치 질문을 입력하세요."
                  className={`${inputClass} resize-y`}
                />
              </label>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="flex items-center gap-1.5 text-xs font-medium text-[#22213a]">
                  <input
                    type="checkbox"
                    checked={newFav}
                    onChange={(e) => setNewFav(e.target.checked)}
                    className="size-4 accent-[#5b3df5]"
                  />
                  즐겨찾기에 바로 추가
                </label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowAddQuestion(false)}
                    className="min-h-8 rounded-lg border border-[#e2deee] bg-white px-3 text-xs font-semibold text-[#22213a]"
                  >
                    취소
                  </button>
                  <button
                    type="submit"
                    className="min-h-8 rounded-lg bg-[#5b3df5] px-3 text-xs font-semibold text-white hover:bg-[#4b2ee0]"
                  >
                    저장하기
                  </button>
                </div>
              </div>
            </form>
          )}

          {filteredQuestions.length === 0 ? (
            <div className="grid justify-items-center gap-2 rounded-xl border border-dashed border-[#d8d3ea] bg-white px-5 py-10 text-center">
              <p className="text-sm font-semibold text-[#22213a]">
                {vault.questions.length === 0
                  ? '아직 저장된 질문이 없어요'
                  : '선택한 조건에 맞는 질문이 없어요'}
              </p>
              <p className="max-w-md text-xs text-[#62627a]">
                {vault.questions.length === 0
                  ? '리서치 가이드에서 아이템을 입력해 질문을 생성하면 자동으로 로컬 스토리지에 보관되고, 마음에 드는 질문을 ★ 즐겨찾기로 관리할 수 있어요.'
                  : '검색어나 필터를 변경해 저장된 다른 질문을 확인해 보세요.'}
              </p>
            </div>
          ) : (
            <ul className="grid divide-y divide-[#efedf6] rounded-xl border border-[#e8ddfb] bg-white">
              {filteredQuestions.map((q: VaultQuestion) => (
                <li key={q.id} className="grid gap-2 px-4 py-3.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-2.5">
                      <button
                        type="button"
                        aria-label={q.favorite ? '즐겨찾기 해제' : '즐겨찾기 추가'}
                        onClick={() => vault.toggleQuestionFavorite(q.id)}
                        className={`mt-0.5 grid size-7 shrink-0 place-items-center rounded-md border transition-colors ${
                          q.favorite
                            ? 'border-[#f4d7ad] bg-[#fff7ea] text-[#d97724]'
                            : 'border-[#ece9f5] bg-white text-[#8a86a0] hover:border-[#cfc1f3] hover:text-[#d97724]'
                        }`}
                      >
                        <Star size={14} fill={q.favorite ? 'currentColor' : 'none'} aria-hidden="true" />
                      </button>
                      <div className="min-w-0">
                        <p className="text-[13px] font-semibold leading-relaxed text-[#22213a]">{q.text}</p>
                        <p className="tnum mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-[#62627a]">
                          <span className="font-bold text-[#4d30cf]">
                            {q.kind === 'interview' ? '인터뷰' : '설문'}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span>{q.itemTopic}</span>
                          <span aria-hidden="true">·</span>
                          <span>{q.stageOrType}</span>
                          {q.useCount > 0 && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span>활용 {q.useCount}회</span>
                            </>
                          )}
                        </p>
                        {q.purpose && <p className="mt-1 text-xs text-[#62627a]">확인 포인트: {q.purpose}</p>}
                        {q.options && q.options.length > 0 && (
                          <p className="mt-1 text-xs text-[#62627a]">선택지: {q.options.join(' / ')}</p>
                        )}
                      </div>
                    </div>

                    <button
                      type="button"
                      aria-label="저장된 질문 삭제"
                      onClick={() => vault.removeQuestion(q.id)}
                      className="grid size-7 shrink-0 place-items-center rounded-md text-[#8a86a0] hover:bg-[#fff0f3] hover:text-[#a6214e]"
                    >
                      <Trash2 size={14} aria-hidden="true" />
                    </button>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 pl-9">
                    <button
                      type="button"
                      onClick={() => {
                        vault.incrementQuestionUse(q.id);
                        onApplyQuestions(q.text, 'analyze', q.itemTopic);
                      }}
                      className="inline-flex min-h-7 items-center gap-1 rounded-md border border-[#d8cef7] bg-[#faf7ff] px-2.5 text-[11px] font-semibold text-[#4d30cf] hover:bg-[#eee8ff]"
                    >
                      분석기에 넣기
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        void copyText(q.id, q.text, () => vault.incrementQuestionUse(q.id));
                      }}
                      className="inline-flex min-h-7 items-center gap-1 rounded-md border border-[#e6e3f0] bg-white px-2.5 text-[11px] font-semibold text-[#22213a] hover:bg-[#f7f7fb]"
                    >
                      {copiedId === q.id ? (
                        <>
                          <Check size={12} className="text-[#14674d]" aria-hidden="true" /> 복사됨
                        </>
                      ) : (
                        <>
                          <Copy size={12} aria-hidden="true" /> 복사
                        </>
                      )}
                    </button>

                    {vault.routines.length > 0 && (
                      assigningId === q.id ? (
                        <select
                          aria-label="추가할 루틴 선택"
                          value=""
                          onChange={(e) => {
                            const rId = e.target.value;
                            if (!rId) return;
                            vault.appendStepToRoutine(rId, {
                              text: q.text,
                              kind: q.kind,
                              stage: q.stageOrType,
                              purpose: q.purpose,
                            });
                            setAssigningId('');
                            setNotice('선택한 리서치 루틴에 질문을 추가했어요.');
                          }}
                          onBlur={() => setAssigningId('')}
                          autoFocus
                          className="min-h-7 rounded-md border border-[#5b3df5] bg-white px-2 text-[11px] text-[#22213a]"
                        >
                          <option value="">루틴 선택…</option>
                          {vault.routines.map((r) => (
                            <option key={r.id} value={r.id}>
                              {r.name}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setAssigningId(q.id)}
                          className="inline-flex min-h-7 items-center gap-1 rounded-md border border-[#e6e3f0] bg-white px-2.5 text-[11px] font-semibold text-[#54546d] hover:border-[#cfc1f3] hover:text-[#4d30cf]"
                        >
                          <FolderPlus size={12} aria-hidden="true" /> 루틴에 추가
                        </button>
                      )
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <div className="grid gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-[#62627a]">
              반복해서 쓰는 인터뷰 질문 흐름이나 검증 세트를 루틴으로 묶어 두고 한 번에 불러와요.
            </p>
            <button
              type="button"
              onClick={() => setShowAddRoutine((v) => !v)}
              className="inline-flex min-h-8 shrink-0 items-center gap-1 whitespace-nowrap rounded-lg bg-[#5b3df5] px-3 text-xs font-semibold text-white hover:bg-[#4b2ee0]"
            >
              <Plus size={13} aria-hidden="true" /> 새 리서치 루틴 만들기
            </button>
          </div>

          {showAddRoutine && (
            <form
              onSubmit={handleAddRoutine}
              className="grid gap-2.5 rounded-xl border border-[#d8cef7] bg-white p-3.5"
            >
              <label className="grid gap-1 text-xs font-semibold text-[#22213a]">
                루틴 이름 *
                <input
                  required
                  value={routineName}
                  onChange={(e) => setRoutineName(e.target.value)}
                  placeholder="예: B2B 초기 고객 15분 검증 루틴"
                  className={inputClass}
                />
              </label>
              <label className="grid gap-1 text-xs font-semibold text-[#22213a]">
                루틴 설명 (선택)
                <input
                  value={routineDesc}
                  onChange={(e) => setRoutineDesc(e.target.value)}
                  placeholder="예: 문제 빈도 → 기존 대안 → 예산 확인 순으로 진행"
                  className={inputClass}
                />
              </label>
              <div className="grid gap-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-[#22213a]">포함할 질문 목록 * (줄바꿈 구분)</span>
                  {favoriteQuestions.length > 0 && (
                    <button
                      type="button"
                      onClick={() =>
                        setRoutineLines(favoriteQuestions.map((q, idx) => `${idx + 1}. ${q.text}`).join('\n'))
                      }
                      className="text-[11px] font-bold text-[#5b3df5] hover:underline"
                    >
                      ★ 즐겨찾는 질문 {favoriteQuestions.length}개 불러오기
                    </button>
                  )}
                </div>
                <textarea
                  rows={4}
                  required
                  value={routineLines}
                  onChange={(e) => setRoutineLines(e.target.value)}
                  placeholder="1. 최근 2주간 이 문제를 겪은 가장 구체적인 순간은 언제였나요?&#10;2. 그때 어떤 방법으로 해결하셨나요?"
                  className={`${inputClass} resize-y`}
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddRoutine(false)}
                  className="min-h-8 rounded-lg border border-[#e2deee] bg-white px-3 text-xs font-semibold text-[#22213a]"
                >
                  취소
                </button>
                <button
                  type="submit"
                  className="min-h-8 rounded-lg bg-[#5b3df5] px-3 text-xs font-semibold text-white hover:bg-[#4b2ee0]"
                >
                  루틴 저장
                </button>
              </div>
            </form>
          )}

          {filteredRoutines.length === 0 ? (
            <div className="grid justify-items-center gap-2 rounded-xl border border-dashed border-[#d8d3ea] bg-white px-5 py-10 text-center">
              <p className="text-sm font-semibold text-[#22213a]">저장된 리서치 루틴이 없어요</p>
              <p className="max-w-md text-xs text-[#62627a]">
                리서치 가이드에서 생성한 질문 세트를 "루틴으로 저장"하거나, 위 버튼으로 나만의 검증 루틴을 만들어 보세요.
              </p>
            </div>
          ) : (
            <ul className="grid gap-2.5">
              {filteredRoutines.map((routine) => (
                <li key={routine.id} className="grid gap-2.5 rounded-xl border border-[#e8ddfb] bg-white p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 items-start gap-2.5">
                      <button
                        type="button"
                        aria-label={routine.favorite ? '루틴 즐겨찾기 해제' : '루틴 즐겨찾기 추가'}
                        onClick={() => vault.toggleRoutineFavorite(routine.id)}
                        className={`mt-0.5 grid size-7 shrink-0 place-items-center rounded-md border transition-colors ${
                          routine.favorite
                            ? 'border-[#f4d7ad] bg-[#fff7ea] text-[#d97724]'
                            : 'border-[#ece9f5] bg-white text-[#8a86a0] hover:border-[#cfc1f3] hover:text-[#d97724]'
                        }`}
                      >
                        <Star size={14} fill={routine.favorite ? 'currentColor' : 'none'} aria-hidden="true" />
                      </button>
                      <div className="min-w-0">
                        <h4 className="text-sm font-bold text-[#22213a]">{routine.name}</h4>
                        <p className="tnum text-[11px] text-[#62627a]">
                          {routine.steps.length}문항 · 실행 {routine.useCount}회 · 업데이트{' '}
                          {routine.updatedAt.slice(0, 10)}
                        </p>
                        {routine.description && (
                          <p className="mt-1 text-xs text-[#54546d]">{routine.description}</p>
                        )}
                      </div>
                    </div>

                    <button
                      type="button"
                      aria-label="루틴 삭제"
                      onClick={() => vault.removeRoutine(routine.id)}
                      className="grid size-7 shrink-0 place-items-center rounded-md text-[#8a86a0] hover:bg-[#fff0f3] hover:text-[#a6214e]"
                    >
                      <Trash2 size={14} aria-hidden="true" />
                    </button>
                  </div>

                  <ol className="grid gap-1 rounded-lg bg-[#faf9fd] px-3 py-2.5 text-xs text-[#22213a]">
                    {routine.steps.map((s, idx) => (
                      <li key={idx} className="tnum leading-relaxed">
                        <span className="mr-1.5 font-mono font-semibold text-[#4d30cf]">{idx + 1}.</span>
                        {s.text}
                      </li>
                    ))}
                  </ol>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => runRoutineInAnalyzer(routine)}
                      className="inline-flex min-h-8 items-center gap-1 rounded-lg bg-[#5b3df5] px-3 text-xs font-semibold text-white hover:bg-[#4b2ee0]"
                    >
                      분석기에서 실행 <ArrowRight size={13} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        vault.incrementRoutineUse(routine.id);
                        onCreateSurvey(
                          routine.name,
                          routine.steps.map((s) => ({ label: s.text, kind: s.kind })),
                        );
                      }}
                      className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-[#d8cef7] bg-[#faf7ff] px-3 text-xs font-semibold text-[#4d30cf] hover:bg-[#eee8ff]"
                    >
                      <ClipboardList size={13} aria-hidden="true" /> 설문으로 만들기
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        void copyText(
                          routine.id,
                          `[${routine.name}]\n` + routine.steps.map((s, idx) => `${idx + 1}. ${s.text}`).join('\n'),
                          () => vault.incrementRoutineUse(routine.id),
                        )
                      }
                      className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-[#e2deee] bg-white px-3 text-xs font-semibold text-[#22213a] hover:bg-[#f7f7fb]"
                    >
                      {copiedId === routine.id ? (
                        <>
                          <Check size={13} className="text-[#14674d]" aria-hidden="true" /> 복사됨
                        </>
                      ) : (
                        <>
                          <Copy size={13} aria-hidden="true" /> 루틴 복사
                        </>
                      )}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
