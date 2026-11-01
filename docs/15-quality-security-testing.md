# 15 Quality, security and testing

Owner of: test matrix, regression set, classifier evaluation, red team, redaction tests, performance tests, accessibility, security requirements.

## Security

- SEC-01 The extension reads every tab and the desktop app controls other apps, so both are targets.
- SEC-02 **Updates must be signed.** No code is ever downloaded and run (INV-05).
- SEC-03 The **native messaging host accepts only the extension's own ID**.
- SEC-04 The backend sends **only signed config data**, never commands.
- SEC-05 The LLM key lives only in the backend.
- SEC-06 VS Code bridge: 127.0.0.1 only, paired secret, signed messages (`12`).
- SEC-07 Install tokens need proof-of-work; Mac app adds App Attest on macOS 27+.

## Test matrix

### QA-01 Platforms
Chrome, Edge, Brave (120+) × macOS, Windows. Every release.

### QA-02 Regression set (before every release)
YouTube · Canvas · Google Docs · Gmail · Meet · GitHub.
Minimum checks per site [DERIVED]: correct verdict for an on-task and an off-task session; overlay keeps page state; Meet/Canvas never parked; YouTube SPA navigation re-judged; Gmail sends domain only.

### QA-03 Proctoring
Honorlock (extension suspends) before each extension beta; Respondus LockDown Browser (desktop) before the Mac beta. Tested for real.

### QA-10 Unit tests per invariant
One automated test per `INV-xx` in `AGENTS.md`. These never get skipped.

### QA-11 Classifier decision tests
Table-driven tests for `05` CLS-04 covering every branch, including on-device-only path, cap reached, backend down.

### QA-12 Parity tests (v1.5)
Extension and Mac app (same WASM module) produce identical scores on a fixed set.

## Classifier evaluation

### QA-40 Evaluation set (decision 17)
- Gate A runs on untuned start values using **300 to 400** task-and-item pairs labeled by the owner in November, plus the Gate A tab-switch samples.
- After Gate A, beta 1 exports grow the benchmark to **1,000 pairs**, stratified by profile and site category.
- **70%** tunes thresholds; **30%**, drawn only from beta exports, is held out for reporting.
- Wrong-park rates reported with a **cluster bootstrap** by person and domain.
- Each person labels their own items; the owner settles disagreements.

### QA-41 Embedding benchmark
MiniLM vs bge-small-en-v1.5 once on the Gate A set; switch only if clearly better within budget.

## QA-20 Prompt-injection red team (decision 12)
- **200** adversarial titles and override sentences: embedded instructions, fake system text, Unicode tricks.
- Each item runs **5 times with the injected title** and **5 times with a neutral title**.
- **Pass:** flip rate under injection ≤ neutral baseline + **2 percentage points**.
- Run before every release. Structural defenses stay on regardless (quoted data, fixed schema, control chars stripped, titles cut to 120, tier 1 lists always win).

## QA-21 Redaction test
500 realistic titles with labeled names; **≥ 95%** of names caught; all emails, phones, long numbers and URLs removed.

## QA-30 Accessibility
Overlay and countdowns: screen-reader labels, full keyboard control, reduced motion.

## QA-50 Performance (decision 18) [START]
```
Extension   idle CPU: no measurable · memory < 150 MB incl. model · tier 1+2 < 100 ms
            tier 3 < 1.5 s p95 · 30 most recent tabs judged ≤ 2 s after Start with 80+ open · storage < 50 MB
Model       load < 3 s · < 20 ms/item warm · batch 16 at Start
Mac app     idle CPU < 1% · memory < 200 MB · classification tested with window closed
Safari      warm judge < 50 ms (decides where Safari classification runs)
LLM         measure real token counts and latency in setup week
```

## QA-60 Crash and error reporting
URLs and titles scrubbed before sending (`06` PRIV-90).

## QA-70 Support
Support email, in-app "report a problem", known-issues page. After launch, reserve a fixed slice of every weekend for fixes before new features.

## QA-80 Dogfooding rule
Never test on Procedura or school systems (INV-20). Use personal browsing and test accounts.
