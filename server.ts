import 'dotenv/config';
import express from 'express';
import { existsSync } from 'node:fs';
import path from 'node:path';
import {
  AiApiError,
  analyzeInterviewContent,
  analyzeInterviewSentimentTrend,
  analyzeSurveyData,
  generateInsightReport,
  generateQuestionGuide,
  generateResearchTemplate,
  generateSurveyFromItem,
  summarizeResearchText,
  transcribeInterviewAudio,
} from './server/ai.ts';
import {
  createSurvey,
  createSyncWorkspace,
  exportSurveyCsv,
  getManagedSurvey,
  getPublicSurvey,
  getSyncWorkspace,
  normalizeSyncId,
  setSurveyActive,
  submitSurveyResponse,
  updateSyncWorkspace,
  type DeviceType,
  type SurveyQuestion,
  type SyncPayload,
} from './server/storage.ts';

interface SyncClient {
  res: express.Response;
  device: DeviceType;
}

const syncRooms = new Map<string, Set<SyncClient>>();

function getSyncPresence(workspaceId: string) {
  const clients = syncRooms.get(workspaceId);
  let pcCount = 0;
  let mobileCount = 0;
  if (clients) {
    for (const c of clients) {
      if (c.device === 'mobile') mobileCount++;
      else pcCount++;
    }
  }
  return { pcCount, mobileCount, totalConnected: pcCount + mobileCount };
}

function broadcastSync(workspaceId: string, event: string, payload: unknown) {
  const clients = syncRooms.get(workspaceId);
  if (!clients || clients.size === 0) return;
  const serialized = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const client of clients) {
    try {
      client.res.write(serialized);
    } catch {
      clients.delete(client);
    }
  }
}

const researchEventClients = new Set<express.Response>();

function broadcastResearchEvent(event: string, payload: unknown) {
  if (researchEventClients.size === 0) return;
  const serialized = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const client of researchEventClients) {
    try {
      client.write(serialized);
    } catch {
      researchEventClients.delete(client);
    }
  }
}

const app = express();
app.use(express.json({ limit: '25mb' }));

function extractBearer(header: string | undefined): string {
  if (!header) return '';
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1].trim() : '';
}

const DEFAULT_SURVEY_INTRO =
  '안녕하세요. 본 설문은 서비스 개선 및 고객 경험 검증을 위한 짧은 설문(약 2~3분 소요)입니다. 모든 응답은 연구 목적 외에는 사용되지 않으며, 원하실 경우 언제든 참여를 중단하실 수 있습니다.';

function validateSurveyQuestions(raw: unknown): { ok: true; questions: SurveyQuestion[] } | { ok: false; error: string } {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 20) {
    return { ok: false, error: '문항은 1개에서 20개 사이로 작성해 주세요.' };
  }
  const questions: SurveyQuestion[] = [];
  for (let i = 0; i < raw.length; i++) {
    const q = raw[i] as Record<string, unknown>;
    const label = String(q?.label ?? '').trim().slice(0, 220);
    if (!label) {
      return { ok: false, error: `${i + 1}번 질문 내용을 입력해 주세요.` };
    }
    const type = q?.type === 'choice' || q?.type === 'scale' || q?.type === 'text' ? q.type : 'text';
    const rawOptions =
      type === 'choice' && Array.isArray(q?.options)
        ? q.options.map((o) => String(o).trim()).filter(Boolean)
        : [];
    const options = Array.from(new Set(rawOptions)).slice(0, 10);
    if (type === 'choice' && options.length < 2) {
      return { ok: false, error: `${i + 1}번 객관식 문항은 선택지를 2개 이상 입력해 주세요.` };
    }
    questions.push({
      label,
      type,
      required: Boolean(q?.required),
      options,
    });
  }
  return { ok: true, questions };
}

