import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { existsSync, mkdirSync } from 'node:fs';
import { readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

export type QuestionType = 'text' | 'choice' | 'scale';

export interface SurveyQuestion {
  label: string;
  type: QuestionType;
  required: boolean;
  options: string[];
}

export interface StoredSurvey {
  id: string;
  ownerHash: string;
  title: string;
  intro: string;
  questions: SurveyQuestion[];
  active: boolean;
  createdAt: string;
}

export interface StoredResponse {
  id: string;
  surveyId: string;
  answers: string[];
  consent: boolean;
  createdAt: string;
}

export type DeviceType = 'pc' | 'mobile';

export interface SyncPayload {
  people?: unknown[];
  surveyKeys?: unknown[];
  questionVault?: unknown;
  questionGuide?: unknown;
  interviewAnalysis?: unknown;
  sentimentTrend?: unknown;
  textSummary?: unknown;
  activeView?: string;
}

export interface StoredWorkspace {
  id: string;
  version: number;
  updatedAt: string;
  updatedByDevice: DeviceType;
  data: SyncPayload;
}

interface ResearchDatabase {
  surveys: StoredSurvey[];
  responses: StoredResponse[];
  workspaces?: Record<string, StoredWorkspace>;
}

const DATA_DIR = path.resolve(process.cwd(), '.data');
const DB_FILE = path.join(DATA_DIR, 'research-db.json');

let writeChain: Promise<void> = Promise.resolve();

function ensureDir() {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }
}

async function readDb(): Promise<ResearchDatabase> {
  ensureDir();
  if (!existsSync(DB_FILE)) {
    return { surveys: [], responses: [], workspaces: {} };
  }
  try {
    const raw = await readFile(DB_FILE, 'utf8');
    const parsed = JSON.parse(raw) as Partial<ResearchDatabase>;
    return {
      surveys: Array.isArray(parsed.surveys) ? parsed.surveys : [],
      responses: Array.isArray(parsed.responses) ? parsed.responses : [],
      workspaces:
        parsed.workspaces && typeof parsed.workspaces === 'object' ? parsed.workspaces : {},
    };
  } catch {
    return { surveys: [], responses: [], workspaces: {} };
  }
}

async function mutateDb<T>(fn: (db: ResearchDatabase) => Promise<T> | T): Promise<T> {
  let result!: T;
  const run = async () => {
    const db = await readDb();
    result = await fn(db);
    ensureDir();
    const tmpFile = `${DB_FILE}.${randomBytes(6).toString('hex')}.tmp`;
    await writeFile(tmpFile, JSON.stringify(db, null, 2), 'utf8');
    await rename(tmpFile, DB_FILE);
  };
  writeChain = writeChain.then(run, run);
  await writeChain;
  return result;
}

export function hashOwnerKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

export function verifyOwnerKey(providedKey: string, expectedHash: string): boolean {
  const actual = Buffer.from(hashOwnerKey(providedKey), 'hex');
  const expected = Buffer.from(expectedHash, 'hex');
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}

export async function createSurvey(input: {
  title: string;
  intro: string;
  questions: SurveyQuestion[];
}): Promise<{ id: string; key: string; title: string }> {
  const id = randomBytes(6).toString('base64url');
  const key = randomBytes(24).toString('base64url');
  const survey: StoredSurvey = {
    id,
    ownerHash: hashOwnerKey(key),
    title: input.title,
    intro: input.intro,
    questions: input.questions,
    active: true,
    createdAt: new Date().toISOString(),
  };
  await mutateDb((db) => {
    db.surveys.unshift(survey);
  });
  return { id, key, title: survey.title };
}

export async function getPublicSurvey(id: string): Promise<Omit<StoredSurvey, 'ownerHash'> | null> {
  const db = await readDb();
  const survey = db.surveys.find((s) => s.id === id);
  if (!survey) return null;
  const { ownerHash: _, ...rest } = survey;
  return rest;
}

