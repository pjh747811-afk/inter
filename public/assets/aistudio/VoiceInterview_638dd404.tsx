import { useEffect, useRef, useState } from 'react';
import { AudioLines, Download, Mic, Square, Trash2 } from 'lucide-react';
import { deleteVoiceAnswer, listVoiceAnswers, saveVoiceAnswer, type VoiceAnswer } from '../lib/interviewAudio';
import { interviewPrompts, type Person } from '../lib/research';
import { webtoonInterview, webtoonTopic } from '../lib/webtoonValidation';
import { demoStore } from '../lib/api';
import { questionGuideKey, type QuestionGuide } from '../lib/questionGuide';
import { Modal, saveBlob } from './ResearchUI';

const limitSeconds = 30 * 60;
const limitBytes = 25 * 1024 * 1024;
const dates = new Intl.DateTimeFormat('ko-KR', {dateStyle:'medium',timeStyle:'short'});
const clock = (seconds: number) => `${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`;
const release = (stream: MediaStream) => stream.getTracks().forEach(track=>track.stop());

function micError(error: unknown) {
  if (error instanceof DOMException) {
    if (['NotAllowedError','SecurityError'].includes(error.name)) return '마이크를 사용할 수 없어요. 브라우저에서 마이크를 허용해 주세요. 미리보기에서 허용이 막히면 앱을 브라우저 탭에서 직접 열어 주세요.';
    if (error.name==='NotFoundError') return '마이크를 찾지 못했어요. 마이크를 연결한 뒤 다시 시작해 주세요.';
    if (error.name==='NotReadableError') return '마이크를 열지 못했어요. 다른 앱에서 마이크를 사용 중인지 확인해 주세요.';
  }
  return '녹음을 시작하지 못했어요. 마이크와 브라우저 설정을 확인해 주세요.';
}

