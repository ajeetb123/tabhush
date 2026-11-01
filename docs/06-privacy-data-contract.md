# 06 Privacy and data contract

Owner of: what stays on device, what is sent, redaction, domain-only categories, retention, telemetry, shared domain prior, review export, consent, age, policy documents.
This is a contract: the privacy policy must match it word for word in substance. Any change here requires a privacy policy update.

## PRIV-01 Never leaves the machine
- Screenshots (never taken at all).
- Page content, including page snippets (read only on device, only when tier 2 is unsure).
- Keystroke content (input is measured as **counts only**).
- Full URLs, full titles, labels, the task registry, sessions and time logs.

## PRIV-02 Sent to the backend, then to the LLM provider (tier 3 only, after consent)
```
task label                 (redacted)
domain
redacted title             (cut to 120 chars, control chars stripped; omitted for domain-only categories)
sentence typed for an override or clarify answer   (redacted)
app name                   [v1.5]
```
Redaction runs **on device before anything is sent**, on titles and typed sentences alike (INV-08).

## PRIV-03 Domain only, never titles (INV-09)
- Webmail: Gmail, Outlook on the web.
- Web chat: Discord, Messenger, WhatsApp Web.
- Banking and health (domain lists: [OPEN Q-48]).
- Desktop app excluded apps never send titles: Messages, Mail, Slack, Discord.
- A user setting **"Domain only"** stops titles from leaving at all.

## PRIV-10 Redaction (decision 15)
```
Pattern pass:  emails · phone numbers · long numbers · URLs            [long-number length OPEN Q-15]
Name pass:     a capitalized word that is NOT in a 50,000-word English dictionary,
               OR that appears in a first-name list  →  [NAME]        [sources OPEN Q-14]
Over-redacting is fine.
Test set: 500 realistic titles with labeled names; target ≥ 95% of names caught.
```
- PRIV-12 No NER model (too heavy for an extension).

## PRIV-20 Retention
- **Billed API access only**, never a free tier.
- Request **zero data retention (ZDR)** from the provider now. Once approved, retention is zero.
- **Until ZDR is confirmed**, the privacy policy states the provider's **default API retention terms accurately**.
- **Processed, not stored by us:** request-body logging is off at the backend and in Cloudflare (INV-18). Policy wording: "processed, not stored by us", with the LLM provider's retention covered separately.

## PRIV-21 Linkability (stated plainly in the policy)
Tier 3 requests carry a token **bound to the install**, so the backend can tell which install sent them.

## PRIV-30 Telemetry (exhaustive list)
```
install ID · browser and platform · daily-active flag
counts of: sessions · parks · corrections · refused overrides · bails · passes · sweep undos
           chip renames · gaps · Limited-mode time
availability of Chrome's built-in model (for CLS-16)
```
- **No titles, URLs or domains** (INV-19).
- Under GDPR the install ID is personal data. A **delete-my-data** button erases it on the server (`08` BE-08).
- Any field not on this list requires updating this doc and the privacy policy first.
- Storage and retention period: [OPEN Q-25].

## PRIV-40 Shared domain prior
- Installs contribute **domains with a distraction category**.
- Sent under a **separate contribution ID**, **never linked** to the install token, that costs the **same proof-of-work** to mint.
- Sent to an endpoint that **logs no IP addresses**, so contributions can't be tied to a person's browsing.
- A tag counts once **25 distinct contribution IDs** have sent it with **≥ 80% agreement**.
- The never-locked list always wins. The prior **only nudges and never parks** (INV-04). On-device parking uses the shipped category list and cached tier 3 categories instead.
- The privacy policy states plainly that domains are collected this way. **It can be turned off** in settings.
- Later upgrade (not v1): anonymous one-per-install-per-day contribution tokens (Privacy Pass style).

## PRIV-50 Review export and label contribution (opt-in)
- Beta testers can **export review records** [beta1, see OPEN Q-29]. Later, users can contribute labels (Later).
- Each record holds: task label, domain, redacted title, verdict, and for reviews the **redacted** override sentence. Same domain-only rules apply.
- Record format and delivery path: [OPEN Q-28].

## PRIV-60 Consent [beta1]
- Before the **first tier 3 call**, the extension shows **exactly what gets sent** and asks for an **explicit opt-in**. Text on the Web Store listing is not enough.
- Declining switches on **on-device-only mode** (no tier 3 calls at all).
- Consent can be revisited in settings [DERIVED].

## PRIV-61 Age [beta2 onboarding]
- Onboarding asks for **age, self-declared**.
- Minimum age **13**, or higher where local law requires it (Terms).
- Anyone under their local **age of digital consent (13 to 16 depending on country)** runs in **on-device-only mode** until the provider approves ZDR (INV-11). Country table: [OPEN Q-40].

## PRIV-70 On-device only mode
- Available on Free and Pro. No tier 3 calls at all (no override judging via LLM: see OPEN Q-38).
- Purpose: work laptops often block extensions that send data off device, and company policy can bar sending internal tool names to an outside AI.
- Uses the on-device parking path (`05` CLS-21). Catch rate reported separately.

## PRIV-80 Documents and disclosures
- **Waitlist (this week):** its own short privacy notice and an unsubscribe link, before the product privacy policy exists.
- **Privacy policy:** matches this contract; GDPR basics (lawful basis, access and deletion rights, a contact).
- **Terms:** minimum age 13, or higher where local law requires.
- **Chrome Web Store** user-data disclosure and single purpose, verbatim:
  > "Blocks sites unrelated to your current work session and tracks time spent on it."
- **Pre-install screen** explaining the "Read and change all your data on all websites" warning, plus the plain data contract on the listing.
- Every tier 3 call is visible to the user in a log [DERIVED from Risks: "every tier 3 call is visible in a log"].

## PRIV-90 Crash and error reporting
URLs and titles are **scrubbed** before any report leaves the device. Vendor: [OPEN Q-24].

## PRIV-99 Owner rule
Do not dogfood on Procedura or school systems (INV-20).

## Acceptance criteria

- [ ] Network capture during a session shows no full URLs, no unredacted titles, no page content, ever.
- [ ] Gmail, Discord web, a bank and a health site produce tier 3 requests with domain only.
- [ ] "Domain only" setting on: no request contains a title field.
- [ ] Before consent: zero tier 3 requests. Decline: on-device-only mode on.
- [ ] Self-declared age 14 in a country with consent age 16: on-device-only mode on.
- [ ] Redaction test set: ≥ 95% names caught; emails, phones, long numbers and URLs always removed.
- [ ] Telemetry payloads validated against the PRIV-30 allowlist schema; extra fields rejected.
- [ ] Contribution requests carry no install token and the endpoint stores no IP.
