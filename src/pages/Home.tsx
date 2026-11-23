import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import {
  ArrowRight,
  AudioLines,
  BarChart3,
  BookOpen,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  ClipboardList,
  Download,
  FileText,
  FlaskConical,
  LayoutDashboard,
  Library,
  Lightbulb,
  Mic,
  MonitorSmartphone,
  MoreHorizontal,
  Plus,
  Search,
  SlidersHorizontal,
  Sparkles,
  Upload,
  Users,
} from 'lucide-react';
import { demoStore } from '../lib/api';
import { groups, interviewPrompts, statuses, type Person } from '../lib/research';
import { deletePersonAudio, listAllVoiceAnswers } from '../lib/interviewAudio';
import {
  interviewAnalysisKey,
  questionGuideKey,
  type InterviewAnalysis,
  type QuestionGuide,
} from '../lib/questionGuide';
import { exportAllResearchBundleCsv, exportCollectedInterviewsCsv } from '../lib/researchCsv';
import { webtoonInterview, webtoonTopic } from '../lib/webtoonValidation';
import type { ResearchTemplate } from '../lib/researchTemplates';
import { useWorkspaceSync } from '../lib/workspaceSync';
import { BulkPersonImportModal } from './BulkPersonImportModal';
import { download, Modal, PersonForm } from './ResearchUI';
import { Surveys, useSurveys } from './Surveys';
import { SurveyAnalytics } from './SurveyAnalytics';
import { ResearchTemplates } from './ResearchTemplates';
import { VoiceInterview } from './VoiceInterview';
import { QuestionGenerator } from './QuestionGenerator';
import { InterviewSentimentPanel, type SentimentTrendOutput } from './InterviewSentimentPanel';
import { TextSummarizer, type TextSummaryOutput } from './TextSummarizer';
import { DeviceSyncModal } from './DeviceSyncModal';

const peopleStore = 'research.people.v1';
const samples: Person[] = [
  ['김OO', '30대 / 마케터', '핵심 타겟', '지인 소개', '완료', '2026-11-25T14:00', '엑셀 수기 관리', '데이터 취합에 매주 3시간 소요됨'],
  ['이OO', '20대 / 대학생', '핵심 타겟', '에브리타임', '일정 확정', '2026-11-26T19:00', '노션', '모바일 앱 연동이 안 되어 불편함'],
  ['박OO', '40대 / 자영업자', '대안 사용자', '관련 카페', '컨택 중', '', '경쟁 서비스', '요금제가 비싸서 해지 고민 중'],
  ['최OO', '30대 / 프리랜서', '이탈/비사용', '링크드인', '섭외 대기', '', '사용 안 함', '기존 툴은 기능이 복잡해서 포기'],
  ['정OO', '20대 / 직장인', '핵심 타겟', '오픈채팅방', '거절/보류', '', '카카오톡 나에게쓰기', ''],
].map(([name, desc, group, source, status, date, alternative, note], i) => ({
  id: `example-${i}`,
  name,
  desc,
  group,
  source,
  status,
  date,
  alternative,
  note,
  sample: true,
}));

const sections = [
  { id: 'home', name: '대시보드', shortName: '홈', icon: LayoutDashboard },
  { id: 'people', name: '인터뷰 대상자', shortName: '대상자', icon: Users },
  { id: 'surveys', name: '설문조사', shortName: '설문', icon: ClipboardList },
  { id: 'analytics', name: '설문 분석', shortName: '분석', icon: BarChart3 },
  { id: 'templates', name: '질문 템플릿', shortName: '템플릿', icon: Library },
  { id: 'insights', name: '인사이트', shortName: '인사이트', icon: Lightbulb },
];

const groupInfo = [
  '문제를 자주 겪는 잠재 고객',
  '다른 방법으로 해결하는 고객',
  '사용을 중단했거나 쓰지 않는 고객',
];

const avatarBg = [
  'bg-[#eee8ff] text-[#4d30cf]',
  'bg-[#eaf2ff] text-[#2d5fbc]',
  'bg-[#e6f7ef] text-[#176b50]',
  'bg-[#fff1e2] text-[#a44b16]',
];

