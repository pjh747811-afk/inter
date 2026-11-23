import 'dotenv/config';
import express from 'express';
import { existsSync } from 'node:fs';
import path from 'node:path';
import {
  AiApiError,
  analyzeInterviewContent,
  analyzeInterviewSentimentTrend,
  analyzeSurveyData,
  generateQuestionGuide,
  generateSurveyFromItem,
  summarizeResearchText,
  transcribeInterviewAudio,
} from './server/ai.ts';
import {
  createSurvey,
  exportSurveyCsv,
  getManagedSurvey,
  getPublicSurvey,
  setSurveyActive,
  submitSurveyResponse,
  type SurveyQuestion,
} from './server/storage.ts';

const app = express();
app.use(express.json({ limit: '25mb' }));

function extractBearer(header: string | undefined): string {
  if (!header) return '';
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1].trim() : '';
}

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
    const options =
      type === 'choice' && Array.isArray(q?.options)
        ? q.options.map((o) => String(o).trim()).filter(Boolean).slice(0, 10)
        : [];
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

// AI Research Guide: generate interview & survey questions + validation analysis
app.post('/api/research/question-guide', async (req, res) => {
  try {
    const item = String(req.body?.item ?? '').trim().slice(0, 300);
    const audience = String(req.body?.audience ?? '').trim().slice(0, 200);
    const hypothesis = String(req.body?.hypothesis ?? '').trim().slice(0, 350);
    const draftQuestions = String(req.body?.draftQuestions ?? '').trim().slice(0, 2000);

    if (item.length < 3) {
      res.status(400).json({ error: '검증할 아이템을 3자 이상 입력해 주세요.' });
      return;
    }
    const guide = await generateQuestionGuide({ item, audience, hypothesis, draftQuestions });
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

// Create & publish survey
app.post('/api/research/surveys', async (req, res) => {
  try {
    const title = String(req.body?.title ?? '').trim().slice(0, 100);
    const intro = String(req.body?.intro ?? '').trim().slice(0, 3000);
    if (!title) {
      res.status(400).json({ error: '설문 제목을 입력해 주세요.' });
      return;
    }
    if (!intro) {
      res.status(400).json({ error: '연구 안내 / 동의 내용을 입력해 주세요.' });
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

// Get public survey for target user response
app.get('/api/research/surveys/:id', async (req, res) => {
  const survey = await getPublicSurvey(req.params.id);
  if (!survey) {
    res.status(404).json({ error: '존재하지 않거나 삭제된 설문이에요.' });
    return;
  }
  res.json(survey);
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
  const page = Math.max(1, Number(req.query.page ?? 1) || 1);
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
  res.setHeader('Content-Disposition', `attachment; filename="survey-${req.params.id}-page-${page}.csv"`);
  res.send(result.csv);
});

const PORT = 3000;

async function startServer() {
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