// Create & publish survey
app.post('/api/research/surveys', async (req, res) => {
  try {
    const title = String(req.body?.title ?? '').trim().slice(0, 100);
    const rawIntro = String(req.body?.intro ?? '').trim().slice(0, 3000);
    const intro = rawIntro || DEFAULT_SURVEY_INTRO;
    if (!title) {
      res.status(400).json({ error: '설문 제목을 입력해 주세요.' });
      return;
    }
    const validated = validateSurveyQuestions(req.body?.questions);
    if (!validated.ok) {
      res.status(400).json({ error: validated.error });
      return;
    }
    const created = await createSurvey({ title, intro, questions: validated.questions });
    res.status(201).json(created);
  } catch (error) {
    const message = error instanceof Error ? error.message : '설문을 저장하지 못했어요.';
    res.status(500).json({ error: message });
  }
});

// AI Research Guide: generate interview & survey questions + validation analysis
app.post('/api/research/question-guide', async (req, res) => {
  try {
    const item = String(req.body?.item ?? '').trim().slice(0, 300);
    const audience = String(req.body?.audience ?? '').trim().slice(0, 200);
    const customerArchetype = String(req.body?.customerArchetype ?? '').trim().slice(0, 100);
    const hypothesis = String(req.body?.hypothesis ?? '').trim().slice(0, 350);
    const valueProposition = String(req.body?.valueProposition ?? '').trim().slice(0, 300);
    const draftQuestions = String(req.body?.draftQuestions ?? '').trim().slice(0, 2000);

    if (item.length < 3) {
      res.status(400).json({ error: '검증할 아이템을 3자 이상 입력해 주세요.' });
      return;
    }
    const guide = await generateQuestionGuide({
      item,
      audience,
      customerArchetype,
      hypothesis,
      valueProposition,
      draftQuestions,
    });
    res.json(guide);
  } catch (error) {
    const status = error instanceof AiApiError ? error.status : 500;
    const message = error instanceof Error ? error.message : '질문 생성 중 오류가 발생했어요.';
    res.status(status).json({ error: message });
  }
});

// AI Research Guide: analyze & organize interview questions and notes
app.post('/api/research/analyze-interview', async (req, res) => {
  try {
    const item = String(req.body?.item ?? '').trim().slice(0, 300);
    const questions = String(req.body?.questions ?? '').trim().slice(0, 4000);
    const notes = String(req.body?.notes ?? '').trim().slice(0, 6000);

    if (item.length < 2) {
      res.status(400).json({ error: '검증할 아이템을 입력해 주세요.' });
      return;
    }
    if (questions.length < 3 && notes.length < 5) {
      res.status(400).json({ error: '분석할 인터뷰 질문이나 인터뷰 메모를 입력해 주세요.' });
      return;
    }
    const result = await analyzeInterviewContent({
      item,
      questions: questions || '(질문 미입력 — 메모 기반 분석)',
      notes,
    });
    res.json(result);
  } catch (error) {
    const status = error instanceof AiApiError ? error.status : 500;
    const message = error instanceof Error ? error.message : '인터뷰 분석 중 오류가 발생했어요.';
    res.status(status).json({ error: message });
  }
});

// AI Survey Generator: generate editable survey title, intro, and questions from item
app.post('/api/research/generate-survey', async (req, res) => {
  try {
    const item = String(req.body?.item ?? '').trim().slice(0, 300);
    const audience = String(req.body?.audience ?? '').trim().slice(0, 200);
    const goal = String(req.body?.goal ?? '').trim().slice(0, 200);

    if (item.length < 3) {
      res.status(400).json({ error: '아이템 설명을 3자 이상 입력해 주세요.' });
      return;
    }
    const surveyDraft = await generateSurveyFromItem({ item, audience, goal });
    res.json(surveyDraft);
  } catch (error) {
    const status = error instanceof AiApiError ? error.status : 500;
    const message = error instanceof Error ? error.message : '설문 문항 생성 중 오류가 발생했어요.';
    res.status(status).json({ error: message });
  }
});

