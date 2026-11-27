export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function resolveSubpathApiUrl(url: string): string | null {
  if (!url.startsWith('/api/')) return null;
  const baseUrl = import.meta.env?.BASE_URL ?? '/';
  if (!baseUrl || baseUrl === '/') return null;
  return `${baseUrl.replace(/\/$/, '')}${url}`;
}

export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  let response = await fetch(url, { ...init, headers });
  let contentType = response.headers.get('content-type') ?? '';
  let data = contentType.includes('application/json') ? await response.json().catch(() => null) : null;

  // Retry once if a non-JSON 404 happens (e.g., transient server restart or subpath proxy)
  if (!response.ok && response.status === 404 && !data) {
    const altUrl = resolveSubpathApiUrl(url);
    await new Promise((resolve) => setTimeout(resolve, 400));
    response = await fetch(altUrl ?? url, { ...init, headers });
    contentType = response.headers.get('content-type') ?? '';
    data = contentType.includes('application/json') ? await response.json().catch(() => null) : null;
  }

  if (!response.ok) {
    const serverMsg =
      data && typeof data === 'object' && 'error' in data && typeof data.error === 'string' && data.error;
    const message =
      serverMsg ||
      (response.status === 404
        ? 'API 서버 응답 경로를 찾지 못했어요(404). 페이지를 새로고침한 뒤 다시 시도해 주세요.'
        : `요청을 처리하지 못했어요. (${response.status})`);
    throw new ApiError(response.status, message);
  }
  return data as T;
}

export const demoStore = {
  get<T>(key: string, fallback: T): T {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return fallback;
      return JSON.parse(raw) as T;
    } catch {
      return fallback;
    }
  },
  set<T>(key: string, value: T, silent = false): void {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      if (!silent && typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('research-store-change', { detail: { key } }));
      }
    } catch {
      // Ignore quota or storage restriction errors
    }
  },
};
