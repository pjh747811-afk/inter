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
import { saasUi } from './ResearchUI';

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

  return (
    <div className="grid gap-4">
      {/* Header & Sub-tab Switcher */}
      <div className={`${saasUi.card} flex flex-wrap items-center justify-between gap-3 px-4 py-3.5`}>
        <div className="flex items-center gap-1 rounded-xl border border-[#e6e3f0] bg-[#faf9fd] p-1" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={subTab === 'questions'}
            onClick={() => setSubTab('questions')}
            className={`inline-flex min-h-10 items-center gap-1.5 whitespace-nowrap rounded-lg px-3.5 text-[14px] font-semibold transition-colors ${
              subTab === 'questions' ? 'bg-[#4c2ee6] text-white' : 'text-[#44435c] hover:text-[#17162b]'
            }`}
          >
            <BookmarkCheck size={15} aria-hidden="true" />
            저장된 질문 <span className="tnum font-mono">({vault.questions.length})</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={subTab === 'routines'}
            onClick={() => setSubTab('routines')}
            className={`inline-flex min-h-10 items-center gap-1.5 whitespace-nowrap rounded-lg px-3.5 text-[14px] font-semibold transition-colors ${
              subTab === 'routines' ? 'bg-[#4c2ee6] text-white' : 'text-[#44435c] hover:text-[#17162b]'
            }`}
          >
            <Layers size={15} aria-hidden="true" />
            리서치 루틴 <span className="tnum font-mono">({vault.routines.length})</span>
          </button>
        </div>

        <label className="flex min-h-10 w-full items-center gap-2 rounded-xl border border-[#dcd8e8] bg-[#faf9fd] px-3.5 text-[#565570] focus-within:border-[#4c2ee6] sm:w-64">
          <Search size={15} aria-hidden="true" />
          <input
            type="search"
            aria-label="질문함 검색"
            placeholder="질문, 아이템, 루틴 검색…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full border-0 bg-transparent text-[14px] text-[#17162b] placeholder:text-[#7c7a94] outline-none"
          />
        </label>
      </div>

      {notice && (
        <p className="rounded-xl bg-[#efeaff] px-4 py-2.5 text-[14px] font-semibold text-[#4125cc]" role="status">
          {notice}
        </p>
      )}

      {subTab === 'questions' ? (
        <div className="grid gap-3.5">
          {/* Filter + Quick Actions */}
          <div className="flex flex-wrap items-center justify-between gap-2.5">
            <div className="flex flex-wrap items-center gap-1.5" role="tablist" aria-label="질문 분류 필터">
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
                  className={`min-h-9 whitespace-nowrap rounded-xl border px-3 text-[14px] font-semibold transition-colors ${
                    filter === key
                      ? 'border-[#4c2ee6] bg-[#efeaff] text-[#4125cc]'
                      : 'border-[#dcd8e8] bg-white text-[#44435c] hover:border-[#b9b1d4]'
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
                  className={saasUi.btnCompactSoft}
                >
                  <FolderPlus size={14} aria-hidden="true" /> 즐겨찾기 → 루틴 묶기
                </button>
              )}
              <button
                type="button"
                onClick={() => setShowAddQuestion((v) => !v)}
                className={saasUi.btnCompactPrimary}
              >
                <Plus size={14} aria-hidden="true" /> 질문 직접 추가
              </button>
            </div>
          </div>

          {showAddQuestion && (
            <form
              onSubmit={handleAddQuestion}
              className="grid gap-3 rounded-2xl border border-[#d6cbf8] bg-white p-4"
            >
              <div className="grid gap-3 sm:grid-cols-[150px_minmax(0,1fr)]">
                <label className={saasUi.labelText}>
                  유형
                  <select
                    value={newKind}
                    onChange={(e) => setNewKind(e.target.value as VaultQuestionKind)}
                    className={saasUi.input}
                  >
                    <option value="interview">인터뷰 질문</option>
                    <option value="survey">설문 문항</option>
                  </select>
                </label>
                <label className={saasUi.labelText}>
                  주제 / 태그 (선택)
                  <input
                    value={newTopic}
                    onChange={(e) => setNewTopic(e.target.value)}
                    placeholder="예: 가격 검증, 온보딩 인터뷰"
                    className={saasUi.input}
                  />
                </label>
              </div>
              <label className={saasUi.labelText}>
                질문 내용 *
                <textarea
                  rows={2}
                  required
                  value={newText}
                  onChange={(e) => setNewText(e.target.value)}
                  placeholder="자주 묻거나 즐겨찾기할 리서치 질문을 입력하세요."
                  className={`${saasUi.input} resize-y`}
                />
              </label>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="flex items-center gap-2 text-[14px] font-semibold text-[#17162b]">
                  <input
                    type="checkbox"
                    checked={newFav}
                    onChange={(e) => setNewFav(e.target.checked)}
                    className="size-4.5 accent-[#4c2ee6]"
                  />
                  즐겨찾기에 바로 추가
                </label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowAddQuestion(false)}
                    className={saasUi.btnCompactSecondary}
                  >
                    취소
                  </button>
                  <button
                    type="submit"
                    className={saasUi.btnCompactPrimary}
                  >
                    저장하기
                  </button>
                </div>
              </div>
            </form>
          )}

          {filteredQuestions.length === 0 ? (
            <div className="grid justify-items-center gap-2 rounded-2xl border border-dashed border-[#dcd8e8] bg-white px-5 py-10 text-center">
              <p className="text-[16px] font-bold text-[#17162b]">
                {vault.questions.length === 0
                  ? '아직 저장된 질문이 없어요'
                  : '선택한 조건에 맞는 질문이 없어요'}
              </p>
              <p className="max-w-md text-[14px] leading-relaxed text-[#565570]">
                {vault.questions.length === 0
                  ? '리서치 가이드에서 아이템을 입력해 질문을 생성하면 자동으로 로컬 스토리지에 보관되고, 마음에 드는 질문을 ★ 즐겨찾기로 관리할 수 있어요.'
                  : '검색어나 필터를 변경해 저장된 다른 질문을 확인해 보세요.'}
              </p>
            </div>
          ) : (
            <ul className={`${saasUi.card} grid divide-y divide-[#e6e3f0]`}>
              {filteredQuestions.map((q: VaultQuestion) => (
                <li key={q.id} className="grid gap-2.5 px-4 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-3">
                      <button
                        type="button"
                        aria-label={q.favorite ? '즐겨찾기 해제' : '즐겨찾기 추가'}
                        onClick={() => vault.toggleQuestionFavorite(q.id)}
                        className={`mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg border transition-colors ${
                          q.favorite
                            ? 'border-[#f4d7ad] bg-[#fff7ea] text-[#d97724]'
                            : 'border-[#e6e3f0] bg-white text-[#8a86a0] hover:border-[#cfc5f3] hover:text-[#d97724]'
                        }`}
                      >
                        <Star size={15} fill={q.favorite ? 'currentColor' : 'none'} aria-hidden="true" />
                      </button>
                      <div className="min-w-0">
                        <p className="text-[15px] font-semibold leading-relaxed text-[#17162b]">{q.text}</p>
                        <p className="tnum mt-1 flex flex-wrap items-center gap-1.5 text-[13px] text-[#565570]">
                          <span className="font-bold text-[#4125cc]">
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
                        {q.purpose && <p className="mt-1 text-[14px] text-[#565570]">확인 포인트: {q.purpose}</p>}
                        {q.options && q.options.length > 0 && (
                          <p className="mt-1 text-[14px] text-[#565570]">선택지: {q.options.join(' / ')}</p>
                        )}
                      </div>
                    </div>

                    <button
                      type="button"
                      aria-label="저장된 질문 삭제"
                      onClick={() => vault.removeQuestion(q.id)}
                      className="grid size-8 shrink-0 place-items-center rounded-lg text-[#8a86a0] hover:bg-[#fff0f3] hover:text-[#b01e4a]"
                    >
                      <Trash2 size={15} aria-hidden="true" />
                    </button>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 pl-11">
                    <button
                      type="button"
                      onClick={() => {
                        vault.incrementQuestionUse(q.id);
                        onApplyQuestions(q.text, 'analyze', q.itemTopic);
                      }}
                      className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-[#d6cbf8] bg-[#f6f3ff] px-3 text-[13px] font-semibold text-[#4125cc] hover:bg-[#ebe4ff]"
                    >
                      분석기에 넣기
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        void copyText(q.id, q.text, () => vault.incrementQuestionUse(q.id));
                      }}
                      className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-[#dcd8e8] bg-white px-3 text-[13px] font-semibold text-[#17162b] hover:bg-[#faf9fd]"
                    >
                      {copiedId === q.id ? (
                        <>
                          <Check size={13} className="text-[#14674d]" aria-hidden="true" /> 복사됨
                        </>
                      ) : (
                        <>
                          <Copy size={13} aria-hidden="true" /> 복사
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
                          className="min-h-9 rounded-lg border border-[#4c2ee6] bg-white px-2.5 text-[13px] text-[#17162b]"
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
                          className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-[#dcd8e8] bg-white px-3 text-[13px] font-semibold text-[#44435c] hover:border-[#b9b1d4] hover:text-[#4125cc]"
                        >
                          <FolderPlus size={13} aria-hidden="true" /> 루틴에 추가
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
        <div className="grid gap-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2.5">
            <p className="text-[14px] text-[#565570]">
              반복해서 쓰는 인터뷰 질문 흐름이나 검증 세트를 루틴으로 묶어 두고 한 번에 불러와요.
            </p>
            <button
              type="button"
              onClick={() => setShowAddRoutine((v) => !v)}
              className={saasUi.btnCompactPrimary}
            >
              <Plus size={14} aria-hidden="true" /> 새 리서치 루틴 만들기
            </button>
          </div>

          {showAddRoutine && (
            <form
              onSubmit={handleAddRoutine}
              className="grid gap-3 rounded-2xl border border-[#d6cbf8] bg-white p-4"
            >
              <label className={saasUi.labelText}>
                루틴 이름 *
                <input
                  required
                  value={routineName}
                  onChange={(e) => setRoutineName(e.target.value)}
                  placeholder="예: B2B 초기 고객 15분 검증 루틴"
                  className={saasUi.input}
                />
              </label>
              <label className={saasUi.labelText}>
                루틴 설명 (선택)
                <input
                  value={routineDesc}
                  onChange={(e) => setRoutineDesc(e.target.value)}
                  placeholder="예: 문제 빈도 → 기존 대안 → 예산 확인 순으로 진행"
                  className={saasUi.input}
                />
              </label>
              <div className="grid gap-1.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[14px] font-bold text-[#17162b]">포함할 질문 목록 * (줄바꿈 구분)</span>
                  {favoriteQuestions.length > 0 && (
                    <button
                      type="button"
                      onClick={() =>
                        setRoutineLines(favoriteQuestions.map((q, idx) => `${idx + 1}. ${q.text}`).join('\n'))
                      }
                      className="text-[13px] font-bold text-[#4c2ee6] hover:underline"
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
                  className={`${saasUi.input} resize-y`}
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddRoutine(false)}
                  className={saasUi.btnCompactSecondary}
                >
                  취소
                </button>
                <button
                  type="submit"
                  className={saasUi.btnCompactPrimary}
                >
                  루틴 저장
                </button>
              </div>
            </form>
          )}

          {filteredRoutines.length === 0 ? (
            <div className="grid justify-items-center gap-2 rounded-2xl border border-dashed border-[#dcd8e8] bg-white px-5 py-10 text-center">
              <p className="text-[16px] font-bold text-[#17162b]">저장된 리서치 루틴이 없어요</p>
              <p className="max-w-md text-[14px] leading-relaxed text-[#565570]">
                리서치 가이드에서 생성한 질문 세트를 "루틴으로 저장"하거나, 위 버튼으로 나만의 검증 루틴을 만들어 보세요.
              </p>
            </div>
          ) : (
            <ul className="grid gap-3">
              {filteredRoutines.map((routine) => (
                <li key={routine.id} className={`${saasUi.card} grid gap-3 p-4 sm:p-5`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 items-start gap-3">
                      <button
                        type="button"
                        aria-label={routine.favorite ? '루틴 즐겨찾기 해제' : '루틴 즐겨찾기 추가'}
                        onClick={() => vault.toggleRoutineFavorite(routine.id)}
                        className={`mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg border transition-colors ${
                          routine.favorite
                            ? 'border-[#f4d7ad] bg-[#fff7ea] text-[#d97724]'
                            : 'border-[#e6e3f0] bg-white text-[#8a86a0] hover:border-[#cfc5f3] hover:text-[#d97724]'
                        }`}
                      >
                        <Star size={15} fill={routine.favorite ? 'currentColor' : 'none'} aria-hidden="true" />
                      </button>
                      <div className="min-w-0">
                        <h4 className="text-[16px] font-bold text-[#17162b]">{routine.name}</h4>
                        <p className="tnum mt-0.5 text-[13px] text-[#565570]">
                          {routine.steps.length}문항 · 실행 {routine.useCount}회 · 업데이트{' '}
                          {routine.updatedAt.slice(0, 10)}
                        </p>
                        {routine.description && (
                          <p className="mt-1 text-[14px] text-[#44435c]">{routine.description}</p>
                        )}
                      </div>
                    </div>

                    <button
                      type="button"
                      aria-label="루틴 삭제"
                      onClick={() => vault.removeRoutine(routine.id)}
                      className="grid size-8 shrink-0 place-items-center rounded-lg text-[#8a86a0] hover:bg-[#fff0f3] hover:text-[#b01e4a]"
                    >
                      <Trash2 size={15} aria-hidden="true" />
                    </button>
                  </div>

                  <ol className="grid gap-1.5 rounded-xl bg-[#faf9fd] px-3.5 py-3 text-[14px] text-[#17162b]">
                    {routine.steps.map((s, idx) => (
                      <li key={idx} className="tnum leading-relaxed">
                        <span className="mr-1.5 font-mono font-bold text-[#4125cc]">{idx + 1}.</span>
                        {s.text}
                      </li>
                    ))}
                  </ol>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => runRoutineInAnalyzer(routine)}
                      className={saasUi.btnCompactPrimary}
                    >
                      분석기에서 실행 <ArrowRight size={14} aria-hidden="true" />
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
                      className={saasUi.btnCompactSoft}
                    >
                      <ClipboardList size={14} aria-hidden="true" /> 설문으로 만들기
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
                      className={saasUi.btnCompactSecondary}
                    >
                      {copiedId === routine.id ? (
                        <>
                          <Check size={14} className="text-[#14674d]" aria-hidden="true" /> 복사됨
                        </>
                      ) : (
                        <>
                          <Copy size={14} aria-hidden="true" /> 루틴 복사
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
