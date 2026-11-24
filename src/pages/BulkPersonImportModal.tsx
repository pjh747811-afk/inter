import { useMemo, useState, type ChangeEvent } from 'react';
import { Download, FileSpreadsheet, Upload, Users } from 'lucide-react';
import { groups, statuses, type Person } from '../lib/research';
import { download, Modal, saasUi } from './ResearchUI';

function parseDelimitedText(raw: string): string[][] {
  const normalized = raw.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = normalized.split('\n').filter((line) => line.trim().length > 0);
  if (!lines.length) return [];

  // Detect tab-delimited vs comma-delimited
  const sample = lines.slice(0, 3).join('\n');
  const delimiter = sample.includes('\t') && !sample.includes(',') ? '\t' : ',';

  if (delimiter === '\t') {
    return lines.map((line) => line.split('\t').map((cell) => cell.trim()));
  }

  // RFC-4180 compliant CSV parser across lines (supports quoted commas & newlines)
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = '';
  let inQuotes = false;

  for (let i = 0; i < normalized.length; i++) {
    const ch = normalized[i];
    const next = normalized[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        currentCell += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        currentCell += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      currentRow.push(currentCell.trim());
      currentCell = '';
    } else if (ch === '\n') {
      currentRow.push(currentCell.trim());
      if (currentRow.some((c) => c.length > 0)) {
        rows.push(currentRow);
      }
      currentRow = [];
      currentCell = '';
    } else {
      currentCell += ch;
    }
  }

  if (currentCell.length > 0 || currentRow.length > 0) {
    currentRow.push(currentCell.trim());
    if (currentRow.some((c) => c.length > 0)) {
      rows.push(currentRow);
    }
  }

  return rows;
}

function matchGroup(raw: string, fallback: string): string {
  const clean = raw.trim();
  if (!clean) return fallback;
  const exact = groups.find((g) => g === clean);
  if (exact) return exact;
  const partial = groups.find((g) => clean.includes(g) || g.includes(clean));
  return partial ?? fallback;
}

function matchStatus(raw: string, fallback: string): string {
  const clean = raw.trim();
  if (!clean) return fallback;
  const exact = statuses.find((s) => s === clean);
  if (exact) return exact;
  const partial = statuses.find((s) => clean.includes(s) || s.includes(clean));
  return partial ?? fallback;
}

function isHeaderRow(cells: string[]): boolean {
  const first = (cells[0] ?? '').replace(/\s+/g, '').toLowerCase();
  const second = (cells[1] ?? '').replace(/\s+/g, '').toLowerCase();
  return (
    first === '이름' ||
    first === '이름/닉네임' ||
    first === '닉네임' ||
    first === '대상자' ||
    first === 'name' ||
    second === '특징' ||
    second === '그룹'
  );
}

const sampleBulkText = [
  '이름, 특징, 그룹, 섭외경로, 진행상태, 인터뷰일시, 현재대안, 핵심인사이트',
  '참여자 01, 30대 / 프로덕트 매니저, 핵심 타겟, 링크드인, 완료, 2026-11-20T14:00, 노션 + 엑셀, 매주 리포트 정리에 2시간 이상 소요됨',
  '참여자 02, 20대 / 디자이너, 핵심 타겟, 지인 소개, 일정 확정, 2026-11-24T19:00, 피그마 메모, 모바일에서 바로 기록 확인하길 원함',
  '참여자 03, 40대 / 팀장, 대안 사용자, 커뮤니티, 섭외 대기, , 유료 설문 툴, 비용 부담으로 대체 도구를 찾는 중',
].join('\n');