// AI Research Template Generator: recommend interview guide + survey questions from research purpose
app.post('/api/research/generate-template', async (req, res) => {
  try {
    const purpose = String(req.body?.purpose ?? '').trim().slice(0, 500);
    const audience = String(req.body?.audience ?? '').trim().slice(0, 200);
    const context = String(req.body?.context ?? '').trim().slice(0, 500);
    const customerArchetype = String(req.body?.customerArchetype ?? '').trim().slice(0, 100);
    const hypothesis = String(req.body?.hypothesis ?? '').trim().slice(0, 350);
    const rawStage = req.body?.validationStage;
    const validationStage =
      rawStage === '고객검증' || rawStage === '문제검증' || rawStage === '솔루션검증'
        ? rawStage
        : undefined;
    const rawFocus = req.body?.focus;
    const focus = rawFocus === 'interview' || rawFocus === 'survey' ? rawFocus : 'both';
    const count = Math.max(4, Math.min(10, Math.round(Number(req.body?.count) || 6)));

    if (purpose.length < 3) {
      res.status(400).json({ error: '리서치 목적을 3자 이상 입력해 주세요.' });
      return;
    }

    const template = await generateResearchTemplate({
      purpose,
      audience: audience || undefined,
      context: context || undefined,
      customerArchetype: customerArchetype || undefined,
      validationStage,
      hypothesis: hypothesis || undefined,
      focus,
      count,
    });
    res.json(template);
  } catch (error) {
    const status = error instanceof AiApiError ? error.status : 500;
    const message = error instanceof Error ? error.message : '질문 템플릿 생성 중 오류가 발생했어요.';
    res.status(status).json({ error: message });
  }
});

// AI Speech-to-Text: transcribe recorded interview audio
app.post('/api/research/transcribe-audio', async (req, res) => {
  try {
    const audioBase64 = String(req.body?.audioBase64 ?? '').trim();
    const mimeType = String(req.body?.mimeType ?? 'audio/webm').trim().slice(0, 120);
    const question = String(req.body?.question ?? '').trim().slice(0, 240);
    const personName = String(req.body?.personName ?? '').trim().slice(0, 80);

    if (!audioBase64 || audioBase64.length < 32) {
      res.status(400).json({ error: '변환할 음성 데이터가 비어 있어요.' });
      return;
    }
    if (audioBase64.length > 24 * 1024 * 1024) {
      res.status(413).json({ error: '음성 파일 크기가 너무 커서 한 번에 변환할 수 없어요.' });
      return;
    }

    const result = await transcribeInterviewAudio({ audioBase64, mimeType, question, personName });
    res.json(result);
  } catch (error) {
    const status = error instanceof AiApiError ? error.status : 500;
    const message = error instanceof Error ? error.message : '음성 텍스트 변환 중 오류가 발생했어요.';
    res.status(status).json({ error: message });
  }
});

// AI Sentiment Trend: analyze positive/negative emotion trajectory across collected interview texts
app.post('/api/research/analyze-sentiment-trend', async (req, res) => {
  try {
    const scopeTitle = String(req.body?.scopeTitle ?? '전체 인터뷰 기록').trim().slice(0, 100);
    const mode = req.body?.mode === 'single' ? 'single' : 'all';
    const rawEntries = Array.isArray(req.body?.entries) ? req.body.entries : [];
    const entries = rawEntries
      .map((entry: Record<string, unknown>, idx: number) => ({
        id: String(entry?.id ?? idx).slice(0, 80),
        speaker: String(entry?.speaker ?? `대상자 ${idx + 1}`).trim().slice(0, 60),
        timestamp: entry?.timestamp ? String(entry.timestamp).trim().slice(0, 40) : undefined,
        text: String(entry?.text ?? '').trim().slice(0, 4000),
      }))
      .filter((e: { text: string }) => e.text.length >= 2);

    if (entries.length === 0) {
      res.status(400).json({ error: '감정 추이를 분석할 인터뷰 텍스트가 아직 없어요.' });
      return;
    }

    const analysis = await analyzeInterviewSentimentTrend({ scopeTitle, mode, entries });
    res.json(analysis);
  } catch (error) {
    const status = error instanceof AiApiError ? error.status : 500;
    const message = error instanceof Error ? error.message : '감정 추이 분석 중 오류가 발생했어요.';
    res.status(status).json({ error: message });
  }
});

