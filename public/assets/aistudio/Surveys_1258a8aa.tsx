import { useEffect, useState, type FormEvent } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { ArrowUpRight, AudioLines, ClipboardList, CircleCheck, Download, Link2, Plus, Trash2, RefreshCw, ListChecks } from 'lucide-react';
import { api, demoStore } from '../lib/api';
import { types, type Question, type Survey, type SurveyKey } from '../lib/research';
import { webtoonSurvey, webtoonTopic } from '../lib/webtoonValidation';
import { questionGuideKey, type QuestionGuide } from '../lib/questionGuide';
import { Modal, saveBlob } from './ResearchUI';
import './research.css';

type Summary = Survey & { count:number };
const surveyStore = 'research.survey-keys.v1';
const auth = (s:SurveyKey) => ({authorization:`Bearer ${s.key}`});
const base = '/api/research';
const message = (e:unknown) => e instanceof Error ? e.message : '잠시 뒤 다시 시도해 주세요.';

export function useSurveys(){
  const [keys,setKeys] = useState(()=>demoStore.get<SurveyKey[]>(surveyStore,[]));
  const [summaries,setSummaries] = useState<Record<string,Summary>>({});
  const [error,setError] = useState(false);
  const [refresh,setRefresh] = useState(0);
  const [loading,setLoading] = useState(false);
  useEffect(()=>{
    if (!keys.length) return;
    const ctl = new AbortController();
    setLoading(true);
    void Promise.allSettled(keys.map(k=>api<Summary>(`${base}/manage/${k.id}`,{headers:auth(k),signal:ctl.signal}))).then(results=>{
      if(ctl.signal.aborted)return;
      setSummaries(Object.fromEntries(results.flatMap(r=>r.status==='fulfilled'?[[r.value.id,r.value]]:[])));
      setError(results.some(r=>r.status==='rejected'));
      setLoading(false);
    });
    return ()=>ctl.abort();
  },[keys,refresh]);
  return {keys,summaries,error,loading,count:Object.values(summaries).reduce((n,s)=>n+s.count,0), reload:()=>setRefresh(n=>n+1), add:(key:SurveyKey)=>{const next=[key,...keys];demoStore.set(surveyStore,next);setKeys(next);}};
}

