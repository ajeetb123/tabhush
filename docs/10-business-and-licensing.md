# 10 Business model, licensing and costs

Owner of: Free vs Pro feature split, prices, founding plan, refunds, merchant of record, license keys, auto-renewal, unit economics, costs.
Every price is a **starting hypothesis** to test with the founding plan. Numbers: `CONSTANTS.md` (PRICING_USD, LICENSE, AI_CAPS).
This is not legal or tax advice; the owner checks with an accountant.

## BIZ-01 Free (the extension)
Task inference · sweep and overlay · time per task · Today screen · session card · timed breaks (5/10/15) · export and import [format OPEN Q-23] · daily cap on AI checks (40/day), always visible.
Free is the growth engine; it must be genuinely useful on its own.

## BIZ-02 Pro
```
In the extension, from day one (v1):
  higher AI caps (300/day) · schedules (OPEN Q-22) · Week and Sessions history · custom break lengths
At the Mac app launch (v1.5):
  the macOS app (beyond its free mode) · strict mode
If it ships (v2):
  the Windows app
```
Note: the Mac app has a **real free mode** (classifier helper + bundled Safari extension). Pro unlocks the rest via license key.

## BIZ-03 Prices (hypotheses)
- **Pro annual $39.99 = the default** shown first. Rationale: payment fees take ~12% (~85¢) of a $6.99 monthly charge.
- **Monthly** tested at **$6.99 vs $7.99**.
- Anchors: Freedom $39.99/yr; Opal Pro $99.99/yr; Rize $13/mo.
- Currency/localization: [OPEN Q-43].

## BIZ-04 Founding plan
- **Not a pre-order**: Pro in the extension starts right away.
- **$24.99 for the first year**, includes the Mac app when it ships, then **renews at $39.99/yr**.
- The price jump is shown **at checkout** and **in the renewal reminder**.
- Goes live with the extension launch (spring week 4).

## BIZ-05 Refunds
- Standard **14-day** window.
- **Full refund** if the Mac app misses its public date: **end of spring week 12** (two weeks past the week 10 target).
- Windows buyers get a **prorated refund** for unused months if the Windows app doesn't ship by its stated date.
- Confirm the merchant of record supports these terms.

## BIZ-06 Merchant of record and checkout
- Default **Paddle**; switch to **Lemon Squeezy** if Paddle won't approve the founding plan.
- Fees roughly **5% + 50¢** per sale; MoR handles sales tax and VAT worldwide.
- The Chrome Web Store has no payment system: **checkout lives on the product site**.
- Apply to the MoR over winter break (approval reviews site, policies and product).

## BIZ-07 License keys
- A license key unlocks Pro in the extension and the Mac app. No accounts.
- An extension can't identify the machine, so each key allows **up to 5 activations**, counted per **browser install or Mac app**.
- A reinstall uses an activation; activations are freed **self-serve** in the MoR customer portal.
- Lost keys recovered **by email** through the MoR.
- Sharing beyond the limit is against the terms, not policed hard.

## BIZ-08 Auto-renewal rules
Several US states require clear renewal terms, easy (one-click) cancellation, and a reminder before an annual plan renews. Check which the MoR handles; send the rest yourself.

## BIZ-09 Unit economics
- Every free user costs AI calls; free caps keep the cost per free user to cents a month (≤ ~2.5¢ at 40 calls/day at the scope's GPT-5 nano prices; **~9¢ with `gpt-5.4-nano`**, Q-60).
- Compare revenue per user with AI cost per user **every month**.

## BIZ-10 Revenue math (planning only)
`revenue = installs × weekly-active share × paid share of actives × price`
Example: 10,000 × 25% × 5% × $40 ≈ $5,000/yr.
Ceiling cases: base (a few hundred to ~2,000 installs, few dozen paying, < $100/mo); strong (10k to 20k installs → 125 to 250 customers → $5k to $10k/yr); $5k/month needs ~1,500 customers ≈ 120,000 installs at these rates. Solo support caps at a few thousand active users.

## BIZ-11 Business setup
Consider an LLC (Virginia: $100 to file, $50/yr) with a separate bank account before taking payments; keep tax records.

## BIZ-12 Costs
```
Before extension launch
  domain                      ~$10 to $15/yr (.com)
  Chrome Web Store            $5 one-time
  Google Workspace email      $7/mo (annual billing)
  website                     Framer Basic $10/mo (annual) OR $0 hand-built on Cloudflare Pages
Backend                       Cloudflare Workers free, then $5/mo for 10M requests
LLM                           GPT-5 nano ~ $0.00002/call floor; a few cents per active user per month max
Payments                      ~5% + 50¢ per sale
Apple Developer Program       $99/yr from the Mac app beta
LLC (optional)                $100 file + $50/yr (Virginia)
Windows code signing          Microsoft Artifact Signing $9.99/mo basic (summer 2027); sign from first beta build
First-year total              ~$310 lean; ~$580 to $780 with Framer, LLC and more LLM usage (assumes a Mac owned)
```

## Acceptance criteria
- [ ] Checkout shows annual as default, founding plan renewal price at checkout.
- [ ] Pro features gated only by a validated license; Free features never gated.
- [ ] Cap counter visible in popup for Free and Pro.
- [ ] Renewal reminder flow confirmed (MoR or self-sent) before launch.
