// INV-05 release check on the built extension: no eval/new Function, no remote script or model
// hosts, CSP not loosened beyond 'wasm-unsafe-eval'. Run after `npm run build`.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const dist = new URL("../apps/extension/dist/", import.meta.url).pathname;
const REMOTE = [/cdn\.jsdelivr\.net/, /unpkg\.com/, /cdnjs\.cloudflare\.com/, /huggingface\.co\/[^"'`\s]*\/resolve\//];
const CODE = [/\bnew Function\s*\(/, /(^|[^.\w])eval\s*\(/];
const problems = [];

function walk(dir) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(m?js|html)$/.test(f)) {
      const src = readFileSync(p, "utf8");
      for (const r of [...REMOTE, ...CODE]) if (r.test(src)) problems.push(`${p.slice(dist.length)}: ${r}`);
    }
  }
}
walk(dist);
const manifest = JSON.parse(readFileSync(join(dist, "manifest.json"), "utf8"));
const csp = manifest.content_security_policy?.extension_pages ?? "";
if (csp !== "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'") problems.push(`manifest CSP changed: ${csp}`);
if (problems.length) {
  console.error("INV-05 bundle check failed:\n  " + problems.join("\n  "));
  process.exit(1);
}
console.log("INV-05 bundle check passed.");
