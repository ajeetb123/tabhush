# 16 Open questions

Everything below is **undecided**. Agents: do not guess. Follow `AGENTS.md` section 2: ask the owner, or leave a `TODO_Q<nn>` placeholder that cannot ship. When the owner answers, move the answer into the owning doc and `CONSTANTS.md`, then mark the question **Resolved** here with the date.

Priority: **P0** blocks beta 1 · **P1** blocks beta 2 / v1 · **P2** blocks a later phase or is cosmetic.

## Product and naming

**Q-01 App name** · P0 · **Name chosen 2026-11-01 (owner): Tabhush**; trademark search still to do
Name, trademark search, domain. Needed this week for Gate 0. Code uses `lockin` until then.
Answer: **Tabhush**. Chosen over the working name because LockIn MCP (lockinmcp.com) sells a task-aware blocker under the same name (`docs/competitive-sweep-2026-11.md`). `tabhush.com` showed as unregistered in an RDAP lookup on 2026-11-01, and a web search found no app or extension with the name. Before buying the domain: a USPTO trademark search (owner). `BRAND` in the constants module now says Tabhush; internal package and repo names stay `lockin`.

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

**Q-08 Shipped domain-category list** · P0 · **Resolved 2026-11-01 (owner)**
Which openly licensed or commercial list, license confirmed, and how its categories map to the 7 categories.
Answer: the **UT1 web blacklists** (Université Toulouse Capitole), **CC BY-SA 4.0** (commercial use allowed; credit required; shipped adaptations stay BY-SA, the extension's code is not affected; license read from the GitHub mirror README because the UT1 site returned 503, recheck on the official site). Built from the mirror `olbat/ut1-blacklists` pinned at commit `03501c64d230df9d84124176558d758351027be1` (2026-10-12). Mapping: `games` → games, `social_networks` → social, `shopping` → shopping, `audio-video` → entertainment. No other UT1 category ships. Recorded in `05` CLS-10 and `CONSTANTS.md` CATEGORY_LIST.

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

**Q-14 Redaction dictionaries** · P0 · **Resolved 2026-10-31**
Source and license of the 50,000-word English dictionary and the first-name list.
Answer: dictionary = SCOWL v1 2020.12.07, `english-words` + `american-words` at sizes 10 to 35 (49,811 words per the SCOWL README), MIT-like license, copyright notice bundled. First names = US Social Security Administration national baby-name data (`names.zip`), the **2,000** most common names by total births across all years and both sexes. ssa.gov refuses automated downloads, so the owner downloads `names.zip` by hand; its public-domain status could not be fetched and is for the owner to confirm. Recorded in `06` PRIV-10 and `CONSTANTS.md` REDACTION.

**Q-15 Redaction patterns** · P0 · **Resolved 2026-10-31**
Minimum digits for "long number"; phone formats/locales to cover.
Answer: a long number is **5 or more digits** (contiguous, or grouped in threes by commas, dots or spaces). Phones: US/Canada formats such as (540) 555-0100, 540-555-0100, 540.555.0100 and 540 555 0100 with an optional +1, plus any number starting with `+` and 7 to 15 digits. Recorded in `06` PRIV-10 and `CONSTANTS.md` REDACTION.

**Q-48 Banking and health domains** · P0 · banking **resolved 2026-11-01 (owner)**, health open
The domain list (or category source) for domain-only sending.
Banking: UT1's `bank` list, same source and license as Q-08. Health: UT1 has no health list; still open.

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

**Q-38 Overrides without tier 3** · P1 · **Resolved 2026-10-31 (owner)** for "tier 3 unavailable"; the LLM `unsure` case stays open (moot while Q-61 keeps the LLM off)
How "This is for my task" works in on-device-only mode, past the cap, or with the backend down; and what an `unsure` override verdict does.
Answer: when tier 3 is unavailable (LLM off per Q-61, cap reached, backend down), "This is for my task" is **accepted and logged**: the one-sentence reason is still required, the item is allowed for this session only, the override shows on the session card as "not checked", is kept as a redacted review record (`unjudged_override`) and counts as a correction. It becomes a label only after 3 active minutes, as before (CLS-62). Recorded in `04` LOCK-04 and `CONSTANTS.md` EXITS. Note for the gates: every accepted override counts toward the estimated wrong-park rate (`14`), so unchecked overrides will push that rate up.

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

**Q-26 Landing page and waitlist** · P0 · backend host **decided 2026-10-31**, rest open
Framer vs hand-built on Cloudflare Pages; waitlist/email provider.
Backend host for beta 1: `https://lockin-backend.<subdomain>.workers.dev`, moving to `api.<domain>` once Q-01 is settled. The owner's workers.dev subdomain is still to come, so `API.BASE_URL` stays `TODO_Q26`. Landing page (owner, 2026-10-31): **hand-built on Cloudflare Pages** ($0, not Framer). The owner wants no paid services beyond the domain, the Chrome Web Store fee and domain email, so the waitlist is to be built in-house on Cloudflare too. How waitlist emails (confirmation, unsubscribe, invites) get sent is still open.

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

**Q-59 "Same as X?" word overlap measure** · P0
`05` CLS-31 fires when labels "overlap by ≥ 60% of their words", but not 60% of what (the shorter label, the longer, or the union). The rule is not applied until decided; the similarity and course-code rules work.

**Q-60 GPT-5 nano shutdown and reasoning setting** · P0 · **Resolved 2026-10-31**
Verified 2026-10-31: OpenAI's deprecations page lists `gpt-5-nano` for removal on **Dec 11, 2026** (recommended replacement `gpt-5.6-luna`), inside beta 1. Its model page does not list which `reasoning.effort` values it accepts, so "lowest reasoning setting" (`minimal` or `none`) is unconfirmed. Owner decides the model for beta 1 and later (check its terms allow minors, as with Q-37), and the effort value after measuring in setup week.
Answer: **`gpt-5.4-nano`** (default snapshot `gpt-5.4-nano-2026-03-17`), reasoning effort **`none`** (its lowest and default value per the model page, checked 2026-10-31). Consequences, recorded in `05` CLS-13, `08` BE-01, `10` BIZ-09 and `CONSTANTS.md` LLM:
- Price is $0.20 per 1M input and $1.25 per 1M output tokens, so a call costs about **$0.000075** (spec assumed $0.00002). A free user at the 40-call cap costs about **9¢ a month**, not 2.5¢. Caps are unchanged; the gap is for the owner to weigh at the gates.
- `gpt-5.4-nano` is itself deprecated: removal **April 1, 2027** (replacement `gpt-6-luna`), during the Mac beta. Pick its successor before then.
- Whether OpenAI's terms allow apps used by minors could not be fetched (pages refuse automated access). Owner to confirm, as Q-37 requires.

**Q-61 No LLM** · **Resolved 2026-10-31 (owner)**
The owner will not pay for or call a pre-existing LLM, and only wants to spend on the domain, the Chrome Web Store fee and domain email. Tier 3 is switched off for everyone (`LLM.ENABLED = false`); every install runs on-device only with the CLS-21 parking path, moved up to beta 1. Consequences: on-device parking needs the shipped category list (Q-08); overrides need a non-LLM rule (Q-38); the on-device catch-rate target is 70%, while Gate B asks for 85% (owner to weigh at Gate A). Q-60's model choice stays recorded as the fallback if this is reversed. Payments: processor decided at v1.

**Q-62 Work subdomains under a distraction domain** · P0 · **Resolved 2026-11-01 (owner)**
UT1 entries cover their subdomains (by design), and the lookup follows that. Checked on the real lists 2026-11-01: `amazon.com` is shopping, so `console.aws.amazon.com` is shopping too, and the CLS-21 on-device path can park the AWS console when its title scores s < 0.25 against the task. `developers.facebook.com` (social) has the same issue. Google, Microsoft, GitHub, Notion, Overleaf and course sites are not listed. Options: an exceptions list of work subdomains, exact-host matching for umbrella domains, or rely on user essentials. Docs and editors are the critical category (`05` CLS-05).
Answer: an **exceptions list** (`CATEGORY_LIST.EXCEPTIONS`): `aws.amazon.com`, `developers.facebook.com`, `developer.amazon.com`, `developer.spotify.com`, `dev.twitch.tv`, `developer.x.com`, `developer.twitter.com`, `studio.youtube.com`, `business.facebook.com`, `sellercentral.amazon.com`. These hosts and their subdomains never take a category from the shipped list, so the on-device path cannot park them; they are still judged and can be asked about. Extend the list by owner decision only.

**Q-63 Owner product changes after the first real run** · **Resolved 2026-11-01 (owner)**
The owner tried beta 1 in Chrome and changed these. They override the scope where they conflict; each owning doc says so.
1. **Never ask.** No "Is this for the <task>?" questions (LOOP-05, CLS-25). Pages that are not clear distractions stay open and are flagged quietly. INV-02 is unchanged: a low score alone still never blocks, because people run several tasks at once.
2. **Clear distractions are blocked**: the pure-distraction list, low-scoring pages in the UT1 games/social/shopping/entertainment lists (CLS-21), and **underground streaming/piracy sites**: UT1 `warez` plus any host containing `streameast` (its domains keep changing). These are blocked for the session.
3. **Always allowed tools**: Claude (`claude.ai`), ChatGPT (`chatgpt.com`, `chat.openai.com`), Blender (`blender.org`), Stack Overflow (`stackoverflow.com`).
4. **YouTube browsing is allowed** (home, search, subscriptions, channels); individual videos and Shorts are still judged.
5. **Music is always allowed at 30% volume**: Spotify (`spotify.com`), YouTube Music (`music.youtube.com`), and YouTube videos whose page metadata says genre `Music` for the video actually playing.
6. **No overrides and no take-backs.** "This is for my task" (LOCK-04 step 1), the emergency pass (step 2) and the 30-second sweep undo (LOOP-04) are removed. Before anything is blocked, the user can still untick tabs in the sweep preview. **End** stays (LOCK-04 step 3: the product is an accountability tool and must always have a way out).
7. **End countdown is 30 seconds** (was 120). Reason line still required.
8. **Several tasks at once** (design delegated to the agent): the "What's this session for?" prompt lets the user pick or type more than one task. A page is related if it is related to any of them. When two or more recent tasks both fit the open tabs (each ≥ 0.60), the prompt opens with them pre-ticked instead of auto-filling one.

**Q-64 Owner changes: no questions, time goals, search blocking** · **Resolved 2026-11-01 (owner; details delegated to the agent where noted)**
1. **No prompts at Start.** The clarify prompt, "Same as X?" and the separate-window questions are gone. The task is inferred from recent tasks; with none, it is named on device from the open tabs (a course code such as "CS 2114" if one appears, else the front tab's title cut to 5 words). Near-duplicate task names merge silently (the CLS-31 triggers). One start screen remains: detected task chips the user can toggle or add to (typed or by voice), a time goal, the list of tabs to block, and "Lock in".
2. **Local memory of courses and tasks**, no prompt: course codes seen in tab titles during sessions are remembered on device to name tasks. Never learned from incognito tabs or domain-only sites (webmail, chat, banking). Nothing leaves the device.
3. **Voice input for tasks**, only when Chrome reports on-device speech recognition (`processLocally`). Audio never goes to a server; without on-device support the mic button is hidden.
4. **Search blocking** (agent design from measured data, 2026-11-01): on Google, Bing and DuckDuckGo result pages the query is compared on device with distraction topics and work topics (`OWNER_RULES.SEARCH_*`). Blocked when distraction similarity ≥ 0.25, it beats the best work topic by ≥ 0.10, and the query is not related to the session's tasks (s < 0.25). On 32 sample queries this blocked 11 of 16 distractions (e.g. "lebron stats") and 0 of 16 work searches; plain similarity to the task could not separate them ("what is a hash map" 0.03 vs "lebron stats" 0.21 for CS homework). This topic match counts as the second signal INV-02 requires, for search pages only. Tune at Gate A.
5. **Sports sites blocked**: UT1 `sports` maps to entertainment.
6. **Time goal** (agent design): the user sets how long they will work (presets 25/45/60/90 min or custom, 15 to 240 min). The default is their typical session (median actual length of their last 10 sessions, rounded to 5 min). A note appears, never a question, when the goal is more than 1.5× their typical (over-ambitious) or under 15 min. When the goal is reached, the popup shows **Stop**: it ends at once as a normal end, with no countdown or reason. Before the goal, End keeps the 30-second countdown and reason ("ended early").
7. **More fun UI** within UI-06 (still no badges, pets, leaderboards or confetti) and a **logo** with toolbar icons.

**Q-65 Unlisted piracy/streaming sites, embedded video, and the report** · **Resolved 2026-11-01 (owner; details by the agent)**
The owner found piracy and movie sites unblocked (yarrlist.net, a movie page playing an embedded trailer). Checked: UT1 misses most of them (yarrlist, fmovies, 123movies, soap2day, hianime, sportsurge…), because they change domains constantly.
1. **Page topics:** pages are also judged by what they are about. The content script reads the title, description and top headings **on device only** (PRIV-01 page snippet; partly answers Q-50) and compares them with distraction and work topics. Blocked when distraction ≥ 0.30, it beats work by ≥ 0.10, and the page is unrelated to the session's tasks (s < 0.25). Measured on 26 realistic pages: 11 of 12 distraction pages blocked, 0 of 14 work pages. Counts as the INV-02 second signal.
2. **Embedded media:** the content script also runs inside frames, so a blocked page's embedded players (e.g. a YouTube trailer) are paused too.
3. **Incognito:** Chrome only lets an extension into incognito windows when the user switches on "Allow in Incognito"; the extension cannot turn that on. The popup and settings flag it.
4. **Report (UI-02/UI-04, built early by owner request):** Today, Week and Sessions views like the scope's mockup: focused time, focus %, items blocked, a day strip colored by task (Q-46: 9am to 9pm, widened to cover any session outside it), time per task, and one insight sentence (Q-21: most-blocked site and when, plus the longest session's time of day). Focus % uses the time the front tab was on task versus off task; time with the browser out of focus is excluded (TIME-01).

**Q-66 Look and feel** · **Resolved 2026-11-01 (owner)**
The owner found the UI "looks like AI" and asked for clean and smooth, a nice non-vibrant background and a slick font. Done: warm neutral palette with one muted accent, ink primary buttons, muted task colors, no gradients or emoji; Plus Jakarta Sans (OFL-1.1, license shipped in `fonts/OFL.txt`) bundled in the package; logo redrawn as a white T with a sage dot on ink. Recorded in `09` UI-06.

**Q-67 Close blocked tabs; music on YouTube** · **Resolved 2026-11-01 (owner; details by the agent)**
1. The owner could still watch a blocked piracy site after a refresh (muted). Blocked tabs are now **closed** and put on the reopen list instead of covered (amends INV-17 and LOCK-05). The last tab in a window becomes the blocked page, so the window never closes.
2. Music on YouTube: YouTube only writes its genre label on a full page load, so a song reached by clicking from another video was judged as an ordinary video. Videos are now also allowed as music when the title or channel shows clear markers (`OWNER_RULES.MUSIC_TITLE_MARKERS`, `MUSIC_CHANNEL_MARKERS`: "official audio", "lyrics", "feat.", "- Topic", VEVO, NCS…), which errs toward allowing. A YouTube video is judged only after the content script reports its genre, title and channel, so a song is never closed in the moment before its label arrives.

**Q-58 Tier 3 cap day boundary** · P1
`AI_CAPS` are "per install per day" but the backend cannot see local time. The backend counts per UTC day [DERIVED]. Confirm, or decide how the client's day (4am local) should apply.

