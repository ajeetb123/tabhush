# 14 Success metrics and gates

Owner of: how errors are measured, metric formulas, gates, what to watch.
**Wrong parks decide everything**: one parked Canvas page mid-assignment and the user uninstalls. Model errors and user behavior are tracked separately, so the model never learns leniency from procrastinators.
All targets are planning numbers, not competitor benchmarks.

## Metric definitions

```
Correction rate          = accepted overrides ÷ parks

Refused-override review  : every refused override reviewed by hand; those judged wrong count as wrong parks
Bail review              : random sample of bails (pass or early end within 2 min of a park) reviewed by hand;
                           the error share found is applied to all bails. Breaks are never bails.     [sample size OPEN Q-42]
Sampled check            : from beta 1, one-tap "Was this park right?" on a small random sample of parks [rate OPEN Q-42]

Estimated wrong-park rate =
   ( accepted overrides
   + refused overrides judged wrong
   + bails × sampled error share
   + wrong parks found by the sampled check )
   ÷ parks
   (bails still never become training labels)

Critical-category wrong parks : wrong parks on docs and editors, tracked alone, target ZERO.
                                Learning platforms are never parked.
Catch rate               = share of distractions caught, on a random sample of items testers label
Inference accuracy       = share of sessions where the inferred chip is kept without renaming,
                           cross-checked against the sampled check. Planning target ≥ 80%.
```

Where review data comes from: everything stays on each machine, so in the betas testers **opt in** to export redacted review records (refused overrides, sampled bails). After launch, the sampled check is the main source.

Reporting: wrong-park rates reported with a **cluster bootstrap** clustered by person and domain (`15` QA-40).

## Gates

### Gate 0: demand [by mid-December]
Landing page + waitlist live this week; clips from November. **≥ 200 sign-ups from people the owner doesn't know.** Below that: rethink pitch or audience before winter break; minimal spending.

### Gate A: before beta 1 [by mid-December]
Runs on **untuned start values**.
- **≥ 200 parks, zero wrong**, across the owner, 2 friends and **≥ 50 distinct sites**; each person judges their own parks. (Clustered: a sanity check, not proof.)
- Each person labels a random sample of **100 of their own tab switches**; **≥ 85%** of distractions in it caught.
- Fail → fix and re-run; beta 1 waits.

### Gate B: per product, before its public launch
- **≥ 500 parks** with an **estimated wrong-park rate ≤ 2%**.
- **Zero** critical-category wrong parks.
- **Catch rate ≥ 85%** on sampled items.
- **Zero lost-work reports.**
- Spend within limits.
- On-device-only mode catch rate reported separately (start target ≥ 70%).
- At 500 parks an observed 2% has a 95% upper bound around 3%: read as directional.
- Extension, Mac app and Windows app each get their own Gate B. Recruit 60 to 90 testers per beta; if under 500 parks, the beta runs longer.

### Gate P: pricing [by the Mac app launch]
**≥ 50 founding plans sold.** Below that: change price, Pro contents, or audience before building more.

### Gate C: before the Windows app
**Day-7 retention ≥ 15%** among **≥ 200 non-friend installs**.

## Watch from day 1
Sessions per active user per week (target 5+) · Day-1 uninstalls with survey reasons · inference accuracy · sweep undos · refused overrides · bypass gaps · waitlist-to-install conversion (phone visitors especially) · LLM calls per user per day (should fall as tier 2 learns) · hours in Limited mode.
Once money flows: founding plans sold · free-to-Pro conversion · monthly vs annual mix · MRR · Pro churn · AI cost per user vs revenue per user.

## Instrumentation requirements [DERIVED]
- Every metric above must be computable from the PRIV-30 telemetry counts, opt-in review exports, or the sampled check. Do not add telemetry fields to compute them without updating `06`.
