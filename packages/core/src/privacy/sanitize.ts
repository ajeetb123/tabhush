// Structural prompt-injection defenses applied on device before sending (docs/05 CLS-15):
// control characters stripped, titles cut to 120 characters.

import { LLM } from "../constants";

// Cc = C0/C1 controls; Cf = format characters (bidi overrides, zero-width marks) used in Unicode tricks.
const CONTROL = /[\p{Cc}\p{Cf}]/gu;

export function stripControlChars(text: string): string {
  return text.replace(CONTROL, "");
}

/** Cuts by code points so a surrogate pair is never split. */
export function cutTo(text: string, maxChars: number): string {
  return Array.from(text).slice(0, maxChars).join("");
}

export function sanitizeTitle(title: string): string {
  return cutTo(stripControlChars(title).replace(/\s+/g, " ").trim(), LLM.TITLE_MAX_CHARS);
}

export function sanitizeSentence(sentence: string): string {
  return stripControlChars(sentence).replace(/\s+/g, " ").trim();
}
