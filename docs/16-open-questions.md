# 16 Open questions

Everything below is **undecided**. Agents: do not guess. Follow `AGENTS.md` section 2: ask the owner, or leave a `TODO_Q<nn>` placeholder that cannot ship. When the owner answers, move the answer into the owning doc and `CONSTANTS.md`, then mark the question **Resolved** here with the date.

Priority: **P0** blocks beta 1 · **P1** blocks beta 2 / v1 · **P2** blocks a later phase or is cosmetic.

## Product and naming

**Q-01 App name** · P0
Name, trademark search, domain. Needed this week for Gate 0. Code uses `lockin` until then.

**Q-30 Mac app gap wording** · P2 · **Owner: not blocking for code (2026-10-31)**
Scope says the Mac app follows "about a month" after the extension, but weeks 4 → 10 is six weeks. Non-blocking; fix copy.

## Engineering foundations

**Q-02 Extension language and build tooling** · P0 · **Resolved 2026-10-31**
TypeScript (strict) + Vite multi-entry build for MV3; Vitest for tests. Recorded in `07` EXT-01 and AGENTS.md section 5.

**Q-03 Backend endpoint paths and versioning** · P0 · **Resolved 2026-10-31**
`/v1/` path prefix; errors are JSON `{"error":{"code","message"}}` with an HTTP status. Paths recorded in `08` BE-00 and `CONSTANTS.md` API.

**Q-04 Backend storage** · P0 · **Resolved 2026-10-31**
Cloudflare D1 for install tokens, daily cap counters, license activations, telemetry and contribution tallies; Workers KV for the signed remote config. Recorded in `08` BE-00.

**Q-05 Remote config signing** · P1
Signature algorithm, key storage, rotation, and what the client does on an invalid signature (spec assumes: keep last valid config).

**Q-06 Proof-of-work puzzle** · P0 · **Resolved 2026-10-31**
SHA-256 hashcash: find a nonce so SHA-256(challenge ‖ nonce) has 18 leading zero bits. Same cost for install tokens and contribution IDs. Recorded in `08` BE-05 and `CONSTANTS.md` POW.

**Q-07 Rate limits and spend limits** · P1
IP rate limit values, global daily dollar limit, and how waitlist invite waves throttle during a spike.

**Q-47 Update deferral on browser restart** · P1
Chrome may apply a pending update when the browser restarts. Verify behavior and decide how a session resumes across that.

## Lists and data sources

**Q-08 Shipped domain-category list** · P0
Which openly licensed or commercial list, license confirmed, and how its categories map to the 7 categories.

**Q-09 Pure-distraction and mixed-site lists** · P0
Full members beyond Netflix, Steam, TikTok (pure) and YouTube, Reddit, Stack Overflow, X (mixed), plus their path rules.

**Q-41 TikTok conflict** · P0 · **Owner: not blocking for code (2026-10-31)**
Scope lists TikTok as pure-distraction (domain key, never auto-lifted) and also gives "TikTok account" as a mixed-site path rule. Pick one.
Implementation follows `CONSTANTS.md` (highest precedence): TikTok is pure-distraction with a domain key; no TikTok account path rule is implemented.

**Q-10 Courseware detection** · P0
Source of school → courseware domain mapping at onboarding, and the page-fingerprint method for school-hosted instances (e.g. canvas.vt.edu). Must be reliable: INV-01 depends on it.

**Q-11 Developer pages** · P0
Exact package registries and URL patterns on the never-locked list.

**Q-12 Profile tool lists** · P1
Tool lists for Homework, Internship, Projects, Writing, and how a profile is inferred from a task.

**Q-13 Leisure keywords and named-site aliases** · P1
Full leisure keyword list (beyond the leisure set) and full alias list (beyond yt, ig).

**Q-14 Redaction dictionaries** · P0
Source and license of the 50,000-word English dictionary and the first-name list.

**Q-15 Redaction patterns** · P0
Minimum digits for "long number"; phone formats/locales to cover.

**Q-48 Banking and health domains** · P0
The domain list (or category source) for domain-only sending.

**Q-19 Known-safe apps (desktop)** · P2
Which media and social apps may be quit; completeness of the excluded-apps list.

## Classifier behavior

**Q-16 Confidence numerics** · P0 · **(b) Resolved 2026-10-31**, (a) still open
(a) What "high confidence" means for sweep auto-commit (session 6+). (b) How tier 3 `confidence` maps to park / ask / allow.
(b) answer: `unrelated` with confidence ≥ 0.80 parks; `unrelated` below 0.80 and `unsure` go to ask; `related` allows at any confidence. Recorded in `05` CLS-14 and `CONSTANTS.md` THRESHOLDS.

**Q-52 Decision order interpretation** · P0
Spec (`05` CLS-04) routes `s < 0.25` items to tier 3 when available, and tries tier 3 before asking in the middle band. Both are interpretations of the scope. Confirm.

**Q-53 Fewer than 3 prototypes** · P0 · **Resolved 2026-10-31**
Mean of what exists (1 or 2 prototypes); with 0 prototypes only the label term counts. Recorded in `05` CLS-33.