// AI Text Summarizer: summarize collected interview texts or pasted content
app.post('/api/research/summarize-text', async (req, res) => {
  try {
    const text = String(req.body?.text ?? '').trim().slice(0, 15000);
    const title = String(req.body?.title ?? '').trim().slice(0, 120);
    const rawStyle = req.body?.style;
    const style = rawStyle === 'bullet' || rawStyle === 'action' ? rawStyle : 'concise';

    if (text.length < 15) {
      res.status(400).json({ error: '요약할 텍스트를 15자 이상 입력해 주세요.' });
      return;
    }

    const summary = await summarizeResearchText({ text, title, style });
    res.json(summary);
  } catch (error) {
    const status = error instanceof AiApiError ? error.status : 500;
    const message = error instanceof Error ? error.message : '텍스트 요약 중 오류가 발생했어요.';
    res.status(status).json({ error: message });
  }
});

// AI Insight Report: synthesize collected interviews and survey responses into actionable insights
app.post('/api/research/generate-insight-report', async (req, res) => {
  try {
    const topic = String(req.body?.topic ?? '').trim().slice(0, 200);
    const rawInterviews = Array.isArray(req.body?.interviews) ? req.body.interviews : [];
    const rawSurveys = Array.isArray(req.body?.surveys) ? req.body.surveys : [];

    const interviews = rawInterviews
      .map((item: Record<string, unknown>, idx: number) => ({
        speaker: String(item?.speaker ?? `대상자 ${idx + 1}`).trim().slice(0, 60),
        group: item?.group ? String(item.group).trim().slice(0, 40) : undefined,
        status: item?.status ? String(item.status).trim().slice(0, 40) : undefined,
        alternative: item?.alternative ? String(item.alternative).trim().slice(0, 120) : undefined,
        text: String(item?.text ?? '').trim().slice(0, 2500),
      }))
      .filter((i: { text: string }) => i.text.length >= 2)
      .slice(0, 80);

    const surveys = rawSurveys
      .map((item: Record<string, unknown>, idx: number) => ({
        title: String(item?.title ?? `설문 ${idx + 1}`).trim().slice(0, 120),
        responseCount: Math.max(0, Math.round(Number(item?.responseCount) || 0)),
        questionsSummary: String(item?.questionsSummary ?? '').trim().slice(0, 3500),
        sampleResponses: Array.isArray(item?.sampleResponses)
          ? item.sampleResponses
              .map((r: unknown) => String(r ?? '').trim().slice(0, 500))
              .filter(Boolean)
              .slice(0, 40)
          : [],
      }))
      .filter((s: { responseCount: number }) => s.responseCount > 0)
      .slice(0, 20);

    if (interviews.length === 0 && surveys.length === 0) {
      res.status(400).json({
        error: 'AI 인사이트 리포트를 생성하려면 수집된 인터뷰 기록이나 설문 응답이 최소 1건 이상 필요해요.',
      });
      return;
    }

    const report = await generateInsightReport({ topic: topic || undefined, interviews, surveys });
    res.json(report);
  } catch (error) {
    const status = error instanceof AiApiError ? error.status : 500;
    const message = error instanceof Error ? error.message : 'AI 인사이트 리포트 생성 중 오류가 발생했어요.';
    res.status(status).json({ error: message });
  }
});

// Get public survey for target user response
app.get('/api/research/surveys/:id', async (req, res) => {
  const survey = await getPublicSurvey(req.params.id);
  if (!survey) {
    res.status(404).json({ error: '존재하지 않거나 삭제된 설문이에요.' });
    return;
  }
  res.json(survey);
});

// Real-time SSE stream for survey response collection
app.get('/api/research/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  researchEventClients.add(res);
  res.write(`event: ready\ndata: ${JSON.stringify({ ok: true })}\n\n`);

  const heartbeat = setInterval(() => {
    try {
      res.write(': ping\n\n');
    } catch {
      clearInterval(heartbeat);
    }
  }, 20000);

  req.on('close', () => {
    clearInterval(heartbeat);
    researchEventClients.delete(res);
  });
});