export default function Home() {
  const [params, setParams] = useSearchParams();
  const section = sections.find((s) => s.id === params.get('view')) ?? sections[0];
  const [people, setPeople] = useState(() => demoStore.get(peopleStore, samples));
  const [editing, setEditing] = useState<Person | 'new' | null>(null);
  const [guideMode, setGuideMode] = useState<'generate' | 'analyze' | 'vault' | null>(null);
  const [guideDraftQuestions, setGuideDraftQuestions] = useState('');
  const [guideDraftNotes, setGuideDraftNotes] = useState('');
  const [hideSamples, setHideSamples] = useState(false);
  const [notice, setNotice] = useState('');
  const [voice, setVoice] = useState<Person | 'pick' | null>(null);
  const [quickVoiceName, setQuickVoiceName] = useState('');
  const [summaryModal, setSummaryModal] = useState<{ title: string; text: string } | null>(null);
  const [syncModalOpen, setSyncModalOpen] = useState(false);
  const [bulkImportOpen, setBulkImportOpen] = useState(false);
  const [page, setPage] = useState(1);
  const surveyState = useSurveys();

  const workspaceSync = useWorkspaceSync({
    currentView: section.id,
    onRemoteViewChange: (nextView) => {
      if (!sections.some((s) => s.id === nextView)) return;
      const next = new URLSearchParams(params);
      if (nextView === 'home') next.delete('view');
      else next.set('view', nextView);
      setParams(next, { replace: true });
    },
  });

  useEffect(() => {
    const onSync = () => {
      setPeople(demoStore.get(peopleStore, samples));
    };
    window.addEventListener('research-sync-applied', onSync);
    window.addEventListener('storage', onSync);
    return () => {
      window.removeEventListener('research-sync-applied', onSync);
      window.removeEventListener('storage', onSync);
    };
  }, []);

  useEffect(() => {
    if (section.id === 'home' || section.id === 'surveys' || section.id === 'analytics') {
      surveyState.reload(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section.id]);

  const query = params.get('q') ?? '';
  const group = params.get('group') ?? '';
  const status = params.get('status') ?? '';
  const PAGE_SIZE = 20;

  useEffect(() => {
    setPage(1);
  }, [query, group, status]);

  function filter(name: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(name, value);
    else next.delete(name);
    setParams(next, { replace: true });
  }

  function store(next: Person[]) {
    setPeople(next);
    demoStore.set(peopleStore, next);
  }

  function save(p: Person) {
    store(editing === 'new' ? [p, ...people] : people.map((r) => (r.id === p.id ? p : r)));
    setEditing(null);
    setNotice('대상자 정보를 저장했어요.');
  }

  function importPeopleBatch(imported: Person[]) {
    if (!imported.length) return;
    store([...imported, ...people]);
    setBulkImportOpen(false);
    setPage(1);
    setNotice(`인터뷰 대상자 ${imported.length}명을 일괄 추가했어요.`);
  }

  async function exportCollectedTexts() {
    const voiceAnswers = await listAllVoiceAnswers().catch(() => []);
    const hasNotes = people.some((p) => p.note.trim() && !(p.sample && !p.note.trim()));
    if (!hasNotes && voiceAnswers.length === 0) {
      setNotice('내보낼 인터뷰 텍스트나 음성 STT 기록이 아직 없어요.');
      return;
    }
    const file = exportCollectedInterviewsCsv(people, voiceAnswers);
    setNotice(`수집된 인터뷰 텍스트를 CSV(${file})로 다운로드했어요.`);
  }

  async function exportAllResearchCsv() {
    const voiceAnswers = await listAllVoiceAnswers().catch(() => []);
    const guide = demoStore.get<QuestionGuide | null>(questionGuideKey, null);
    const interviewAnalysis = demoStore.get<InterviewAnalysis | null>(interviewAnalysisKey, null);
    const sentimentCache = demoStore.get<Record<string, { fingerprint: string; result: SentimentTrendOutput }>>(
      'research.sentiment-trend.v1',
      {},
    );
    const sentimentResults = Object.values(sentimentCache).map((item) => item.result);
    const textSummary = demoStore.get<TextSummaryOutput | null>('research.text-summary.v1', null);
    const surveySummaries = Object.values(surveyState.summaries);

    const file = exportAllResearchBundleCsv({
      people,
      voiceAnswers,
      guide,
      interviewAnalysis,
      sentimentResults,
      textSummary,
      surveySummaries,
    });
    setNotice(`리서치·수집 인터뷰·분석 데이터 통합 CSV(${file})를 다운로드했어요.`);
  }

  function appendPersonInsight(personId: string, summaryText: string) {
    setPeople((prev) => {
      const next = prev.map((p) => {
        if (p.id !== personId) return p;
        const merged = p.note.trim() ? `${p.note.trim()}\n\n${summaryText}` : summaryText;
        return { ...p, note: merged, sample: false };
      });
      demoStore.set(peopleStore, next);
      return next;
    });
    setNotice('인터뷰 기록 공간에 내용을 저장했어요.');
  }

  function openGuideFromTemplate(template: ResearchTemplate, mode: 'generate' | 'analyze') {
    const formatted = template.interview.map((item, idx) => `${idx + 1}. ${item.prompt}`).join('\n');
    setGuideDraftNotes('');
    setGuideDraftQuestions(formatted);
    setGuideMode(mode);
  }

  const filtered = people.filter(
    (p) =>
      (!group || p.group === group) &&
      (!status || p.status === status) &&
      `${p.name} ${p.desc} ${p.alternative}`.toLowerCase().includes(query.trim().toLowerCase()),
  );
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paginated = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const counts = [
    people.length,
    people.filter((p) => p.status === '일정 확정').length,
    people.filter((p) => p.status === '완료').length,
    surveyState.count,
  ];
  const noteCount = people.filter((p) => p.note).length;
  const customPeople = people.filter((p) => !p.sample);
  const samplePeople = people.filter((p) => p.sample);

  const statItems = [
    { Icon: Users, label: '전체 대상자', unit: '명', to: '/?view=people', tint: 'bg-[#eee8ff] text-[#4d30cf]' },
    {
      Icon: CalendarDays,
      label: '일정 확정',
      unit: '명',
      to: '/?view=people&status=일정+확정',
      tint: 'bg-[#eaf2ff] text-[#2d5fbc]',
    },
    {
      Icon: CircleCheck,
      label: '인터뷰 완료',
      unit: '명',
      to: '/?view=people&status=완료',
      tint: 'bg-[#e6f7ef] text-[#176b50]',
    },
    { Icon: BarChart3, label: '설문 응답', unit: '건', to: '/?view=analytics', tint: 'bg-[#fff1e2] text-[#a44b16]' },
  ];

  return (
    <div className="min-h-dvh bg-[#f7f7fb] text-[#22213a] lg:grid lg:grid-cols-[240px_minmax(0,1fr)]">
      <a
        href="#workspace-main"
        className="fixed left-2 top-2 z-50 -translate-y-24 rounded-lg bg-white px-3 py-2 text-sm font-semibold shadow focus:translate-y-0"
      >
        본문으로 이동
      </a>

      {/* Sidebar (Desktop) + Compact Header Nav (Mobile) */}
      <aside className="border-b border-[#e9e7f1] bg-white px-4 py-3 lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col lg:border-b-0 lg:border-r lg:px-4 lg:py-6">
        <div className="flex items-center justify-between gap-3 lg:block">
          <Link to="/" className="flex items-center gap-2.5 text-inherit no-underline">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#5b3df5] text-white">
              <AudioLines size={20} aria-hidden="true" />
            </span>
            <span>
              <b className="block font-display text-lg font-extrabold leading-tight tracking-tight">리서치랩</b>
              <small className="block text-[11px] text-[#62627a]">고객 검증 워크스페이스</small>
            </span>
          </Link>

          <button
            type="button"
            onClick={() => {
              setGuideDraftQuestions('');
              setGuideMode('generate');
            }}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-[#e5dcfc] bg-[#f8f5ff] px-3 text-xs font-bold text-[#4d30cf] lg:hidden"
          >
            <BookOpen size={15} aria-hidden="true" />
            리서치 가이드
          </button>
        </div>

        <nav aria-label="워크스페이스" className="hidden lg:mt-8 lg:grid lg:grid-cols-1 lg:gap-1">
          <p className="px-3 pb-1.5 text-[11px] font-bold tracking-wider text-[#8a86a0]">워크스페이스</p>
          {sections.map(({ id, name, icon: Icon }) => {
            const active = section.id === id;
            return (
              <Link
                key={id}
                to={id === 'home' ? '/' : `/?view=${id}`}
                aria-current={active ? 'page' : undefined}
                className={`flex min-h-10 shrink-0 items-center gap-3 whitespace-nowrap rounded-xl px-3 py-2 text-sm font-semibold transition-colors ${
                  active
                    ? 'bg-[#eee9ff] font-bold text-[#4d30cf]'
                    : 'text-[#54546d] hover:bg-[#f6f4fd] hover:text-[#22213a]'
                }`}
              >
                <Icon size={17} aria-hidden="true" className="shrink-0" />
                <span>{name}</span>
              </Link>
            );
          })}
        </nav>

        <button
          type="button"
          onClick={() => {
            setGuideDraftQuestions('');
            setGuideMode('generate');
          }}
          className="mt-auto hidden items-center gap-2.5 rounded-xl border border-[#e8ddfb] bg-[#f8f5ff] p-3 text-left text-[#4d30cf] transition-colors hover:bg-[#f0eaff] lg:flex"
        >
          <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-[#eee8ff]">
            <BookOpen size={17} aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1">
            <b className="block text-[13px] font-bold">리서치 가이드</b>
            <small className="block truncate text-[11px] text-[#6e649c]">AI 분석 · 설문 · 나의 질문함</small>
          </span>
          <ChevronRight size={14} aria-hidden="true" className="shrink-0" />
        </button>
      </aside>

      {/* Main Workspace */}
      <div className="min-w-0">
        <header className="flex min-h-14 flex-wrap items-center justify-between gap-2 border-b border-[#e9e7f1] bg-white px-4 py-2 sm:px-8">
          <div className="flex items-center gap-1.5 text-[13px] text-[#62627a]">
            <span className="hidden sm:inline">워크스페이스</span>
            <ChevronRight size={13} className="hidden sm:inline" aria-hidden="true" />
            <b className="font-semibold text-[#22213a]">{section.name}</b>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setSyncModalOpen(true)}
              className={`inline-flex min-h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border px-2.5 text-xs font-semibold transition-colors sm:px-3 ${
                workspaceSync.syncId && workspaceSync.connected
                  ? 'border-[#b7e2d1] bg-[#edf9f4] text-[#14674d] hover:bg-[#e1f5ed]'
                  : 'border-[#e2deee] bg-white text-[#22213a] hover:bg-[#f7f7fb]'
              }`}
            >
              <MonitorSmartphone size={14} aria-hidden="true" />
              {workspaceSync.syncId ? (
                <span className="tnum">
                  연동 {workspaceSync.syncId} · PC {workspaceSync.presence.pcCount}/모바일 {workspaceSync.presence.mobileCount}
                </span>
              ) : (
                <span>PC·모바일 연동</span>
              )}
            </button>
            {(section.id === 'home' || section.id === 'people') && (
              <button
                type="button"
                onClick={() => setVoice('pick')}
                className="inline-flex min-h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-[#e5dcfc] bg-[#f5f1ff] px-2.5 text-xs font-semibold text-[#4d30cf] hover:bg-[#eee6ff] sm:px-3"
              >
                <Mic size={15} aria-hidden="true" /> <span className="hidden sm:inline">음성 인터뷰</span><span className="sm:hidden">녹음</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => setSummaryModal({ title: '', text: '' })}
              className="inline-flex min-h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-[#e2deee] bg-white px-2.5 text-xs font-semibold text-[#22213a] hover:bg-[#f7f7fb] sm:px-3"
            >
              <FileText size={14} className="text-[#5b3df5]" aria-hidden="true" /> <span className="hidden sm:inline">텍스트 요약</span><span className="sm:hidden">요약</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setGuideDraftQuestions('');
                setGuideMode('analyze');
              }}
              className="hidden min-h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-[#e2deee] bg-white px-3 text-xs font-semibold text-[#22213a] hover:bg-[#f7f7fb] sm:inline-flex"
            >
              <Sparkles size={14} className="text-[#5b3df5]" aria-hidden="true" /> AI 질문·메모 분석
            </button>
          </div>
        </header>

        <main id="workspace-main" tabIndex={-1} className="mx-auto grid max-w-[1400px] gap-5 px-4 pt-5 pb-24 sm:px-8 lg:pt-6 lg:pb-6">
          {notice && (
            <div
              role="status"
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#dfd4fb] bg-[#f5f1ff] px-4 py-2.5 text-[13px] font-medium text-[#4d30cf]"
            >
              <span>{notice}</span>
              <button
                type="button"
                onClick={() => setNotice('')}
                className="text-xs font-bold text-[#4d30cf] hover:underline"
              >
                닫기
              </button>
            </div>
          )}

          {section.id === 'home' && (
            <>
              <section className="relative flex flex-col justify-between gap-6 overflow-hidden rounded-2xl border border-[#e9defe] bg-[#f0eaff] px-6 py-7 sm:flex-row sm:items-center sm:px-8">
                <div className="relative z-10 max-w-xl">
                  <p className="inline-flex items-center gap-1.5 text-xs font-bold text-[#4d30cf]">
                    <FlaskConical aria-hidden="true" size={14} /> 고객 검증 워크스페이스
                  </p>
                  <h1 className="mt-2 font-display text-3xl font-extrabold leading-tight tracking-tight text-[#22213a] sm:text-4xl [text-wrap:balance]">
                    좋은 질문에서
                    <br />
                    좋은 발견이 시작돼요.
                  </h1>
                  <p className="mt-2.5 text-sm text-[#595472]">
                    인터뷰 질문 자동 분석·정리부터 타겟 유저 설문 생성·배포, 인사이트 관리까지 한곳에서 진행해요.
                  </p>
                  <div className="mt-5 flex flex-wrap items-center gap-2.5">
                    <button
                      type="button"
                      onClick={() => setEditing('new')}
                      className="inline-flex min-h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg bg-[#5b3df5] px-4 text-sm font-semibold text-white hover:bg-[#4b2ee0]"
                    >
                      <Plus size={16} aria-hidden="true" /> 대상자 추가
                    </button>
                    <button
                      type="button"
                      onClick={() => setGuideMode('analyze')}
                      className="inline-flex min-h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-[#d8cef7] bg-white px-4 text-sm font-semibold text-[#4d30cf] hover:bg-[#faf8ff]"
                    >
                      <Sparkles size={15} aria-hidden="true" /> 인터뷰 질문 분석
                    </button>
                    <Link
                      to="/?view=surveys&new=1"
                      className="inline-flex min-h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-[#d8cef7] bg-white px-4 text-sm font-semibold text-[#22213a] hover:bg-[#faf8ff]"
                    >
                      설문 만들기 <ArrowRight size={15} aria-hidden="true" />
                    </Link>
                    <Link
                      to="/?view=templates"
                      className="inline-flex min-h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-[#e2deee] bg-white px-4 text-sm font-semibold text-[#4d30cf] hover:bg-[#faf8ff]"
                    >
                      <Library size={15} aria-hidden="true" /> 질문 템플릿 생성
                    </Link>
                  </div>
                </div>
                <HeroArt />
              </section>

              <section aria-label="리서치 현황" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                {statItems.map(({ Icon, label, unit, to, tint }, i) => (
                  <Link
                    to={to}
                    key={label}
                    className="flex min-h-20 items-center gap-3 rounded-2xl border border-[#e9e7f1] bg-white px-4 py-3.5 transition-colors hover:border-[#cfc1f3]"
                  >
                    <span className={`grid size-10 shrink-0 place-items-center rounded-xl ${tint}`}>
                      <Icon size={19} aria-hidden="true" />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-xs font-medium text-[#62627a]">{label}</span>
                      <span className="tnum mt-0.5 block font-display text-2xl font-extrabold leading-tight text-[#22213a]">
                        {i === 3 && surveyState.error ? '—' : counts[i]}
                        <small className="ml-0.5 text-xs font-semibold text-[#62627a]">{unit}</small>
                      </span>
                    </span>
                  </Link>
                ))}
              </section>
            </>
          )}

          {(section.id === 'home' || section.id === 'people') && (
            <div className={`grid items-start gap-4 ${section.id === 'people' ? 'grid-cols-1' : 'xl:grid-cols-[minmax(0,1fr)_270px]'}`}>
              <section className="min-w-0 overflow-hidden rounded-2xl border border-[#e9e7f1] bg-white">
                <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                  <div>
                    {section.id === 'people' ? (
                      <h1 className="font-display text-2xl font-bold tracking-tight text-[#22213a]">인터뷰 대상자</h1>
                    ) : (
                      <h2 className="font-display text-lg font-bold text-[#22213a]">인터뷰 대상자</h2>
                    )}
                    <p className="mt-0.5 text-[13px] text-[#62627a]">섭외 현황과 인터뷰 일정을 관리해요.</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setBulkImportOpen(true)}
                      className="inline-flex min-h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-[#d8cef7] bg-[#faf7ff] px-3 text-xs font-semibold text-[#4d30cf] hover:bg-[#eee8ff]"
                    >
                      <Upload size={14} aria-hidden="true" /> 일괄 추가
                    </button>
                    <button
                      type="button"
                      disabled={!filtered.some((p) => !p.sample)}
                      onClick={() =>
                        download(
                          [
                            ['이름/닉네임', '특징', '그룹', '현재 대안', '섭외 경로', '진행 상태', '인터뷰 일시', '핵심 인사이트'],
                            ...filtered
                              .filter((p) => !p.sample)
                              .map((p) => [p.name, p.desc, p.group, p.alternative, p.source, p.status, p.date, p.note]),
                          ],
                          '인터뷰-대상자.csv',
                        )
                      }
                      title="현재 검색 결과에서 예시를 제외하고 전체 내보내기"
                      className="inline-flex min-h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-[#e2deee] bg-white px-3 text-xs font-semibold text-[#22213a] hover:bg-[#f7f7fb] disabled:opacity-45"
                    >
                      <Download size={14} aria-hidden="true" /> CSV 내보내기
                    </button>
                    {section.id === 'people' && (
                      <button
                        type="button"
                        onClick={() => setEditing('new')}
                        className="inline-flex min-h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg bg-[#5b3df5] px-3 text-xs font-semibold text-white hover:bg-[#4b2ee0]"
                      >
                        <Plus size={15} aria-hidden="true" /> 대상자 추가
                      </button>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 px-5 pb-3.5">
                  <label className="flex min-h-9 min-w-[180px] flex-1 items-center gap-2 rounded-lg border border-[#e4e1ec] bg-white px-3 text-[#62627a] focus-within:border-[#5b3df5]">
                    <Search size={15} aria-hidden="true" />
                    <input
                      name="q"
                      autoComplete="off"
                      aria-label="대상자 검색"
                      placeholder="이름, 특징, 대안 검색…"
                      value={query}
                      onChange={(e) => filter('q', e.target.value)}
                      className="w-full border-0 bg-transparent text-[13px] text-[#22213a] outline-none"
                    />
                  </label>
                  <select
                    aria-label="그룹 필터"
                    name="group"
                    value={group}
                    onChange={(e) => filter('group', e.target.value)}
                    className="min-h-9 rounded-lg border border-[#dfdce9] bg-white px-2.5 text-xs text-[#22213a]"
                  >
                    <option value="">전체 그룹</option>
                    {groups.map((g) => (
                      <option key={g}>{g}</option>
                    ))}
                  </select>
                  <select
                    aria-label="진행 상태 필터"
                    name="status"
                    value={status}
                    onChange={(e) => filter('status', e.target.value)}
                    className="min-h-9 rounded-lg border border-[#dfdce9] bg-white px-2.5 text-xs text-[#22213a]"
                  >
                    <option value="">전체 상태</option>
                    {statuses.map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </div>

                {/* Mobile Card List (< md) */}
                <div className="divide-y divide-[#efedf5] border-t border-[#efedf5] md:hidden" role="region" aria-label="모바일 대상자 목록">
                  {paginated.map((p, i) => {
                    const globalIdx = (currentPage - 1) * PAGE_SIZE + i;
                    const statusStyle =
                      p.status === '완료'
                        ? 'text-[#14674d]'
                        : p.status === '일정 확정'
                        ? 'text-[#295dad]'
                        : p.status === '거절/보류'
                        ? 'text-[#9b3c58]'
                        : 'text-[#8b4d17]';
                    return (
                      <article key={p.id} className="grid gap-2.5 px-4 py-3.5">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex min-w-0 items-center gap-2.5">
                            <span
                              className={`grid size-9 shrink-0 place-items-center rounded-full text-xs font-bold ${avatarBg[globalIdx % 4]}`}
                              aria-hidden="true"
                            >
                              {p.name.slice(0, 1)}
                            </span>
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5 text-sm">
                                <b className="truncate font-bold text-[#22213a]">{p.name}</b>
                                {p.sample && <span className="shrink-0 text-[11px] text-[#62627a]">· 예시</span>}
                              </div>
                              <p className="truncate text-xs text-[#62627a]">{p.desc || '특징 미입력'}</p>
                            </div>
                          </div>
                          <span className={`shrink-0 text-xs font-bold ${statusStyle}`}>{p.status}</span>
                        </div>

                        <div className="tnum flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[#62627a]">
                          <span className="font-semibold text-[#4d30cf]">{p.group}</span>
                          {p.source && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span>{p.source}</span>
                            </>
                          )}
                          {p.date && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="font-mono">{p.date.replace('T', ' ')}</span>
                            </>
                          )}
                        </div>

                        {p.note && (
                          <p className="line-clamp-2 rounded-lg bg-[#faf9fd] px-2.5 py-2 text-xs text-[#22213a]">
                            {p.note}
                          </p>
                        )}

                        <div className="flex items-center gap-2 pt-0.5">
                          <button
                            type="button"
                            onClick={() => setVoice(p)}
                            className="inline-flex min-h-8 flex-1 items-center justify-center gap-1 rounded-lg border border-[#e5dcfc] bg-[#faf7ff] px-3 text-xs font-semibold text-[#4d30cf]"
                          >
                            <Mic size={13} aria-hidden="true" /> 음성 녹음
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditing(p)}
                            className="inline-flex min-h-8 flex-1 items-center justify-center gap-1 rounded-lg border border-[#e2deee] bg-white px-3 text-xs font-semibold text-[#22213a]"
                          >
                            상세 편집
                          </button>
                        </div>
                      </article>
                    );
                  })}
                  {!filtered.length && (
                    <p className="px-4 py-8 text-center text-sm text-[#62627a]">
                      {people.length ? '검색 조건에 맞는 대상자가 없어요.' : '첫 인터뷰 대상자를 추가해 보세요.'}
                    </p>
                  )}
                </div>

                {/* Desktop Table (>= md) */}
                <div className="hidden overflow-x-auto md:block" role="region" aria-label="대상자 목록" tabIndex={0}>
                  <table className="w-full min-w-[640px] border-collapse text-left text-[13px] tnum">
                    <thead>
                      <tr className="border-t border-[#efedf5] bg-[#f8f8fc] text-xs font-semibold text-[#565771]">
                        <th scope="col" className="py-2.5 pl-5 pr-3">
                          이름 / 특징
                        </th>
                        <th scope="col" className="px-3 py-2.5">
                          그룹
                        </th>
                        <th scope="col" className="px-3 py-2.5">
                          섭외 경로
                        </th>
                        <th scope="col" className="px-3 py-2.5">
                          진행 상태
                        </th>
                        <th scope="col" className="px-3 py-2.5">
                          인터뷰 일시
                        </th>
                        <th scope="col" className="py-2.5 pl-3 pr-5 text-right">
                          <span className="sr-only">편집</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#efedf5]">
                      {paginated.map((p, i) => {
                        const globalIdx = (currentPage - 1) * PAGE_SIZE + i;
                        const statusStyle =
                          p.status === '완료'
                            ? 'text-[#14674d]'
                            : p.status === '일정 확정'
                            ? 'text-[#295dad]'
                            : p.status === '거절/보류'
                            ? 'text-[#9b3c58]'
                            : 'text-[#8b4d17]';
                        return (
                          <tr key={p.id} className="hover:bg-[#faf9ff]">
                            <td className="py-2.5 pl-5 pr-3">
                              <div className="flex items-center gap-2.5">
                                <span
                                  className={`grid size-8 shrink-0 place-items-center rounded-full text-xs font-bold ${avatarBg[globalIdx % 4]}`}
                                  aria-hidden="true"
                                >
                                  {p.name.slice(0, 1)}
                                </span>
                                <div className="min-w-0">
                                  <div className="flex items-center gap-1.5">
                                    <b className="font-semibold text-[#22213a]">{p.name}</b>
                                    {p.sample && <span className="text-[11px] text-[#62627a]">· 예시</span>}
                                  </div>
                                  <span className="block truncate text-xs text-[#62627a]">{p.desc || '—'}</span>
                                </div>
                              </div>
                            </td>
                            <td className="px-3 py-2.5 text-xs font-semibold text-[#4d30cf]">{p.group}</td>
                            <td className="px-3 py-2.5 text-xs text-[#62627a]">{p.source || '—'}</td>
                            <td className={`px-3 py-2.5 text-xs font-semibold ${statusStyle}`}>{p.status}</td>
                            <td className="px-3 py-2.5 font-mono text-xs text-[#62627a]">
                              {p.date ? p.date.replace('T', ' ') : '—'}
                            </td>
                            <td className="py-2.5 pl-3 pr-5 text-right">
                              <button
                                type="button"
                                aria-label={`${p.name} 상세 편집`}
                                onClick={() => setEditing(p)}
                                className="inline-grid size-8 place-items-center rounded-lg text-[#565571] hover:bg-[#eee8ff] hover:text-[#4d30cf]"
                              >
                                <MoreHorizontal size={17} aria-hidden="true" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {!filtered.length && (
                    <p className="px-5 py-8 text-center text-sm text-[#62627a]">
                      {people.length ? '검색 조건에 맞는 대상자가 없어요.' : '첫 인터뷰 대상자를 추가해 보세요.'}
                    </p>
                  )}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#e9e7f1] px-5 py-3 text-xs text-[#62627a]">
                  <span className="tnum">
                    대상자 {filtered.length}명
                    {filtered.length > PAGE_SIZE
                      ? ` (${(currentPage - 1) * PAGE_SIZE + 1}–${Math.min(currentPage * PAGE_SIZE, filtered.length)} 표시)`
                      : ''}
                    <span className="hidden sm:inline"> · 이 브라우저에 저장</span>
                  </span>

                  <div className="flex flex-wrap items-center gap-3">
                    {filtered.length > PAGE_SIZE && (
                      <div className="tnum flex items-center gap-1.5">
                        <button
                          type="button"
                          disabled={currentPage <= 1}
                          onClick={() => setPage((p) => Math.max(1, p - 1))}
                          className="inline-flex min-h-7 items-center gap-0.5 rounded-md border border-[#e2deee] bg-white px-2 text-xs font-semibold text-[#22213a] hover:bg-[#f7f7fb] disabled:opacity-45"
                        >
                          <ChevronLeft size={13} aria-hidden="true" /> 이전
                        </button>
                        <span className="font-mono text-xs font-semibold text-[#22213a]">
                          {currentPage} / {totalPages}
                        </span>
                        <button
                          type="button"
                          disabled={currentPage >= totalPages}
                          onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                          className="inline-flex min-h-7 items-center gap-0.5 rounded-md border border-[#e2deee] bg-white px-2 text-xs font-semibold text-[#22213a] hover:bg-[#f7f7fb] disabled:opacity-45"
                        >
                          다음 <ChevronRight size={13} aria-hidden="true" />
                        </button>
                      </div>
                    )}
                    {people.some((p) => p.sample) && (
                      <button
                        type="button"
                        onClick={() => setHideSamples(true)}
                        className="font-bold text-[#5b3df5] hover:underline"
                      >
                        예시 데이터 지우기
                      </button>
                    )}
                  </div>
                </div>
              </section>

              {section.id === 'home' && (
                <aside className="grid gap-4 rounded-2xl border border-[#e9e7f1] bg-white p-5">
                  <div>
                    <span className="mb-2.5 grid size-9 place-items-center rounded-xl bg-[#eee8ff] text-[#5b3df5]">
                      <SlidersHorizontal size={17} aria-hidden="true" />
                    </span>
                    <h2 className="text-base font-bold text-[#22213a]">그룹별 모집 현황</h2>
                    <p className="mt-0.5 text-xs text-[#62627a]">각 그룹에서 3~5명을 만나 보세요.</p>
                  </div>

                  <div className="grid gap-3.5">
                    {groups.map((g, i) => {
                      const n = people.filter((p) => p.group === g && p.status !== '거절/보류').length;
                      const meterClass = i === 1 ? 'meter-alt' : i === 2 ? 'meter-churn' : '';
                      return (
                        <Link
                          key={g}
                          to={`/?view=people&group=${encodeURIComponent(g)}`}
                          className="grid gap-1.5 text-inherit no-underline hover:text-[#4d30cf]"
                        >
                          <div className="flex items-center justify-between text-[13px]">
                            <b className="font-semibold">{g}</b>
                            <span className="tnum text-xs font-bold text-[#4d30cf]">
                              {n}
                              <span className="font-normal text-[#62627a]"> / 5명</span>
                            </span>
                          </div>
                          <progress className={`meter-progress ${meterClass}`} value={Math.min(n, 5)} max={5} />
                        </Link>
                      );
                    })}
                  </div>

                  <button
                    type="button"
                    onClick={() => setGuideMode('generate')}
                    className="inline-flex w-fit items-center gap-1 text-xs font-bold text-[#5b3df5] hover:underline"
                  >
                    모집 기준 · AI 가이드 보기 <ArrowRight size={14} aria-hidden="true" />
                  </button>
                </aside>
              )}
            </div>
          )}

          {section.id === 'surveys' && <Surveys state={surveyState} />}

          {section.id === 'analytics' && <SurveyAnalytics state={surveyState} />}

          {section.id === 'templates' && <ResearchTemplates onUseInGuide={openGuideFromTemplate} />}

          {section.id === 'insights' && (
            <div className="grid gap-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h1 className="font-display text-2xl font-bold tracking-tight text-[#22213a]">인터뷰 기록 · 인사이트</h1>
                  <p className="mt-1 text-[13px] text-[#62627a]">
                    실시간 음성 녹음(STT) 기록과 대상자별 핵심 발견을 관리하고 AI로 자동 분석해요.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void exportCollectedTexts()}
                    className="inline-flex min-h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-[#e2deee] bg-white px-3.5 text-sm font-semibold text-[#22213a] hover:bg-[#f7f7fb]"
                  >
                    <Download size={15} aria-hidden="true" /> 수집 텍스트 CSV
                  </button>
                  <button
                    type="button"
                    onClick={() => void exportAllResearchCsv()}
                    className="inline-flex min-h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-[#e2deee] bg-white px-3.5 text-sm font-semibold text-[#22213a] hover:bg-[#f7f7fb]"
                  >
                    <Download size={15} aria-hidden="true" /> 리서치·분석 통합 CSV
                  </button>
                  <button
                    type="button"
                    onClick={() => setVoice('pick')}
                    className="inline-flex min-h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-[#d8cef7] bg-white px-4 text-sm font-semibold text-[#4d30cf] hover:bg-[#faf8ff]"
                  >
                    <Mic size={15} aria-hidden="true" /> 실시간 음성 녹음 · STT
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const allNotes = people
                        .filter((p) => p.note.trim())
                        .map((p) => `[${p.name} · ${p.group}]\n${p.note.trim()}`)
                        .join('\n\n---\n\n');
                      setSummaryModal({
                        title: allNotes ? `수집된 인터뷰 기록 (${noteCount}건)` : '',
                        text: allNotes,
                      });
                    }}
                    className="inline-flex min-h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-[#e2deee] bg-white px-4 text-sm font-semibold text-[#22213a] hover:bg-[#f7f7fb]"
                  >
                    <FileText size={15} className="text-[#5b3df5]" aria-hidden="true" /> 텍스트 요약
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setGuideDraftNotes('');
                      setGuideMode('analyze');
                    }}
                    className="inline-flex min-h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg bg-[#5b3df5] px-4 text-sm font-semibold text-white hover:bg-[#4b2ee0]"
                  >
                    <Sparkles size={15} aria-hidden="true" /> AI 인터뷰 질문·답변 분석
                  </button>
                </div>
              </div>

              <InterviewSentimentPanel people={people} />

              <section className="overflow-hidden rounded-2xl border border-[#e9e7f1] bg-white">
                <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-4">
                  <h2 className="text-base font-bold text-[#22213a]">저장된 인터뷰 기록 {noteCount}개</h2>
                  <button
                    type="button"
                    onClick={() => setGuideMode('generate')}
                    className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-[#e2deee] bg-white px-3 text-xs font-semibold text-[#22213a] hover:bg-[#f7f7fb]"
                  >
                    <BookOpen size={14} aria-hidden="true" /> 인터뷰 질문 보기
                  </button>
                </div>

                {noteCount ? (
                  <ul className="divide-y divide-[#e9e7f1] border-t border-[#e9e7f1]">
                    {people
                      .filter((p) => p.note)
                      .map((p) => (
                        <li key={p.id} className="grid gap-2 px-5 py-4">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex flex-wrap items-center gap-2 text-xs">
                              <b className="text-sm font-bold text-[#22213a]">{p.name}</b>
                              <span className="font-semibold text-[#4d30cf]">{p.group}</span>
                              {p.alternative && (
                                <>
                                  <span aria-hidden="true" className="text-[#62627a]">
                                    ·
                                  </span>
                                  <span className="text-[#62627a]">현재 대안: {p.alternative}</span>
                                </>
                              )}
                              {p.sample && <span className="text-[#62627a]">· 예시</span>}
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                              <button
                                type="button"
                                onClick={() => setVoice(p)}
                                className="inline-flex min-h-7 items-center gap-1 rounded-md border border-[#e5dcfc] bg-[#faf8ff] px-2.5 text-xs font-semibold text-[#4d30cf] hover:bg-[#eee8ff]"
                              >
                                <Mic size={12} aria-hidden="true" /> 음성 녹음
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  setSummaryModal({
                                    title: `${p.name} (${p.group}) 인터뷰 기록`,
                                    text: p.note,
                                  })
                                }
                                className="inline-flex min-h-7 items-center gap-1 rounded-md border border-[#e2deee] bg-white px-2.5 text-xs font-semibold text-[#22213a] hover:bg-[#f7f7fb]"
                              >
                                <FileText size={12} className="text-[#5b3df5]" aria-hidden="true" /> 요약하기
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setGuideDraftQuestions('');
                                  setGuideDraftNotes(`- ${p.name}(${p.group}):\n${p.note}`);
                                  setGuideMode('analyze');
                                }}
                                className="inline-flex min-h-7 items-center gap-1 rounded-md border border-[#e2deee] bg-white px-2.5 text-xs font-semibold text-[#22213a] hover:bg-[#f7f7fb]"
                              >
                                <Sparkles size={12} className="text-[#5b3df5]" aria-hidden="true" /> AI 분석기에 넣기
                              </button>
                            </div>
                          </div>
                          <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-[#22213a]">{p.note}</p>
                          <button
                            type="button"
                            onClick={() => setEditing(p)}
                            className="w-fit text-xs font-bold text-[#5b3df5] hover:underline"
                          >
                            기록 편집
                          </button>
                        </li>
                      ))}
                  </ul>
                ) : (
                  <p className="border-t border-[#e9e7f1] px-5 py-8 text-center text-sm text-[#62627a]">
                    실시간 음성 녹음(STT)을 진행하거나 대상자 상세 화면에서 인터뷰 인사이트를 기록하면 여기에 자동으로 저장돼요.
                  </p>
                )}
              </section>
            </div>
          )}
        </main>

        <footer className="mx-auto hidden max-w-[1400px] px-4 py-6 text-xs text-[#62627a] sm:px-8 lg:block">
          리서치랩 · 고객 인터뷰와 연구 설문
        </footer>
      </div>

      {/* Mobile Bottom Navigation (< lg) */}
      <nav
        aria-label="모바일 하단 메뉴"
        className="fixed inset-x-0 bottom-0 z-30 flex items-center justify-around border-t border-[#e9e7f1] bg-white/95 px-1 py-1.5 backdrop-blur lg:hidden"
      >
        {sections.map(({ id, shortName, icon: Icon }) => {
          const active = section.id === id;
          return (
            <Link
              key={id}
              to={id === 'home' ? '/' : `/?view=${id}`}
              aria-current={active ? 'page' : undefined}
              className={`flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-lg py-1 text-[11px] font-semibold transition-colors ${
                active ? 'text-[#5b3df5] font-bold' : 'text-[#62627a]'
              }`}
            >
              <Icon size={18} aria-hidden="true" />
              <span className="truncate">{shortName}</span>
            </Link>
          );
        })}
      </nav>

      <div className="sr-only" role="status">
        {notice}
      </div>

      {editing && (
        <Modal title={editing === 'new' ? '대상자 추가' : '대상자 상세'} close={() => setEditing(null)}>
          <PersonForm
            record={editing === 'new' ? undefined : editing}
            save={save}
            close={() => setEditing(null)}
            remove={
              editing === 'new'
                ? undefined
                : async () => {
                    await deletePersonAudio(editing.id);
                    store(people.filter((p) => p.id !== editing.id));
                    setEditing(null);
                    setNotice('대상자 기록을 삭제했어요.');
                  }
            }
          />
        </Modal>
      )}

      {voice === 'pick' && (
        <Modal title="실시간 음성 인터뷰 · 자동 STT" close={() => setVoice(null)}>
          <div className="grid gap-4">
            <p className="text-sm text-[#62627a]">
              마이크로 인터뷰를 녹음하면 음성이 텍스트로 변환되어 선택한 대상자의 인터뷰 기록 공간에 자동으로 저장돼요.
            </p>

            {people.length > 0 && (
              <form
                className="grid gap-3 rounded-xl border border-[#e9e7f1] bg-[#faf9fd] p-3.5"
                onSubmit={(e) => {
                  e.preventDefault();
                  const id = new FormData(e.currentTarget).get('voice-person');
                  const p = people.find((v) => v.id === id);
                  if (p) setVoice(p);
                }}
              >
                <label className="grid gap-1.5 text-[13px] font-semibold text-[#22213a]">
                  기존 대상자 선택
                  <select
                    name="voice-person"
                    defaultValue={customPeople.length === 1 ? customPeople[0].id : people[0]?.id ?? ''}
                    required
                    className="min-h-10 rounded-lg border border-[#dfdce9] bg-white px-3 text-sm font-normal text-[#22213a]"
                  >
                    <option value="">대상자 선택</option>
                    {customPeople.length > 0 && (
                      <optgroup label="등록된 인터뷰 대상자">
                        {customPeople.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                            {p.desc ? ` · ${p.desc}` : ''}
                          </option>
                        ))}
                      </optgroup>
                    )}
                    {samplePeople.length > 0 && (
                      <optgroup label="예시 대상자 (녹음 시 실제 기록으로 전환)">
                        {samplePeople.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                            {p.desc ? ` · ${p.desc}` : ''} (예시)
                          </option>
                        ))}
                      </optgroup>
                    )}
                  </select>
                </label>
                <button
                  type="submit"
                  className="inline-flex min-h-10 w-fit items-center gap-1.5 rounded-lg bg-[#5b3df5] px-4 text-sm font-semibold text-white hover:bg-[#4b2ee0]"
                >
                  <Mic size={16} aria-hidden="true" /> 녹음 · STT 화면 열기
                </button>
              </form>
            )}

            <form
              className="grid gap-2.5 rounded-xl border border-[#e5dcfc] bg-[#faf7ff] p-3.5"
              onSubmit={(e) => {
                e.preventDefault();
                const clean = quickVoiceName.trim();
                if (!clean) return;
                const created: Person = {
                  id: crypto.randomUUID(),
                  name: clean,
                  desc: '',
                  group: groups[0],
                  source: '음성 인터뷰',
                  status: '완료',
                  date: new Date().toISOString().slice(0, 16),
                  alternative: '',
                  note: '',
                  sample: false,
                };
                store([created, ...people]);
                setQuickVoiceName('');
                setVoice(created);
              }}
            >
              <label className="grid gap-1 text-[13px] font-semibold text-[#22213a]">
                새 대상자 이름으로 바로 녹음 시작
                <div className="flex flex-wrap gap-2">
                  <input
                    name="quick-voice-name"
                    required
                    maxLength={60}
                    value={quickVoiceName}
                    onChange={(e) => setQuickVoiceName(e.target.value)}
                    placeholder="예: 참여자 A (30대 마케터)"
                    className="min-h-10 min-w-[180px] flex-1 rounded-lg border border-[#dfdce9] bg-white px-3 text-sm font-normal text-[#22213a]"
                  />
                  <button
                    type="submit"
                    className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-lg border border-[#5b3df5] bg-white px-3.5 text-xs font-bold text-[#4d30cf] hover:bg-[#eee8ff]"
                  >
                    <Plus size={14} aria-hidden="true" /> 등록 후 바로 녹음
                  </button>
                </div>
              </label>
            </form>
          </div>
        </Modal>
      )}

      {voice && voice !== 'pick' && (
        <VoiceInterview
          key={voice.id}
          person={voice}
          close={() => setVoice(null)}
          onSaveTranscript={appendPersonInsight}
        />
      )}

      {summaryModal && (
        <Modal title="AI 텍스트 요약" close={() => setSummaryModal(null)} wide>
          <TextSummarizer
            key={`${summaryModal.title}-${summaryModal.text.length}`}
            people={people}
            initialTitle={summaryModal.title}
            initialText={summaryModal.text}
            onSaveSummary={appendPersonInsight}
          />
        </Modal>
      )}

      {guideMode && (
        <Modal
          title="리서치 가이드"
          close={() => {
            setGuideMode(null);
            setGuideDraftQuestions('');
            setGuideDraftNotes('');
          }}
          wide
        >
          <div className="grid gap-4">
            <QuestionGenerator
              key={`${guideMode}-${guideDraftQuestions.slice(0, 20)}-${guideDraftNotes.slice(0, 20)}`}
              initialMode={guideMode}
              initialQuestionsText={guideDraftQuestions}
              initialNotesText={guideDraftNotes}
              close={() => {
                setGuideMode(null);
                setGuideDraftQuestions('');
                setGuideDraftNotes('');
              }}
              editingSurvey={section.id === 'surveys' && params.has('new')}
              people={people}
              onSaveInsight={appendPersonInsight}
            />

            <details className="rounded-xl border border-[#e8ddfb] bg-[#f8f4ff] p-3.5 text-[13px]">
              <summary className="flex flex-wrap items-center justify-between gap-2 font-bold text-[#4d30cf]">
                <span>{webtoonTopic}</span>
                <span className="text-xs font-normal text-[#62627a]">고객검증 인터뷰 {webtoonInterview.length}문항</span>
              </summary>
              <div className="mt-3 grid gap-2.5">
                <p className="text-[#22213a]">
                  소개부터 하지 말고 최근에 있었던 일을 먼저 물어보세요. 서비스 아이디어는 5번에서 처음 보여 주세요.
                </p>
                <ol className="grid gap-2 pl-5 list-decimal">
                  {webtoonInterview.map(({ stage, prompt }) => (
                    <li key={stage}>
                      <b className="font-semibold text-[#22213a]">{stage}</b>
                      <p className="text-[#62627a]">{prompt}</p>
                    </li>
                  ))}
                </ol>
                <Link
                  to="/?view=surveys&new=1&template=webtoon"
                  onClick={() => setGuideMode(null)}
                  className="inline-flex min-h-9 w-fit items-center gap-1.5 rounded-lg border border-[#d8cef7] bg-white px-3 text-xs font-semibold text-[#4d30cf] hover:bg-[#faf8ff]"
                >
                  웹툰 고객검증 설문 만들기 <ArrowRight size={14} aria-hidden="true" />
                </Link>
              </div>
            </details>

            <div className="grid gap-3 text-[13px] text-[#22213a]">
              <div>
                <h3 className="text-sm font-bold">누구를 만날까요?</h3>
                <p className="mt-1 text-[#62627a]">
                  세 그룹에서 각각 3~5명을 모집해 서로 다른 경험을 비교해 보세요. 지인 외 경로에서도 참여자를 찾아보세요.
                </p>
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  {groups.map((g, i) => (
                    <li key={g}>
                      <b>{g}</b> · {groupInfo[i]}
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <h3 className="text-sm font-bold">인터뷰 기본 질문 예시</h3>
                <ol className="mt-1.5 list-decimal space-y-1 pl-5 text-[#62627a]">
                  {interviewPrompts.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ol>
              </div>
            </div>
          </div>
        </Modal>
      )}

      {hideSamples && (
        <Modal title="예시 데이터를 지울까요?" close={() => setHideSamples(false)}>
          <p className="text-sm text-[#62627a]">직접 추가한 대상자는 그대로 남아요.</p>
          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setHideSamples(false)}
              className="min-h-10 rounded-lg border border-[#e2deee] bg-white px-4 text-sm font-semibold text-[#22213a]"
            >
              취소
            </button>
            <button
              type="button"
              onClick={() => {
                store(people.filter((p) => !p.sample));
                setHideSamples(false);
                setNotice('예시 데이터를 지웠어요.');
              }}
              className="min-h-10 rounded-lg bg-[#a6214e] px-4 text-sm font-semibold text-white"
            >
              예시 지우기
            </button>
          </div>
        </Modal>
      )}

      {syncModalOpen && (
        <Modal title="PC · 모바일 실시간 연동" close={() => setSyncModalOpen(false)} wide>
          <DeviceSyncModal
            syncId={workspaceSync.syncId}
            currentView={section.id}
            deviceType={workspaceSync.deviceType}
            connected={workspaceSync.connected}
            reconnecting={workspaceSync.reconnecting}
            presence={workspaceSync.presence}
            lastSyncedAt={workspaceSync.lastSyncedAt}
            syncError={workspaceSync.syncError}
            busy={workspaceSync.busy}
            followScreen={workspaceSync.followScreen}
            setFollowScreen={workspaceSync.setFollowScreen}
            createRoom={workspaceSync.createRoom}
            joinRoom={workspaceSync.joinRoom}
            disconnect={workspaceSync.disconnect}
            pushNow={workspaceSync.pushNow}
          />
        </Modal>
      )}

      {bulkImportOpen && (
        <BulkPersonImportModal close={() => setBulkImportOpen(false)} onImport={importPeopleBatch} />
      )}
    </div>
  );
}

function HeroArt() {
  return (
    <svg className="hidden h-44 w-72 shrink-0 md:block" viewBox="0 0 390 224" fill="none" aria-hidden="true">
      <path
        d="M15 161C54 191 125 192 199 166S328 100 375 117M38 185C109 203 178 199 235 174S338 131 380 141"
        stroke="#d3c4fa"
        strokeDasharray="4 7"
      />
      <circle cx="216" cy="111" r="101" fill="#e6dbff" />
      <circle cx="216" cy="111" r="82" stroke="#f4efff" />
      <g transform="translate(129 31) rotate(-10 66 80)">
        <rect x="7" y="9" width="140" height="168" rx="16" fill="#b49af4" />
        <rect width="140" height="168" rx="16" fill="#fff" stroke="#b69df1" />
        <path d="M0 31H140" stroke="#e9ddff" />
        <path d="M32 -4v16M61 -4v16M91 -4v16M116 -4v16" stroke="#9e7ce9" strokeWidth="5" strokeLinecap="round" />
        <path d="M50 57h60M50 87h55M50 118h65M50 144h39" stroke="#d7c7fc" strokeWidth="5" strokeLinecap="round" />
        <path
          d="M21 57l4 4 8-9m-12 35 4 4 8-9m-12 36 4 4 8-9"
          stroke="#7654db"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
      <g transform="translate(226 66) rotate(10 52 33)">
        <path
          d="M17 0h78a16 16 0 0 1 16 16v33a16 16 0 0 1-16 16H44L25 79V65h-8A17 17 0 0 1 0 48V17A17 17 0 0 1 17 0Z"
          fill="#5b3df5"
        />
        <circle cx="32" cy="33" r="4" fill="#fff" />
        <circle cx="55" cy="33" r="4" fill="#fff" />
        <circle cx="78" cy="33" r="4" fill="#fff" />
      </g>
      <g transform="translate(79 113) rotate(-10 37 22)">
        <rect width="76" height="46" rx="12" fill="#fff" stroke="#d0bcfd" />
        <path
          d="M13 24h8l4-9 6 18 7-22 6 20 5-11 4 4h10"
          stroke="#9b79ee"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
    </svg>
  );
}
