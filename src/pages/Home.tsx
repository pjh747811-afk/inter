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
  Play,
  Plus,
  Search,
  SlidersHorizontal,
  Sparkles,
  Upload,
  Users,
} from 'lucide-react';
import { demoStore } from '../lib/api';
import { groups, interviewPrompts, statuses, type Person } from '../lib/research';
import { deletePersonAudio, listAllVoiceAnswers, type VoiceAnswer } from '../lib/interviewAudio';
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
import { download, Modal, PersonForm, saasUi } from './ResearchUI';
import { Surveys, useSurveys } from './Surveys';
import { SurveyAnalytics } from './SurveyAnalytics';
import { ResearchTemplates } from './ResearchTemplates';
import { VoiceInterview } from './VoiceInterview';
import { QuestionGenerator } from './QuestionGenerator';
import { InterviewSentimentPanel, type SentimentTrendOutput } from './InterviewSentimentPanel';
import { TextSummarizer, type TextSummaryOutput } from './TextSummarizer';
import { AiInsightReportPanel, insightReportKey, type InsightReportOutput } from './AiInsightReportPanel';
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
  'bg-[#efeaff] text-[#4125cc]',
  'bg-[#eaf2ff] text-[#2d5fbc]',
  'bg-[#e6f7ef] text-[#14674d]',
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
  const [hoveredPersonId, setHoveredPersonId] = useState<string | null>(null);
  const [mobilePreviewId, setMobilePreviewId] = useState<string | null>(null);
  const [voiceByPerson, setVoiceByPerson] = useState<Record<string, VoiceAnswer[]>>({});
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
    let active = true;
    const loadVoiceMap = () => {
      void listAllVoiceAnswers()
        .then((rows) => {
          if (!active) return;
          const grouped: Record<string, VoiceAnswer[]> = {};
          for (const row of rows) {
            if (!grouped[row.personId]) grouped[row.personId] = [];
            grouped[row.personId].push(row);
          }
          setVoiceByPerson(grouped);
        })
        .catch(() => {});
    };
    loadVoiceMap();

    const onSync = () => {
      setPeople(demoStore.get(peopleStore, samples));
      loadVoiceMap();
    };
    window.addEventListener('research-voice-updated', loadVoiceMap);
    window.addEventListener('research-sync-applied', onSync);
    window.addEventListener('storage', onSync);
    return () => {
      active = false;
      window.removeEventListener('research-voice-updated', loadVoiceMap);
      window.removeEventListener('research-sync-applied', onSync);
      window.removeEventListener('storage', onSync);
    };
  }, []);

  useEffect(() => {
    if (
      section.id === 'home' ||
      section.id === 'surveys' ||
      section.id === 'analytics' ||
      section.id === 'insights'
    ) {
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
    const insightReport = demoStore.get<InsightReportOutput | null>(insightReportKey, null);
    const surveySummaries = Object.values(surveyState.summaries);

    const file = exportAllResearchBundleCsv({
      people,
      voiceAnswers,
      guide,
      interviewAnalysis,
      sentimentResults,
      textSummary,
      insightReport,
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
    <div className="min-h-dvh bg-[#f6f6fa] text-[#17162b] lg:grid lg:grid-cols-[248px_minmax(0,1fr)]">
      <a
        href="#workspace-main"
        className="fixed left-2 top-2 z-50 -translate-y-24 rounded-xl bg-white px-3.5 py-2 text-[15px] font-semibold text-[#17162b] shadow focus:translate-y-0"
      >
        본문으로 이동
      </a>

      {/* Sidebar (Desktop) + Compact Header Nav (Mobile) */}
      <aside className="border-b border-[#e6e3f0] bg-white px-4 py-3 lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col lg:border-b-0 lg:border-r lg:px-4 lg:py-6">
        <div className="flex items-center justify-between gap-3 lg:block">
          <Link to="/" className="flex items-center gap-3 text-inherit no-underline">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#4c2ee6] text-white shadow-sm">
              <AudioLines size={20} aria-hidden="true" />
            </span>
            <span>
              <b className="block font-display text-[21px] font-extrabold leading-tight tracking-tight text-[#17162b]">리서치랩</b>
              <small className="block text-[13px] font-medium text-[#565570]">고객 검증 워크스페이스</small>
            </span>
          </Link>

          <button
            type="button"
            onClick={() => {
              setGuideDraftQuestions('');
              setGuideMode('generate');
            }}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-[#dfd7fb] bg-[#f7f4ff] px-3.5 text-[14px] font-bold text-[#4125cc] lg:hidden"
          >
            <BookOpen size={16} aria-hidden="true" />
            리서치 가이드
          </button>
        </div>

        <nav aria-label="워크스페이스" className="hidden lg:mt-8 lg:grid lg:grid-cols-1 lg:gap-1.5">
          <p className="px-3.5 pb-1.5 text-[13px] font-bold tracking-wide text-[#75728c]">워크스페이스</p>
          {sections.map(({ id, name, icon: Icon }) => {
            const active = section.id === id;
            return (
              <Link
                key={id}
                to={id === 'home' ? '/' : `/?view=${id}`}
                aria-current={active ? 'page' : undefined}
                className={`flex min-h-11 shrink-0 items-center gap-3 whitespace-nowrap rounded-xl px-3.5 py-2.5 text-[16px] transition-colors ${
                  active
                    ? 'bg-[#efeaff] font-extrabold text-[#4125cc]'
                    : 'font-semibold text-[#44435c] hover:bg-[#f6f4fd] hover:text-[#17162b]'
                }`}
              >
                <Icon size={19} aria-hidden="true" className="shrink-0" />
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
          className="mt-auto hidden items-center gap-3 rounded-xl border border-[#dfd7fb] bg-[#f8f6ff] p-3.5 text-left text-[#4125cc] transition-colors hover:bg-[#efeaff] lg:flex"
        >
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#ebe3ff]">
            <BookOpen size={19} aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1">
            <b className="block text-[15px] font-extrabold">리서치 가이드</b>
            <small className="block truncate text-[13px] font-medium text-[#5c5486]">AI 분석 · 설문 · 나의 질문함</small>
          </span>
          <ChevronRight size={16} aria-hidden="true" className="shrink-0" />
        </button>
      </aside>

      {/* Main Workspace */}
      <div className="min-w-0">
        <header className="flex min-h-16 flex-wrap items-center justify-between gap-2.5 border-b border-[#e6e3f0] bg-white px-4 py-2.5 sm:px-8">
          <div className="flex items-center gap-1.5 text-[15px] text-[#565570]">
            <span className="hidden font-medium sm:inline">워크스페이스</span>
            <ChevronRight size={15} className="hidden sm:inline" aria-hidden="true" />
            <b className="font-extrabold text-[#17162b]">{section.name}</b>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setSyncModalOpen(true)}
              className={`inline-flex min-h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl border px-3.5 text-[14px] font-bold transition-colors ${
                workspaceSync.syncId && workspaceSync.connected
                  ? 'border-[#b7e2d1] bg-[#edf9f4] text-[#14674d] hover:bg-[#e1f5ed]'
                  : 'border-[#dcd8e8] bg-white text-[#17162b] hover:bg-[#f6f6fa]'
              }`}
            >
              <MonitorSmartphone size={16} aria-hidden="true" />
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
                className={saasUi.btnCompactSoft}
              >
                <Mic size={16} aria-hidden="true" /> <span className="hidden sm:inline">음성 인터뷰</span><span className="sm:hidden">녹음</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => setSummaryModal({ title: '', text: '' })}
              className={saasUi.btnCompactSecondary}
            >
              <FileText size={16} className="text-[#4c2ee6]" aria-hidden="true" /> <span className="hidden sm:inline">텍스트 요약</span><span className="sm:hidden">요약</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setGuideDraftQuestions('');
                setGuideMode('analyze');
              }}
              className={`hidden sm:inline-flex ${saasUi.btnCompactSecondary}`}
            >
              <Sparkles size={16} className="text-[#4c2ee6]" aria-hidden="true" /> AI 질문·메모 분석
            </button>
          </div>
        </header>

        <main id="workspace-main" tabIndex={-1} className="mx-auto grid max-w-[1400px] gap-6 px-4 pt-6 pb-24 sm:px-8 lg:pt-7 lg:pb-8">
          {notice && (
            <div
              role="status"
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#dfd7fb] bg-[#efeaff] px-4 py-3 text-[15px] font-medium text-[#4125cc]"
            >
              <span>{notice}</span>
              <button
                type="button"
                onClick={() => setNotice('')}
                className="text-[14px] font-bold text-[#4125cc] hover:underline"
              >
                닫기
              </button>
            </div>
          )}

          {section.id === 'home' && (
            <>
              <section className={`relative flex flex-col justify-between gap-8 overflow-hidden ${saasUi.card} px-6 py-8 sm:px-10 sm:py-10 lg:flex-row lg:items-center`}>
                <div className="relative z-10 max-w-2xl">
                  <p className="inline-flex items-center gap-1.5 text-[14px] font-extrabold tracking-tight text-[#4c2ee6]">
                    <FlaskConical aria-hidden="true" size={16} /> 고객 검증 워크스페이스
                  </p>
                  <h1 className="mt-2.5 font-display text-[34px] font-extrabold leading-[1.16] tracking-[-0.025em] text-[#17162b] sm:text-[44px] lg:text-[48px] [text-wrap:balance]">
                    <strong className="font-extrabold text-[#4c2ee6]">좋은 질문</strong>에서
                    <br />
                    <strong className="font-extrabold text-[#17162b]">좋은 발견</strong>이 시작돼요.
                  </h1>
                  <p className="mt-3.5 max-w-xl text-[16px] leading-relaxed text-[#44435c] sm:text-[17px]">
                    <strong className="font-bold text-[#17162b]">인터뷰 질문 설계·실시간 녹음</strong>부터{' '}
                    <strong className="font-bold text-[#17162b]">타겟 유저 설문 배포</strong>,{' '}
                    <strong className="font-bold text-[#17162b]">AI 인사이트 리포트</strong>까지 한곳에서 진행해요.
                  </p>
                  <div className="mt-6 flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setEditing('new')}
                      className="inline-flex min-h-12 shrink-0 items-center gap-2 whitespace-nowrap rounded-xl bg-[#4c2ee6] px-5 text-[16px] font-bold text-white shadow-[0_2px_8px_rgba(76,46,230,0.22)] transition-colors hover:bg-[#3d22c9]"
                    >
                      <Plus size={18} aria-hidden="true" /> 대상자 추가
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setGuideDraftQuestions('');
                        setGuideMode('generate');
                      }}
                      className="inline-flex min-h-12 shrink-0 items-center gap-2 whitespace-nowrap rounded-xl border border-[#cfc6f7] bg-[#f6f3ff] px-5 text-[16px] font-bold text-[#4125cc] transition-colors hover:bg-[#ebe4ff]"
                    >
                      <Play size={16} aria-hidden="true" /> 인터뷰 질문 시작
                    </button>
                    <Link
                      to="/?view=surveys&new=1"
                      className="inline-flex min-h-12 shrink-0 items-center gap-2 whitespace-nowrap rounded-xl border border-[#dcd8e8] bg-white px-5 text-[16px] font-bold text-[#17162b] transition-colors hover:border-[#b9b0e0] hover:bg-[#faf9fd]"
                    >
                      설문 만들기 <ArrowRight size={17} aria-hidden="true" />
                    </Link>
                    <Link
                      to="/?view=templates"
                      className="inline-flex min-h-12 shrink-0 items-center gap-2 whitespace-nowrap rounded-xl border border-[#dcd8e8] bg-white px-5 text-[16px] font-bold text-[#4125cc] transition-colors hover:border-[#b9b0e0] hover:bg-[#faf9fd]"
                    >
                      <Library size={17} aria-hidden="true" /> 질문 템플릿 생성
                    </Link>
                  </div>
                </div>
                <HeroArt />
              </section>

              <section aria-label="리서치 현황" className="grid grid-cols-2 gap-3.5 lg:grid-cols-4">
                {statItems.map(({ Icon, label, unit, to, tint }, i) => (
                  <Link
                    to={to}
                    key={label}
                    className={`flex min-h-24 items-center gap-3.5 ${saasUi.card} px-5 py-4.5 transition-all hover:border-[#bfb4ec] hover:shadow-[0_4px_14px_rgba(76,46,230,0.06)]`}
                  >
                    <span className={`grid size-12 shrink-0 place-items-center rounded-xl ${tint}`}>
                      <Icon size={21} aria-hidden="true" />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-[14px] font-bold text-[#565570]">{label}</span>
                      <span className="tnum mt-0.5 block font-display text-[30px] font-extrabold leading-tight tracking-tight text-[#17162b] sm:text-[34px]">
                        {i === 3 && surveyState.error ? '—' : counts[i]}
                        <small className="ml-1 text-[15px] font-bold text-[#565570]">{unit}</small>
                      </span>
                    </span>
                  </Link>
                ))}
              </section>
            </>
          )}

          {(section.id === 'home' || section.id === 'people') && (
            <div className={`grid items-start gap-5 ${section.id === 'people' ? 'grid-cols-1' : 'xl:grid-cols-[minmax(0,1fr)_300px]'}`}>
              <section className={`min-w-0 ${saasUi.card}`}>
                <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4.5 sm:px-6">
                  <div>
                    {section.id === 'people' ? (
                      <h1 className={saasUi.pageTitle}>인터뷰 대상자</h1>
                    ) : (
                      <h2 className="font-display text-[21px] font-extrabold tracking-tight text-[#17162b]">인터뷰 대상자</h2>
                    )}
                    <p className="mt-1 text-[15px] text-[#565570]">
                      <strong className="font-bold text-[#17162b]">섭외 현황</strong>과{' '}
                      <strong className="font-bold text-[#17162b]">인터뷰 일정</strong>을 한눈에 관리해요.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setBulkImportOpen(true)}
                      className={saasUi.btnCompactSoft}
                    >
                      <Upload size={16} aria-hidden="true" /> 일괄 추가
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
                      className={saasUi.btnCompactSecondary}
                    >
                      <Download size={16} aria-hidden="true" /> CSV 내보내기
                    </button>
                    {section.id === 'people' && (
                      <button
                        type="button"
                        onClick={() => setEditing('new')}
                        className={saasUi.btnCompactPrimary}
                      >
                        <Plus size={16} aria-hidden="true" /> 대상자 추가
                      </button>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap gap-2.5 px-5 pb-4 sm:px-6">
                  <label className="flex min-h-11 min-w-[200px] flex-1 items-center gap-2.5 rounded-xl border border-[#dcd8e8] bg-white px-3.5 text-[#565570] transition-colors focus-within:border-[#4c2ee6]">
                    <Search size={16} aria-hidden="true" />
                    <input
                      name="q"
                      autoComplete="off"
                      aria-label="대상자 검색"
                      placeholder="이름, 특징, 대안 검색…"
                      value={query}
                      onChange={(e) => filter('q', e.target.value)}
                      className="w-full border-0 bg-transparent text-[15px] text-[#17162b] placeholder:text-[#7c7a94] outline-none"
                    />
                  </label>
                  <select
                    aria-label="그룹 필터"
                    name="group"
                    value={group}
                    onChange={(e) => filter('group', e.target.value)}
                    className={saasUi.select}
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
                    className={saasUi.select}
                  >
                    <option value="">전체 상태</option>
                    {statuses.map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </div>

                {/* Mobile Card List (< md) */}
                <div className="divide-y divide-[#e6e3f0] border-t border-[#e6e3f0] md:hidden" role="region" aria-label="모바일 대상자 목록">
                  {paginated.map((p, i) => {
                    const globalIdx = (currentPage - 1) * PAGE_SIZE + i;
                    const isCompleted = p.status === '완료';
                    const personVoices = (voiceByPerson[p.id] ?? []).filter(
                      (v) => v.transcript?.trim() && !v.transcript.includes('인식된 음성이 없습니다'),
                    );
                    const noteText = p.note.trim();
                    const extraVoices = personVoices.filter(
                      (v) => !noteText.includes((v.transcript?.trim() ?? '').slice(0, 28)),
                    );
                    const fullResultText = [
                      noteText,
                      ...extraVoices.map((v) => `Q. ${v.question}\nA. ${v.transcript?.trim() ?? ''}`),
                    ]
                      .filter(Boolean)
                      .join('\n\n');
                    const expanded = mobilePreviewId === p.id;
                    const statusStyle =
                      p.status === '완료'
                        ? 'text-[#14674d]'
                        : p.status === '일정 확정'
                        ? 'text-[#295dad]'
                        : p.status === '거절/보류'
                        ? 'text-[#9f1d45]'
                        : 'text-[#8b4d17]';
                    return (
                      <article key={p.id} className="grid gap-3 px-4 py-4">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex min-w-0 items-center gap-3">
                            <span
                              className={`grid size-10 shrink-0 place-items-center rounded-xl text-[14px] font-extrabold ${avatarBg[globalIdx % 4]}`}
                              aria-hidden="true"
                            >
                              {p.name.slice(0, 1)}
                            </span>
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5 text-[16px]">
                                {isCompleted ? (
                                  <button
                                    type="button"
                                    onClick={() => setMobilePreviewId((curr) => (curr === p.id ? null : p.id))}
                                    className="truncate text-left font-bold text-[#17162b] underline decoration-[#c7b8f4] decoration-dashed underline-offset-4"
                                  >
                                    {p.name}
                                  </button>
                                ) : (
                                  <b className="truncate font-bold text-[#17162b]">{p.name}</b>
                                )}
                                {p.sample && <span className="shrink-0 text-[13px] font-medium text-[#565570]">· 예시</span>}
                              </div>
                              <p className="truncate text-[14px] text-[#565570]">{p.desc || '특징 미입력'}</p>
                            </div>
                          </div>
                          <span className={`shrink-0 text-[14px] font-bold ${statusStyle}`}>{p.status}</span>
                        </div>

                        <div className="tnum flex flex-wrap items-center gap-x-2 gap-y-1 text-[14px] text-[#565570]">
                          <span className="font-bold text-[#4125cc]">{p.group}</span>
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

                        {isCompleted && expanded ? (
                          <div className="grid gap-2 rounded-xl border border-[#dfd7fb] bg-[#f8f6ff] p-4 text-[14px]">
                            <b className="font-extrabold text-[#4125cc]">{p.name} 인터뷰 결과</b>
                            <p className="whitespace-pre-wrap leading-relaxed text-[#17162b]">
                              {fullResultText || '아직 기록된 인터뷰 결과가 없어요. 아래 상세 편집이나 음성 녹음으로 내용을 기록해 보세요.'}
                            </p>
                            {p.alternative && (
                              <span className="text-[13px] text-[#565570]">
                                현재 대안: <strong className="font-bold text-[#17162b]">{p.alternative}</strong>
                              </span>
                            )}
                          </div>
                        ) : (
                          p.note && (
                            <p className="line-clamp-2 rounded-xl bg-[#f8f7fc] px-3.5 py-2.5 text-[14px] text-[#17162b]">
                              {p.note}
                            </p>
                          )
                        )}

                        <div className="flex items-center gap-2 pt-0.5">
                          <button
                            type="button"
                            onClick={() => setVoice(p)}
                            className={`${saasUi.btnCompactSoft} flex-1`}
                          >
                            <Mic size={15} aria-hidden="true" /> 음성 녹음
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditing(p)}
                            className={`${saasUi.btnCompactSecondary} flex-1`}
                          >
                            상세 편집
                          </button>
                        </div>
                      </article>
                    );
                  })}
                  {!filtered.length && (
                    <p className="px-4 py-8 text-center text-[15px] text-[#565570]">
                      {people.length ? '검색 조건에 맞는 대상자가 없어요.' : '첫 인터뷰 대상자를 추가해 보세요.'}
                    </p>
                  )}
                </div>

                {/* Desktop Table (>= md) */}
                <div className="hidden overflow-x-auto md:block md:overflow-visible" role="region" aria-label="대상자 목록" tabIndex={0}>
                  <table className="w-full min-w-[640px] border-collapse text-left text-[15px] tnum">
                    <thead>
                      <tr className="border-t border-[#e6e3f0] bg-[#f8f7fc] text-[14px] font-bold text-[#44435c]">
                        <th scope="col" className="py-3.5 pl-6 pr-3">
                          이름 / 특징
                        </th>
                        <th scope="col" className="px-3 py-3.5">
                          그룹
                        </th>
                        <th scope="col" className="px-3 py-3.5">
                          섭외 경로
                        </th>
                        <th scope="col" className="px-3 py-3.5">
                          진행 상태
                        </th>
                        <th scope="col" className="px-3 py-3.5">
                          인터뷰 일시
                        </th>
                        <th scope="col" className="py-3.5 pl-3 pr-6 text-right">
                          <span className="sr-only">편집</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#e6e3f0]">
                      {paginated.map((p, i) => {
                        const globalIdx = (currentPage - 1) * PAGE_SIZE + i;
                        const isCompleted = p.status === '완료';
                        const personVoices = (voiceByPerson[p.id] ?? []).filter(
                          (v) => v.transcript?.trim() && !v.transcript.includes('인식된 음성이 없습니다'),
                        );
                        const noteText = p.note.trim();
                        const extraVoices = personVoices.filter(
                          (v) => !noteText.includes((v.transcript?.trim() ?? '').slice(0, 28)),
                        );
                        const fullResultText = [
                          noteText,
                          ...extraVoices.map((v) => `Q. ${v.question}\nA. ${v.transcript?.trim() ?? ''}`),
                        ]
                          .filter(Boolean)
                          .join('\n\n');
                        const openUpward = paginated.length >= 4 && i >= paginated.length - 2;
                        const showPopover = isCompleted && hoveredPersonId === p.id;
                        const statusStyle =
                          p.status === '완료'
                            ? 'text-[#14674d]'
                            : p.status === '일정 확정'
                            ? 'text-[#295dad]'
                            : p.status === '거절/보류'
                            ? 'text-[#9f1d45]'
                            : 'text-[#8b4d17]';
                        return (
                          <tr key={p.id} className="transition-colors hover:bg-[#faf9ff]">
                            <td className="py-3.5 pl-6 pr-3">
                              <div className="flex items-center gap-3">
                                <span
                                  className={`grid size-10 shrink-0 place-items-center rounded-xl text-[14px] font-extrabold ${avatarBg[globalIdx % 4]}`}
                                  aria-hidden="true"
                                >
                                  {p.name.slice(0, 1)}
                                </span>
                                <div className="min-w-0">
                                  <div className="flex items-center gap-1.5">
                                    {isCompleted ? (
                                      <span
                                        className="relative inline-flex items-center"
                                        onMouseEnter={() => setHoveredPersonId(p.id)}
                                        onMouseLeave={() =>
                                          setHoveredPersonId((curr) => (curr === p.id ? null : curr))
                                        }
                                      >
                                        <button
                                          type="button"
                                          aria-label={`${p.name} 인터뷰 결과 미리보기 및 편집`}
                                          onFocus={() => setHoveredPersonId(p.id)}
                                          onBlur={() =>
                                            setHoveredPersonId((curr) => (curr === p.id ? null : curr))
                                          }
                                          onClick={() => setEditing(p)}
                                          className="cursor-pointer text-left text-[16px] font-bold text-[#17162b] underline decoration-[#c7b8f4] decoration-dashed underline-offset-4 hover:text-[#4125cc]"
                                        >
                                          {p.name}
                                        </button>

                                        {showPopover && (
                                          <div
                                            role="tooltip"
                                            className={`absolute left-0 z-40 w-88 max-w-[calc(100vw-48px)] ${
                                              openUpward ? 'bottom-full pb-2' : 'top-full pt-2'
                                            }`}
                                          >
                                            <div className="rounded-2xl border border-[#dfd7fb] bg-white p-4.5 text-left shadow-xl">
                                              <div className="flex items-center justify-between gap-2 border-b border-[#e6e3f0] pb-2.5">
                                                <b className="text-[15px] font-extrabold text-[#17162b]">{p.name} 인터뷰 결과</b>
                                                <span className="text-[13px] font-bold text-[#14674d]">
                                                  완료 · {p.group}
                                                </span>
                                              </div>
                                              <div className="mt-3 max-h-52 overflow-y-auto whitespace-pre-wrap text-[14px] leading-relaxed text-[#17162b]">
                                                {fullResultText ||
                                                  '기록된 인터뷰 결과가 아직 없어요. 이름을 클릭해 핵심 인사이트를 남기거나 음성 녹음을 진행해 보세요.'}
                                              </div>
                                              {(p.alternative || personVoices.length > 0 || p.date) && (
                                                <div className="tnum mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-[#e6e3f0] pt-2.5 text-[13px] font-medium text-[#565570]">
                                                  {p.alternative && (
                                                    <span>
                                                      현재 대안: <strong className="font-bold text-[#17162b]">{p.alternative}</strong>
                                                    </span>
                                                  )}
                                                  {personVoices.length > 0 && (
                                                    <span>
                                                      {p.alternative ? '· ' : ''}음성 STT{' '}
                                                      <strong className="font-bold text-[#4125cc]">{personVoices.length}건</strong>
                                                    </span>
                                                  )}
                                                  {p.date && (
                                                    <span>
                                                      {p.alternative || personVoices.length > 0 ? '· ' : ''}
                                                      {p.date.replace('T', ' ')}
                                                    </span>
                                                  )}
                                                </div>
                                              )}
                                            </div>
                                          </div>
                                        )}
                                      </span>
                                    ) : (
                                      <b className="text-[16px] font-bold text-[#17162b]">{p.name}</b>
                                    )}
                                    {p.sample && <span className="text-[13px] font-medium text-[#565570]">· 예시</span>}
                                  </div>
                                  <span className="block truncate text-[14px] text-[#565570]">{p.desc || '—'}</span>
                                </div>
                              </div>
                            </td>
                            <td className="px-3 py-3.5 text-[14px] font-bold text-[#4125cc]">{p.group}</td>
                            <td className="px-3 py-3.5 text-[14px] text-[#565570]">{p.source || '—'}</td>
                            <td className={`px-3 py-3.5 text-[14px] font-bold ${statusStyle}`}>{p.status}</td>
                            <td className="px-3 py-3.5 font-mono text-[14px] text-[#565570]">
                              {p.date ? p.date.replace('T', ' ') : '—'}
                            </td>
                            <td className="py-3.5 pl-3 pr-6 text-right">
                              <button
                                type="button"
                                aria-label={`${p.name} 상세 편집`}
                                onClick={() => setEditing(p)}
                                className="inline-grid size-9 place-items-center rounded-xl text-[#565570] transition-colors hover:bg-[#efeaff] hover:text-[#4125cc]"
                              >
                                <MoreHorizontal size={18} aria-hidden="true" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {!filtered.length && (
                    <p className="px-5 py-8 text-center text-[15px] text-[#565570]">
                      {people.length ? '검색 조건에 맞는 대상자가 없어요.' : '첫 인터뷰 대상자를 추가해 보세요.'}
                    </p>
                  )}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#e6e3f0] px-6 py-3.5 text-[14px] text-[#565570]">
                  <span className="tnum">
                    대상자 <strong className="font-bold text-[#17162b]">{filtered.length}명</strong>
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
                          className="inline-flex min-h-9 items-center gap-0.5 rounded-xl border border-[#dcd8e8] bg-white px-3 text-[14px] font-bold text-[#17162b] hover:bg-[#f6f6fa] disabled:opacity-45"
                        >
                          <ChevronLeft size={15} aria-hidden="true" /> 이전
                        </button>
                        <span className="font-mono text-[14px] font-bold text-[#17162b]">
                          {currentPage} / {totalPages}
                        </span>
                        <button
                          type="button"
                          disabled={currentPage >= totalPages}
                          onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                          className="inline-flex min-h-9 items-center gap-0.5 rounded-xl border border-[#dcd8e8] bg-white px-3 text-[14px] font-bold text-[#17162b] hover:bg-[#f6f6fa] disabled:opacity-45"
                        >
                          다음 <ChevronRight size={15} aria-hidden="true" />
                        </button>
                      </div>
                    )}
                    {people.some((p) => p.sample) && (
                      <button
                        type="button"
                        onClick={() => setHideSamples(true)}
                        className="font-bold text-[#4c2ee6] hover:underline"
                      >
                        예시 데이터 지우기
                      </button>
                    )}
                  </div>
                </div>
              </section>

              {section.id === 'home' && (
                <aside className={`grid gap-4 ${saasUi.card} p-5.5`}>
                  <div>
                    <span className="mb-3 grid size-10 place-items-center rounded-xl bg-[#efeaff] text-[#4c2ee6]">
                      <SlidersHorizontal size={19} aria-hidden="true" />
                    </span>
                    <h2 className={saasUi.sectionTitle}>그룹별 모집 현황</h2>
                    <p className="mt-1 text-[14px] text-[#565570]">
                      각 그룹에서 <strong className="font-bold text-[#17162b]">3~5명</strong>을 만나 보세요.
                    </p>
                  </div>

                  <div className="grid gap-4">
                    {groups.map((g, i) => {
                      const n = people.filter((p) => p.group === g && p.status !== '거절/보류').length;
                      const meterClass = i === 1 ? 'meter-alt' : i === 2 ? 'meter-churn' : '';
                      return (
                        <Link
                          key={g}
                          to={`/?view=people&group=${encodeURIComponent(g)}`}
                          className="grid gap-1.5 text-inherit no-underline hover:text-[#4125cc]"
                        >
                          <div className="flex items-center justify-between text-[15px]">
                            <b className="font-bold text-[#17162b]">{g}</b>
                            <span className="tnum text-[15px] font-extrabold text-[#4125cc]">
                              {n}
                              <span className="font-medium text-[#565570]"> / 5명</span>
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
                    className="inline-flex w-fit items-center gap-1 text-[14px] font-bold text-[#4c2ee6] hover:underline"
                  >
                    모집 기준 · AI 가이드 보기 <ArrowRight size={15} aria-hidden="true" />
                  </button>
                </aside>
              )}
            </div>
          )}

          {section.id === 'surveys' && <Surveys state={surveyState} />}

          {section.id === 'analytics' && <SurveyAnalytics state={surveyState} />}

          {section.id === 'templates' && <ResearchTemplates onUseInGuide={openGuideFromTemplate} />}

          {section.id === 'insights' && (
            <div className="grid gap-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h1 className={saasUi.pageTitle}>인터뷰 기록 · 인사이트</h1>
                  <p className={saasUi.pageSubtitle}>
                    실시간 음성 녹음(STT) 기록과 대상자별 핵심 발견을 관리하고 AI로 자동 분석해요.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => void exportCollectedTexts()}
                    className={saasUi.btnSecondary}
                  >
                    <Download size={16} aria-hidden="true" /> 수집 텍스트 CSV
                  </button>
                  <button
                    type="button"
                    onClick={() => void exportAllResearchCsv()}
                    className={saasUi.btnSecondary}
                  >
                    <Download size={16} aria-hidden="true" /> 리서치·분석 통합 CSV
                  </button>
                  <button
                    type="button"
                    onClick={() => setVoice('pick')}
                    className={saasUi.btnSoft}
                  >
                    <Mic size={16} aria-hidden="true" /> 실시간 음성 녹음 · STT
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
                    className={saasUi.btnSecondary}
                  >
                    <FileText size={16} className="text-[#4c2ee6]" aria-hidden="true" /> 텍스트 요약
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setGuideDraftNotes('');
                      setGuideMode('analyze');
                    }}
                    className={saasUi.btnPrimary}
                  >
                    <Sparkles size={16} aria-hidden="true" /> AI 인터뷰 질문·답변 분석
                  </button>
                </div>
              </div>

              <AiInsightReportPanel
                people={people}
                surveySummaries={Object.values(surveyState.summaries)}
              />

              <InterviewSentimentPanel people={people} />

              <section className={`overflow-hidden ${saasUi.card}`}>
                <div className="flex flex-wrap items-center justify-between gap-2 px-6 py-4.5">
                  <h2 className={saasUi.sectionTitle}>저장된 인터뷰 기록 {noteCount}개</h2>
                  <button
                    type="button"
                    onClick={() => setGuideMode('generate')}
                    className={saasUi.btnCompactSecondary}
                  >
                    <BookOpen size={16} aria-hidden="true" /> 인터뷰 질문 보기
                  </button>
                </div>

                {noteCount ? (
                  <ul className="divide-y divide-[#e6e3f0] border-t border-[#e6e3f0]">
                    {people
                      .filter((p) => p.note)
                      .map((p) => (
                        <li key={p.id} className="grid gap-2.5 px-6 py-5 transition-colors hover:bg-[#faf9fd]/60">
                          <div className="flex flex-wrap items-center justify-between gap-2.5">
                            <div className="flex flex-wrap items-center gap-2 text-[14px]">
                              <b className="text-[16px] font-extrabold text-[#17162b]">{p.name}</b>
                              <span className="font-bold text-[#4125cc]">{p.group}</span>
                              {p.alternative && (
                                <>
                                  <span aria-hidden="true" className="text-[#7c7a94]">
                                    ·
                                  </span>
                                  <span className="text-[#565570]">현재 대안: {p.alternative}</span>
                                </>
                              )}
                              {p.sample && <span className="text-[#7c7a94]">· 예시</span>}
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                              <button
                                type="button"
                                onClick={() => setVoice(p)}
                                className={saasUi.btnCompactSoft}
                              >
                                <Mic size={15} aria-hidden="true" /> 음성 녹음
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  setSummaryModal({
                                    title: `${p.name} (${p.group}) 인터뷰 기록`,
                                    text: p.note,
                                  })
                                }
                                className={saasUi.btnCompactSecondary}
                              >
                                <FileText size={15} className="text-[#4c2ee6]" aria-hidden="true" /> 요약하기
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setGuideDraftQuestions('');
                                  setGuideDraftNotes(`- ${p.name}(${p.group}):\n${p.note}`);
                                  setGuideMode('analyze');
                                }}
                                className={saasUi.btnCompactSecondary}
                              >
                                <Sparkles size={15} className="text-[#4c2ee6]" aria-hidden="true" /> AI 분석기에 넣기
                              </button>
                            </div>
                          </div>
                          <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-[#17162b]">{p.note}</p>
                          <button
                            type="button"
                            onClick={() => setEditing(p)}
                            className="w-fit text-[14px] font-bold text-[#4c2ee6] hover:underline"
                          >
                            기록 편집
                          </button>
                        </li>
                      ))}
                  </ul>
                ) : (
                  <p className="border-t border-[#e6e3f0] px-6 py-9 text-center text-[15px] text-[#565570]">
                    실시간 음성 녹음(STT)을 진행하거나 대상자 상세 화면에서 인터뷰 인사이트를 기록하면 여기에 자동으로 저장돼요.
                  </p>
                )}
              </section>
            </div>
          )}
        </main>

        <footer className="mx-auto hidden max-w-[1440px] px-4 py-6 text-[14px] text-[#565570] sm:px-8 lg:block">
          리서치랩 · 고객 인터뷰와 연구 설문
        </footer>
      </div>

      {/* Mobile Bottom Navigation (< lg) */}
      <nav
        aria-label="모바일 하단 메뉴"
        className="fixed inset-x-0 bottom-0 z-30 flex items-center justify-around border-t border-[#e6e3f0] bg-white/95 px-1.5 py-2 backdrop-blur lg:hidden"
      >
        {sections.map(({ id, shortName, icon: Icon }) => {
          const active = section.id === id;
          return (
            <Link
              key={id}
              to={id === 'home' ? '/' : `/?view=${id}`}
              aria-current={active ? 'page' : undefined}
              className={`flex min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-xl py-1.5 text-[13px] font-semibold transition-colors ${
                active ? 'bg-[#f4f1ff] font-bold text-[#4c2ee6]' : 'text-[#565570]'
              }`}
            >
              <Icon size={19} aria-hidden="true" />
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
            <p className="text-[15px] leading-relaxed text-[#565570]">
              마이크로 인터뷰를 녹음하면 음성이 텍스트로 변환되어 선택한 대상자의 인터뷰 기록 공간에 자동으로 저장돼요.
            </p>

            {people.length > 0 && (
              <form
                className={`grid gap-3 p-4 ${saasUi.inset}`}
                onSubmit={(e) => {
                  e.preventDefault();
                  const id = new FormData(e.currentTarget).get('voice-person');
                  const p = people.find((v) => v.id === id);
                  if (p) setVoice(p);
                }}
              >
                <label className={saasUi.labelText}>
                  기존 대상자 선택
                  <select
                    name="voice-person"
                    defaultValue={customPeople.length === 1 ? customPeople[0].id : people[0]?.id ?? ''}
                    required
                    className={`w-full ${saasUi.select}`}
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
                  className={`w-fit ${saasUi.btnPrimary}`}
                >
                  <Mic size={17} aria-hidden="true" /> 녹음 · STT 화면 열기
                </button>
              </form>
            )}

            <form
              className={`grid gap-3 p-4 ${saasUi.cardSoft}`}
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
              <label className={saasUi.labelText}>
                새 대상자 이름으로 바로 녹음 시작
                <div className="flex flex-wrap gap-2">
                  <input
                    name="quick-voice-name"
                    required
                    maxLength={60}
                    value={quickVoiceName}
                    onChange={(e) => setQuickVoiceName(e.target.value)}
                    placeholder="예: 참여자 A (30대 마케터)"
                    className={`min-w-[180px] flex-1 ${saasUi.input}`}
                  />
                  <button
                    type="submit"
                    className={saasUi.btnSoft}
                  >
                    <Plus size={16} aria-hidden="true" /> 등록 후 바로 녹음
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
          <div className="grid gap-5">
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

            <details className={`p-4 text-[15px] ${saasUi.cardSoft}`}>
              <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2 font-bold text-[#4125cc]">
                <span>{webtoonTopic}</span>
                <span className="text-[14px] font-normal text-[#565570]">고객검증 인터뷰 {webtoonInterview.length}문항</span>
              </summary>
              <div className="mt-3.5 grid gap-3">
                <p className="leading-relaxed text-[#17162b]">
                  소개부터 하지 말고 최근에 있었던 일을 먼저 물어보세요. 서비스 아이디어는 5번에서 처음 보여 주세요.
                </p>
                <ol className="list-decimal grid gap-2.5 pl-5">
                  {webtoonInterview.map(({ stage, prompt }) => (
                    <li key={stage}>
                      <b className="font-bold text-[#17162b]">{stage}</b>
                      <p className="mt-0.5 text-[#565570]">{prompt}</p>
                    </li>
                  ))}
                </ol>
                <Link
                  to="/?view=surveys&new=1&template=webtoon"
                  onClick={() => setGuideMode(null)}
                  className={`w-fit ${saasUi.btnCompactSoft}`}
                >
                  웹툰 고객검증 설문 만들기 <ArrowRight size={15} aria-hidden="true" />
                </Link>
              </div>
            </details>

            <div className="grid gap-4 text-[15px] text-[#17162b]">
              <div className="rounded-xl border border-[#e6e3f0] bg-[#faf9fd] p-4">
                <h3 className="text-[16px] font-extrabold text-[#17162b]">
                  VPC · CPF 인터뷰 질문지 작성 6단계 (실습 가이드)
                </h3>
                <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-[14px] leading-relaxed text-[#44435c]">
                  <li>
                    <b className="text-[#17162b]">CPF 핵심가설 정리:</b> VPC 작성 내용을 바탕으로 고객군·고객 원형(최종사용자·구매자·의사결정자)별 고객 가설과 문제 가설을 정리해요.
                  </li>
                  <li>
                    <b className="text-[#17162b]">핵심질문 도출:</b> 문제 상황에서 무엇이 가장 불편한지, 이유·시간·비용·기존 대체재 불만을 묻는 질문을 설계해요.
                  </li>
                  <li>
                    <b className="text-[#17162b]">고객 가설 질문 (JTBD):</b> 고객의 특성과 실제 수행 행동을 확인하는 질문을 작성해요.
                  </li>
                  <li>
                    <b className="text-[#17162b]">문제 가설 & 강도 질문:</b> 특정 행동에서 겪는 문제와 빈도·비용·시간 등 숫자 판단근거를 확인해요.
                  </li>
                  <li>
                    <b className="text-[#17162b]">현재 행동 · 기존 대안 확인:</b> 문제 해결을 위해 현재 쓰는 대안과 계속 쓰는 이유를 질문해요.
                  </li>
                  <li>
                    <b className="text-[#17162b]">질문 3원칙 최종 검토:</b> 제품·서비스 평가나 미래형(&quot;Would you?&quot;) 질문이 아닌지, 가설을 검증할 수 있는지 검토해요.
                  </li>
                </ol>
              </div>

              <div>
                <h3 className="text-[16px] font-extrabold text-[#17162b]">누구를 만날까요? (고객군 · 고객 원형)</h3>
                <p className="mt-1.5 leading-relaxed text-[#565570]">
                  기초 탐색에서는 <b className="text-[#17162b]">최종사용자 · 구매자 · (최종)의사결정자</b> 원형을 우선으로, 세 그룹에서 각각 3~5명을 모집해 반복 패턴을 찾고 후속 인터뷰이도 추천받아 보세요.
                </p>
                <ul className="mt-2.5 list-disc space-y-1.5 pl-5">
                  {groups.map((g, i) => (
                    <li key={g}>
                      <b>{g}</b> · {groupInfo[i]}
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <h3 className="text-[16px] font-extrabold text-[#17162b]">인터뷰 질문 순서 · 기본 예시 (문제 탐색 → 강도 → 대안)</h3>
                <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-[#565570]">
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
          <p className="text-[15px] leading-relaxed text-[#565570]">직접 추가한 대상자는 그대로 남아요.</p>
          <div className="mt-5 flex justify-end gap-2.5">
            <button
              type="button"
              onClick={() => setHideSamples(false)}
              className={saasUi.btnSecondary}
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
              className={saasUi.btnDanger}
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
    <svg className="hidden h-48 w-76 shrink-0 lg:block" viewBox="0 0 390 224" fill="none" aria-hidden="true">
      <path
        d="M15 161C54 191 125 192 199 166S328 100 375 117M38 185C109 203 178 199 235 174S338 131 380 141"
        stroke="#ddd6f8"
        strokeDasharray="4 7"
      />
      <circle cx="216" cy="111" r="101" fill="#f3efff" />
      <circle cx="216" cy="111" r="82" stroke="#e5dcfe" />
      <g transform="translate(129 31) rotate(-10 66 80)">
        <rect x="7" y="9" width="140" height="168" rx="16" fill="#d9cefc" />
        <rect width="140" height="168" rx="16" fill="#fff" stroke="#c3b4f5" />
        <path d="M0 31H140" stroke="#ece6fe" />
        <path d="M32 -4v16M61 -4v16M91 -4v16M116 -4v16" stroke="#8565ea" strokeWidth="5" strokeLinecap="round" />
        <path d="M50 57h60M50 87h55M50 118h65M50 144h39" stroke="#ddd2fd" strokeWidth="5" strokeLinecap="round" />
        <path
          d="M21 57l4 4 8-9m-12 35 4 4 8-9m-12 36 4 4 8-9"
          stroke="#4c2ee6"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
      <g transform="translate(226 66) rotate(10 52 33)">
        <path
          d="M17 0h78a16 16 0 0 1 16 16v33a16 16 0 0 1-16 16H44L25 79V65h-8A17 17 0 0 1 0 48V17A17 17 0 0 1 17 0Z"
          fill="#4c2ee6"
        />
        <circle cx="32" cy="33" r="4" fill="#fff" />
        <circle cx="55" cy="33" r="4" fill="#fff" />
        <circle cx="78" cy="33" r="4" fill="#fff" />
      </g>
      <g transform="translate(79 113) rotate(-10 37 22)">
        <rect width="76" height="46" rx="12" fill="#fff" stroke="#d5c8fb" />
        <path
          d="M13 24h8l4-9 6 18 7-22 6 20 5-11 4 4h10"
          stroke="#7554e8"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
    </svg>
  );
}
