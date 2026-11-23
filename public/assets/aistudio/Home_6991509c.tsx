import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { AudioLines, LayoutDashboard, Users, ClipboardList, Lightbulb, Plus, ArrowRight, CalendarDays, CircleCheck, Search, MoreHorizontal, BookOpen, Download, ChevronRight, FlaskConical, SlidersHorizontal, Mic } from 'lucide-react';
import { demoStore } from '../lib/api';
import { groups, interviewPrompts, statuses, type Person } from '../lib/research';
import { deletePersonAudio } from '../lib/interviewAudio';
import { webtoonInterview, webtoonTopic } from '../lib/webtoonValidation';
import { download, Modal, PersonForm } from './ResearchUI';
import { Surveys, useSurveys } from './Surveys';
import { VoiceInterview } from './VoiceInterview';
import { QuestionGenerator } from './QuestionGenerator';
import './research.css';

const peopleStore = 'research.people.v1';
const samples: Person[] = [
  ['김OO','30대 / 마케터','핵심 타겟','지인 소개','완료','2026-11-25T14:00','엑셀 수기 관리','데이터 취합에 매주 3시간 소요됨'],
  ['이OO','20대 / 대학생','핵심 타겟','에브리타임','일정 확정','2026-11-26T19:00','노션','모바일 앱 연동이 안 되어 불편함'],
  ['박OO','40대 / 자영업자','대안 사용자','관련 카페','컨택 중','','경쟁 서비스','요금제가 비싸서 해지 고민 중'],
  ['최OO','30대 / 프리랜서','이탈/비사용','링크드인','섭외 대기','','사용 안 함','기존 툴은 기능이 복잡해서 포기'],
  ['정OO','20대 / 직장인','핵심 타겟','오픈채팅방','거절/보류','','카카오톡 나에게쓰기',''],
].map(([name,desc,group,source,status,date,alternative,note],i)=>({id:`example-${i}`,name,desc,group,source,status,date,alternative,note,sample:true}));
const sections = [{id:'home',name:'대시보드',icon:LayoutDashboard},{id:'people',name:'인터뷰 대상자',icon:Users},{id:'surveys',name:'설문조사',icon:ClipboardList},{id:'insights',name:'인사이트',icon:Lightbulb}];
const groupInfo = ['문제를 자주 겪는 잠재 고객','다른 방법으로 해결하는 고객','사용을 중단했거나 쓰지 않는 고객'];
const colors = ['violet','blue','green','orange'];

