export interface VoiceAnswer {
  id: string;
  personId: string;
  question: string;
  recordedAt: number;
  seconds: number;
  audio: Blob;
  transcript?: string;
  transcribedAt?: number;
  sttEngine?: 'gemini' | 'browser';
  syncedToRecord?: boolean;
}

const DB_NAME = 'researchlab-voice-v1';
const STORE_NAME = 'answers';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('personId', 'personId', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('Failed to open voice database'));
  });
}

export async function listVoiceAnswers(personId: string): Promise<VoiceAnswer[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const index = tx.objectStore(STORE_NAME).index('personId');
    const req = index.getAll(personId);
    req.onsuccess = () => {
      const rows = (req.result as VoiceAnswer[]).sort((a, b) => b.recordedAt - a.recordedAt);
      resolve(rows);
    };
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => db.close();
  });
}

export async function listAllVoiceAnswers(): Promise<VoiceAnswer[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).getAll();
    req.onsuccess = () => {
      const rows = (req.result as VoiceAnswer[]).sort((a, b) => b.recordedAt - a.recordedAt);
      resolve(rows);
    };
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => db.close();
  });
}

export async function saveVoiceAnswer(answer: VoiceAnswer): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(answer);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
    tx.onabort = () => {
      db.close();
      reject(tx.error ?? new Error('Save aborted'));
    };
  });
}

export async function deleteVoiceAnswer(id: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(id);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
    tx.onabort = () => {
      db.close();
      reject(tx.error ?? new Error('Delete aborted'));
    };
  });
}

export async function deletePersonAudio(personId: string): Promise<void> {
  const items = await listVoiceAnswers(personId).catch(() => []);
  if (!items.length) return;
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    for (const item of items) {
      store.delete(item.id);
    }
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
    tx.onabort = () => {
      db.close();
      reject(tx.error ?? new Error('Delete aborted'));
    };
  });
}

export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = typeof reader.result === 'string' ? reader.result : '';
      const comma = dataUrl.indexOf(',');
      if (comma === -1) {
        reject(new Error('Failed to encode audio blob'));
        return;
      }
      resolve(dataUrl.slice(comma + 1));
    };
    reader.onerror = () => reject(reader.error ?? new Error('FileReader error'));
    reader.readAsDataURL(blob);
  });
}

function writeAscii(view: DataView, offset: number, str: string) {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}

export async function encodeAudioBlobToWav(
  blob: Blob,
): Promise<{ blob: Blob; hasAudioSignal: boolean }> {
  const AudioCtx =
    typeof window !== 'undefined'
      ? window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      : undefined;

  if (!AudioCtx) {
    return { blob, hasAudioSignal: true };
  }

  let ctx: AudioContext | null = null;
  try {
    const rawBuffer = await blob.arrayBuffer();
    ctx = new AudioCtx();
    const decoded = await ctx.decodeAudioData(rawBuffer.slice(0));

    const numChannels = decoded.numberOfChannels || 1;
    const srcLength = decoded.length;
    if (!srcLength) {
      return { blob, hasAudioSignal: false };
    }

    // Mix down to mono
    const mono = new Float32Array(srcLength);
    for (let ch = 0; ch < numChannels; ch++) {
      const channelData = decoded.getChannelData(ch);
      for (let i = 0; i < srcLength; i++) {
        mono[i] += channelData[i] / numChannels;
      }
    }

    // Measure peak amplitude
    let peak = 0;
    for (let i = 0; i < srcLength; i++) {
      const abs = Math.abs(mono[i]);
      if (abs > peak) peak = abs;
    }

    // Resample to 16kHz mono PCM for compact, universally supported WAV
    const targetRate = 16000;
    const srcRate = decoded.sampleRate || targetRate;
    const targetLen = Math.max(1, Math.round((srcLength * targetRate) / srcRate));
    const ratio = srcLength / targetLen;

    const dataBytes = targetLen * 2;
    const wavBuffer = new ArrayBuffer(44 + dataBytes);
    const view = new DataView(wavBuffer);

    writeAscii(view, 0, 'RIFF');
    view.setUint32(4, 36 + dataBytes, true);
    writeAscii(view, 8, 'WAVE');
    writeAscii(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true); // PCM
    view.setUint16(22, 1, true); // Mono
    view.setUint32(24, targetRate, true);
    view.setUint32(28, targetRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeAscii(view, 36, 'data');
    view.setUint32(40, dataBytes, true);

    for (let i = 0; i < targetLen; i++) {
      const srcPos = i * ratio;
      const idx0 = Math.min(srcLength - 1, Math.floor(srcPos));
      const idx1 = Math.min(srcLength - 1, idx0 + 1);
      const frac = srcPos - idx0;
      const sample = mono[idx0] * (1 - frac) + mono[idx1] * frac;
      const clamped = Math.max(-1, Math.min(1, sample));
      view.setInt16(44 + i * 2, clamped < 0 ? Math.round(clamped * 0x8000) : Math.round(clamped * 0x7fff), true);
    }

    const wavBlob = new Blob([wavBuffer], { type: 'audio/wav' });
    if (wavBlob.size <= 17 * 1024 * 1024) {
      return { blob: wavBlob, hasAudioSignal: peak >= 0.0015 };
    }
    return { blob, hasAudioSignal: peak >= 0.0015 };
  } catch {
    return { blob, hasAudioSignal: true };
  } finally {
    if (ctx) {
      await ctx.close().catch(() => {});
    }
  }
}
