# Competitive sweep (2026-11-01)

Prepared for the owner. Facts come from vendor pages and recent reviews found on 2026-11-01; prices change often and third-party listings disagree, so recheck on each vendor's own site before quoting anything publicly (PROD-04). Not every claim could be verified; unverified items are marked.

## Who else blocks by task, not by list

| Product | How it decides | Where it runs | Price (as found) | Notes |
|---|---|---|---|---|
| **LockIn MCP** (lockinmcp.com) | You set an active task; the Chrome extension blocks pages that don't match it and logs attempts | Relevance checks send the **page URL and a short excerpt to their server**; desktop installer edits the hosts file | $2.99/mo or $29.99/yr, $59.99 lifetime (official site) | Needs an account; extension is a Pro add-on. **Same name as ours** and same pitch. |
| **ProcrastiBlock** | Compares your active task with open tab titles using **local Transformers.js similarity** | Local (store listing's privacy section and description disagree) | Free, open source | Block / warn / grace-period modes, sensitivity slider. Same core technique as our tier 2. |
| **Focus AI** (Chrome) | You type the task; it reads page content to judge each page | Reads page content during sessions | Not verified | 2.6★ average on the Web Store. |
| **TabAI** | Task context drives blocking, plus tab grouping and task integrations | Not verified | Not verified | Broader "AI workspace". |

## List-based blockers and trackers (the defaults to beat)

| Product | What it is | Price (as found) |
|---|---|---|
| Freedom | Cross-device list blocker | $8.99/mo or $39.99/yr; lifetime figures vary |
| Cold Turkey | Strictest blocker, Windows/Mac | Free; Pro $39 one-time |
| Opal | Phone-first, now Mac | $99.99/yr, $19.99/mo, $399 lifetime |
| FocusMe | Cross-platform blocker | Sources disagree ($7.95–9.95/mo) |
| Rize | AI time tracker, no enforcement | From about $9.99/mo billed yearly; no permanent free tier |
| StayFocusd, Forest | Free browser blockers / timers | Free (Forest paid on phones) |

## What is no longer a differentiator

- **"AI that knows your task."** ProcrastiBlock already does local similarity between a typed task and tab titles, for free. LockIn MCP does task matching through a server. An on-device model by itself is not a moat.
- **"It overlays unrelated pages."** LockIn MCP's extension does this too.

## What actually differentiates this product today

1. **Zero typing.** Every task-aware competitor found asks the user to type or set the task. This one infers it from the open tabs, names it from course codes, remembers courses, and handles several tasks at once. That is pillar 1 of the scope and the strongest real edge.
2. **Nothing leaves the device and there is no account.** LockIn MCP sends URLs and page excerpts to its server and requires sign-in; Focus AI reads page content. This one sends nothing but daily counts.
3. **Built to avoid wrong blocks.** A low score alone never blocks (INV-02); learning platforms are never blocked (INV-01); searches are judged by topic with measured results (11/16 distraction searches blocked, 0/16 work searches on the sample). Competitors publish no accuracy numbers.
4. **Keeps page state.** Blocked tabs are covered and paused, never closed, so drafts and quizzes survive.
5. **Student-specific behavior.** Course codes, Canvas/Gradescope/Piazza never blocked, music allowed at low volume, YouTube judged per video while browsing stays open, time goals with an honest Stop.

## Where it is weaker

- **No desktop or phone coverage.** Discord, Steam and games apps are untouched until the Mac app (v1.5). LockIn MCP and Cold Turkey already block system-wide.
- **Accuracy is unproven.** Gate A has not run; the zero-label model scores some of your own work pages under the allow line.
- **Price pressure.** LockIn MCP sells a similar promise at $29.99/yr; the spec's Pro is $39.99/yr (founding $24.99).

## Recommendations to get the edge and make money

1. **Pick the name now (Q-01).** "LockIn"/"Lock-in" collides with LockIn MCP: trademark risk and you'd fight them in search. Done 2026-11-01: **Tabhush**. Still to do: the trademark search, then buy the domain, landing page and waitlist (Gate 0).
2. **Lead with zero setup and privacy**, the two things competitors don't have: "Hit Start. It already knows it's CS 2114. Nothing leaves your laptop." Show it in the Road to SWE clips; a 10-second demo of Start → right task → YouTube music still playing → lebron stats blocked is the ad.
3. **Publish real numbers.** Run Gate A, then put the wrong-block rate and catch rate on the landing page (only numbers the app recorded, per PROD-03). Nobody in this category does, and a 2.6★ competitor shows how much trust matters.
4. **Own the student wedge before going broad.** Course awareness is hard for generic tools to copy quickly. Grow through CS clubs and course Discords with the free tier; keep Pro for history, schedules and higher limits as the spec plans.
5. **Price against the field, at Gate P.** Keep the spec's prices as the hypothesis, but test whether $24.99 founding / $39.99 annual converts against a $29.99/yr competitor. Tune with data, not guesses.
6. **The real moat comes later**: the Mac app for cross-app enforcement (the scope estimates about a year before others own it), and, with opt-in labels, a shared model that gets better than any one user's (scope "Later" list). Both need users first.

## Extension or application?

The scope chose **extension first** on purpose: one-click install from the Web Store, most student distraction happens in the browser, it costs only the $5 Web Store fee, and it ships months sooner. A desktop app is what blocks Discord, Steam and games, but it costs **$99/yr** (Apple Developer Program, needed for notarized direct download) and much more build time, which conflicts with the "domain, Web Store fee and email only" budget. Recommendation: stay extension-first through v1, and revisit the Mac app at Gate P once paying users can fund the $99.

## Sources

- [Focus AI on the Chrome Web Store](https://chromewebstore.google.com/detail/focus-ai-website-blocker/ngboiiifeoioghodfglighnahefnjbib)
- [ProcrastiBlock on the Chrome Web Store](https://chromewebstore.google.com/detail/procrastiblock-procrastin/koiccjinehmalodnlpjlfmnaipilpeoa?hl=en), [Firefox listing](https://firefox.marketplace.browsertotal.com/ko/firefox/addon/procrastiblock/)
- [LockIn MCP](https://www.lockinmcp.com/), [FAQ](https://www.lockinmcp.com/faq), [for students](https://www.lockinmcp.com/for/students), [terms](https://www.lockinmcp.com/terms), [LockIn for Chrome write-up](https://chatgate.ai/post/lockin-for-chrome)
- [TabAI](https://tabai.dev/)
- [Freedom vs Opal (Asian Efficiency, 2026)](https://www.asianefficiency.com/productivity/freedom-vs-opal/), [Freedom review (Makerstack)](https://makerstack.co/reviews/freedom-review/), [Opal review (Autonomous)](https://www.autonomous.ai/en-PT/ourblog/opal-app-review), [TechCrunch blockers roundup](https://techcrunch.com/2025/12/25/the-best-distraction-blockers-to-jumpstart-your-focus-in-the-new-year)
- [FocusMe pricing](https://focusme.com/pricing/#subscribefocusmeyearly), [Reclaim: focus apps 2026](https://reclaim.ai/blog/focus-apps)
- [Rize alternatives with pricing check (Dayflow)](https://www.dayflow.so/compare/rize-alternative/), [Rize reviews (Toolradar)](https://toolradar.com/tools/rize)
