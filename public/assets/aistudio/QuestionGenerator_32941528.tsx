import { useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { ArrowRight, Copy, Sparkles } from 'lucide-react';
import { api, demoStore } from '../lib/api';
import { questionGuideKey, type QuestionGuide } from '../lib/questionGuide';

const example = '일상 사진과 짧은 글을 웹툰으로 바꿔 주는 웹·앱';

export function QuestionGenerator({close,editingSurvey}:{close:()=>void;editingSurvey:boolean}) {
  const [result,setResult] = useState(()=>demoStore.get<QuestionGuide|null>(questionGuideKey,null));
  const [item,setItem] = useState(result?.item??'');
  const [busy,setBusy] = useState(false);
  const [notice,setNotice] = useState('');
  const [error,setError] = useState('');
  const [copyText,setCopyText] = useState('');
  const heading=useRef<HTMLHeadingElement>(null);

  async function generate(e:FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data=new FormData(e.currentTarget);
    if(item.trim().length<3){setError('아이템을 3자 이상 입력해 주세요.');return;}
    setBusy(true);setError('');setNotice('');setCopyText('');
    try {
      const guide=await api<QuestionGuide>('/api/research/question-guide',{method:'POST',body:JSON.stringify({item,audience:data.get('audience'),hypothesis:data.get('hypothesis')})});
      demoStore.set(questionGuideKey,guide);setResult(guide);setNotice(`인터뷰 ${guide.interview.length}문항과 설문 ${guide.survey.length}문항을 만들었어요.`);
      requestAnimationFrame(()=>heading.current?.focus());
    } catch(e) {setError(e instanceof Error ? e.message : '질문을 만들지 못했어요. 잠시 뒤 다시 시도해 주세요.');}
    finally {setBusy(false);}
  }

  async function copyQuestions(guide:QuestionGuide){
    const text=[guide.item,'','인터뷰 질문',...guide.interview.map(({stage,prompt},i)=>`${i+1}. [${stage}] ${prompt}`),'','설문 문항',...guide.survey.map((q,i)=>`${i+1}. ${q.label}${q.options.length?`\n   ${q.options.join(' / ')}`:''}`)].join('\n');
    try {await navigator.clipboard.writeText(text);setNotice('질문지 전체를 복사했어요.');} catch {setCopyText(text);}
  }

  return <section className="question-maker" aria-label="아이템으로 질문 만들기">
    <div className="question-maker-head"><span className="stat-icon violet"><Sparkles size={18} aria-hidden="true"/></span><div><h3>아이템으로 질문 만들기</h3><p>AI가 실제 경험부터 시제품 검증까지 묻는 인터뷰·설문 초안을 만들어요.</p></div></div>
    <form className="r-form" autoComplete="off" onSubmit={generate}>
      <fieldset disabled={busy} className="r-form">
        <label>검증할 아이템 *<textarea name="item" rows={2} minLength={3} maxLength={220} required value={item} onChange={e=>setItem(e.target.value)} placeholder="예: 일상을 짧은 웹툰으로 바꿔 주는 웹·앱…"/></label>
        <button className="r-text question-example" type="button" onClick={()=>setItem(example)}>웹툰 앱 예시 입력</button>
        <details><summary>타겟과 가설 추가 (선택)</summary><div className="question-context r-form"><label>타겟 고객<input name="audience" maxLength={150} placeholder="예: 일상을 사진으로 자주 남기는 20대…"/></label><label>검증하고 싶은 가설<textarea name="hypothesis" rows={2} maxLength={250} placeholder="예: 편집에 시간이 들어 SNS 공유를 미룬다…"/></label></div></details>
      </fieldset>
      <p className="form-hint">입력 내용은 질문 생성을 위해 AI에 전달돼요. 개인정보나 공개하기 어려운 내용은 빼 주세요.</p>
      {error && <p role="alert" className="r-error">{error}</p>}
      <div className="research-actions"><button className="r-btn primary" disabled={busy}><Sparkles size={15} aria-hidden="true"/>{busy?'질문을 만드는 중…':'인터뷰·설문 질문 만들기'}</button></div>
    </form>
    <p className="voice-notice" role="status">{busy?'아이템에 맞는 질문을 작성하고 있어요. 잠시만 기다려 주세요.':notice}</p>
    {result && <section className="question-result">
      <p className="question-subject">{result.item}</p><h4 ref={heading} tabIndex={-1}>인터뷰 질문 {result.interview.length}개</h4>
      <ol>{result.interview.map(({stage,prompt})=><li key={stage}><b>{stage}</b><p>{prompt}</p></li>)}</ol>
      <h4>설문 문항 {result.survey.length}개</h4><ol>{result.survey.map(q=><li key={q.label}><p>{q.label}</p><small>{q.options.length?q.options.join(' / '):'서술형 (선택 응답)'}</small></li>)}</ol>
      <p className="form-hint">AI 초안이에요. 실제로 묻기 전에 문항이 한 번에 하나만 묻는지, 답을 유도하지 않는지 확인해 주세요. 최근 질문지는 이 브라우저에 남아요.</p>
      <div className="research-actions"><button className="r-btn compact" onClick={()=>void copyQuestions(result)}><Copy size={15} aria-hidden="true"/> 전체 질문 복사</button>{editingSurvey ? <button className="r-btn compact" onClick={close}>설문 작성으로 돌아가기</button> : <Link className="r-btn compact" to="/?view=surveys&new=1&template=generated" onClick={close}>설문 초안으로 사용 <ArrowRight size={15} aria-hidden="true"/></Link>}</div>
      {editingSurvey && <p className="form-hint">기존 설문에 추가하려면 질문 예시에서 ‘생성한 고객검증 질문’을 선택하세요.</p>}
      {copyText && <label className="r-form">아래 질문지를 직접 복사해 주세요.<textarea rows={7} value={copyText} readOnly onFocus={e=>e.currentTarget.select()}/></label>}
    </section>}
  </section>;
}
