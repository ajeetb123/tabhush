# Tabhush privacy policy (DRAFT)

> Draft for the owner, matching `docs/06-privacy-data-contract.md` and the macOS app as of 2026-11-02 (no LLM, Q-61; desktop app, Q-70). Any change to what the extension collects needs a change here first. Not legal advice. Items marked **[OWNER]** need a decision or legal review before publishing.

Last updated: [OWNER: date of publication]

## The short version

Tabhush decides everything on your computer. Your browsing, your tasks and what you type never leave it. The only thing that can leave is a small daily count of how the app was used, with no web addresses, page titles or site names in it.

## Who we are

Tabhush is a Mac app that blocks apps and sites unrelated to your current work session and reports how you spend your time on the computer. It is run by [OWNER: legal name or LLC, country]. Contact: [OWNER: privacy contact email].

## What Tabhush looks at, and where

While it runs, Tabhush looks at, **on your Mac only**:

- which app is in front, and the title of its front window (with the Accessibility permission you grant);
- in Chrome, Safari, Brave, Edge, Arc and similar browsers, the address and title of the tab in front, and at Start the addresses and titles of your open tabs (with the permission macOS asks for per browser);
- whether you are using the computer, or it is idle or locked.

It compares these with your task using rules, site and app lists and a small model that ships inside the app. Nothing is sent anywhere to make that decision. Tabhush never takes screenshots, never records the screen and never reads what you type.

## What Tabhush stores, and where

Stored in the app's folder on your Mac:

- a log of which app, site and window was in front and for how long, for your report (switch off "Track all day" to log only during sessions);
- your tasks and the courses it has noticed (like "CS 2114"), so it can name your next session for you;
- your sessions: when they ran, your time goal, what was blocked and when, breaks and pauses, and time per app, site and page;
- your settings.

For Messages, Mail, Slack, Discord, password managers, webmail, web chat and banking sites, only the app or site name is kept, never titles. Deleting the app's folder (`~/Library/Application Support/Tabhush`) deletes all of this.

## What leaves your computer

Once a day Tabhush sends **counts only**: an install ID, your browser and operating system, whether you used it that day, and how many sessions, blocks and similar events happened. Never web addresses, page titles, site names, task names or anything you typed. The install ID is personal data under the GDPR. [OWNER: how long these counts are kept, Q-25; whether to add an off switch in settings.] (In the current build these counts are not sent yet, because the server address isn't set, Q-26.)

Tabhush does not use advertising, analytics or tracking services, and it does not sell or share data.

## Why macOS asks for Accessibility and Automation

Accessibility lets Tabhush read window titles and close a tab in browsers that don't share their tabs. Automation lets it read and close tabs in your browsers. Tabhush uses them only for the decisions described above, on your Mac.

## Children

You must be at least 13, or older where your local law requires.

## Your rights

You can ask to access or delete the usage counts linked to your install ID. [OWNER: how to make a request, the lawful basis for usage counts (for example legitimate interest), and the supervisory authority you can complain to.]

## Changes

If what Tabhush collects changes, this page changes first, and the extension tells you before the change takes effect.
