// Tier 2 runs in an offscreen document because the MV3 service worker can be suspended at any
// time (CLS-20, AGENTS.md section 6). This module creates it on demand and asks it for vectors.

import { EMBEDDING } from "@lockin/core";
import type { OffscreenReply, ToOffscreen } from "../shared/messages";

const OFFSCREEN_PATH = "offscreen/offscreen.html";
let creating: Promise<void> | null = null;

async function ensureOffscreen(): Promise<void> {
  const url = chrome.runtime.getURL(OFFSCREEN_PATH);
  const contexts = await chrome.runtime.getContexts({
    contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
    documentUrls: [url],
  });
  if (contexts.length > 0) return;
  creating ??= chrome.offscreen
    .createDocument({
      url: OFFSCREEN_PATH,
      reasons: [chrome.offscreen.Reason.WORKERS],
      justification: "Runs the bundled on-device embedding model (WASM) that judges tabs against the session's task.",
    })
    .finally(() => {
      creating = null;
    });
  await creating;
}

/** Embeds texts in batches of 16 (EMBEDDING.START_BATCH_SIZE). Throws if tier 2 is unavailable. */
export async function embed(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  await ensureOffscreen();
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += EMBEDDING.START_BATCH_SIZE) {
    const msg: ToOffscreen = { target: "offscreen", type: "embed", texts: texts.slice(i, i + EMBEDDING.START_BATCH_SIZE) };
    const reply = (await chrome.runtime.sendMessage(msg)) as OffscreenReply | undefined;
    if (!reply?.ok) throw new Error(reply ? reply.error : "offscreen document did not reply");
    out.push(...reply.vectors);
  }
  return out;
}
