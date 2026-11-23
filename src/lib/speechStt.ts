interface SpeechRecognitionAlternativeLike {
  transcript: string;
}

interface SpeechRecognitionResultLike {
  isFinal: boolean;
  length: number;
  [index: number]: SpeechRecognitionAlternativeLike;
}

interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: SpeechRecognitionResultLike;
  };
}

interface SpeechRecognitionErrorEventLike {
  error: string;
}

interface SpeechRecognitionInstance {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

type SpeechRecognitionCtor = new () => SpeechRecognitionInstance;

function getSpeechCtor(): SpeechRecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function isLiveSpeechSupported(): boolean {
  return getSpeechCtor() !== null;
}

export interface LiveSpeechController {
  stop: () => string;
}

export function startLiveSpeech(callbacks: {
  lang?: string;
  onUpdate: (finalText: string, interimText: string) => void;
}): LiveSpeechController | null {
  const Ctor = getSpeechCtor();
  if (!Ctor) return null;

  let active = true;
  let committed = '';
  let currentInterim = '';

  const recognition = new Ctor();
  recognition.lang = callbacks.lang ?? 'ko-KR';
  recognition.continuous = true;
  recognition.interimResults = true;

  recognition.onresult = (event) => {
    let sessionFinal = '';
    let interim = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const res = event.results[i];
      const text = res[0]?.transcript ?? '';
      if (res.isFinal) {
        sessionFinal += text;
      } else {
        interim += text;
      }
    }
    if (sessionFinal.trim()) {
      committed = committed ? `${committed} ${sessionFinal.trim()}` : sessionFinal.trim();
    }
    currentInterim = interim.trim();
    callbacks.onUpdate(committed, currentInterim);
  };

  let errorCount = 0;
  let restartTimer: number | null = null;

  recognition.onerror = (event) => {
    if (
      event.error === 'not-allowed' ||
      event.error === 'service-not-allowed' ||
      event.error === 'audio-capture' ||
      event.error === 'network' ||
      event.error === 'language-not-supported'
    ) {
      active = false;
      return;
    }
    errorCount++;
    if (errorCount > 5) {
      active = false;
    }
  };

  recognition.onend = () => {
    if (!active) return;
    restartTimer = window.setTimeout(() => {
      if (!active) return;
      try {
        recognition.start();
      } catch {
        active = false;
      }
    }, 200);
  };

  try {
    recognition.start();
  } catch {
    return null;
  }

  return {
    stop: () => {
      active = false;
      if (restartTimer !== null) {
        window.clearTimeout(restartTimer);
        restartTimer = null;
      }
      try {
        recognition.stop();
      } catch {
        // Ignore already-stopped errors
      }
      return [committed, currentInterim].filter(Boolean).join(' ').trim();
    },
  };
}
