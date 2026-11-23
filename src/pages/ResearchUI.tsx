import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { groups, statuses, type Person } from '../lib/research';

export function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function download(rows: string[][], filename: string) {
  const text = rows
    .map((row) =>
      row
        .map((value) => `"${(/^[\s]*[=+\-@]|^[\t\r\n]/.test(value) ? `'${value}` : value).replaceAll('"', '""')}"`)
        .join(','),
    )
    .join('\r\n');
  saveBlob(new Blob(['\uFEFF', text], { type: 'text/csv;charset=utf-8' }), filename);
}

export function Modal({
  title,
  close,
  wide = false,
  children,
}: {
  title: string;
  close: () => void;
  wide?: boolean;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => dialog?.close();
  }, []);

  return (
    <dialog
      ref={ref}
      aria-labelledby={id}
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      onClick={(e) => {
        if (e.target === ref.current) close();
      }}
      className={`research-modal fixed inset-0 m-auto max-h-[calc(100dvh-28px)] w-[calc(100%-24px)] ${
        wide ? 'max-w-3xl' : 'max-w-xl'
      } overflow-hidden rounded-2xl border border-[#e9e7f1] bg-white p-0 text-[#22213a] shadow-2xl overscroll-contain`}
    >
      <header className="flex items-center justify-between gap-3 border-b border-[#e9e7f1] px-5 py-4">
        <h2 id={id} className="font-display text-lg font-bold tracking-tight text-[#22213a]">
          {title}
        </h2>
        <button
          type="button"
          aria-label="닫기"
          onClick={close}
          className="grid size-9 shrink-0 place-items-center rounded-lg text-[#62627a] transition-colors hover:bg-[#f1edff] hover:text-[#4d30cf]"
        >
          <X size={19} aria-hidden="true" />
        </button>
      </header>
      <div className="max-h-[calc(100dvh-105px)] overflow-y-auto px-5 py-4">{children}</div>
    </dialog>
  );
}

export function PersonForm({
  record,
  save,
  close,
  remove,
}: {
  record?: Person;
  save: (p: Person) => void;
  close: () => void;
  remove?: () => Promise<void>;
}) {
  const [confirm, setConfirm] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState('');

  async function deleteRecord() {
    if (!remove || removing) return;
    setRemoving(true);
    setError('');
    try {
      await remove();
    } catch {
      setError('연결된 녹음을 지우지 못해 대상자를 삭제하지 않았어요. 잠시 뒤 다시 시도해 주세요.');
    } finally {
      setRemoving(false);
    }
  }

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (confirm) return;
    const f = new FormData(e.currentTarget);
    const read = (name: string) => String(f.get(name) ?? '').trim();
    const p: Person = {
      id: record?.id ?? crypto.randomUUID(),
      name: read('name'),
      desc: read('desc'),
      group: read('group'),
      source: read('source'),
      status: read('status'),
      date: read('date'),
      alternative: read('alternative'),
      note: read('note'),
      sample: false,
    };
    if (!p.name) {
      const input = e.currentTarget.elements.namedItem('name') as HTMLInputElement;
      input.value = '';
      input.reportValidity();
      return;
    }
    save(p);
  }

  const inputClass =
    'w-full min-h-10 rounded-lg border border-[#dfdce9] bg-white px-3 py-2 text-sm font-normal text-[#22213a] transition-colors hover:border-[#b9b0da] focus:border-[#5b3df5]';

  return (
    <form className="grid gap-3.5" autoComplete="off" onSubmit={submit}>
      <p className="text-[13px] text-[#62627a]">
        이 기록은 현재 브라우저에만 저장돼요. 민감한 개인정보 대신 닉네임을 사용해 보세요.
        {record?.sample ? ' 예시를 저장하면 실제 목록에 포함돼요.' : ''}
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="grid gap-1.5 text-[13px] font-semibold text-[#22213a]">
          이름 / 닉네임 *
          <input
            name="name"
            required
            maxLength={60}
            defaultValue={record?.name}
            placeholder="예: 참여자 A"
            className={inputClass}
          />
        </label>
        <label className="grid gap-1.5 text-[13px] font-semibold text-[#22213a]">
          연령 / 직업 등 특징
          <input
            name="desc"
            maxLength={120}
            defaultValue={record?.desc}
            placeholder="예: 30대 / 마케터"
            className={inputClass}
          />
        </label>
        <label className="grid gap-1.5 text-[13px] font-semibold text-[#22213a]">
          그룹
          <select name="group" defaultValue={record?.group ?? groups[0]} className={inputClass}>
            {groups.map((g) => (
              <option key={g}>{g}</option>
            ))}
          </select>
        </label>
        <label className="grid gap-1.5 text-[13px] font-semibold text-[#22213a]">
          진행 상태
          <select name="status" defaultValue={record?.status ?? statuses[0]} className={inputClass}>
            {statuses.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <label className="grid gap-1.5 text-[13px] font-semibold text-[#22213a]">
          섭외 경로
          <input name="source" maxLength={100} defaultValue={record?.source} className={inputClass} />
        </label>
        <label className="grid gap-1.5 text-[13px] font-semibold text-[#22213a]">
          인터뷰 일시 (현지 시간)
          <input type="datetime-local" name="date" defaultValue={record?.date} className={inputClass} />
        </label>
      </div>
      <label className="grid gap-1.5 text-[13px] font-semibold text-[#22213a]">
        현재 사용 중인 대안
        <input
          name="alternative"
          maxLength={160}
          defaultValue={record?.alternative}
          placeholder="예: 엑셀 수기 관리"
          className={inputClass}
        />
      </label>
      <label className="grid gap-1.5 text-[13px] font-semibold text-[#22213a]">
        핵심 인사이트
        <textarea
          name="note"
          rows={4}
          maxLength={2500}
          defaultValue={record?.note}
          placeholder="기억하고 싶은 행동, 불편, 인용문…"
          className={`${inputClass} resize-y`}
        />
      </label>
      {confirm ? (
        <div className="grid gap-2.5 rounded-xl border border-[#f2d0d9] bg-[#fff5f7] p-3.5">
          <p className="text-sm font-medium text-[#22213a]">
            이 대상자와 인사이트{record?.sample ? '' : ' 및 연결된 음성 답변'}를 삭제할까요?
          </p>
          {error && (
            <p className="text-sm text-[#a6214e]" role="alert">
              {error}
            </p>
          )}
          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              disabled={removing}
              onClick={() => setConfirm(false)}
              className="min-h-10 rounded-lg border border-[#e2deee] bg-white px-4 text-sm font-semibold text-[#22213a] hover:bg-[#f7f7fb]"
            >
              기록 유지
            </button>
            <button
              type="button"
              disabled={removing}
              onClick={() => void deleteRecord()}
              className="min-h-10 rounded-lg bg-[#a6214e] px-4 text-sm font-semibold text-white hover:bg-[#8c1b41] disabled:opacity-50"
            >
              {removing ? '삭제 중…' : '대상자 삭제'}
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-1 flex flex-wrap items-center justify-end gap-2">
          {remove && (
            <button
              type="button"
              onClick={() => setConfirm(true)}
              className="mr-auto min-h-10 px-2 text-sm font-semibold text-[#a6214e] hover:underline"
            >
              삭제
            </button>
          )}
          <button
            type="button"
            onClick={close}
            className="min-h-10 rounded-lg border border-[#e2deee] bg-white px-4 text-sm font-semibold text-[#22213a] hover:bg-[#f7f7fb]"
          >
            취소
          </button>
          <button
            type="submit"
            className="min-h-10 rounded-lg bg-[#5b3df5] px-4 text-sm font-semibold text-white hover:bg-[#4b2ee0]"
          >
            대상자 저장
          </button>
        </div>
      )}
    </form>
  );
}
