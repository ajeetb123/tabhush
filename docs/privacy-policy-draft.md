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

## What is sent

Nothing about your browsing. Lock-in decides every page on your device, with rules and a small model that ships inside the extension. Page titles, web addresses, domains, task names and anything you type stay on your device. The only thing that leaves is the daily usage counts below.

[OWNER: this matches the no-LLM decision (Q-61). If an AI check is ever added back, restore the AI-check sections from git history and the consent screen before shipping it.]

## Usage statistics

Once a day Lock-in sends counts only: an install ID, browser and platform, whether you used it that day, and how many sessions, parks, corrections, refused overrides, bails, passes, sweep undos, task renames, gaps and Limited-mode time. Never titles, web addresses or domains. The install ID is personal data under the GDPR. Retention: [OWNER: period, Q-25].

## Children

You must be at least 13, or older where your local law requires. [OWNER: the age-check onboarding ships in beta 2; until then confirm how beta 1 testers are screened.]

## Your rights

Under the GDPR you can ask to access or delete your data. Delete-my-data erases your install ID and its usage statistics from our server. [OWNER: lawful basis for each kind of data, for example consent for AI checks; how to make a request; the supervisory authority you can complain to.]

## Not collected in beta 1

Shared domain categories (PRIV-40) are not built yet. [OWNER: when they ship, add a section saying plainly that installs send domains with a distraction category under a separate, unlinked contribution ID to an endpoint that stores no IP addresses, and that it can be turned off in settings.]

## Changes

We will update this page when what we collect changes, and the extension will show the change before it takes effect.
