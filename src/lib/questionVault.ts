import { useCallback, useEffect, useState } from 'react';
import { demoStore } from './api';
import { types } from './research';
import type { InterviewAnalysis, QuestionGuide } from './questionGuide';

export const questionVaultKey = 'research.question-vault.v1';
const VAULT_SYNC_EVENT = 'research-vault-updated';

export type VaultQuestionKind = 'interview' | 'survey';

export interface VaultQuestion {
  id: string;
  text: string;
  kind: VaultQuestionKind;
  itemTopic: string;
  stageOrType: string;
  purpose?: string;
  options?: string[];
  favorite: boolean;
  useCount: number;
  createdAt: string;
}

export interface RoutineStep {
  text: string;
  kind: VaultQuestionKind;
  stage?: string;
  purpose?: string;
}

export interface ResearchRoutine {
  id: string;
  name: string;
  description: string;
  favorite: boolean;
  steps: RoutineStep[];
  useCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface QuestionVaultData {
  questions: VaultQuestion[];
  routines: ResearchRoutine[];
}

const emptyVault: QuestionVaultData = {
  questions: [],
  routines: [],
};

function makeId(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
  }
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

export function readVault(): QuestionVaultData {
  const raw = demoStore.get<QuestionVaultData>(questionVaultKey, emptyVault);
  return {
    questions: Array.isArray(raw?.questions) ? raw.questions : [],
    routines: Array.isArray(raw?.routines) ? raw.routines : [],
  };
}

export function writeVault(next: QuestionVaultData): void {
  demoStore.set(questionVaultKey, next);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(VAULT_SYNC_EVENT));
  }
}

export function saveGuideToVault(guide: QuestionGuide): { addedCount: number; totalCount: number } {
  const current = readVault();
  const existingTexts = new Set(current.questions.map((q) => q.text.trim()));
  const now = new Date().toISOString();
  const additions: VaultQuestion[] = [];

  for (const item of guide.interview) {
    const clean = item.prompt.trim();
    if (!clean || existingTexts.has(clean)) continue;
    existingTexts.add(clean);
    additions.push({
      id: makeId('vq'),
      text: clean,
      kind: 'interview',
      itemTopic: guide.item,
      stageOrType: item.stage,
      purpose: item.purpose,
      favorite: false,
      useCount: 0,
      createdAt: now,
    });
  }

  for (const sq of guide.survey) {
    const clean = sq.label.trim();
    if (!clean || existingTexts.has(clean)) continue;
    existingTexts.add(clean);
    additions.push({
      id: makeId('vq'),
      text: clean,
      kind: 'survey',
      itemTopic: guide.item,
      stageOrType: types[sq.type],
      options: sq.options,
      favorite: false,
      useCount: 0,
      createdAt: now,
    });
  }

  if (additions.length > 0) {
    writeVault({
      ...current,
      questions: [...additions, ...current.questions].slice(0, 200),
    });
  }

  return {
    addedCount: additions.length,
    totalCount: current.questions.length + additions.length,
  };
}

export function saveAnalysisToVault(analysis: InterviewAnalysis): { addedCount: number } {
  const current = readVault();
  const existingTexts = new Set(current.questions.map((q) => q.text.trim()));
  const now = new Date().toISOString();
  const additions: VaultQuestion[] = [];

  for (const qr of analysis.questionReviews) {
    const clean = qr.improved.trim();
    if (!clean || existingTexts.has(clean)) continue;
    existingTexts.add(clean);
    additions.push({
      id: makeId('vq'),
      text: clean,
      kind: 'interview',
      itemTopic: analysis.item,
      stageOrType: `개선 질문 (${qr.verdict})`,
      purpose: qr.insightGoal,
      favorite: false,
      useCount: 0,
      createdAt: now,
    });
  }

  if (additions.length > 0) {
    writeVault({
      ...current,
      questions: [...additions, ...current.questions].slice(0, 200),
    });
  }

  return { addedCount: additions.length };
}