export function Surveys({state}: {state:ReturnType<typeof useSurveys>}) {
  const [params,setParams] = useSearchParams();
  const [notice,setNotice] = useState('');
  const [error,setError] = useState('');
  const [busy,setBusy] = useState('');
  const [exporting,setExporting] = useState<SurveyKey|null>(null);
  const [closing,setClosing] = useState<SurveyKey|null>(null);
  const [copying,setCopying] = useState('');
  const closeBuilder = ()=>setParams({view:'surveys'});
  const link = (s:SurveyKey)=>`${window.location.origin}/survey/${s.id}`;
  async function copy(s:SurveyKey){
    try {await navigator.clipboard.writeText(link(s));setNotice('응답 링크를 복사했어요.');} catch {setCopying(link(s));}
  }
  async function toggle(s:SurveyKey,active:boolean){
    setBusy(s.id);setError('');
    try {await api(`${base}/manage/${s.id}`,{method:'PATCH',headers:auth(s),body:JSON.stringify({active})});setClosing(null);state.reload();setNotice(active?'다시 응답을 받아요.':'응답 접수를 종료했어요.');}catch(e){setError(message(e));}finally{setBusy('');}
  }
  async function exportCsv(s:SurveyKey,page:number){
    setBusy(s.id);setError('');
    try {const r=await fetch(`${base}/manage/${s.id}/answers.csv?page=${page}`,{headers:auth(s)});if(!r.ok)throw new Error('응답을 내보낼 수 없어요. 다시 시도해 주세요.');saveBlob(await r.blob(),`설문-응답-${page}.csv`);setExporting(null);setNotice('설문 응답을 CSV로 내보냈어요.');}catch(e){setError(message(e));}finally{setBusy('');}
  }
  if(params.has('new')) return <SurveyBuilder key={params.get('template')??''} initialTemplate={params.get('template')} cancel={closeBuilder} saved={s=>{state.add(s);closeBuilder();setNotice('응답을 받기 시작했어요. 참여자에게 응답 링크를 보내 주세요.');}}/>;
  return <><div className="page-title split"><div><h1>설문조사</h1><p>인터뷰 사전 스크리닝부터 논문 연구까지, 같은 질문으로 응답을 모아 보세요.</p></div><Link className="r-btn primary" to="/?view=surveys&new=1"><Plus size={17} aria-hidden="true"/> 설문 만들기</Link></div>
    <p className="r-notice">응답은 링크를 통해 모이고, 관리 권한은 설문을 만든 브라우저에만 남아요. 브라우저 데이터를 지우기 전에 응답을 CSV로 내려받으세요. 실제 참여자에게는 앱 게시 후 만든 링크를 보내 주세요.</p>
    <section className="research-panel"><div className="panel-head"><div><h2>내 설문 {state.keys.length}개</h2><p>문항은 응답을 받기 시작한 뒤 바뀌지 않아요.</p></div>{state.keys.length>0 && <button className="r-btn compact" disabled={state.loading} onClick={state.reload}><RefreshCw size={15} aria-hidden="true"/> 응답 수 새로고침</button>}</div>
    {!state.keys.length && <div className="survey-empty"><span className="stat-icon violet"><ClipboardList size={24} aria-hidden="true"/></span><h3>아직 만든 설문이 없어요</h3><p>서술형, 객관식, 5점 척도를 조합하고 연구 안내와 동의를 받아 보세요.</p><Link className="r-btn" to="/?view=surveys&new=1">첫 설문 만들기</Link></div>}
    <div className="survey-list">{state.keys.map(k=>{const s=state.summaries[k.id];return <article key={k.id}><div><h3>{k.title}</h3>{s ? <p><span className={`pill ${s.active?'green':'neutral'}`}>{s.active?'응답 접수 중':'접수 종료'}</span> <span>{s.questions.length}문항 · 응답 {s.count}건</span></p>:<p>{state.loading?'불러오는 중…':'설문 상태를 불러올 수 없어요.'}</p>}</div><div className="research-actions"><a className="r-btn compact" href={`/survey/${k.id}`} target="_blank" rel="noreferrer">응답 화면 <ArrowUpRight size={15} aria-hidden="true"/></a><button className="r-btn compact" onClick={()=>void copy(k)}><Link2 size={15} aria-hidden="true"/> 링크 복사</button><button className="r-btn compact" disabled={!s||busy===k.id} onClick={()=>s.count>500?setExporting(k):void exportCsv(k,1)}><Download size={15} aria-hidden="true"/> 응답 CSV</button>{s && <button className="r-btn compact" disabled={busy===k.id} onClick={()=>s.active?setClosing(k):void toggle(k,true)}>{s.active?'접수 종료':'접수 재개'}</button>}</div></article>;})}</div></section>
    {state.error && <p className="r-error" role="alert">일부 설문 상태를 읽을 수 없어요. 응답 수를 새로고침해 보세요.</p>}
    {error && !closing && !exporting && <p className="r-error" role="alert">{error}</p>}{notice && <p className="r-notice" role="status">{notice}</p>}
    {closing && <Modal title="응답 접수를 종료할까요?" close={()=>{if(!busy)setClosing(null);}}><p>이 링크로 새 응답을 받지 않아요. 기존 응답은 CSV로 내려받을 수 있어요.</p>{error && <p className="r-error" role="alert">{error}</p>}<div className="research-actions modal-actions"><button className="r-btn" disabled={!!busy} onClick={()=>setClosing(null)}>취소</button><button className="r-btn primary" disabled={!!busy} onClick={()=>void toggle(closing,false)}>{busy?'저장 중…':'접수 종료'}</button></div></Modal>}
    {copying && <Modal title="응답 링크 복사" close={()=>setCopying('')}><label className="r-form">이 주소를 복사해 주세요.<input name="survey-link" readOnly value={copying} onFocus={e=>e.currentTarget.select()}/></label></Modal>}
    {exporting && <Modal title="응답 CSV 내보내기" close={()=>{if(!busy)setExporting(null);}}><form className="r-form" onSubmit={e=>{e.preventDefault();void exportCsv(exporting,Number(new FormData(e.currentTarget).get('page')));}}><label>500건 단위 파일 번호<input name="page" type="number" min="1" max={Math.ceil(state.summaries[exporting.id].count/500)} required defaultValue="1"/></label>{error && <p className="r-error" role="alert">{error}</p>}<button className="r-btn primary" disabled={!!busy}>파일 내려받기</button></form></Modal>}
  </>;
}

