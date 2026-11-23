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
        dark: '#22213a',
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
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#e5dcfc] bg-[#faf7ff] px-4 py-3 text-xs">
        <div className="flex items-center gap-2 font-semibold text-[#22213a]">
          {deviceType === 'mobile' ? (
            <Smartphone size={16} className="text-[#5b3df5]" aria-hidden="true" />
          ) : (
            <Monitor size={16} className="text-[#5b3df5]" aria-hidden="true" />
          )}
          <span>현재 기기: {deviceType === 'mobile' ? '모바일 브라우저' : 'PC 브라우저'}</span>
        </div>

        <div className="flex items-center gap-1.5 font-semibold">
          {syncId ? (
            connected ? (
              <span className="inline-flex items-center gap-1 text-[#14674d]">
                <Wifi size={14} aria-hidden="true" /> 실시간 연동 중
              </span>
            ) : reconnecting ? (
              <span className="inline-flex items-center gap-1 text-[#8b4d17]">
                <RefreshCw size={14} className="animate-spin" aria-hidden="true" /> 재연결 중…
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-[#62627a]">
                <WifiOff size={14} aria-hidden="true" /> 연결 대기
              </span>
            )
          ) : (
            <span className="text-[#62627a]">연동 전</span>
          )}
        </div>
      </div>

      {!syncId ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <section className="grid content-between gap-3 rounded-xl border border-[#e2d5fd] bg-white p-4">
            <div className="grid gap-1.5">
              <span className="grid size-9 place-items-center rounded-xl bg-[#eee8ff] text-[#5b3df5]">
                <MonitorSmartphone size={18} aria-hidden="true" />
              </span>
              <h3 className="text-sm font-bold text-[#22213a]">새 연동 코드 · QR 만들기</h3>
              <p className="text-xs leading-relaxed text-[#62627a]">
                지금 보고 있는 대상자, 음성 STT 기록, 설문, 질문함 데이터를 휴대폰이나 다른 PC와 실시간으로 연결해요.
              </p>
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={() => void createRoom()}
              className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg bg-[#5b3df5] px-4 text-sm font-semibold text-white hover:bg-[#4b2ee0] disabled:opacity-50"
            >
              <MonitorSmartphone size={16} aria-hidden="true" />
              {busy ? '연동 코드 생성 중…' : 'PC·모바일 연동 시작'}
            </button>
          </section>

          <form
            onSubmit={handleJoinSubmit}
            className="grid content-between gap-3 rounded-xl border border-[#e9e7f1] bg-[#faf9fd] p-4"
          >
            <div className="grid gap-1.5">
              <span className="grid size-9 place-items-center rounded-xl bg-white text-[#4d30cf] border border-[#e5dcfc]">
                <Link2 size={18} aria-hidden="true" />
              </span>
              <h3 className="text-sm font-bold text-[#22213a]">다른 기기 코드로 연결하기</h3>
              <p className="text-xs leading-relaxed text-[#62627a]">
                이미 다른 기기에서 발급한 6자리 연동 코드를 입력하면 즉시 같은 화면·데이터로 동기화돼요.
              </p>
              <label className="mt-1 grid gap-1 text-xs font-semibold text-[#22213a]">
                연동 코드 (6자리)
                <input
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                  placeholder="예: A7K9M2"
                  maxLength={12}
                  required
                  className="min-h-10 rounded-lg border border-[#dfdce9] bg-white px-3 font-mono text-sm font-bold tracking-widest uppercase text-[#22213a] focus:border-[#5b3df5]"
                />
              </label>
            </div>
            <button
              type="submit"
              disabled={busy || joinCode.trim().length < 4}
              className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg border border-[#5b3df5] bg-white px-4 text-sm font-semibold text-[#4d30cf] hover:bg-[#eee8ff] disabled:opacity-45"
            >
              코드로 연결하기
            </button>
          </form>
        </div>
      ) : (
        <div className="grid gap-4">
          <div className="grid gap-4 rounded-xl border border-[#e2d5fd] bg-white p-4 sm:grid-cols-[176px_minmax(0,1fr)] sm:items-center">
            <div className="grid justify-items-center gap-1.5">
              {qrDataUrl ? (
                <img
                  src={qrDataUrl}
                  alt={`모바일 연동 QR 코드 (${syncId})`}
                  width={168}
                  height={168}
                  className="size-42 rounded-xl border border-[#e5dcfc] bg-white p-2"
                />
              ) : (
                <div className="grid size-42 place-items-center rounded-xl border border-[#e5dcfc] bg-[#faf9fd] text-xs text-[#62627a]">
                  QR 생성 중…
                </div>
              )}
              <span className="text-[11px] font-medium text-[#62627a]">휴대폰 카메라로 스캔해 바로 열기</span>
            </div>

            <div className="grid gap-3">
              <div>
                <span className="text-xs font-semibold text-[#62627a]">실시간 연동 코드</span>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <b className="font-mono text-2xl font-extrabold tracking-widest text-[#4d30cf]">{syncId}</b>
                  <button
                    type="button"
                    onClick={() => void copyText(syncId, 'code')}
                    className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-[#e2deee] bg-white px-2.5 text-xs font-semibold text-[#22213a] hover:bg-[#f7f7fb]"
                  >
                    {copiedType === 'code' ? (
                      <>
                        <Check size={13} className="text-[#14674d]" aria-hidden="true" /> 복사됨
                      </>
                    ) : (
                      <>
                        <Copy size={13} aria-hidden="true" /> 코드 복사
                      </>
                    )}
                  </button>
                </div>
              </div>

              <div className="grid gap-1.5 text-xs">
                <div className="tnum flex flex-wrap items-center gap-2 text-[#22213a]">
                  <span className="font-semibold text-[#4d30cf]">접속 기기:</span>
                  <span>PC {presence.pcCount}대</span>
                  <span aria-hidden="true">·</span>
                  <span>모바일 {presence.mobileCount}대</span>
                </div>
                {lastSyncedAt && (
                  <p className="tnum text-[11px] text-[#62627a]">
                    최근 동기화: {lastSyncedAt.slice(0, 19).replace('T', ' ')}
                  </p>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => void copyText(syncUrl, 'link')}
                  className="inline-flex min-h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg bg-[#5b3df5] px-3 text-xs font-semibold text-white hover:bg-[#4b2ee0]"
                >
                  {copiedType === 'link' ? (
                    <>
                      <Check size={14} aria-hidden="true" /> 접속 링크 복사됨
                    </>
                  ) : (
                    <>
                      <Link2 size={14} aria-hidden="true" /> 모바일 접속 링크 복사
                    </>
                  )}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void pushNow()}
                  className="inline-flex min-h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-[#e2deee] bg-white px-3 text-xs font-semibold text-[#22213a] hover:bg-[#f7f7fb] disabled:opacity-50"
                >
                  <RefreshCw size={14} aria-hidden="true" /> 지금 동기화
                </button>
              </div>
            </div>
          </div>

          <label className="flex items-start gap-2.5 rounded-xl border border-[#e9e7f1] bg-[#faf9fd] px-4 py-3 text-xs">
            <input
              type="checkbox"
              checked={followScreen}
              onChange={(e) => setFollowScreen(e.target.checked)}
              className="mt-0.5 size-4 accent-[#5b3df5]"
            />
            <span>
              <b className="block text-[13px] font-bold text-[#22213a]">PC·모바일 화면 전환 실시간 따라가기</b>
              <span className="mt-0.5 block text-[#62627a]">
                PC에서 메뉴(예: 인터뷰 대상자, 인사이트, 설문 분석)를 바꾸면 연결된 모바일 화면도 같은 탭으로 함께 이동해요.
              </span>
            </span>
          </label>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#efedf6] pt-3">
            <p className="text-[11px] text-[#62627a]">
              대상자, 음성 STT 기록, 설문 키, 나의 질문함, 감정·텍스트 분석 결과가 실시간 공유돼요.
            </p>
            <button
              type="button"
              onClick={disconnect}
              className="inline-flex min-h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-[#f2c8d5] bg-[#fff5f8] px-3 text-xs font-semibold text-[#a6214e] hover:bg-[#ffe8ef]"
            >
              <Unlink size={14} aria-hidden="true" /> 연동 해제
            </button>
          </div>
        </div>
      )}

      {syncError && (
        <p className="rounded-lg border border-[#f5c7d3] bg-[#fff0f3] px-3 py-2 text-xs text-[#9a2148]" role="alert">
          {syncError}
        </p>
      )}
    </div>
  );
}