export async function getManagedSurvey(id: string, ownerKey: string) {
  const db = await readDb();
  const survey = db.surveys.find((s) => s.id === id);
  if (!survey) return { status: 404 as const };
  if (!verifyOwnerKey(ownerKey, survey.ownerHash)) return { status: 403 as const };
  const responses = db.responses
    .filter((r) => r.surveyId === id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const { ownerHash: _, ...publicSurvey } = survey;
  return {
    status: 200 as const,
    data: {
      ...publicSurvey,
      count: responses.length,
      responses: responses.map((r) => ({
        id: r.id,
        answers: r.answers,
        createdAt: r.createdAt,
      })),
    },
  };
}

export async function setSurveyActive(id: string, ownerKey: string, active: boolean) {
  return mutateDb((db) => {
    const survey = db.surveys.find((s) => s.id === id);
    if (!survey) return { status: 404 as const };
    if (!verifyOwnerKey(ownerKey, survey.ownerHash)) return { status: 403 as const };
    survey.active = active;
    const { ownerHash: _, ...rest } = survey;
    return { status: 200 as const, data: rest };
  });
}

export async function submitSurveyResponse(
  id: string,
  input: { consent: boolean; answers: string[] },
) {
  return mutateDb((db) => {
    const survey = db.surveys.find((s) => s.id === id);
    if (!survey) return { status: 404 as const, error: '설문을 찾을 수 없어요.' };
    if (!survey.active) return { status: 409 as const, error: '이 설문은 응답 접수를 종료했어요.' };
    if (input.consent !== true) {
      return { status: 400 as const, error: '자발적 참여 동의가 필요해요.' };
    }
    if (!Array.isArray(input.answers) || input.answers.length !== survey.questions.length) {
      return { status: 400 as const, error: '모든 문항 응답 형식을 확인해 주세요.' };
    }

    const cleaned: string[] = [];
    for (let i = 0; i < survey.questions.length; i++) {
      const q = survey.questions[i];
      const raw = String(input.answers[i] ?? '').trim().slice(0, 1500);
      if (q.required && !raw) {
        return { status: 400 as const, error: `${i + 1}번 필수 문항에 응답해 주세요.` };
      }
      if (raw && q.type === 'scale' && !['1', '2', '3', '4', '5'].includes(raw)) {
        return { status: 400 as const, error: `${i + 1}번 척도 점수가 올바르지 않아요.` };
      }
      if (raw && q.type === 'choice' && !q.options.includes(raw)) {
        return { status: 400 as const, error: `${i + 1}번 선택지가 올바르지 않아요.` };
      }
      cleaned.push(raw);
    }

    const response: StoredResponse = {
      id: randomBytes(8).toString('hex'),
      surveyId: id,
      answers: cleaned,
      consent: true,
      createdAt: new Date().toISOString(),
    };
    db.responses.push(response);
    return { status: 201 as const, data: { id: response.id, createdAt: response.createdAt } };
  });
}

function escapeCsvCell(value: unknown): string {
  const s = String(value ?? '');
  const safe = /^[\s]*[=+\-@]|^[\t\r\n]/.test(s) ? `'${s}` : s;
  return `"${safe.replaceAll('"', '""')}"`;
}

function formatExportTimestamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export async function exportSurveyCsv(id: string, ownerKey: string, page: number | 'all' = 1) {
  const db = await readDb();
  const survey = db.surveys.find((s) => s.id === id);
  if (!survey) return { status: 404 as const };
  if (!verifyOwnerKey(ownerKey, survey.ownerHash)) return { status: 403 as const };

  const all = db.responses
    .filter((r) => r.surveyId === id)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  const pageSize = 500;
  const start = page === 'all' ? 0 : Math.max(0, (page - 1) * pageSize);
  const slice = page === 'all' ? all : all.slice(start, start + pageSize);

  const headers = [
    '응답 번호',
    '응답 ID',
    '제출 시각',
    '참여 동의',
    ...survey.questions.map((q, i) => `Q${i + 1}. ${q.label}`),
  ];
  const rows = slice.map((r, idx) => [
    `#${start + idx + 1}`,
    r.id,
    formatExportTimestamp(r.createdAt),
    r.consent ? '동의' : '미동의',
    ...survey.questions.map((_, i) => r.answers[i] ?? ''),
  ]);

  const csv = '\uFEFF' + [headers, ...rows].map((row) => row.map(escapeCsvCell).join(',')).join('\r\n');
  return { status: 200 as const, csv };
}

const SYNC_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generateSyncCode(): string {
  const bytes = randomBytes(6);
  let out = '';
  for (let i = 0; i < 6; i++) {
    out += SYNC_ALPHABET[bytes[i] % SYNC_ALPHABET.length];
  }
  return out;
}

export function normalizeSyncId(raw: string): string {
  return raw.trim().toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 16);
}

export async function createSyncWorkspace(input: {
  initialData?: SyncPayload;
  device?: DeviceType;
}): Promise<StoredWorkspace> {
  return mutateDb((db) => {
    if (!db.workspaces) db.workspaces = {};
    let id = generateSyncCode();
    while (db.workspaces[id]) {
      id = generateSyncCode();
    }
    const workspace: StoredWorkspace = {
      id,
      version: 1,
      updatedAt: new Date().toISOString(),
      updatedByDevice: input.device === 'mobile' ? 'mobile' : 'pc',
      data: input.initialData ?? {},
    };
    db.workspaces[id] = workspace;
    return workspace;
  });
}

export async function getSyncWorkspace(rawId: string): Promise<StoredWorkspace | null> {
  const id = normalizeSyncId(rawId);
  if (!id) return null;
  const db = await readDb();
  return db.workspaces?.[id] ?? null;
}

export async function updateSyncWorkspace(
  rawId: string,
  input: { data: SyncPayload; device?: DeviceType; clientId?: string },
): Promise<StoredWorkspace | null> {
  const id = normalizeSyncId(rawId);
  if (!id) return null;
  return mutateDb((db) => {
    if (!db.workspaces) db.workspaces = {};
    const existing = db.workspaces[id];
    if (!existing) return null;
    const merged: SyncPayload = { ...existing.data };
    for (const [k, v] of Object.entries(input.data)) {
      if (v !== undefined) {
        (merged as Record<string, unknown>)[k] = v;
      }
    }
    const next: StoredWorkspace = {
      id,
      version: existing.version + 1,
      updatedAt: new Date().toISOString(),
      updatedByDevice: input.device === 'mobile' ? 'mobile' : 'pc',
      data: merged,
    };
    db.workspaces[id] = next;
    return next;
  });
}
