# Tabhush privacy policy (DRAFT)

> Draft for the owner, matching `docs/06-privacy-data-contract.md` and the build as of 2026-11-01 (no LLM, Q-61). Any change to what the extension collects needs a change here first. Not legal advice. Items marked **[OWNER]** need a decision or legal review before publishing.

Last updated: [OWNER: date of publication]

## The short version

Tabhush decides everything on your computer. Your browsing, your tasks and what you type never leave it. The only thing that can leave is a small daily count of how the app was used, with no web addresses, page titles or site names in it.

## Who we are

Tabhush is a browser extension that blocks sites unrelated to your current work session and tracks time spent on it. It is run by [OWNER: legal name or LLC, country]. Contact: [OWNER: privacy contact email].

## What Tabhush looks at, and where

To decide whether a tab belongs to what you're working on, Tabhush looks at, **on your computer only**:

- the address and title of your open tabs;
- a short summary of a page: its title, description and top headings;
- for YouTube videos, YouTube's own category label, the video title and channel name;
- how many keys, clicks and scrolls happen on a page, as counts only. Tabhush never reads what you type.

It compares these with your task using rules, site lists and a small model that ships inside the extension. Nothing is sent anywhere to make that decision. Tabhush never takes screenshots.

## What Tabhush stores, and where

Stored in your browser, on your computer:

- your tasks and the courses it has noticed (like "CS 2114"), so it can name your next session for you;
- your sessions: when they ran, your time goal, which sites were blocked and when, breaks, and how much time was on task;
- your settings: school sites, essentials, and similar.

It never learns from incognito tabs or from email, chat or banking sites. Uninstalling Tabhush deletes all of this.

## What leaves your computer

Once a day Tabhush sends **counts only**: an install ID, your browser and operating system, whether you used it that day, and how many sessions, blocks and similar events happened. Never web addresses, page titles, site names, task names or anything you typed. The install ID is personal data under the GDPR. [OWNER: how long these counts are kept, Q-25; whether to add an off switch in settings.] (In the current build these counts are not sent yet, because the server address isn't set, Q-26.)

Tabhush does not use advertising, analytics or tracking services, and it does not sell or share data.

## Why Chrome warns about "all your data"

To see which tab you're on and to block the ones that aren't part of your work, Tabhush needs access to all websites. Chrome describes that access as being able to "read and change all your data on all websites". Tabhush uses it only for the decisions described above, on your computer.

## Children

You must be at least 13, or older where your local law requires.

## Your rights

You can ask to access or delete the usage counts linked to your install ID. [OWNER: how to make a request, the lawful basis for usage counts (for example legitimate interest), and the supervisory authority you can complain to.]

## Changes

If what Tabhush collects changes, this page changes first, and the extension tells you before the change takes effect.