const blank:Question[] = [{label:'',type:'text',required:true,options:[]}];
const templates = [
  {id:'screening',name:'인터뷰 사전 스크리닝',items:[{label:'최근 한 달 내 이 문제를 겪은 적이 있나요?',type:'choice',required:true,options:['있어요','없어요']},{label:'현재 이 문제를 어떻게 해결하시나요?',type:'text',required:true,options:[]}]},
  {id:'academic',name:'연구용 만족도',items:[{label:'이 서비스는 사용하기 쉬웠다.',type:'scale',required:true,options:[]},{label:'이 서비스는 필요한 작업을 수행하는 데 도움이 되었다.',type:'scale',required:true,options:[]},{label:'이용 경험에 대해 덧붙이고 싶은 의견이 있나요?',type:'text',required:false,options:[]}]},
  {id:'webtoon',name:`${webtoonTopic} · 고객검증`,items:webtoonSurvey},
] satisfies {id:string;name:string;items:Question[]}[];

function SurveyBuilder({initialTemplate,cancel,saved}:{initialTemplate:string|null;cancel:()=>void;saved:(s:SurveyKey)=>void}){
  const generated = demoStore.get<QuestionGuide|null>(questionGuideKey,null);
  const available = generated ? [...templates,{id:'generated',name:'생성한 고객검증 질문',items:generated.survey}] : templates;
  const [questions,setQuestions] = useState<Question[]>(()=>available.find(t=>t.id===initialTemplate)?.items??blank);
  const [error,setError] = useState('');
  const [busy,setBusy] = useState(false);
  const [confirmCancel,setConfirmCancel] = useState(false);
  function edit(i:number,q:Partial<Question>){setQuestions(old=>old.map((v,n)=>n===i?{...v,...q}:v));}
  async function submit(e:FormEvent<HTMLFormElement>){
    e.preventDefault();const data=new FormData(e.currentTarget);setError('');setBusy(true);
    try {const s=await api<SurveyKey>(`${base}/surveys`,{method:'POST',body:JSON.stringify({title:data.get('title'),intro:data.get('intro'),questions:questions.map(q=>({...q,options:q.options.map(o=>o.trim()).filter(Boolean)}))})});saved(s);}catch(e){setError(message(e));}finally{setBusy(false);}
  }
  return <><div className="page-title"><h1>설문 만들기</h1><p>참여자에게 보여 줄 안내와 질문을 작성해요.</p></div><form className="research-panel r-form builder" autoComplete="off" onSubmit={submit}><fieldset disabled={busy} className="builder-fields"><label>설문 제목 *<input name="title" maxLength={100} required placeholder="예: 업무 도구 이용 경험 연구…"/></label><label>연구 안내 / 동의 내용 *<textarea name="intro" required maxLength={3000} rows={5} placeholder="연구 목적, 소요 시간, 자발적 참여, 보관 기간, 철회 가능 범위와 문의 방법…"/></label><p className="form-hint">제목과 연구 안내는 참여 링크를 가진 사람에게 보여요. 논문용 설문이라면 소속 기관의 심의·동의 요건을 확인하세요.</p><div className="split"><h2>문항 {questions.length}개</h2><label className="template-picker">질문 예시<select aria-label="질문 예시" value="" onChange={e=>{const q=available.find(t=>t.id===e.target.value)?.items;if(q)setQuestions(old=>old===blank?q:old.length+q.length<=20?[...old,...q]:old);}}><option value="">예시 추가</option>{available.map(t=><option key={t.id} value={t.id} disabled={questions!==blank&&questions.length+t.items.length>20}>{t.name}</option>)}</select></label></div>
    {questions.map((q,i)=><fieldset className="question-editor" key={i}><legend><span className="pill violet">문항 {i+1}</span></legend><div className="question-top"><label>질문 *<input name={`label-${i}`} required maxLength={220} value={q.label} onChange={e=>edit(i,{label:e.target.value})}/></label><label>응답 유형<select name={`type-${i}`} value={q.type} onChange={e=>edit(i,{type:e.target.value as Question['type']})}>{Object.entries(types).map(([key,label])=><option value={key} key={key}>{label}</option>)}</select></label><button type="button" className="r-icon" aria-label={`문항 ${i+1} 삭제`} disabled={questions.length===1} onClick={()=>setQuestions(old=>old.filter((_,n)=>n!==i))}><Trash2 size={17} aria-hidden="true"/></button></div>{q.type==='choice' && <label>선택지 * (한 줄에 하나씩, 2~10개)<textarea rows={3} name={`options-${i}`} required value={q.options.join('\n')} onChange={e=>edit(i,{options:e.target.value.split('\n')})}/></label>}{q.type==='scale' && <p className="form-hint">1 전혀 그렇지 않다 / 5 매우 그렇다</p>}<label className="r-check"><input type="checkbox" name={`required-${i}`} checked={q.required} onChange={e=>edit(i,{required:e.target.checked})}/> 필수 응답</label></fieldset>)}
    <button type="button" className="r-btn" disabled={questions.length>=20} onClick={()=>setQuestions(old=>[...old,...blank])}><Plus size={16} aria-hidden="true"/> 문항 추가</button></fieldset>
    {error && <p className="r-error" role="alert">{error}</p>}<p className="form-hint">응답을 받기 시작하면 문항은 수정할 수 없어요.</p><div className="research-actions"><button className="r-btn" type="button" disabled={busy} onClick={()=>setConfirmCancel(true)}>취소</button><button className="r-btn primary" disabled={busy}>{busy?'설문을 여는 중…':'응답 받기 시작'}</button></div></form>
    {confirmCancel && <Modal title="설문 작성을 그만둘까요?" close={()=>setConfirmCancel(false)}><p>지금까지 입력한 내용은 저장되지 않아요.</p><div className="research-actions modal-actions"><button className="r-btn" onClick={()=>setConfirmCancel(false)}>계속 작성</button><button className="r-btn danger" onClick={cancel}>작성 취소</button></div></Modal>}
  </>;
}

