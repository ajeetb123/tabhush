# AGENTS.md: Rules for any coding agent

Read this file completely before writing code. It applies to every agent and IDE (Claude Code, Cursor, Codex, Copilot, Windsurf, Aider, others). If your tool reads `CLAUDE.md`, `.cursorrules` or similar, point it here.

## 1. Source of truth

- This spec pack is derived from **"Lock-in App: Full Product Scope" (Oct 31, 2026, @Ajeet)**. Nothing outside this pack is authoritative.
- Precedence when two places disagree:
  1. `CONSTANTS.md` for any number, list or price
  2. The topic doc in `docs/` that owns the area (see `README.md` file map)
  3. `README.md`
- If code and spec disagree, the spec wins. If you believe the spec is wrong, change the spec in the same PR and say so in the PR description. Never silently diverge.
- The product name is **Tabhush** (owner, 2026-11-01; trademark search pending, `docs/16-open-questions.md` Q-01). UI strings read it from the single `BRAND` constant; internal package names keep the old working name `lockin`.

## 2. No-invention rules

1. **Never invent** a number, threshold, timeout, price, URL, endpoint path, list member, vendor, model ID, file format or third-party API. If it is not in `CONSTANTS.md` or `docs/`, it is undecided.
2. When you hit something undecided:
   - Look it up in `docs/16-open-questions.md`.
   - If it is listed and unresolved: stop and ask the owner. If you are running unattended and must continue, put the value in the constants/config module as `TODO_Q<nn>` (for example `TODO_Q17`) with no guessed default that could ship, and list it in your final summary.
   - If it is not listed: add it to `docs/16-open-questions.md` with the next Q number, then do the above.
3. **Never build features from the "Later" or "Out" lists** in `docs/13-release-scope.md`, even if they seem easy.
4. **Build only what the current phase lists.** Phase gating is in `docs/13-release-scope.md`.
5. **Verify every external API before using it.** Browser extension APIs, Transformers.js, ONNX Runtime Web, Tauri, OpenAI, Paddle, Cloudflare and VS Code APIs change. Check the installed version's docs or type definitions. If an API you expected does not exist, report it; do not write a shim that pretends it does.
6. **Do not "improve" product decisions.** Thresholds, countdowns, prices and policies were chosen deliberately. Tuning happens through data at the gates, not in code review.
7. **Every numeric value lives in one constants module** (mirroring `CONSTANTS.md`), or in the signed remote config where marked `RC`. No inline magic numbers.

## 3. Tags used in this pack

- No tag: normative, stated in the scope.
- `[START]`: a starting value from the scope, to be tuned in betas. Must be configurable (constants module, and remote config where marked `RC`).
- `[DERIVED]`: a direct technical consequence of the scope, not stated word for word. Implement it, but if it conflicts with something, the scope text wins.
- `[OPEN Q-nn]`: undecided. See `docs/16-open-questions.md`.
- `[vX]`: the release that first includes the item (`beta1`, `beta2`, `v1`, `v1.1`, `v1.5`, `v2`).
- Requirement IDs look like `LOOP-04`, `CLS-12`. Cite them in commits and PRs.

## 4. Hard invariants (never violate, in any phase)

These are the requirements most likely to be broken by a well-meaning agent. Treat each as a test that must always pass.