export default function Home() {
  const [params, setParams] = useSearchParams();
  const section = sections.find(s=>s.id === params.get('view')) ?? sections[0];
  const [people, setPeople] = useState(()=>demoStore.get(peopleStore, samples));
  const [editing, setEditing] = useState<Person | 'new' | null>(null);
  const [guide, setGuide] = useState(false);
  const [hideSamples, setHideSamples] = useState(false);
  const [notice, setNotice] = useState('');
  const [voice, setVoice] = useState<Person | 'pick' | null>(null);
  const surveyState = useSurveys();
  const query = params.get('q') ?? '', group = params.get('group') ?? '', status = params.get('status') ?? '';
  function filter(name: string, value: string) { const next = new URLSearchParams(params); if (value) next.set(name, value); else next.delete(name); setParams(next, {replace:true}); }
  function store(next: Person[]) { setPeople(next); demoStore.set(peopleStore, next); }
  function save(p: Person) { store(editing === 'new' ? [p,...people] : people.map(r=>r.id === p.id ? p : r)); setEditing(null); setNotice('대상자 정보를 저장했어요.'); }
  const filtered = people.filter(p=>(!group || p.group===group) && (!status || p.status===status) && `${p.name} ${p.desc} ${p.alternative}`.toLowerCase().includes(query.trim().toLowerCase()));
  const counts = [people.length, people.filter(p=>p.status==='일정 확정').length, people.filter(p=>p.status==='완료').length, surveyState.count];
  const noteCount = people.filter(p=>p.note).length;
  const voicePeople = people.filter(p=>!p.sample);
  return <div className="research-shell">
    <a href="#workspace-main" className="skip-link">본문으로 이동</a>
    <aside className="research-side">
      <Link to="/" className="research-brand"><span className="brand-icon"><AudioLines size={21} aria-hidden="true"/></span><span><b>리서치랩</b><small>고객 검증 워크스페이스</small></span></Link>
      <nav aria-label="워크스페이스"><p className="nav-label">워크스페이스</p>{sections.map(({id,name,icon:Icon})=><Link to={id==='home'?'/':`/?view=${id}`} key={id} aria-current={section.id===id?'page':undefined}><Icon size={18} aria-hidden="true"/><span>{name}</span></Link>)}</nav>
      <button className="research-guide" onClick={()=>setGuide(true)}><span className="guide-icon"><BookOpen size={18} aria-hidden="true"/></span><span><b>리서치 가이드</b><small>질문 만들기와 모집 기준</small></span><ChevronRight size={14} aria-hidden="true"/></button>
    </aside>
    <div className="research-workspace"><header className="research-top"><span>워크스페이스 <ChevronRight size={13} aria-hidden="true"/> <b>{section.name}</b></span><div className="workspace-actions">{(section.id==='home'||section.id==='people') && <button className="r-btn compact voice-open" onClick={()=>setVoice('pick')}><Mic size={16} aria-hidden="true"/> 음성 인터뷰</button>}<span className="research-profile" title="내 작업 공간">R</span></div></header>
      <main id="workspace-main" tabIndex={-1} className="research-main">
        {section.id==='home' && <>
          <section className="research-hero"><HeroArt/><div className="hero-copy"><p className="hero-tag"><FlaskConical aria-hidden="true" size={14}/> 고객 검증 워크스페이스</p><h1>좋은 질문에서<br/>좋은 발견이 시작돼요.</h1><p>인터뷰 대상자 모집부터 연구 설문, 인사이트 정리까지 한곳에서 관리해요.</p><div className="research-actions"><button className="r-btn primary" onClick={()=>setEditing('new')}><Plus size={17} aria-hidden="true"/> 대상자 추가</button><Link className="r-btn" to="/?view=surveys&new=1">설문 만들기 <ArrowRight size={16} aria-hidden="true"/></Link></div></div></section>
          <section aria-label="리서치 현황" className="research-stats">{[{Icon:Users,label:'전체 대상자',unit:'명',to:'/?view=people'},{Icon:CalendarDays,label:'일정 확정',unit:'명',to:'/?view=people&status=일정+확정'},{Icon:CircleCheck,label:'인터뷰 완료',unit:'명',to:'/?view=people&status=완료'},{Icon:ClipboardList,label:'설문 응답',unit:'건',to:'/?view=surveys'}].map(({Icon,label,unit,to},i)=><Link to={to} className="stat" key={label}><span className={`stat-icon ${colors[i]}`}><Icon size={20} aria-hidden="true"/></span><span><span className="stat-label">{label}</span><span className="stat-value">{i===3 && surveyState.error ? '—' : counts[i]}<small>{unit}</small></span></span></Link>)}</section>
        </>}
        {(section.id==='home'||section.id==='people') && <div className={`research-data ${section.id==='people'?'full':''}`}><section className="research-panel people-panel"><div className="panel-head"><div>{section.id==='people'?<h1>인터뷰 대상자</h1>:<h2>인터뷰 대상자</h2>}<p>섭외 현황과 인터뷰 일정을 관리해요.</p></div><div className="research-actions"><button className="r-btn compact" disabled={!filtered.some(p=>!p.sample)} onClick={()=>download([['이름/닉네임','특징','그룹','현재 대안','섭외 경로','진행 상태','인터뷰 일시','핵심 인사이트'],...filtered.filter(p=>!p.sample).map(p=>[p.name,p.desc,p.group,p.alternative,p.source,p.status,p.date,p.note])],'인터뷰-대상자.csv')} title="현재 검색 결과에서 예시를 제외하고 내보내기"><Download size={15} aria-hidden="true"/> CSV 내보내기</button>{section.id==='people' && <button className="r-btn primary compact" onClick={()=>setEditing('new')}><Plus size={16} aria-hidden="true"/> 대상자 추가</button>}</div></div>
        <div className="r-filters"><label className="r-search"><Search size={17} aria-hidden="true"/><input name="q" autoComplete="off" aria-label="대상자 검색" placeholder="이름, 특징 검색…" value={query} onChange={e=>filter('q',e.target.value)}/></label><select aria-label="그룹 필터" name="group" value={group} onChange={e=>filter('group',e.target.value)}><option value="">전체 그룹</option>{groups.map(g=><option key={g}>{g}</option>)}</select><select aria-label="진행 상태 필터" name="status" value={status} onChange={e=>filter('status',e.target.value)}><option value="">전체 상태</option>{statuses.map(g=><option key={g}>{g}</option>)}</select></div>
        <div className="table-scroll" role="region" aria-label="대상자 목록" tabIndex={0}><table><thead><tr>{['이름 / 특징','그룹','섭외 경로','진행 상태','인터뷰 일시'].map(h=><th key={h} scope="col">{h}</th>)}<th scope="col"><span className="sr-only">편집</span></th></tr></thead><tbody>{filtered.map((p,i)=><tr key={p.id}><td><div className="person-cell"><span className={`person-avatar ${colors[i%4]}`} aria-hidden="true">{p.name.slice(0,1)}</span><span><b>{p.name}</b>{p.sample && <small className="example">예시</small>}<small>{p.desc || '—'}</small></span></div></td><td><span className={`pill ${colors[groups.findIndex(g=>g===p.group)] ?? 'neutral'}`}>{p.group}</span></td><td>{p.source || '—'}</td><td><span className={`pill status-${statuses.findIndex(s=>s===p.status)}`}>{p.status}</span></td><td>{p.date.replace('T',' ') || '—'}</td><td><button className="r-icon" aria-label={`${p.name} 상세 편집`} onClick={()=>setEditing(p)}><MoreHorizontal size={18} aria-hidden="true"/></button></td></tr>)}</tbody></table>{!filtered.length && <p className="r-empty">{people.length?'검색 조건에 맞는 대상자가 없어요.':'첫 인터뷰 대상자를 추가해 보세요.'}</p>}</div>
        <div className="table-foot"><span>대상자 {filtered.length}명 <span className="mobile-hide">· 이 브라우저에 저장</span></span>{people.some(p=>p.sample) && <button className="r-text" onClick={()=>setHideSamples(true)}>예시 데이터 지우기</button>}</div></section>
        {section.id==='home' && <aside className="research-panel group-panel"><div className="group-head"><span className="stat-icon violet"><SlidersHorizontal size={19} aria-hidden="true"/></span><h2>그룹별 모집 현황</h2><p>각 그룹에서 3~5명을 만나 보세요.</p></div>{groups.map((g,i)=>{const n=people.filter(p=>p.group===g&&p.status!=='거절/보류').length;return <Link key={g} className="group-line" to={`/?view=people&group=${encodeURIComponent(g)}`}><span><b>{g}</b><small>{n}<span> / 5명</span></small></span><div className="meter"><div style={{width:`${Math.min(n/5,1)*100}%`}} className={`meter-${i}`}/></div></Link>;})}<button className="r-text group-link" onClick={()=>setGuide(true)}>모집 기준 보기 <ArrowRight size={15} aria-hidden="true"/></button></aside>}
        </div>}
        {section.id==='surveys' && <Surveys state={surveyState}/>}
        {section.id==='insights' && <><div className="page-title"><h1>인터뷰 인사이트</h1><p>대상자별 발견을 비교하고 다음 질문을 정리해요.</p></div><section className="research-panel"><div className="panel-head"><h2>기록된 인사이트 {noteCount}개</h2><button className="r-btn compact" onClick={()=>setGuide(true)}><BookOpen size={16} aria-hidden="true"/> 인터뷰 질문 보기</button></div>{noteCount ? <ul className="insight-list">{people.filter(p=>p.note).map(p=><li key={p.id}><div><b>{p.name}</b> <span className="pill violet">{p.group}</span> {p.sample && <small className="example">예시</small>}</div><p>{p.note}</p><button className="r-text" onClick={()=>setEditing(p)}>기록 편집</button></li>)}</ul> : <p className="r-empty">대상자 상세 화면에서 인터뷰 인사이트를 기록하면 여기에 보여요.</p>}</section></>}
      </main>
      <footer className="research-footer">리서치랩 <span>·</span> 고객 인터뷰와 연구 설문</footer>
    </div>
    <div className="sr-only" role="status">{notice}</div>
    {editing && <Modal title={editing==='new'?'대상자 추가':'대상자 상세'} close={()=>setEditing(null)}><PersonForm record={editing==='new'?undefined:editing} save={save} close={()=>setEditing(null)} remove={editing==='new'?undefined:async()=>{if(!editing.sample)await deletePersonAudio(editing.id);store(people.filter(p=>p.id!==editing.id));setEditing(null);setNotice('대상자 기록을 삭제했어요.');}}/></Modal>}
    {voice==='pick' && <Modal title="음성 인터뷰" close={()=>setVoice(null)}>{voicePeople.length ? <form className="r-form" onSubmit={e=>{e.preventDefault();const id=new FormData(e.currentTarget).get('voice-person');const p=voicePeople.find(v=>v.id===id);if(p)setVoice(p);}}><p>음성으로 답할 대상자를 선택해 주세요. 이 화면에서 바로 녹음하거나 저장한 답변을 다시 들을 수 있어요.</p><label>인터뷰 대상자<select name="voice-person" defaultValue={voicePeople.length===1?voicePeople[0].id:''} required><option value="">대상자 선택</option>{voicePeople.map(p=><option key={p.id} value={p.id}>{p.name}{p.desc?` · ${p.desc}`:''}</option>)}</select></label><button className="r-btn primary"><Mic size={16} aria-hidden="true"/> 녹음 화면 열기</button></form> : <div className="voice-layout"><p>음성 답변을 연결할 대상자가 필요해요. 닉네임만 입력해도 추가할 수 있어요.</p><div className="research-actions"><button className="r-btn primary" onClick={()=>{setVoice(null);setEditing('new');}}><Plus size={16} aria-hidden="true"/> 대상자 추가</button></div></div>}</Modal>}
    {voice && voice!=='pick' && <VoiceInterview key={voice.id} person={voice} close={()=>setVoice(null)}/>}
    {guide && <Modal title="리서치 가이드" close={()=>setGuide(false)}><div className="guide-content">
      <QuestionGenerator close={()=>setGuide(false)} editingSurvey={section.id==='surveys'&&params.has('new')}/>
      <details className="validation-guide"><summary><b>{webtoonTopic}</b><span>고객검증 인터뷰 {webtoonInterview.length}문항</span></summary><div>
        <p>소개부터 하지 말고 최근에 있었던 일을 먼저 물어보세요. 서비스 아이디어는 4번에서 처음 보여 주세요.</p>
        <ol>{webtoonInterview.map(({stage,prompt})=><li key={stage}><b>{stage}</b><p>{prompt}</p></li>)}</ol>
        <p>“좋아요”라는 반응보다 기존에 쓴 시간과 비용, 예시를 직접 만들어 봤는지 따로 기록해 보세요.</p>
        <Link className="r-btn compact" to="/?view=surveys&new=1&template=webtoon" onClick={()=>setGuide(false)}>웹툰 고객검증 설문 만들기 <ArrowRight size={15} aria-hidden="true"/></Link>
      </div></details>
      <h3>누구를 만날까요?</h3><p>세 그룹에서 각각 3~5명을 모집해 서로 다른 경험을 비교해 보세요. 지인 외 경로에서도 참여자를 찾아보세요.</p><ul>{groups.map((g,i)=><li key={g}><b>{g}</b> · {groupInfo[i]}</li>)}</ul><h3>인터뷰 질문 예시</h3><ol>{interviewPrompts.map(p=><li key={p}>{p}</li>)}</ol><h3>섭외 메시지 예시</h3><p>안녕하세요. [고객군]이 [문제]를 어떻게 해결하는지 알아보고 있어요. 약 [30분] 동안 최근 경험을 여쭤봐도 될까요? 참여 방식과 보상은 [안내]를 참고해 주세요.</p>
    </div></Modal>}
    {hideSamples && <Modal title="예시 데이터를 지울까요?" close={()=>setHideSamples(false)}><p>직접 추가한 대상자는 그대로 남아요.</p><div className="research-actions modal-actions"><button className="r-btn" onClick={()=>setHideSamples(false)}>취소</button><button className="r-btn danger" onClick={()=>{store(people.filter(p=>!p.sample));setHideSamples(false);setNotice('예시 데이터를 지웠어요.');}}>예시 지우기</button></div></Modal>}
  </div>;
}