export function BulkPersonImportModal({
  close,
  onImport,
}: {
  close: () => void;
  onImport: (people: Person[]) => void;
}) {
  const [rawText, setRawText] = useState('');
  const [defaultGroup, setDefaultGroup] = useState<string>(groups[0]);
  const [defaultStatus, setDefaultStatus] = useState<string>(statuses[0]);
  const [fileError, setFileError] = useState('');

  const parsedPeople = useMemo<Person[]>(() => {
    const rows = parseDelimitedText(rawText);
    if (!rows.length) return [];
    const dataRows = isHeaderRow(rows[0]) ? rows.slice(1) : rows;
    const out: Person[] = [];

    for (const cells of dataRows) {
      const name = (cells[0] ?? '').trim().slice(0, 60);
      if (!name) continue;
      out.push({
        id: crypto.randomUUID(),
        name,
        desc: (cells[1] ?? '').trim().slice(0, 120),
        group: matchGroup(cells[2] ?? '', defaultGroup),
        source: (cells[3] ?? '').trim().slice(0, 100),
        status: matchStatus(cells[4] ?? '', defaultStatus),
        date: (cells[5] ?? '').trim().replace(' ', 'T').slice(0, 16),
        alternative: (cells[6] ?? '').trim().slice(0, 160),
        note: (cells[7] ?? '').trim().slice(0, 2500),
        sample: false,
      });
    }
    return out;
  }, [rawText, defaultGroup, defaultStatus]);

  async function handleFileUpload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileError('');
    try {
      const buffer = await file.arrayBuffer();
      let decoded = new TextDecoder('utf-8').decode(buffer);
      if (decoded.includes('\uFFFD')) {
        try {
          decoded = new TextDecoder('euc-kr').decode(buffer);
        } catch {
          // Keep UTF-8 fallback
        }
      }
      setRawText(decoded);
    } catch {
      setFileError('CSV 파일을 읽지 못했어요. 파일 형식을 확인해 주세요.');
    } finally {
      e.target.value = '';
    }
  }

  function downloadTemplate() {
    download(
      [
        ['이름', '특징', '그룹', '섭외경로', '진행상태', '인터뷰일시', '현재대안', '핵심인사이트'],
        ['참여자 01', '30대 / 마케터', '핵심 타겟', '지인 소개', '섭외 대기', '2026-11-28T14:00', '엑셀 수기 관리', ''],
        ['참여자 02', '20대 / 대학생', '대안 사용자', '오픈채팅', '완료', '2026-11-29T16:00', '노션', '모바일 연동이 아쉬움'],
      ],
      '인터뷰대상자-일괄등록-양식.csv',
    );
  }

  return (
    <Modal title="인터뷰 대상자 일괄 추가 (100명+ 지원)" close={close} wide>
      <div className="grid gap-4">
        <div className={`${saasUi.cardSoft} p-4 text-[15px] text-[#17162b]`}>
          <p className="font-bold text-[#4125cc]">
            100명 이상의 인터뷰 대상자도 인원 제한 없이 한 번에 등록·검색·CSV 내보내기할 수 있어요.
          </p>
          <p className="mt-1 text-[14px] leading-relaxed text-[#565570]">
            엑셀에서 작성한 <code className="font-mono font-semibold text-[#17162b]">.csv</code> 파일을 업로드하거나, 아래 칸에 이름만 줄바꿈으로 붙여넣어도 바로 추가돼요.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <label className={`${saasUi.btnCompactSoft} cursor-pointer`}>
            <Upload size={15} aria-hidden="true" />
            CSV / 텍스트 파일 불러오기
            <input
              type="file"
              accept=".csv,.tsv,.txt,text/csv,text/plain"
              onChange={(e) => void handleFileUpload(e)}
              className="sr-only"
            />
          </label>
          <button
            type="button"
            onClick={downloadTemplate}
            className={saasUi.btnCompactSecondary}
          >
            <Download size={15} aria-hidden="true" /> 엑셀 등록 양식 CSV 받기
          </button>
          <button
            type="button"
            onClick={() => setRawText(sampleBulkText)}
            className="min-h-10 px-2 text-[14px] font-bold text-[#4c2ee6] hover:underline"
          >
            예시 데이터 채우기
          </button>
        </div>

        {fileError && (
          <p className="rounded-xl bg-[#fff0f3] px-3.5 py-2.5 text-[14px] font-medium text-[#9f1d45]" role="alert">
            {fileError}
          </p>
        )}

        <div className="grid gap-3.5 sm:grid-cols-2">
          <label className={saasUi.labelText}>
            기본 그룹 (열 생략 시 적용)
            <select
              value={defaultGroup}
              onChange={(e) => setDefaultGroup(e.target.value)}
              className={saasUi.select}
            >
              {groups.map((g) => (
                <option key={g}>{g}</option>
              ))}
            </select>
          </label>
          <label className={saasUi.labelText}>
            기본 진행 상태 (열 생략 시 적용)
            <select
              value={defaultStatus}
              onChange={(e) => setDefaultStatus(e.target.value)}
              className={saasUi.select}
            >
              {statuses.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
        </div>

        <label className={saasUi.labelText}>
          대상자 목록 붙여넣기 (줄바꿈 구분 또는 CSV/엑셀 복사)
          <textarea
            rows={7}
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            placeholder={[
              '형식 1 (이름만 줄바꿈):',
              '김철수',
              '이영희',
              '',
              '형식 2 (CSV 쉼표/탭 구분):',
              '이름, 특징, 그룹, 섭외경로, 진행상태, 인터뷰일시, 현재대안, 핵심인사이트',
            ].join('\n')}
            className={`${saasUi.input} resize-y font-mono text-[14px] leading-relaxed`}
          />
        </label>

        {parsedPeople.length > 0 && (
          <div className={`grid gap-2.5 ${saasUi.inset} p-4`}>
            <div className="flex flex-wrap items-center justify-between gap-2 text-[14px]">
              <span className="inline-flex items-center gap-1.5 font-bold text-[#4125cc]">
                <FileSpreadsheet size={16} aria-hidden="true" />
                인식된 대상자 <span className="tnum font-mono">{parsedPeople.length}명</span>
              </span>
              <span className="text-[#565570]">상위 {Math.min(5, parsedPeople.length)}건 미리보기</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-[14px] tnum">
                <thead>
                  <tr className="border-b border-[#e4e1ef] text-[13px] font-bold text-[#565570]">
                    <th className="py-2 pr-3">이름</th>
                    <th className="py-2 pr-3">특징</th>
                    <th className="py-2 pr-3">그룹</th>
                    <th className="py-2 pr-3">상태</th>
                    <th className="py-2">대안/메모</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#efedf5]">
                  {parsedPeople.slice(0, 5).map((p) => (
                    <tr key={p.id}>
                      <td className="py-2 pr-3 font-bold text-[#17162b]">{p.name}</td>
                      <td className="py-2 pr-3 text-[#565570]">{p.desc || '—'}</td>
                      <td className="py-2 pr-3 font-semibold text-[#4125cc]">{p.group}</td>
                      <td className="py-2 pr-3 text-[#17162b]">{p.status}</td>
                      <td className="max-w-[200px] truncate py-2 text-[#565570]">
                        {p.note || p.alternative || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-end gap-2.5 pt-1">
          <button
            type="button"
            onClick={close}
            className={saasUi.btnSecondary}
          >
            취소
          </button>
          <button
            type="button"
            disabled={parsedPeople.length === 0}
            onClick={() => onImport(parsedPeople)}
            className={saasUi.btnPrimary}
          >
            <Users size={16} aria-hidden="true" />
            <span className="tnum">{parsedPeople.length}명</span> 일괄 추가하기
          </button>
        </div>
      </div>
    </Modal>
  );
}
