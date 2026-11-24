import { useEffect, useState, type FormEvent } from 'react';
import QRCode from 'qrcode';
import {
  Check,
  Copy,
  Link2,
  Monitor,
  MonitorSmartphone,
  RefreshCw,
  Smartphone,
  Unlink,
  Wifi,
  WifiOff,
} from 'lucide-react';
import type { DeviceType, SyncPresence } from '../lib/workspaceSync';
import { saasUi } from './ResearchUI';

interface DeviceSyncModalProps {
  syncId: string;
  currentView: string;
  deviceType: DeviceType;
  connected: boolean;
  reconnecting: boolean;
  presence: SyncPresence;
  lastSyncedAt: string;
  syncError: string;
  busy: boolean;
  followScreen: boolean;
  setFollowScreen: (v: boolean) => void;
  createRoom: () => Promise<string | null>;
  joinRoom: (code: string) => Promise<boolean>;
  disconnect: () => void;
  pushNow: () => Promise<void>;
}

export function DeviceSyncModal({
  syncId,
  currentView,
  deviceType,
  connected,
  reconnecting,
  presence,
  lastSyncedAt,
  syncError,
  busy,
  followScreen,
  setFollowScreen,
  createRoom,
  joinRoom,
  disconnect,
  pushNow,
}: DeviceSyncModalProps) {
  const [joinCode, setJoinCode] = useState('');
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [copiedType, setCopiedType] = useState<'code' | 'link' | ''>('');

  const syncUrl = syncId
    ? `${window.location.origin}/?sync=${encodeURIComponent(syncId)}&view=${encodeURIComponent(currentView)}`
    : '';

  useEffect(() => {
    if (!syncUrl) {
      setQrDataUrl('');
      return;
    }
    let cancelled = false;
    void QRCode.toDataURL(syncUrl, {
      width: 220,
      margin: 1,
      color: {
        dark: '#17162b',
        light: '#ffffff',
      },
    })
      .then((url) => {
        if (!cancelled) setQrDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setQrDataUrl('');
      });
    return () => {
      cancelled = true;
    };
  }, [syncUrl]);

  async function copyText(text: string, type: 'code' | 'link') {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedType(type);
      window.setTimeout(() => setCopiedType(''), 1800);
    } catch {
      // Fallback: ignore if clipboard blocked
    }
  }

  async function handleJoinSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const ok = await joinRoom(joinCode);
    if (ok) {
      setJoinCode('');
    }
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2.5 rounded-xl border border-[#dfd7fb] bg-[#f8f6ff] px-4 py-3 text-[14px]">
        <div className="flex items-center gap-2 font-bold text-[#17162b]">
          {deviceType === 'mobile' ? (
            <Smartphone size={17} className="text-[#4c2ee6]" aria-hidden="true" />
          ) : (
            <Monitor size={17} className="text-[#4c2ee6]" aria-hidden="true" />
          )}
          <span>현재 기기: {deviceType === 'mobile' ? '모바일 브라우저' : 'PC 브라우저'}</span>
        </div>

        <div className="flex items-center gap-1.5 font-bold">
          {syncId ? (
            connected ? (
              <span className="inline-flex items-center gap-1.5 text-[#14674d]">
                <Wifi size={15} aria-hidden="true" /> 실시간 연동 중
              </span>
            ) : reconnecting ? (
              <span className="inline-flex items-center gap-1.5 text-[#8b4d17]">
                <RefreshCw size={15} className="animate-spin" aria-hidden="true" /> 재연결 중…
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-[#565570]">
                <WifiOff size={15} aria-hidden="true" /> 연결 대기
              </span>
            )
          ) : (
            <span className="text-[#565570]">연동 전</span>
          )}
        </div>
      </div>

      {!syncId ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <section className={`grid content-between gap-4 border-[#dfd7fb] bg-white p-5 rounded-2xl border shadow-[0_1px_3px_rgba(23,22,43,0.03)]`}>
            <div className="grid gap-2">
              <span className="grid size-10 place-items-center rounded-xl bg-[#efeaff] text-[#4c2ee6]">
                <MonitorSmartphone size={20} aria-hidden="true" />
              </span>
              <h3 className="text-[16px] font-bold text-[#17162b]">새 연동 코드 · QR 만들기</h3>
              <p className="text-[14px] leading-relaxed text-[#565570]">
                지금 보고 있는 대상자, 음성 STT 기록, 설문, 질문함 데이터를 휴대폰이나 다른 PC와 실시간으로 연결해요.
              </p>
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={() => void createRoom()}
              className={saasUi.btnPrimary}
            >
              <MonitorSmartphone size={17} aria-hidden="true" />
              {busy ? '연동 코드 생성 중…' : 'PC·모바일 연동 시작'}
            </button>
          </section>

          <form
            onSubmit={handleJoinSubmit}
            className="grid content-between gap-4 rounded-2xl border border-[#e4e1ef] bg-[#faf9fd] p-5"
          >
            <div className="grid gap-2">
              <span className="grid size-10 place-items-center rounded-xl border border-[#dfd7fb] bg-white text-[#4125cc]">
                <Link2 size={20} aria-hidden="true" />
              </span>
              <h3 className="text-[16px] font-bold text-[#17162b]">다른 기기 코드로 연결하기</h3>
              <p className="text-[14px] leading-relaxed text-[#565570]">
                이미 다른 기기에서 발급한 6자리 연동 코드를 입력하면 즉시 같은 화면·데이터로 동기화돼요.
              </p>
              <label className="mt-1 grid gap-1.5 text-[14px] font-bold text-[#17162b]">
                연동 코드 (6자리)
                <input
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                  placeholder="예: A7K9M2"
                  maxLength={12}
                  required
                  className={`${saasUi.input} font-mono text-[16px] font-bold tracking-widest uppercase`}
                />
              </label>
            </div>
            <button
              type="submit"
              disabled={busy || joinCode.trim().length < 4}
              className={saasUi.btnSoft}
            >
              코드로 연결하기
            </button>
          </form>
        </div>
      ) : (
        <div className="grid gap-4">
          <div className="grid gap-5 rounded-2xl border border-[#dfd7fb] bg-white p-5 sm:grid-cols-[184px_minmax(0,1fr)] sm:items-center">
            <div className="grid justify-items-center gap-2">
              {qrDataUrl ? (
                <img
                  src={qrDataUrl}
                  alt={`모바일 연동 QR 코드 (${syncId})`}
                  width={172}
                  height={172}
                  className="size-44 rounded-xl border border-[#dfd7fb] bg-white p-2"
                />
              ) : (
                <div className="grid size-44 place-items-center rounded-xl border border-[#dfd7fb] bg-[#faf9fd] text-[14px] text-[#565570]">
                  QR 생성 중…
                </div>
              )}
              <span className="text-[13px] font-medium text-[#565570]">휴대폰 카메라로 스캔해 바로 열기</span>
            </div>

            <div className="grid gap-3.5">
              <div>
                <span className="text-[14px] font-bold text-[#565570]">실시간 연동 코드</span>
                <div className="mt-1.5 flex flex-wrap items-center gap-2.5">
                  <b className="font-mono text-[26px] font-extrabold tracking-widest text-[#4125cc]">{syncId}</b>
                  <button
                    type="button"
                    onClick={() => void copyText(syncId, 'code')}
                    className={saasUi.btnCompactSecondary}
                  >
                    {copiedType === 'code' ? (
                      <>
                        <Check size={15} className="text-[#14674d]" aria-hidden="true" /> 복사됨
                      </>
                    ) : (
                      <>
                        <Copy size={15} aria-hidden="true" /> 코드 복사
                      </>
                    )}
                  </button>
                </div>
              </div>

              <div className="grid gap-1.5 text-[14px]">
                <div className="tnum flex flex-wrap items-center gap-2 text-[#17162b]">
                  <span className="font-bold text-[#4125cc]">접속 기기:</span>
                  <span>PC {presence.pcCount}대</span>
                  <span aria-hidden="true">·</span>
                  <span>모바일 {presence.mobileCount}대</span>
                </div>
                {lastSyncedAt && (
                  <p className="tnum text-[13px] text-[#565570]">
                    최근 동기화: {lastSyncedAt.slice(0, 19).replace('T', ' ')}
                  </p>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => void copyText(syncUrl, 'link')}
                  className={saasUi.btnCompactPrimary}
                >
                  {copiedType === 'link' ? (
                    <>
                      <Check size={15} aria-hidden="true" /> 접속 링크 복사됨
                    </>
                  ) : (
                    <>
                      <Link2 size={15} aria-hidden="true" /> 모바일 접속 링크 복사
                    </>
                  )}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void pushNow()}
                  className={saasUi.btnCompactSecondary}
                >
                  <RefreshCw size={15} aria-hidden="true" /> 지금 동기화
                </button>
              </div>
            </div>
          </div>

          <label className="flex items-start gap-3 rounded-xl border border-[#e4e1ef] bg-[#faf9fd] px-4 py-3.5 text-[14px]">
            <input
              type="checkbox"
              checked={followScreen}
              onChange={(e) => setFollowScreen(e.target.checked)}
              className="mt-1 size-4.5 accent-[#4c2ee6]"
            />
            <span>
              <b className="block text-[15px] font-bold text-[#17162b]">PC·모바일 화면 전환 실시간 따라가기</b>
              <span className="mt-0.5 block text-[14px] leading-relaxed text-[#565570]">
                PC에서 메뉴(예: 인터뷰 대상자, 인사이트, 설문 분석)를 바꾸면 연결된 모바일 화면도 같은 탭으로 함께 이동해요.
              </span>
            </span>
          </label>

          <div className="flex flex-wrap items-center justify-between gap-2.5 border-t border-[#e6e3f0] pt-3.5">
            <p className="text-[13px] text-[#565570]">
              대상자, 음성 STT 기록, 설문 키, 나의 질문함, 감정·텍스트 분석 결과가 실시간 공유돼요.
            </p>
            <button
              type="button"
              onClick={disconnect}
              className="inline-flex min-h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl border border-[#f2c8d5] bg-[#fff5f8] px-3.5 text-[14px] font-semibold text-[#b01e4a] hover:bg-[#ffe8ef]"
            >
              <Unlink size={15} aria-hidden="true" /> 연동 해제
            </button>
          </div>
        </div>
      )}

      {syncError && (
        <p className="rounded-xl border border-[#f5c7d3] bg-[#fff0f3] px-3.5 py-2.5 text-[14px] text-[#9f1d45]" role="alert">
          {syncError}
        </p>
      )}
    </div>
  );
}
