// On-device redaction (docs/06 PRIV-10, INV-08). Runs before anything is sent, on titles and
// typed sentences alike. Over-redacting is fine.
//
// Pattern pass: emails · phone numbers · long numbers · URLs.
// Name pass: a capitalized word NOT in the English dictionary, OR in the first-name list → [NAME].
//
// Production lists (Q-14) are built into the package by scripts/build-lexicons.mjs; values for
// long numbers and phone formats are Q-15. If the lists are missing, productionRedactor()
// returns null and nothing can be sent to tier 3 (INV-08 fails closed).

import { isTodo, REDACTION } from "../constants";

export interface RedactorConfig {
  dictionary: ReadonlySet<string>; // lowercase words
  firstNames: ReadonlySet<string>; // lowercase names
  longNumberMinDigits: number;
  phonePatterns: readonly RegExp[];
}

// Replacement tokens for the pattern pass [DERIVED: the scope only names [NAME]].
const TOKENS = { email: "[EMAIL]", url: "[URL]", phone: "[PHONE]", number: "[NUMBER]" } as const;

const EMAIL = /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}.-]+\.[\p{L}]{2,}/gu;
const URL_PATTERN = /\b(?:[a-z][a-z0-9+.-]*:\/\/|www\.)[^\s<>"']+|\b(?:[a-z0-9-]+\.)+[a-z]{2,}\/[^\s<>"']*/giu;

export type Redactor = (text: string) => string;

export function createRedactor(cfg: RedactorConfig): Redactor {
  // A long number is contiguous digits, or digits grouped in threes by "," "." or a space (Q-15).
  const longNumber = /\d{1,3}(?:[,.\s]\d{3})+(?!\d)|\d+/g;
  return (text: string) => {
    let out = text.replace(EMAIL, TOKENS.email).replace(URL_PATTERN, TOKENS.url);
    for (const p of cfg.phonePatterns) out = out.replace(new RegExp(p.source, p.flags.includes("g") ? p.flags : p.flags + "g"), TOKENS.phone);
    out = out.replace(longNumber, (m) => (m.replace(/\D/g, "").length >= cfg.longNumberMinDigits ? TOKENS.number : m));
    return out.replace(/\[(?:EMAIL|URL|PHONE|NUMBER|NAME)\]|\p{L}[\p{L}'’-]*/gu, (word) => {
      if (word.startsWith("[")) return word; // a token from the pattern pass
      const lower = word.toLowerCase();
      if (cfg.firstNames.has(lower)) return REDACTION.NAME_TOKEN;
      const capitalized = /^\p{Lu}/u.test(word);
      if (capitalized && !cfg.dictionary.has(lower)) return REDACTION.NAME_TOKEN;
      return word;
    });
  };
}

/** The loader returns the bundled lists (lowercase), or null when the build has none. */
export function productionRedactor(load: () => { dictionary: ReadonlySet<string>; firstNames: ReadonlySet<string> } | null): Redactor | null {
  if (isTodo(REDACTION.LONG_NUMBER_MIN_DIGITS) || isTodo(REDACTION.PHONE_FORMATS)) return null;
  if (isTodo(REDACTION.DICTIONARY_SOURCE) || isTodo(REDACTION.FIRST_NAME_LIST_SOURCE)) return null;
  const lists = load();
  if (!lists) return null;
  return createRedactor({
    ...lists,
    longNumberMinDigits: REDACTION.LONG_NUMBER_MIN_DIGITS,
    phonePatterns: (REDACTION.PHONE_FORMATS as readonly string[]).map((p) => new RegExp(p, "g")),
  });
}