**Q-36 Personal memory agreement** · P1
How "≥ 3 qualifying neighbors agree" combines label weights and decay (count vs weighted vote).

**Q-49 Shared prior nudge size** · P1
How much a crowd tag shifts s (it may never park on its own).

**Q-50 Page snippet use** · P1
Which part of the page is read as a snippet when tier 2 is unsure, its length, and how it enters scoring (on device only).

**Q-51 Task scoring from a tab set** · P0 · **Resolved 2026-10-31**
Compute each tab's s for the task; the front tab is entered twice; the task score is the mean of the 3 highest entries (fewer entries: mean of what exists). Recorded in `05` CLS-50 and `CONSTANTS.md` INFERENCE.

**Q-37 LLM fallback model** · P1
If GPT-5 nano on the lowest reasoning setting is too slow, which non-reasoning model whose terms allow minors.

**Q-38 Overrides without tier 3** · P1
How "This is for my task" works in on-device-only mode, past the cap, or with the backend down; and what an `unsure` override verdict does.

**Q-42 Statistics details** · P1
Sampled-check rate; bail review sample size; CI method for the per-user drift rule; what "disagreement rises" means for the pooled weekly check.

## Core loop and UI

**Q-17 Sweep preview cap** · P0
How many domain groups the preview shows before collapsing.

**Q-18 Heartbeat** · P1
Write interval and the gap threshold.

**Q-20 Proctoring detection** · P1
How the extension detects Honorlock (and other tools), and what state the session returns to after suspension.

**Q-21 Insight generation** · P1
Rules for the Today and Week insight sentences (which patterns, thresholds, wording).

**Q-46 Day strip range** · P2
Mockup shows 9am to 9pm; is the strip fixed or fitted to the day's activity (days run 4am to 4am)?

**Q-22 Pro schedules** · P1
UI, recurrence model, how a scheduled start appears (always with the clarify prompt).

**Q-23 Export/import format** · P1
File format and contents.

**Q-32 Extend increment** · P1
How much time the one-tap extend adds at max length.

**Q-34 Break accrual** · P1
How the "about 1 break minute per 5 focused minutes" cap is computed (per session bank, per day, rounding) and what the UI shows when no break time is available.

**Q-35 "Same as X?" flow** · P2
Prompt UI and what happens on "No".

**Q-39 Timers during breaks** · P1
Do idle pause/end and active-time rules run during a break?

**Q-44 "Where I left off" generation** · P1
How the note is built on device from the last on-task items (which items, how many, format).

**Q-45 Emergency pass scope** · P1
For a mixed site, does a pass unlock the one page/path, or the domain?

## Privacy, data and policy

**Q-24 Crash reporting vendor** · P1
Vendor, and how scrubbing is enforced before send.

**Q-25 Telemetry storage and retention** · P1
Where telemetry lives and for how long.

**Q-28 Review export format** · P0
Record schema (fields fixed in `06` PRIV-50), file format, how testers send it.

**Q-29 Review export phase** · P0 · **Owner: not blocking for code (2026-10-31)**; built in beta 1 as the spec assumes.
Scope's feature list places refused-override logging and review export with beta 2 items, but the roadmap puts review export in beta 1 and beta 2 thresholds are tuned on beta 1 exports. Spec assumes beta 1. Confirm.

**Q-40 Age gate** · P1
Country table for age of digital consent (13 to 16) and how age is stored.

## Business and web

**Q-26 Landing page and waitlist** · P0
Framer vs hand-built on Cloudflare Pages; waitlist/email provider.

**Q-31 Uninstall survey** · P1
Questions and where responses are stored.

**Q-43 Currency** · P2
Localized pricing or USD only.

## Desktop and VS Code

**Q-27 VS Code bridge protocol** · P1
The 3 port numbers, the secret-exchange protocol after the 6-digit code, and the message signature algorithm.

**Q-33 "Lock in?" suggestion** · P2
Trigger rules for the opt-in on-device front-app check outside sessions.

**Q-54 Desktop free vs Pro split** · P2
Exactly which desktop features are in the Mac app's free mode beyond the classifier helper and Safari extension.

## Added during implementation

**Q-55 Ask budget phase** · P0
`03` LOOP-05 is tagged beta 1 and says the ask budget applies, but `13` lists "the ask budget" under beta 2. The code applies the budget in beta 1 (it only ever turns an ask into allow-and-flag, which fails open). Confirm.

**Q-56 School sign-in pages** · P0
`04` LOCK-02 puts "school sign-in pages" on the never-locked list but gives no domains or detection rule (onboarding school domains are beta 2). Which hosts or patterns?

**Q-57 Platform name → domain mapping** · P0
The scope names learning platforms, meetings, webmail, web chat and distraction sites, not their domains. The code ships a `[DERIVED]` domain list for each named platform (`CONSTANTS.md` "Domain mapping"). Owner to verify the list; over-inclusion on the never-locked list is the safe direction.

**Q-58 Tier 3 cap day boundary** · P1
`AI_CAPS` are "per install per day" but the backend cannot see local time. The backend counts per UTC day [DERIVED]. Confirm, or decide how the client's day (4am local) should apply.

