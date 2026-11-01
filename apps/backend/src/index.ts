// Cloudflare Worker entry (docs/08 BE-00).

import { handle } from "./app";
import { openAiTransport } from "./llm";
import { D1Store } from "./store";

export interface Env {
  DB: D1Database;
  OPENAI_API_KEY: string;
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return handle(
      {
        store: new D1Store(env.DB),
        llm: openAiTransport(env.OPENAI_API_KEY),
        now: () => Date.now(),
        randomBytes: (n) => crypto.getRandomValues(new Uint8Array(n)),
        sha256Hex,
      },
      request,
    );
  },
} satisfies ExportedHandler<Env>;