export function SurveyResponse(){
  const {id} = useParams();
  return <ResponseForm key={id} id={id??''}/>;
}

function ResponseForm({id}:{id:string}){
  const [survey,setSurvey] = useState<Survey>();
  const [error,setError] = useState('');
  const [busy,setBusy] = useState(false);
  const [done,setDone] = useState(false);
  useEffect(()=>{
    const ctl=new AbortController();
    void api<Survey>(`${base}/surveys/${id}`,{signal:ctl.signal}).then(setSurvey).catch(e=>{if(!ctl.signal.aborted)setError(message(e));});
    return ()=>ctl.abort();
  },[id]);
  async function submit(e:FormEvent<HTMLFormElement>){
    e.preventDefault();if(!survey)return;
    const data=new FormData(e.currentTarget);setBusy(true);setError('');
    try{await api(`${base}/surveys/${id}/responses`,{method:'POST',body:JSON.stringify({consent:data.get('consent')==='on',answers:survey.questions.map((_,i)=>String(data.get(`q${i}`)??''))})});setDone(true);}catch(e){setError(message(e));}finally{setBusy(false);}
  }
  return <div className="response-shell"><header><span className="brand-icon"><AudioLines size={20} aria-hidden="true"/></span><b>리서치랩</b></header><main className="research-panel response-card">{!survey ? <><h1>연구 설문</h1><p role={error?'alert':'status'}>{error||'설문을 불러오는 중…'}</p></> : done ? <><span className="stat-icon green"><CircleCheck size={24} aria-hidden="true"/></span><h1>응답을 제출했어요</h1><p>참여해 주셔서 감사합니다.</p></> : <><span className="hero-tag"><ListChecks size={15} aria-hidden="true"/> 연구 설문</span><h1>{survey.title}</h1>{!survey.active ? <p>이 설문은 응답 접수를 종료했어요.</p> : <form className="r-form" autoComplete="off" onSubmit={submit}><section className="consent-box"><h2>참여 안내</h2><p>{survey.intro}</p><p className="form-hint">이름이나 연락처 등 개인을 알아볼 수 있는 정보는 답변에 적지 마세요.</p><label className="r-check"><input type="checkbox" name="consent" required/> 연구 안내를 읽었으며 자발적으로 참여하는 데 동의합니다. *</label></section>{survey.questions.map((q,i)=><fieldset className="response-question" key={i}><legend><span>{i+1}.</span> {q.label} {q.required?'*':''}</legend>{q.type==='text'?<textarea name={`q${i}`} aria-label={`${i+1}번 응답`} rows={3} maxLength={1500} required={q.required}/>:q.type==='scale'?<><div className="scale-label"><span>전혀 그렇지 않다</span><span>매우 그렇다</span></div><select name={`q${i}`} aria-label={`${i+1}번 점수`} defaultValue="" required={q.required}><option value="">점수 선택</option>{[1,2,3,4,5].map(n=><option key={n}>{n}</option>)}</select></>:<select name={`q${i}`} aria-label={`${i+1}번 선택`} defaultValue="" required={q.required}><option value="">응답 선택</option>{q.options.map(o=><option key={o}>{o}</option>)}</select>}</fieldset>)}{error && <p className="r-error" role="alert">{error}</p>}<button className="r-btn primary" disabled={busy}>{busy?'제출 중…':'응답 제출'}</button></form>}</>}</main></div>;
}