function HeroArt(){return <svg className="hero-art" viewBox="0 0 390 224" fill="none" aria-hidden="true">
  <path d="M15 161C54 191 125 192 199 166S328 100 375 117M38 185C109 203 178 199 235 174S338 131 380 141" stroke="#d3c4fa" strokeDasharray="4 7"/>
  <circle cx="216" cy="111" r="101" fill="#e6dbff"/><circle cx="216" cy="111" r="82" stroke="#f4efff"/>
  <g transform="translate(129 31) rotate(-10 66 80)"><rect x="7" y="9" width="140" height="168" rx="16" fill="#b49af4"/><rect width="140" height="168" rx="16" fill="#fff" stroke="#b69df1"/><path d="M0 31H140" stroke="#e9ddff"/><path d="M32 -4v16M61 -4v16M91 -4v16M116 -4v16" stroke="#9e7ce9" strokeWidth="5" strokeLinecap="round"/><path d="M50 57h60M50 87h55M50 118h65M50 144h39" stroke="#d7c7fc" strokeWidth="5" strokeLinecap="round"/><path d="M21 57l4 4 8-9m-12 35 4 4 8-9m-12 36 4 4 8-9" stroke="#7654db" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/></g>
  <g transform="translate(226 66) rotate(10 52 33)"><path d="M17 0h78a16 16 0 0 1 16 16v33a16 16 0 0 1-16 16H44L25 79V65h-8A17 17 0 0 1 0 48V17A17 17 0 0 1 17 0Z" fill="#7953e9"/><circle cx="32" cy="33" r="4" fill="#fff"/><circle cx="55" cy="33" r="4" fill="#fff"/><circle cx="78" cy="33" r="4" fill="#fff"/></g>
  <g transform="translate(79 113) rotate(-10 37 22)"><rect width="76" height="46" rx="12" fill="#fff" stroke="#d0bcfd"/><path d="M13 24h8l4-9 6 18 7-22 6 20 5-11 4 4h10" stroke="#9b79ee" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></g>
  <path d="M322 32v20m-10-10h20M92 45v16m-8-8h16M305 164v16m-8-8h16" stroke="#a17dea" strokeWidth="2" strokeLinecap="round"/><circle cx="58" cy="97" r="4" fill="#cfb9fa"/><circle cx="351" cy="150" r="4" fill="#ab87f5"/>
</svg>;}
