import { useCallback, useEffect, useRef, useState } from 'react';
import { api, demoStore } from './api';

export type DeviceType = 'pc' | 'mobile';

export interface SyncPayload {
  people?: unknown[];
  surveyKeys?: unknown[];
  questionVault?: unknown;
  questionGuide?: unknown;
  interviewAnalysis?: unknown;
  sentimentTrend?: unknown;
  textSummary?: unknown;
  customTemplates?: unknown[];
  activeView?: string;
}

export interface StoredWorkspace {
  id: string;
  version: number;
  updatedAt: string;
  updatedByDevice: DeviceType;
  data: SyncPayload;
}

export interface SyncPresence {
  pcCount: number;
  mobileCount: number;
  totalConnected: number;
}

interface SyncMeta {
  id: string;
  followScreen?: boolean;
}

export const SYNC_META_KEY = 'research.sync-id.v1';
export const SYNC_APPLIED_EVENT = 'research-sync-applied';

const SYNC_KEY_MAP = [
  { lsKey: 'research.people.v1', field: 'people' },
  { lsKey: 'research.survey-keys.v1', field: 'surveyKeys' },
  { lsKey: 'research.question-vault.v1', field: 'questionVault' },
  { lsKey: 'research.question-guide.v1', field: 'questionGuide' },
  { lsKey: 'research.interview-analysis.v1', field: 'interviewAnalysis' },
  { lsKey: 'research.sentiment-trend.v1', field: 'sentimentTrend' },
  { lsKey: 'research.text-summary.v1', field: 'textSummary' },
  { lsKey: 'research.custom-templates.v1', field: 'customTemplates' },
] as const;

