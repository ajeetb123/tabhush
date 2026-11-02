// INV-05 release check on the built app pages: no eval/new Function, no remote script or model
// hosts, page CSP not loosened. Run after `npm run build`.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const dist = fileURLToPath(new URL("../apps/desktop/dist/", import.meta.url));
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
for (const page of ["session", "report", "settings", "embedder"]) {
  const html = readFileSync(join(dist, "renderer", `${page}.html`), "utf8");
  const csp = /Content-Security-Policy" content="([^"]+)"/.exec(html)?.[1] ?? "";
  if (!/script-src 'self'( 'wasm-unsafe-eval')?;/.test(csp)) problems.push(`${page}.html CSP changed: ${csp}`);
}
if (problems.length) {
  console.error("INV-05 bundle check failed:\n  " + problems.join("\n  "));
  process.exit(1);
}
console.log("INV-05 bundle check passed.");
