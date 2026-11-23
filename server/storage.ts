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

interface ResearchDatabase {
  surveys: StoredSurvey[];
  responses: StoredResponse[];
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
    return { surveys: [], responses: [] };
  }
  try {
    const raw = await readFile(DB_FILE, 'utf8');
    const parsed = JSON.parse(raw) as Partial<ResearchDatabase>;
    return {
      surveys: Array.isArray(parsed.surveys) ? parsed.surveys : [],
      responses: Array.isArray(parsed.responses) ? parsed.responses : [],
    };
  } catch {
    return { surveys: [], responses: [] };
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

export async function exportSurveyCsv(id: string, ownerKey: string, page = 1) {
  const db = await readDb();
  const survey = db.surveys.find((s) => s.id === id);
  if (!survey) return { status: 404 as const };
  if (!verifyOwnerKey(ownerKey, survey.ownerHash)) return { status: 403 as const };

  const all = db.responses
    .filter((r) => r.surveyId === id)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  const pageSize = 500;
  const start = Math.max(0, (page - 1) * pageSize);
  const slice = all.slice(start, start + pageSize);

  const headers = ['응답 ID', '제출 시각', '참여 동의', ...survey.questions.map((q, i) => `${i + 1}. ${q.label}`)];
  const rows = slice.map((r) => [
    r.id,
    r.createdAt,
    r.consent ? '동의' : '미동의',
    ...survey.questions.map((_, i) => r.answers[i] ?? ''),
  ]);

  const csv = '\uFEFF' + [headers, ...rows].map((row) => row.map(escapeCsvCell).join(',')).join('\r\n');
  return { status: 200 as const, csv };
}