const TAB_CLIENT_ID = (() => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `client-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
})();

export function detectDeviceType(): DeviceType {
  if (typeof window === 'undefined') return 'pc';
  if (window.innerWidth < 768) return 'mobile';
  if (/Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) return 'mobile';
  return 'pc';
}

export function normalizeSyncCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 16);
}

function readSyncMeta(): SyncMeta | null {
  try {
    const raw = localStorage.getItem(SYNC_META_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SyncMeta;
    if (!parsed?.id) return null;
    return {
      id: normalizeSyncCode(parsed.id),
      followScreen: parsed.followScreen !== false,
    };
  } catch {
    return null;
  }
}

function writeSyncMeta(meta: SyncMeta | null): void {
  try {
    if (!meta) {
      localStorage.removeItem(SYNC_META_KEY);
    } else {
      localStorage.setItem(SYNC_META_KEY, JSON.stringify(meta));
    }
  } catch {
    // Ignore storage errors
  }
}

export function collectLocalSyncPayload(activeView?: string): SyncPayload {
  const payload: SyncPayload = {};
  for (const { lsKey, field } of SYNC_KEY_MAP) {
    try {
      const raw = localStorage.getItem(lsKey);
      if (raw !== null) {
        (payload as Record<string, unknown>)[field] = JSON.parse(raw);
      }
    } catch {
      // Ignore malformed entry
    }
  }
  if (activeView) {
    payload.activeView = activeView;
  }
  return payload;
}

export function applyRemoteSyncPayload(data: SyncPayload): string[] {
  const appliedKeys: string[] = [];
  for (const { lsKey, field } of SYNC_KEY_MAP) {
    const remoteValue = (data as Record<string, unknown>)[field];
    if (remoteValue === undefined) continue;
    try {
      const incomingSerialized = JSON.stringify(remoteValue);
      const currentSerialized = localStorage.getItem(lsKey);
      if (incomingSerialized !== currentSerialized) {
        demoStore.set(lsKey, remoteValue, true);
        appliedKeys.push(lsKey);
      }
    } catch {
      // Ignore storage error
    }
  }

  if (typeof window !== 'undefined' && (appliedKeys.length > 0 || data.activeView)) {
    window.dispatchEvent(
      new CustomEvent(SYNC_APPLIED_EVENT, {
        detail: { keys: appliedKeys, activeView: data.activeView },
      }),
    );
  }
  return appliedKeys;
}

export function useWorkspaceSync({
  currentView,
  onRemoteViewChange,
}: {
  currentView: string;
  onRemoteViewChange?: (view: string) => void;
}) {
  const initialMeta = readSyncMeta();
  const [syncId, setSyncId] = useState<string>(() => initialMeta?.id ?? '');
  const [followScreen, setFollowScreenState] = useState<boolean>(() => initialMeta?.followScreen !== false);
  const [deviceType, setDeviceType] = useState<DeviceType>(() => detectDeviceType());
  const [connected, setConnected] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const [presence, setPresence] = useState<SyncPresence>({ pcCount: 0, mobileCount: 0, totalConnected: 0 });
  const [lastSyncedAt, setLastSyncedAt] = useState<string>('');
  const [syncError, setSyncError] = useState<string>('');
  const [busy, setBusy] = useState(false);

  const lastVersionRef = useRef<number>(0);
  const debounceTimerRef = useRef<number | null>(null);
  const currentViewRef = useRef(currentView);
  const followScreenRef = useRef(followScreen);
  const onRemoteViewChangeRef = useRef(onRemoteViewChange);
  const suppressNextViewPushRef = useRef(false);

  currentViewRef.current = currentView;
  followScreenRef.current = followScreen;
  onRemoteViewChangeRef.current = onRemoteViewChange;

  useEffect(() => {
    const onResize = () => setDeviceType(detectDeviceType());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const setFollowScreen = useCallback(
    (enabled: boolean) => {
      setFollowScreenState(enabled);
      if (syncId) {
        writeSyncMeta({ id: syncId, followScreen: enabled });
      }
    },
    [syncId],
  );

  const pushPayload = useCallback(
    async (targetId: string, partialData?: SyncPayload) => {
      if (!targetId) return;
      try {
        const data = partialData ?? collectLocalSyncPayload(followScreenRef.current ? currentViewRef.current : undefined);
        const res = await api<{ workspace: StoredWorkspace; presence: SyncPresence }>(`/api/sync/${targetId}`, {
          method: 'PUT',
          body: JSON.stringify({
            device: detectDeviceType(),
            clientId: TAB_CLIENT_ID,
            data,
          }),
        });
        lastVersionRef.current = Math.max(lastVersionRef.current, res.workspace.version);
        setPresence(res.presence);
        setLastSyncedAt(res.workspace.updatedAt);
        setSyncError('');
      } catch (err) {
        setSyncError(err instanceof Error ? err.message : '동기화 전송에 실패했어요.');
      }
    },
    [],
  );

  const createRoom = useCallback(async () => {
    setBusy(true);
    setSyncError('');
    try {
      const payload = collectLocalSyncPayload(followScreenRef.current ? currentViewRef.current : undefined);
      const res = await api<{ workspace: StoredWorkspace; presence: SyncPresence }>('/api/sync/create', {
        method: 'POST',
        body: JSON.stringify({
          device: detectDeviceType(),
          data: payload,
        }),
      });
      lastVersionRef.current = res.workspace.version;
      writeSyncMeta({ id: res.workspace.id, followScreen: followScreenRef.current });
      setSyncId(res.workspace.id);
      setPresence(res.presence);
      setLastSyncedAt(res.workspace.updatedAt);
      return res.workspace.id;
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : '연동 코드를 만들지 못했어요.');
      return null;
    } finally {
      setBusy(false);
    }
  }, []);

  const joinRoom = useCallback(async (rawCode: string, applyView = true) => {
    const code = normalizeSyncCode(rawCode);
    if (code.length < 4) {
      setSyncError('6자리 연동 코드를 정확히 입력해 주세요.');
      return false;
    }
    setBusy(true);
    setSyncError('');
    try {
      const res = await api<{ workspace: StoredWorkspace; presence: SyncPresence }>(`/api/sync/${code}`);
      lastVersionRef.current = res.workspace.version;
      applyRemoteSyncPayload(res.workspace.data);
      if (applyView && res.workspace.data.activeView && onRemoteViewChangeRef.current) {
        suppressNextViewPushRef.current = true;
        onRemoteViewChangeRef.current(res.workspace.data.activeView);
      }
      writeSyncMeta({ id: res.workspace.id, followScreen: followScreenRef.current });
      setSyncId(res.workspace.id);
      setPresence(res.presence);
      setLastSyncedAt(res.workspace.updatedAt);
      return true;
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : '연동 코드에 연결하지 못했어요.');
      return false;
    } finally {
      setBusy(false);
    }
  }, []);

  const disconnect = useCallback(() => {
    if (debounceTimerRef.current !== null) {
      window.clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    writeSyncMeta(null);
    lastVersionRef.current = 0;
    setSyncId('');
    setConnected(false);
    setReconnecting(false);
    setPresence({ pcCount: 0, mobileCount: 0, totalConnected: 0 });
    setLastSyncedAt('');
    setSyncError('');
  }, []);

  const pushNow = useCallback(async () => {
    if (!syncId) return;
    setBusy(true);
    await pushPayload(syncId);
    setBusy(false);
  }, [syncId, pushPayload]);

  // Auto-join from URL query ?sync=CODE (e.g. scanned via mobile QR code)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlSync = params.get('sync');
    if (!urlSync) return;
    const normalized = normalizeSyncCode(urlSync);
    if (!normalized) return;

    const explicitView = params.get('view');
    void joinRoom(normalized, !explicitView).then((ok) => {
      if (ok) {
        const cleaned = new URLSearchParams(window.location.search);
        cleaned.delete('sync');
        const nextUrl = cleaned.toString() ? `${window.location.pathname}?${cleaned.toString()}` : window.location.pathname;
        window.history.replaceState({}, '', nextUrl);
      }
    });
  }, [joinRoom]);

  // SSE subscription for real-time updates & presence
  useEffect(() => {
    if (!syncId) return;
    let closed = false;
    const es = new EventSource(`/api/sync/${encodeURIComponent(syncId)}/events?device=${deviceType}`);

    es.onopen = () => {
      if (closed) return;
      setConnected(true);
      setReconnecting(false);
      setSyncError('');
    };

    es.onerror = () => {
      if (closed) return;
      setConnected(false);
      setReconnecting(true);
    };

    es.addEventListener('init', (ev) => {
      if (closed) return;
      try {
        const payload = JSON.parse((ev as MessageEvent).data) as {
          workspace: StoredWorkspace;
          presence: SyncPresence;
        };
        setConnected(true);
        setReconnecting(false);
        setPresence(payload.presence);
        setLastSyncedAt(payload.workspace.updatedAt);
        if (payload.workspace.version > lastVersionRef.current) {
          lastVersionRef.current = payload.workspace.version;
          applyRemoteSyncPayload(payload.workspace.data);
          if (
            followScreenRef.current &&
            payload.workspace.data.activeView &&
            payload.workspace.data.activeView !== currentViewRef.current &&
            onRemoteViewChangeRef.current
          ) {
            suppressNextViewPushRef.current = true;
            onRemoteViewChangeRef.current(payload.workspace.data.activeView);
          }
        }
      } catch {
        // Ignore malformed init
      }
    });

    es.addEventListener('presence', (ev) => {
      if (closed) return;
      try {
        const payload = JSON.parse((ev as MessageEvent).data) as { presence: SyncPresence };
        setPresence(payload.presence);
      } catch {
        // Ignore malformed presence
      }
    });

    es.addEventListener('sync', (ev) => {
      if (closed) return;
      try {
        const payload = JSON.parse((ev as MessageEvent).data) as {
          workspace: StoredWorkspace;
          presence: SyncPresence;
          sourceClientId?: string;
        };
        setPresence(payload.presence);
        setLastSyncedAt(payload.workspace.updatedAt);
        if (payload.sourceClientId === TAB_CLIENT_ID) return;
        if (payload.workspace.version <= lastVersionRef.current) return;
        lastVersionRef.current = payload.workspace.version;
        applyRemoteSyncPayload(payload.workspace.data);
        if (
          followScreenRef.current &&
          payload.workspace.data.activeView &&
          payload.workspace.data.activeView !== currentViewRef.current &&
          onRemoteViewChangeRef.current
        ) {
          suppressNextViewPushRef.current = true;
          onRemoteViewChangeRef.current(payload.workspace.data.activeView);
        }
      } catch {
        // Ignore malformed sync
      }
    });

    return () => {
      closed = true;
      es.close();
    };
  }, [syncId, deviceType]);

  // Push local store changes automatically (debounced)
  useEffect(() => {
    if (!syncId) return;
    const onStoreChange = () => {
      if (debounceTimerRef.current !== null) {
        window.clearTimeout(debounceTimerRef.current);
      }
      debounceTimerRef.current = window.setTimeout(() => {
        debounceTimerRef.current = null;
        void pushPayload(syncId);
      }, 300);
    };
    window.addEventListener('research-store-change', onStoreChange);
    return () => {
      window.removeEventListener('research-store-change', onStoreChange);
      if (debounceTimerRef.current !== null) {
        window.clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
    };
  }, [syncId, pushPayload]);

  // Mirror screen view changes when followScreen is active
  useEffect(() => {
    if (!syncId || !followScreen) return;
    if (suppressNextViewPushRef.current) {
      suppressNextViewPushRef.current = false;
      return;
    }
    const timer = window.setTimeout(() => {
      void pushPayload(syncId, { activeView: currentView });
    }, 150);
    return () => window.clearTimeout(timer);
  }, [syncId, followScreen, currentView, pushPayload]);

  return {
    syncId,
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
  };
}