export function VoiceInterview({person,close}:{person:Person;close:()=>void}) {
  const [generated] = useState(()=>demoStore.get<QuestionGuide|null>(questionGuideKey,null));
  const [answers,setAnswers] = useState<VoiceAnswer[]>([]);
  const [loading,setLoading] = useState(true);
  const [phase,setPhase] = useState<'idle'|'permission'|'recording'|'stopping'>('idle');
  const [seconds,setSeconds] = useState(0);
  const [question,setQuestion] = useState('');
  const [consent,setConsent] = useState(false);
  const [draft,setDraft] = useState<VoiceAnswer|null>(null);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  const [notice,setNotice] = useState('');
  const [confirm,setConfirm] = useState<'close'|'draft'|VoiceAnswer|null>(null);
  const active = useRef<MediaRecorder|null>(null);
  const session = useRef(0);
  const started = useRef(0);
  const recorderInUse = phase!=='idle';
  const supported = window.isSecureContext && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder==='function';

  const personId = person.id;
  useEffect(()=>{
    let ignore = false;
    void listVoiceAnswers(personId).then(items=>{if(!ignore)setAnswers(items);}).catch(()=>{if(!ignore)setError('저장된 녹음을 읽을 수 없어요. 브라우저의 사이트 저장 공간을 확인해 주세요.');}).finally(()=>{if(!ignore)setLoading(false);});
    return ()=>{
      ignore=true;
      session.current++;
      if (active.current) { release(active.current.stream); active.current=null; }
    };
  },[personId]);

  function stop(){
    const media = active.current;
    if(media?.state==='recording') { setPhase('stopping'); media.stop(); }
  }

  useEffect(()=>{
    if(phase!=='recording')return;
    const timer = window.setInterval(()=>{
      const elapsed = (performance.now()-started.current)/1000;
      setSeconds(Math.min(limitSeconds,Math.floor(elapsed)));
      if(elapsed>=limitSeconds) stop();
    },250);
    return ()=>window.clearInterval(timer);
  },[phase]);

  useEffect(()=>{
    if (!recorderInUse && !draft && !busy) return;
    const warn = (event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue='';};
    window.addEventListener('beforeunload',warn);
    return ()=>window.removeEventListener('beforeunload',warn);
  },[recorderInUse,draft,busy]);

  async function start(){
    if (!supported || !consent || draft || recorderInUse) return;
    const attempt = ++session.current;
    let stream:MediaStream|undefined;
    setError('');setNotice('');setSeconds(0);setPhase('permission');
    try {
      stream=await navigator.mediaDevices.getUserMedia({audio:true});
      if(attempt!==session.current){release(stream);return;}
      const media = new MediaRecorder(stream,{audioBitsPerSecond:96000});
      const chunks:Blob[] = [];
      let bytes=0;
      const time=Date.now();
      const label=question.trim() || '인터뷰 답변';
      media.ondataavailable = ({data})=>{
        if(attempt!==session.current || !data.size)return;
        chunks.push(data);bytes+=data.size;
        if(bytes>=limitBytes) stop();
      };
      media.onstop = ()=>{
        release(media.stream);
        if(attempt!==session.current)return;
        active.current=null;setPhase('idle');setConsent(false);
        const audio=new Blob(chunks,{type:media.mimeType || chunks[0]?.type || 'audio/webm'});
        if(!audio.size){setError('저장할 소리가 없어요. 마이크를 확인한 뒤 다시 녹음해 주세요.');return;}
        const duration=Math.max(1,Math.min(limitSeconds,Math.round((performance.now()-started.current)/1000)));
        setDraft({id:crypto.randomUUID(),personId,question:label,recordedAt:time,seconds:duration,audio});
        setNotice('녹음을 마쳤어요. 들어 본 뒤 답변을 저장해 주세요.');
      };
      media.onerror = ()=>{
        release(media.stream);
        if(attempt!==session.current)return;
        session.current++;active.current=null;setPhase('idle');setConsent(false);
        setError('녹음이 중단됐어요. 마이크를 확인한 뒤 다시 시도해 주세요.');
      };
      active.current=media;
      started.current=performance.now();
      media.start(1000);setPhase('recording');
    } catch(e) {
      if(stream)release(stream);
      if(attempt===session.current){active.current=null;setPhase('idle');setError(micError(e));}
    }
  }

  async function save(){
    if(!draft)return;
    setBusy(true);setError('');
    try {await saveVoiceAnswer(draft);setAnswers(old=>[draft,...old]);setDraft(null);setNotice('음성 답변을 저장했어요.');}
    catch {setError('브라우저에 저장하지 못했어요. 녹음 파일을 내려받아 보관할 수 있어요.');}
    finally {setBusy(false);}
  }

  async function accept(){
    if(confirm==='close') {close();return;}
    if(confirm==='draft'){setDraft(null);setConfirm(null);setError('');setNotice('저장하지 않은 녹음을 버렸어요.');return;}
    if(!confirm)return;
    setBusy(true);setError('');
    try {await deleteVoiceAnswer(confirm.id);setAnswers(old=>old.filter(a=>a.id!==confirm.id));setConfirm(null);setNotice('음성 답변을 삭제했어요.');}
    catch {setError('녹음을 삭제하지 못했어요. 잠시 뒤 다시 시도해 주세요.');}
    finally {setBusy(false);}
  }

  function requestClose(){
    if(busy)return;
    if(phase==='stopping') {setNotice('녹음을 정리하고 있어요. 잠시 기다려 주세요.');return;}
    if(recorderInUse||draft) setConfirm('close');
    else close();
  }

  return <Modal title="음성 인터뷰" close={requestClose}>
    <div className="voice-layout">
      <div className="voice-heading"><span className="stat-icon violet"><AudioLines size={19} aria-hidden="true"/></span><div><h3>{person.name}</h3><p>지금 쓰는 기기의 마이크로 답변을 녹음해요.</p></div></div>
      {confirm && <section className="voice-confirm" aria-label="녹음 삭제 확인"><b>{confirm==='close'?'저장하지 않고 닫을까요?':confirm==='draft'?'이 녹음을 버릴까요?':'저장한 답변을 삭제할까요?'}</b><p>이 녹음은 다시 불러올 수 없어요.</p><div className="research-actions"><button className="r-btn compact" disabled={busy} onClick={()=>setConfirm(null)}>계속하기</button><button className="r-btn compact danger" disabled={busy} onClick={()=>void accept()}>{confirm==='close'?'저장하지 않고 닫기':confirm==='draft'?'녹음 버리기':'음성 답변 삭제'}</button></div></section>}
      <div className="voice-console r-form">
        <label>인터뷰 질문 <span className="sr-only">(선택)</span><input name="voice-question" autoComplete="off" maxLength={220} disabled={recorderInUse||!!draft||!!confirm} placeholder="질문을 직접 입력해도 돼요…" value={question} onChange={e=>setQuestion(e.target.value)}/></label>
        <label className="voice-prompt-picker">추천 질문<select name="voice-prompt" value="" disabled={recorderInUse||!!draft||!!confirm} onChange={e=>{if(e.target.value)setQuestion(e.target.value);}}><option value="">질문 예시 선택</option>{generated && <optgroup label="리서치 가이드에서 만든 질문">{generated.interview.map(({stage,prompt},i)=><option key={stage} value={prompt}>{i+1}. {stage} — {prompt}</option>)}</optgroup>}<optgroup label="기본 고객검증">{interviewPrompts.map((prompt,i)=><option key={prompt} value={prompt}>{i+1}. {prompt}</option>)}</optgroup><optgroup label={webtoonTopic}>{webtoonInterview.map(({stage,prompt},i)=><option key={stage} value={prompt}>{i+1}. {stage} — {prompt}</option>)}</optgroup></select></label>
        <div className="voice-status" role="status">{phase==='permission'?'마이크 권한을 기다리는 중…':phase==='recording'?<><i aria-hidden="true"/> 녹음 중</>:phase==='stopping'?'녹음을 정리하는 중…':draft?'저장 전 녹음':'녹음 대기'}</div>
        <div className="voice-clock" aria-label="녹음 시간">{clock(draft?.seconds??seconds)}</div>
        {!supported && <p className="r-error" role="alert">이 화면에서는 마이크를 사용할 수 없어요. 앱을 브라우저 탭에서 직접 열거나 최신 브라우저를 사용해 주세요.</p>}
        {!recorderInUse && !draft && <><label className="r-check"><input type="checkbox" name="recording-consent" disabled={!supported||!!confirm} checked={consent} onChange={e=>setConsent(e.target.checked)}/> 참여자가 녹음에 동의했어요.</label><button className="r-btn primary" disabled={!supported||!consent||!!confirm} onClick={()=>void start()}><Mic size={16} aria-hidden="true"/> 녹음 시작</button></>}
        {phase==='recording' && <button className="r-btn danger" disabled={!!confirm} onClick={stop}><Square size={14} aria-hidden="true"/> 녹음 끝내기</button>}
        {phase==='permission' && <button className="r-btn" disabled={!!confirm} onClick={()=>{session.current++;setPhase('idle');}}>마이크 요청 취소</button>}
        {draft && <div className="voice-draft"><AudioPlayer answer={draft}/><div className="research-actions"><button className="r-btn primary" disabled={busy||!!confirm} onClick={()=>void save()}>{busy?'저장 중…':'음성 답변 저장'}</button><button className="r-btn" disabled={busy||!!confirm} onClick={()=>downloadAnswer(draft)}>내려받기</button><button className="r-text red" disabled={busy||!!confirm} onClick={()=>setConfirm('draft')}>녹음 버리기</button></div></div>}
        <p className="form-hint">한 번에 최대 30분 녹음할 수 있어요. 저장한 녹음은 이 브라우저에만 남고 전송되지 않아요.</p>
      </div>
      {error && <p className="r-error" role="alert">{error}</p>}
      <p className="voice-notice" role="status">{notice}</p>
      <section className="voice-library" aria-label="저장된 음성 답변"><h3>저장된 음성 답변 {answers.length}개</h3>
        {loading?<p>불러오는 중…</p>:answers.length===0?<p>아직 저장된 답변이 없어요.</p>:<ul>{answers.map(a=><li key={a.id}><div className="voice-entry"><div><b>{a.question}</b><small><time dateTime={new Date(a.recordedAt).toISOString()}>{dates.format(a.recordedAt)}</time> · {clock(a.seconds)}</small></div><button className="r-icon" aria-label={`${a.question} 녹음 내려받기`} onClick={()=>downloadAnswer(a)}><Download size={17} aria-hidden="true"/></button><button className="r-icon" aria-label={`${a.question} 녹음 삭제`} disabled={busy||!!confirm||recorderInUse} onClick={()=>setConfirm(a)}><Trash2 size={16} aria-hidden="true"/></button></div><AudioPlayer answer={a}/></li>)}</ul>}
      </section>
    </div>
  </Modal>;
}

function AudioPlayer({answer}:{answer:VoiceAnswer}) {
  const [url,setUrl] = useState('');
  useEffect(()=>{const src=URL.createObjectURL(answer.audio);setUrl(src);return ()=>URL.revokeObjectURL(src);},[answer.audio]);
  return <audio controls preload="metadata" src={url||undefined} aria-label={`${answer.question} 녹음 재생`}>이 브라우저에서는 녹음을 재생할 수 없어요. 파일을 내려받아 주세요.</audio>;
}

function downloadAnswer(answer:VoiceAnswer) {
  const type=answer.audio.type.toLowerCase();
  const extension=type.includes('mp4')?'m4a':type.includes('ogg')?'ogg':type.includes('wav')?'wav':'webm';
  saveBlob(answer.audio,`인터뷰-음성-${answer.id.slice(0,8)}.${extension}`);
}