- **INV-01** Learning platforms and courseware are **never parked**, by any tier, any override flow or any config. (`docs/04` LOCK-02)
- **INV-02** Embedding similarity **alone never parks**. A park needs a second signal: tier 1 distraction list, tier 3 "unrelated" verdict, or personal memory. Exception: the on-device-only parking path (`docs/05` CLS-21), which still needs a category signal. (`docs/05`)
- **INV-03** Tier 3 (LLM) output can **never override** tier 1's never-locked list or tier 1's distraction list.
- **INV-04** The crowd-sourced shared domain prior **only nudges scores and never parks**.
- **INV-05** **No remote code.** The model and WASM runtime are bundled. The remote config is signed data only (thresholds, never-locked list, fail-open switch), never code or commands.
- **INV-06** **Fail open.** If the backend is down, a spend cap is hit, or no tier is confident: nothing new is locked, unknown items are allowed and flagged, and nothing already parked unlocks.
- **INV-07** **No screenshots, page content, or keystroke content ever leave the device.** Input is measured as counts only.
- **INV-08** Redaction runs **on device, before** anything is sent, on titles and typed sentences alike.
- **INV-09** Webmail, web chat, banking and health send the **domain only**, never titles. Desktop excluded apps never send titles.
- **INV-10** **No tier 3 call before explicit consent.** Declining consent turns on on-device-only mode.
- **INV-11** Users under their local age of digital consent run **on-device-only** until zero data retention is approved by the LLM provider.
- **INV-12** Page titles and user sentences go to the LLM **as quoted data, never as instructions**, and the LLM answers in a **fixed JSON schema**.
- **INV-13** The model **never learns from its own guesses or from excuses**: bails and refused overrides are never labels; an accepted override becomes a label only after 3 active minutes on that item; playback and idle time never count.
- **INV-14** An extension update arriving mid-session **waits until the session ends**.
- **INV-15** Quitting the desktop app is always possible, is logged as a gap, and is **never followed by a relaunch**.
- **INV-16** Breaks are **never** counted as bails.
- **INV-17** Overlays **keep page state**: unrelated tabs are muted, paused and covered, never closed (except pages a content script cannot reach, which are closed and added to the restore list).
- **INV-18** Request-body logging is **off** at the backend and in Cloudflare.
- **INV-19** Telemetry never contains titles, URLs or domains.
- **INV-20** Do not dogfood or test on Procedura or school systems, since titles reach an LLM.

## 5. Fixed technology choices

Decided in the scope. Do not substitute.

- **Extension:** Chrome Manifest V3, one build for Chrome, Edge and Brave, version 120 or later, on macOS and Windows.
- **On-device model:** `all-MiniLM-L6-v2`, 8-bit quantized ONNX (about 23 MB), 384 dimensions, run with **Transformers.js on ONNX Runtime Web**, bundled in the extension, executed in an **offscreen document**. `bge-small-en-v1.5` gets one benchmark only.
- **Local storage:** IndexedDB for embeddings, labels, task registry and logs. Extension storage only for small settings.
- **Backend:** serverless on **Cloudflare Workers**. No user accounts.
- **LLM: none (owner decision 2026-10-31, Q-61).** Tier 3 is switched off (`LLM.ENABLED = false`); every install runs on-device only. The fallback below is kept so the decision can be reversed.
- **LLM fallback if Q-61 is reversed:** **OpenAI API, `gpt-5.4-nano`** (owner decision 2026-10-31, Q-60; the scope's GPT-5 nano is removed from the API 2026-12-11), lowest reasoning setting (`none`), JSON output, billed access only. **Gemini is banned** (terms bar apps likely used by under-18s).
- **Payments:** a merchant of record, default **Paddle**, fallback **Lemon Squeezy**. License keys, no accounts.
- **Desktop (v1.5 / v2):** **Tauri** with a **Rust** shared core. Tier 2 runs as the **same WASM classifier** in Tauri's webview (reuse, do not rewrite in Rust).
- **VS Code companion (v1.1):** VS Code extension, also published on Open VSX.
- **Extension language and build tooling:** TypeScript (strict) + Vite, tests with Vitest (Q-02, resolved 2026-10-31).
- **Backend storage:** Cloudflare D1 + Workers KV (Q-04, resolved 2026-10-31).

## 6. Things agents commonly get wrong here

- Model ID strings (OpenAI model name, Hugging Face repo for the quantized MiniLM ONNX files): verify the exact current string before use. Do not guess.
- MV3 background is a service worker that can be suspended at any time. That is why the model runs in an offscreen document and why session state must be persisted, not held in memory.
- `chrome.storage.local` caps at 10 MB without the `unlimitedStorage` permission. Use IndexedDB for anything large.
- Chrome Web Store bans remotely hosted code. No downloading model weights or scripts at runtime.
- Safari native messaging only reaches the extension's own containing app. Safari ships inside the Mac app (v1.5), never standalone.
- The Mac app is **not** on the Mac App Store (direct download, notarized).
- Windows focus sessions need a Microsoft Limited Access Feature token. Plan as if it is denied.

## 7. Definition of done for any PR

- Cites requirement IDs implemented.
- Uses the constants module; no new magic numbers.
- Adds or updates tests listed in `docs/15-quality-security-testing.md` for the touched area.
- Does not violate any `INV-xx`.
- Lists any `TODO_Q<nn>` placeholders introduced.
- Updates the spec if behavior intentionally differs, with the reason.
