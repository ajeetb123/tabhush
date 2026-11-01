// Redaction lists bundled at build time (Q-14, scripts/build-lexicons.mjs): one lowercase entry
// per line. Missing files mean no redactor, so tier 3 stays off (INV-08 fails closed).

import { productionRedactor, type Redactor } from "@lockin/core";

export const LEXICON_FILES = { dictionary: "lexicon/dictionary.txt", firstNames: "lexicon/first-names.txt" } as const;

async function readList(path: string): Promise<Set<string> | null> {
  try {
    const res = await fetch(chrome.runtime.getURL(path));
    if (!res.ok) return null;
    const words = (await res.text()).split("\n").map((w) => w.trim().toLowerCase()).filter(Boolean);
    return words.length ? new Set(words) : null;
  } catch {
    return null;
  }
}

let redactor: Promise<Redactor | null> | null = null;

export function getRedactor(): Promise<Redactor | null> {
  redactor ??= Promise.all([readList(LEXICON_FILES.dictionary), readList(LEXICON_FILES.firstNames)]).then(([dictionary, firstNames]) =>
    productionRedactor(() => (dictionary && firstNames ? { dictionary, firstNames } : null)),
  );
  return redactor;
}
