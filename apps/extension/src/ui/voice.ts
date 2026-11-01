// Voice input for tasks (Q-64), on device only. The mic is offered only when Chrome reports
// on-device speech recognition (Web Speech API `processLocally`); audio never goes to a server.

interface RecognitionResultEvent {
  results: ArrayLike<ArrayLike<{ transcript: string }>>;
}

interface Recognition {
  lang: string;
  processLocally: boolean;
  interimResults: boolean;
  onresult: ((e: RecognitionResultEvent) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start(): void;
  stop(): void;
}

interface RecognitionCtor {
  new (): Recognition;
  available?: (o: { langs: string[]; processLocally: boolean }) => Promise<string>;
  install?: (o: { langs: string[]; processLocally: boolean }) => Promise<boolean>;
}

const LANG = "en-US"; // English-only in v1 (EMBEDDING.LANGUAGE)

function ctor(): RecognitionCtor | null {
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/** "available", "downloadable", or null when on-device recognition can't be used. */
export async function onDeviceVoice(): Promise<"available" | "downloadable" | null> {
  const C = ctor();
  if (!C?.available) return null; // no on-device API: never fall back to server recognition
  try {
    const status = await C.available({ langs: [LANG], processLocally: true });
    return status === "available" || status === "downloadable" ? status : null;
  } catch {
    return null;
  }
}

/** Listens once (call from a click) and resolves with what was said, or null. */
export async function listenOnce(): Promise<string | null> {
  const C = ctor();
  if (!C) return null;
  if ((await onDeviceVoice()) === "downloadable" && C.install) await C.install({ langs: [LANG], processLocally: true });
  return new Promise((resolve) => {
    const r = new C();
    r.lang = LANG;
    r.processLocally = true;
    r.interimResults = false;
    let text: string | null = null;
    r.onresult = (e) => (text = e.results[0]?.[0]?.transcript?.trim() || null);
    r.onerror = () => resolve(null);
    r.onend = () => resolve(text);
    r.start();
  });
}