export function useQuestionVault() {
  const [vault, setVault] = useState<QuestionVaultData>(() => readVault());

  useEffect(() => {
    const sync = () => setVault(readVault());
    window.addEventListener(VAULT_SYNC_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(VAULT_SYNC_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  const update = useCallback((updater: (prev: QuestionVaultData) => QuestionVaultData) => {
    const next = updater(readVault());
    writeVault(next);
    setVault(next);
  }, []);

  const addQuestion = useCallback(
    (input: {
      text: string;
      kind: VaultQuestionKind;
      itemTopic?: string;
      stageOrType?: string;
      purpose?: string;
      options?: string[];
      favorite?: boolean;
    }) => {
      const clean = input.text.trim();
      if (!clean) return;
      update((prev) => {
        const existing = prev.questions.find((q) => q.text.trim() === clean);
        if (existing) {
          return {
            ...prev,
            questions: prev.questions.map((q) =>
              q.id === existing.id ? { ...q, favorite: input.favorite ?? q.favorite } : q,
            ),
          };
        }
        const entry: VaultQuestion = {
          id: makeId('vq'),
          text: clean,
          kind: input.kind,
          itemTopic: input.itemTopic?.trim() || '직접 등록',
          stageOrType: input.stageOrType?.trim() || (input.kind === 'interview' ? '인터뷰 질문' : '설문 문항'),
          purpose: input.purpose?.trim() || undefined,
          options: input.options,
          favorite: Boolean(input.favorite),
          useCount: 0,
          createdAt: new Date().toISOString(),
        };
        return {
          ...prev,
          questions: [entry, ...prev.questions].slice(0, 200),
        };
      });
    },
    [update],
  );

  const toggleQuestionFavorite = useCallback(
    (textOrId: string) => {
      update((prev) => ({
        ...prev,
        questions: prev.questions.map((q) =>
          q.id === textOrId || q.text.trim() === textOrId.trim() ? { ...q, favorite: !q.favorite } : q,
        ),
      }));
    },
    [update],
  );

  const incrementQuestionUse = useCallback(
    (id: string) => {
      update((prev) => ({
        ...prev,
        questions: prev.questions.map((q) => (q.id === id ? { ...q, useCount: q.useCount + 1 } : q)),
      }));
    },
    [update],
  );

  const removeQuestion = useCallback(
    (id: string) => {
      update((prev) => ({
        ...prev,
        questions: prev.questions.filter((q) => q.id !== id),
      }));
    },
    [update],
  );

  const addRoutine = useCallback(
    (input: { name: string; description?: string; steps: RoutineStep[]; favorite?: boolean }) => {
      const cleanName = input.name.trim();
      if (!cleanName || input.steps.length === 0) return;
      const now = new Date().toISOString();
      update((prev) => ({
        ...prev,
        routines: [
          {
            id: makeId('rt'),
            name: cleanName,
            description: input.description?.trim() || '',
            favorite: Boolean(input.favorite),
            steps: input.steps,
            useCount: 0,
            createdAt: now,
            updatedAt: now,
          },
          ...prev.routines,
        ].slice(0, 60),
      }));
    },
    [update],
  );

  const toggleRoutineFavorite = useCallback(
    (id: string) => {
      update((prev) => ({
        ...prev,
        routines: prev.routines.map((r) => (r.id === id ? { ...r, favorite: !r.favorite } : r)),
      }));
    },
    [update],
  );

  const incrementRoutineUse = useCallback(
    (id: string) => {
      update((prev) => ({
        ...prev,
        routines: prev.routines.map((r) =>
          r.id === id ? { ...r, useCount: r.useCount + 1, updatedAt: new Date().toISOString() } : r,
        ),
      }));
    },
    [update],
  );

  const removeRoutine = useCallback(
    (id: string) => {
      update((prev) => ({
        ...prev,
        routines: prev.routines.filter((r) => r.id !== id),
      }));
    },
    [update],
  );

  const appendStepToRoutine = useCallback(
    (routineId: string, step: RoutineStep) => {
      update((prev) => ({
        ...prev,
        routines: prev.routines.map((r) => {
          if (r.id !== routineId) return r;
          if (r.steps.some((s) => s.text.trim() === step.text.trim())) return r;
          return {
            ...r,
            steps: [...r.steps, step],
            updatedAt: new Date().toISOString(),
          };
        }),
      }));
    },
    [update],
  );

  return {
    questions: vault.questions,
    routines: vault.routines,
    addQuestion,
    toggleQuestionFavorite,
    incrementQuestionUse,
    removeQuestion,
    addRoutine,
    toggleRoutineFavorite,
    incrementRoutineUse,
    removeRoutine,
    appendStepToRoutine,
  };
}
