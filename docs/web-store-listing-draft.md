# Chrome Web Store listing (DRAFT)

> For the owner to paste into the Chrome Web Store developer dashboard (EXT-14). Submit **unlisted** first. Check every answer against the current build before submitting; the store reviews broad host access in depth.

## Store listing

**Name:** Tabhush

**Summary** (single purpose, verbatim from PRIV-80/EXT-14; 132 characters max):
Blocks sites unrelated to your current work session and tracks time spent on it.

**Category:** Productivity

**Description:**

Hit Start. Tabhush figures out what you're working on from your open tabs and blocks everything else until you're done.

- No setup each time: it names the task for you (it even spots course codes like "CS 2114"), and you can juggle more than one.
- Blocks what's clearly a distraction: games, shopping, social, streaming, sports and piracy sites, distracting searches, and unrelated YouTube videos. YouTube browsing, music and your work stay open.
- Never blocks your coursework: Canvas, Gradescope, Piazza and your school's own sites are always allowed.
- Set a time goal. Earn breaks as you work. Past your goal, stop whenever you like.
- See your day: focused time, time per task, what got blocked and when.
- Private by design: everything is decided on your computer. Your browsing, tasks and typing never leave it. No account.

**Single purpose description:** Blocks sites unrelated to your current work session and tracks time spent on it.

## Permission justifications

| Permission | Why it's needed |
|---|---|
| `tabs` | Read the address and title of open tabs to decide which belong to the session, and close blocked tabs. |
| `tabGroups` | Read tab-group structure at Start (the start snapshot). |
| `webNavigation` | Re-check pages that change without reloading (YouTube and other single-page sites). |
| `declarativeNetRequest` | Stop known distraction sites before they load during a session. |
| `scripting` | Add the content script to tabs that were open before install, and to pages that need it. |
| `offscreen` | Run the bundled on-device model, which can't run in the service worker. |
| `storage` | Save settings and the current session so they survive the browser restarting the extension. |
| `alarms` | Time the end countdown, breaks and the daily usage count. |
| Host access (all sites) | See which tab you're on, block the unrelated ones, and read a page's title and description on the device to judge it. |

**Remote code:** No. The model and its runtime are bundled in the package; nothing executable is downloaded.

## Data disclosure (Privacy practices tab)

- **Collected:** Web browsing activity is *read on the device* to block distractions; it is **not** collected or transmitted. Website content (title, description, headings) is likewise read on the device only.
- **Sent:** a daily usage count with an install ID (no URLs, titles or site names), once the server is set up (Q-26).
- Certify: not sold to third parties; not used for purposes unrelated to the single purpose; not used for creditworthiness or lending.
- **Privacy policy URL:** [OWNER: https://tabhush.com/privacy once the domain and site exist].

## Assets still needed

- 128×128 icon: `apps/extension/dist/icons/icon-128.png`.
- At least one 1280×800 screenshot: the start screen, the blocked page, and the report are good candidates.
- Optional 440×280 promo tile.
- Owner: the $5 developer registration fee, and the support email.