// Submit target user response
app.post('/api/research/surveys/:id/responses', async (req, res) => {
  const consent = req.body?.consent === true;
  const answers = Array.isArray(req.body?.answers) ? req.body.answers.map((a: unknown) => String(a ?? '')) : [];
  const result = await submitSurveyResponse(req.params.id, { consent, answers });
  if ('error' in result) {
    res.status(result.status).json({ error: result.error });
    return;
  }
  broadcastResearchEvent('survey-response', {
    surveyId: req.params.id,
    responseId: result.data.id,
    createdAt: result.data.createdAt,
  });
  res.status(201).json(result.data);
});

// Manage survey: summary + collected responses
app.get('/api/research/manage/:id', async (req, res) => {
  const key = extractBearer(req.headers.authorization);
  if (!key) {
    res.status(401).json({ error: '설문 관리 권한이 필요해요.' });
    return;
  }
  const result = await getManagedSurvey(req.params.id, key);
  if (result.status === 404) {
    res.status(404).json({ error: '설문을 찾을 수 없어요.' });
    return;
  }
  if (result.status === 403) {
    res.status(403).json({ error: '설문 관리 키가 일치하지 않아요.' });
    return;
  }
  res.json(result.data);
});

// Manage survey: toggle active state
app.patch('/api/research/manage/:id', async (req, res) => {
  const key = extractBearer(req.headers.authorization);
  if (!key) {
    res.status(401).json({ error: '설문 관리 권한이 필요해요.' });
    return;
  }
  const active = Boolean(req.body?.active);
  const result = await setSurveyActive(req.params.id, key, active);
  if (result.status === 404) {
    res.status(404).json({ error: '설문을 찾을 수 없어요.' });
    return;
  }
  if (result.status === 403) {
    res.status(403).json({ error: '설문 관리 키가 일치하지 않아요.' });
    return;
  }
  broadcastResearchEvent('survey-updated', { surveyId: req.params.id, active });
  res.json(result.data);
});

// Manage survey: AI analysis of collected survey responses
app.post('/api/research/manage/:id/analyze', async (req, res) => {
  try {
    const key = extractBearer(req.headers.authorization);
    if (!key) {
      res.status(401).json({ error: '설문 관리 권한이 필요해요.' });
      return;
    }
    const result = await getManagedSurvey(req.params.id, key);
    if (result.status === 404) {
      res.status(404).json({ error: '설문을 찾을 수 없어요.' });
      return;
    }
    if (result.status === 403) {
      res.status(403).json({ error: '설문 관리 키가 일치하지 않아요.' });
      return;
    }
    if (result.data.responses.length === 0) {
      res.status(400).json({ error: '분석할 설문 응답이 아직 없어요.' });
      return;
    }
    const analysis = await analyzeSurveyData({
      title: result.data.title,
      questions: result.data.questions,
      responses: result.data.responses,
    });
    res.json(analysis);
  } catch (error) {
    const status = error instanceof AiApiError ? error.status : 500;
    const message = error instanceof Error ? error.message : '응답 분석 중 오류가 발생했어요.';
    res.status(status).json({ error: message });
  }
});

