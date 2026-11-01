// MV3 manifest (EXT-01, EXT-03, EXT-14). Generated at build so the name comes from BRAND (Q-01).
// Relative imports (not "@lockin/core") so Vite bundles them when it loads its config.
import { BRAND } from "../../packages/core/src/brand";
import { PLATFORM } from "../../packages/core/src/constants";

export const SINGLE_PURPOSE = "Blocks sites unrelated to your current work session and tracks time spent on it.";

export const manifest = {
  manifest_version: 3,
  name: BRAND.NAME,
  description: SINGLE_PURPOSE,
  version: "0.1.0",
  minimum_chrome_version: String(PLATFORM.MIN_CHROMIUM_VERSION),
  background: { service_worker: "background.js", type: "module" },
  action: { default_popup: "ui/popup.html", default_title: BRAND.NAME },
  options_page: "ui/options.html",
  commands: {
    // No suggested key: the shortcut is undecided, so users assign it in the browser.
    "start-session": { description: `Start a ${BRAND.NAME} session` },
  },
  permissions: ["tabs", "tabGroups", "webNavigation", "declarativeNetRequest", "offscreen", "storage", "scripting", "alarms"],
  host_permissions: ["<all_urls>"],
  content_scripts: [{ matches: ["<all_urls>"], js: ["content.js"], run_at: "document_idle" }],
  web_accessible_resources: [{ resources: ["ui/blocked.html"], matches: ["<all_urls>"] }],
  // INV-05: no remote code. WASM needs 'wasm-unsafe-eval'; nothing else is loosened.
  content_security_policy: { extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'" },
} as const;
