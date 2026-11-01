# Lock-in: Engineering Spec Pack

Hit Start from wherever you are. It figures out the task, locks everything unrelated, and counts the work.

This pack turns the product scope (Oct 31, 2026) into implementation specs for coding agents. **Agents: read `AGENTS.md` first.**

## Reading order

1. `AGENTS.md`: rules, invariants, fixed tech choices
2. `docs/02-glossary.md`: exact meaning of every term
3. `CONSTANTS.md`: every number in one place
4. The topic doc for the area you are building
5. `docs/16-open-questions.md` before you assume anything

## File map (who owns what)

```
AGENTS.md                              Agent rules and hard invariants
CONSTANTS.md                           All numbers, lists, prices (single source)
docs/01-product.md                     What it is, positioning, audience, pillars
docs/02-glossary.md                    Definitions
docs/03-core-loop.md                   Start > infer > clarify > sweep > judge > switch > end, breaks, lifecycle
docs/04-locking-and-exits.md           Never-locked list, exit ladder, parking per item, bypass, fail-open
docs/05-classifier.md                  3 tiers, task registry, labels, memory, thresholds, inference, cache
docs/06-privacy-data-contract.md       What stays, what's sent, redaction, consent, telemetry, age
docs/07-extension.md                   MV3 architecture, storage, permissions, overlay, Safari test
docs/08-backend.md                     Workers backend, tier 3 proxy, abuse limits, config, licenses
docs/09-log-and-ui.md                  Today screen, session card, Week/Sessions, time definitions
docs/10-business-and-licensing.md      Free vs Pro, pricing, founding plan, refunds, keys, costs
docs/11-desktop-app.md                 v1.5 macOS and v2 Windows (Tauri)
docs/12-vscode-companion.md            v1.1 coding-time companion and local bridge
docs/13-release-scope.md               Timeline, what ships in each phase, Later, Out
docs/14-metrics-and-gates.md           Wrong-park math, catch rate, Gates 0/A/B/P/C
docs/15-quality-security-testing.md    Test matrix, regression set, red team, perf budgets
docs/16-open-questions.md              Everything undecided. Do not guess these.
```

## Release map at a glance

```
Nov 1-7         Setup: name, domain, waitlist, ZDR request, Windows token request, Safari test
Nov 8-29        Extension core
mid-Dec         Gate A  ->  Beta 1 (light friends alpha) through winter break
mid-Dec         Gate 0 (200+ stranger waitlist signups)
Winter break    Extension v1 features + Mac app core starts; Web Store submission
Spring wk 1-3   Beta 2 (60-90 testers)  ->  Gate B (extension)
Spring wk 4     v1: free extension launch + Pro + founding plan
right after     v1.1: VS Code companion
Spring wk 6-9   Mac app beta  ->  Gate B (Mac) + Gate P
Spring wk 10    v1.5: Mac app launch (public date for refunds: end of week 12)
Summer 2027     v2: Windows app, only if Gate C passes
```

## Status legend

`[START]` tune later, `[DERIVED]` technical consequence of scope, `[OPEN Q-nn]` undecided, `[vX]` release. Details in `AGENTS.md` section 3.
