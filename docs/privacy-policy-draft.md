# Privacy policy (DRAFT, beta 1)

> Draft for the owner. It must match `docs/06-privacy-data-contract.md` in substance (PRIV-80); any change to that contract needs a change here. Not legal advice. Items marked **[OWNER]** need a decision or legal review before publishing. The product name is undecided (Q-01); "Lock-in" is the working name.

Last updated: [OWNER: date of publication]

## Who we are

Lock-in is a browser extension that blocks sites unrelated to your current work session and tracks time spent on it. It is run by [OWNER: legal name or LLC, country]. Contact: [OWNER: privacy contact email].

## What never leaves your device

- Screenshots. Lock-in never takes any.
- Page content. When Lock-in can't decide about a page, it may read a short snippet on your device only.
- What you type on pages. Lock-in counts input (keys, clicks, scrolls) as numbers only, never their content.
- Full web addresses, full page titles, your task names, your task list, your sessions and your time logs.

## What is sent, and only after you say yes

Most pages are decided on your device. For the few it can't decide, and only after you agree on the consent screen, Lock-in sends this to its server, which passes it to OpenAI's API:

- your task label, redacted;
- the page's domain (for example `docs.google.com`);
- the page title, redacted, with control characters removed and cut to 120 characters;
- a sentence you type to explain an override, redacted.

Redaction runs on your device before anything is sent. It removes email addresses, phone numbers, long numbers, web addresses, and words that look like names.

Webmail (Gmail, Outlook on the web), web chat (Discord, Messenger, WhatsApp Web), banking and health sites send the **domain only**, never titles. A "Domain only" setting stops titles from being sent anywhere. You can decline AI checks or turn them off at any time; then nothing is sent and Lock-in runs only on your device. Every AI check your install sends is listed in Settings.

Requests carry a token tied to your browser install, so our server can tell which install sent them.

## How long it is kept

- **Our server** processes these requests and does not store them. Request logging is turned off on our server and at our host, Cloudflare.
- **OpenAI** does not use API data to train its models by default. We ask OpenAI not to store responses (`store: false`). Until OpenAI approves zero data retention for our account, OpenAI keeps abuse-monitoring logs of API requests for up to 30 days, unless the law requires longer. Source: OpenAI, "Your data" (developers.openai.com/api/docs/guides/your-data), checked 2026-10-31. [OWNER: recheck before publishing; update this section the day ZDR is approved.]

## Usage statistics

Once a day Lock-in sends counts only: an install ID, browser and platform, whether you used it that day, and how many sessions, parks, corrections, refused overrides, bails, passes, sweep undos, task renames, gaps and Limited-mode time. Never titles, web addresses or domains. The install ID is personal data under the GDPR. Retention: [OWNER: period, Q-25].

## Children

You must be at least 13, or older where your local law requires. If you are under your country's age of digital consent, Lock-in runs on your device only and sends nothing to AI checks. [OWNER: the age-check onboarding ships in beta 2; until then confirm how beta 1 testers are screened.]

## Your rights

Under the GDPR you can ask to access or delete your data. Delete-my-data erases your install ID and its usage statistics from our server. [OWNER: lawful basis for each kind of data, for example consent for AI checks; how to make a request; the supervisory authority you can complain to.]

## Not collected in beta 1

Shared domain categories (PRIV-40) are not built yet. [OWNER: when they ship, add a section saying plainly that installs send domains with a distraction category under a separate, unlinked contribution ID to an endpoint that stores no IP addresses, and that it can be turned off in settings.]

## Changes

We will update this page when what we collect changes, and the extension will show the change before it takes effect.
