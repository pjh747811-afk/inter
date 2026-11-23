import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { groups, statuses, type Person } from '../lib/research';

export function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(()=>URL.revokeObjectURL(url),1000);
}

export function download(rows: string[][], filename: string) {
  const text = rows.map(row=>row.map(value=>`"${(/^[\s]*[=+\-@]|^[\t\r\n]/.test(value)?`'${value}`:value).replaceAll('"','""')}"`).join(',')).join('\r\n');
  saveBlob(new Blob(['\uFEFF',text],{type:'text/csv;charset=utf-8'}),filename);
}

export function Modal({title, close, children}: {title:string; close:()=>void; children:ReactNode}) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  useEffect(()=>{const dialog=ref.current; if(dialog && !dialog.open) dialog.showModal(); return ()=>dialog?.close();},[]);
  return <dialog ref={ref} className="research-dialog" aria-labelledby={id} onCancel={e=>{e.preventDefault();close();}}><header><h2 id={id}>{title}</h2><button className="r-icon" aria-label="닫기" onClick={close}><X size={20} aria-hidden="true"/></button></header><div className="dialog-body">{children}</div></dialog>;
}

export function PersonForm({record,save,close,remove}: {record?:Person;save:(p:Person)=>void;close:()=>void;remove?:()=>Promise<void>}) {
  const [confirm,setConfirm] = useState(false);
  const [removing,setRemoving] = useState(false);
  const [error,setError] = useState('');
  async function deleteRecord() {
    if(!remove || removing)return;
    setRemoving(true);setError('');
    try {await remove();} catch {setError('연결된 녹음을 지우지 못해 대상자를 삭제하지 않았어요. 잠시 뒤 다시 시도해 주세요.');} finally {setRemoving(false);}
  }
  function submit(e:FormEvent<HTMLFormElement>){
    e.preventDefault();
    if(confirm)return;
    const f=new FormData(e.currentTarget), read=(name:string)=>String(f.get(name)??'').trim();
    const p = {id:record?.id??crypto.randomUUID(),name:read('name'),desc:read('desc'),group:read('group'),source:read('source'),status:read('status'),date:read('date'),alternative:read('alternative'),note:read('note')};
    if (!p.name) { const input=e.currentTarget.elements.namedItem('name') as HTMLInputElement; input.value='';input.reportValidity();return; }
    save(p);
  }
  return <form className="r-form" autoComplete="off" onSubmit={submit}>
    <p className="form-hint">이 기록은 현재 브라우저에만 저장돼요. 민감한 개인정보 대신 닉네임을 사용해 보세요.{record?.sample?' 예시를 저장하면 실제 목록에 포함돼요.':''}</p>
    <div className="form-grid"><label>이름 / 닉네임 *<input name="name" required maxLength={60} defaultValue={record?.name} placeholder="예: 참여자 A…"/></label><label>연령 / 직업 등 특징<input name="desc" maxLength={120} defaultValue={record?.desc} placeholder="예: 30대 / 마케터…"/></label>
    <label>그룹<select name="group" defaultValue={record?.group??groups[0]}>{groups.map(g=><option key={g}>{g}</option>)}</select></label><label>진행 상태<select name="status" defaultValue={record?.status??statuses[0]}>{statuses.map(g=><option key={g}>{g}</option>)}</select></label>
    <label>섭외 경로<input name="source" maxLength={100} defaultValue={record?.source}/></label><label>인터뷰 일시 (현지 시간)<input type="datetime-local" name="date" defaultValue={record?.date}/></label></div>
    <label>현재 사용 중인 대안<input name="alternative" maxLength={160} defaultValue={record?.alternative} placeholder="예: 엑셀 수기 관리…"/></label><label>핵심 인사이트<textarea name="note" rows={4} maxLength={2500} defaultValue={record?.note} placeholder="기억하고 싶은 행동, 불편, 인용문…"/></label>
    {confirm ? <div className="modal-actions"><p>이 대상자와 인사이트{record?.sample?'':' 및 연결된 음성 답변'}를 삭제할까요?</p>{error&&<p className="r-error" role="alert">{error}</p>}<div className="research-actions"><button type="button" className="r-btn" disabled={removing} onClick={()=>setConfirm(false)}>기록 유지</button><button type="button" className="r-btn danger" disabled={removing} onClick={()=>void deleteRecord()}>{removing?'삭제 중…':'대상자 삭제'}</button></div></div> : <div className="research-actions modal-actions">{remove && <button type="button" className="r-text red" onClick={()=>setConfirm(true)}>삭제</button>}<button type="button" className="r-btn" onClick={close}>취소</button><button className="r-btn primary" type="submit">대상자 저장</button></div>}
  </form>;
}
