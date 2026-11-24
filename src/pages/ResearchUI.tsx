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

export function download(
  rows: Array<Array<string | number | boolean | null | undefined>>,
  filename: string,
) {
  const text = rows
    .map((row) =>
      row
        .map((value) => {
          const s = String(value ?? '');
          return `"${(/^[\s]*[=+\-@]|^[\t\r\n]/.test(s) ? `'${s}` : s).replaceAll('"', '""')}"`;
        })
        .join(','),
    )
    .join('\r\n');
  saveBlob(new Blob(['\uFEFF', text], { type: 'text/csv;charset=utf-8' }), filename);
}

export const saasUi = {
  card: 'rounded-2xl border border-[#e4e1ef] bg-white shadow-[0_1px_3px_rgba(23,22,43,0.03)]',
  cardSoft: 'rounded-2xl border border-[#dfd7fb] bg-[#f8f6ff] shadow-[0_1px_3px_rgba(76,46,230,0.04)]',
  inset: 'rounded-xl border border-[#e6e3f0] bg-[#faf9fd]',
  input:
    'w-full min-h-11 rounded-xl border border-[#dcd8e8] bg-white px-3.5 py-2.5 text-[15px] font-normal text-[#17162b] placeholder:text-[#7c7a94] transition-colors hover:border-[#b9b1d4] focus:border-[#4c2ee6] focus:outline-none',
  select:
    'min-h-11 rounded-xl border border-[#dcd8e8] bg-white px-3.5 py-2 text-[15px] font-medium text-[#17162b] transition-colors hover:border-[#b9b1d4] focus:border-[#4c2ee6] focus:outline-none',
  btnPrimary:
    'inline-flex min-h-11 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-[#4c2ee6] px-4.5 text-[15px] font-bold text-white shadow-[0_1px_2px_rgba(76,46,230,0.2)] transition-colors hover:bg-[#3d22c9] disabled:opacity-45',
  btnSoft:
    'inline-flex min-h-11 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-xl border border-[#d6cbf8] bg-[#f6f3ff] px-4 text-[15px] font-bold text-[#4125cc] transition-colors hover:bg-[#ebe4ff] disabled:opacity-45',
  btnSecondary:
    'inline-flex min-h-11 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-xl border border-[#dcd8e8] bg-white px-4 text-[15px] font-bold text-[#17162b] transition-colors hover:border-[#c3bdd8] hover:bg-[#faf9fd] disabled:opacity-45',
  btnCompactSecondary:
    'inline-flex min-h-10 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl border border-[#dcd8e8] bg-white px-3.5 text-[14px] font-semibold text-[#17162b] transition-colors hover:border-[#c3bdd8] hover:bg-[#faf9fd] disabled:opacity-45',
  btnCompactSoft:
    'inline-flex min-h-10 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl border border-[#d6cbf8] bg-[#f6f3ff] px-3.5 text-[14px] font-semibold text-[#4125cc] transition-colors hover:bg-[#ebe4ff] disabled:opacity-45',
  btnCompactPrimary:
    'inline-flex min-h-10 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl bg-[#4c2ee6] px-4 text-[14px] font-bold text-white transition-colors hover:bg-[#3d22c9] disabled:opacity-45',
  btnDanger:
    'inline-flex min-h-11 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl bg-[#b01e4a] px-4.5 text-[15px] font-bold text-white transition-colors hover:bg-[#93183d] disabled:opacity-45',
  pageTitle: 'font-display text-[27px] font-extrabold leading-tight tracking-tight text-[#17162b] sm:text-[29px] [text-wrap:balance]',
  pageSubtitle: 'mt-1.5 text-[15px] leading-relaxed text-[#565570]',
  sectionTitle: 'font-display text-[18px] font-extrabold tracking-tight text-[#17162b] sm:text-[19px]',
  labelText: 'grid gap-1.5 text-[14px] font-bold text-[#17162b] sm:text-[15px]',
};

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
      } overflow-hidden rounded-2xl border border-[#e4e1ef] bg-white p-0 text-[#17162b] shadow-2xl overscroll-contain`}
    >
      <header className="flex items-center justify-between gap-3 border-b border-[#e6e3f0] px-6 py-4.5">
        <h2 id={id} className="font-display text-[20px] font-extrabold tracking-tight text-[#17162b]">
          {title}
        </h2>
        <button
          type="button"
          aria-label="닫기"
          onClick={close}
          className="grid size-10 shrink-0 place-items-center rounded-xl text-[#565570] transition-colors hover:bg-[#f2eeff] hover:text-[#4125cc]"
        >
          <X size={20} aria-hidden="true" />
        </button>
      </header>
      <div className="max-h-[calc(100dvh-112px)] overflow-y-auto px-6 py-5">{children}</div>
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

  return (
    <form className="grid gap-4" autoComplete="off" onSubmit={submit}>
      <p className="text-[14px] leading-relaxed text-[#565570]">
        이 기록은 현재 브라우저에만 저장돼요. 민감한 개인정보 대신 닉네임을 사용해 보세요.
        {record?.sample ? ' 예시를 저장하면 실제 목록에 포함돼요.' : ''}
      </p>
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
        <label className={saasUi.labelText}>
          이름 / 닉네임 *
          <input
            name="name"
            required
            maxLength={60}
            defaultValue={record?.name}
            placeholder="예: 참여자 A"
            className={saasUi.input}
          />
        </label>
        <label className={saasUi.labelText}>
          연령 / 직업 등 특징
          <input
            name="desc"
            maxLength={120}
            defaultValue={record?.desc}
            placeholder="예: 30대 / 마케터"
            className={saasUi.input}
          />
        </label>
        <label className={saasUi.labelText}>
          그룹
          <select name="group" defaultValue={record?.group ?? groups[0]} className={saasUi.input}>
            {groups.map((g) => (
              <option key={g}>{g}</option>
            ))}
          </select>
        </label>
        <label className={saasUi.labelText}>
          진행 상태
          <select name="status" defaultValue={record?.status ?? statuses[0]} className={saasUi.input}>
            {statuses.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <label className={saasUi.labelText}>
          섭외 경로
          <input name="source" maxLength={100} defaultValue={record?.source} className={saasUi.input} />
        </label>
        <label className={saasUi.labelText}>
          인터뷰 일시 (현지 시간)
          <input type="datetime-local" name="date" defaultValue={record?.date} className={saasUi.input} />
        </label>
      </div>
      <label className={saasUi.labelText}>
        현재 사용 중인 대안
        <input
          name="alternative"
          maxLength={160}
          defaultValue={record?.alternative}
          placeholder="예: 엑셀 수기 관리"
          className={saasUi.input}
        />
      </label>
      <label className={saasUi.labelText}>
        핵심 인사이트
        <textarea
          name="note"
          rows={4}
          maxLength={2500}
          defaultValue={record?.note}
          placeholder="기억하고 싶은 행동, 불편, 인용문…"
          className={`${saasUi.input} resize-y`}
        />
      </label>
      {confirm ? (
        <div className="grid gap-3 rounded-xl border border-[#f2ccd7] bg-[#fff5f7] p-4">
          <p className="text-[15px] font-semibold text-[#17162b]">
            이 대상자와 인사이트{record?.sample ? '' : ' 및 연결된 음성 답변'}를 삭제할까요?
          </p>
          {error && (
            <p className="text-[14px] text-[#9f1d45]" role="alert">
              {error}
            </p>
          )}
          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              disabled={removing}
              onClick={() => setConfirm(false)}
              className={saasUi.btnCompactSecondary}
            >
              기록 유지
            </button>
            <button
              type="button"
              disabled={removing}
              onClick={() => void deleteRecord()}
              className={saasUi.btnDanger}
            >
              {removing ? '삭제 중…' : '대상자 삭제'}
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-1 flex flex-wrap items-center justify-end gap-2.5">
          {remove && (
            <button
              type="button"
              onClick={() => setConfirm(true)}
              className="mr-auto min-h-11 px-2 text-[15px] font-bold text-[#b01e4a] hover:underline"
            >
              삭제
            </button>
          )}
          <button
            type="button"
            onClick={close}
            className={saasUi.btnSecondary}
          >
            취소
          </button>
          <button
            type="submit"
            className={saasUi.btnPrimary}
          >
            대상자 저장
          </button>
        </div>
      )}
    </form>
  );
}