// Manage survey: CSV download
app.get('/api/research/manage/:id/answers.csv', async (req, res) => {
  const key = extractBearer(req.headers.authorization);
  if (!key) {
    res.status(401).json({ error: '설문 관리 권한이 필요해요.' });
    return;
  }
  const exportAll = req.query.all === '1' || req.query.page === 'all';
  const page = exportAll ? 'all' : Math.max(1, Number(req.query.page ?? 1) || 1);
  const result = await exportSurveyCsv(req.params.id, key, page);
  if (result.status === 404) {
    res.status(404).json({ error: '설문을 찾을 수 없어요.' });
    return;
  }
  if (result.status === 403) {
    res.status(403).json({ error: '설문 관리 키가 일치하지 않아요.' });
    return;
  }
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="survey-${req.params.id}-${exportAll ? 'all' : `page-${page}`}.csv"`,
  );
  res.send(result.csv);
});

// Cross-device PC <-> Mobile Sync API
app.post('/api/sync/create', async (req, res) => {
  try {
    const device: DeviceType = req.body?.device === 'mobile' ? 'mobile' : 'pc';
    const initialData = (req.body?.data && typeof req.body.data === 'object' ? req.body.data : {}) as SyncPayload;
    const workspace = await createSyncWorkspace({ initialData, device });
    res.status(201).json({
      workspace,
      presence: getSyncPresence(workspace.id),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '연동 워크스페이스를 만들지 못했어요.';
    res.status(500).json({ error: message });
  }
});

app.get('/api/sync/:id', async (req, res) => {
  const id = normalizeSyncId(req.params.id);
  const workspace = await getSyncWorkspace(id);
  if (!workspace) {
    res.status(404).json({ error: '일치하는 연동 코드를 찾지 못했어요. 코드를 다시 확인해 주세요.' });
    return;
  }
  res.json({
    workspace,
    presence: getSyncPresence(workspace.id),
  });
});

app.put('/api/sync/:id', async (req, res) => {
  try {
    const id = normalizeSyncId(req.params.id);
    const device: DeviceType = req.body?.device === 'mobile' ? 'mobile' : 'pc';
    const clientId = String(req.body?.clientId ?? '').slice(0, 64);
    const data = (req.body?.data && typeof req.body.data === 'object' ? req.body.data : {}) as SyncPayload;

    const workspace = await updateSyncWorkspace(id, { data, device, clientId });
    if (!workspace) {
      res.status(404).json({ error: '연결된 워크스페이스를 찾지 못했어요.' });
      return;
    }

    const presence = getSyncPresence(workspace.id);
    broadcastSync(workspace.id, 'sync', { workspace, presence, sourceClientId: clientId });
    res.json({ workspace, presence });
  } catch (error) {
    const message = error instanceof Error ? error.message : '동기화 저장에 실패했어요.';
    res.status(500).json({ error: message });
  }
});

app.get('/api/sync/:id/events', async (req, res) => {
  const id = normalizeSyncId(req.params.id);
  const workspace = await getSyncWorkspace(id);
  if (!workspace) {
    res.status(404).json({ error: '연동 코드를 찾을 수 없어요.' });
    return;
  }

  const device: DeviceType = req.query.device === 'mobile' ? 'mobile' : 'pc';
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  let room = syncRooms.get(id);
  if (!room) {
    room = new Set();
    syncRooms.set(id, room);
  }
  const client: SyncClient = { res, device };
  room.add(client);

  const presence = getSyncPresence(id);
  res.write(`event: init\ndata: ${JSON.stringify({ workspace, presence })}\n\n`);
  broadcastSync(id, 'presence', { presence });

  const heartbeat = setInterval(() => {
    try {
      res.write(': ping\n\n');
    } catch {
      clearInterval(heartbeat);
    }
  }, 20000);

  req.on('close', () => {
    clearInterval(heartbeat);
    room?.delete(client);
    if (room && room.size === 0) {
      syncRooms.delete(id);
    } else {
      broadcastSync(id, 'presence', { presence: getSyncPresence(id) });
    }
  });
});

const PORT = 3000;

async function startServer() {
  // Ensure unmatched /api/* requests always return structured JSON 404 instead of falling through to Vite/HTML
  app.use('/api', (req, res) => {
    res.status(404).json({
      error: `요청한 API 경로(${req.method} ${req.originalUrl})를 찾을 수 없어요.`,
    });
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      const indexFile = path.join(distDir, 'index.html');
      if (existsSync(indexFile)) {
        res.sendFile(indexFile);
      } else {
        res.status(404).send('Build output not found.');
      }
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`ResearchLab server listening on http://0.0.0.0:${PORT}`);
  });
}

void startServer();
