# 12 VS Code companion (v1.1)

Ships right after the extension launch. Budget about 15 to 20 hours.

## VSC-01 Distribution
A VS Code extension, also published on **Open VSX** for Cursor and Windsurf.

## VSC-02 What it reports
**Active editing** and the **workspace name**. Nothing else: no file names, no code, no keystroke content.

## VSC-03 Workspace to task mapping
The first time a workspace appears, it asks **which task it belongs to** and remembers.

## VSC-04 No double counting
Only **one source counts each minute**: whichever had the most recent input. VS Code and a browser tab on a second monitor are never counted twice (`09` TIME-05).

## VSC-05 Local bridge (decision 19)
There is no desktop app yet to relay, so the VS Code extension talks to the browser extension directly over localhost.

```
VS Code extension listens on 127.0.0.1 ONLY, on one of 3 fixed ports        [port numbers OPEN Q-27]
Pairing:
  1. VS Code shows a 6-digit code
  2. User types it into the browser extension
  3. They exchange a shared secret                                            [exchange protocol OPEN Q-27]
  4. Every message is signed with that secret                                 [signature algorithm OPEN Q-27]
Message fields ONLY: workspace name · active flag · timestamp
```
- Unsigned or wrongly signed messages are dropped [DERIVED].
- From v1.5 the desktop app may relay instead; not specified.

## Acceptance criteria
- [ ] Bridge refuses connections not from 127.0.0.1.
- [ ] Messages contain only the three fields.
- [ ] A minute with input in both VS Code and a browser tab counts once, for the most recent source.
- [ ] New workspace triggers the task question once, then is remembered.
