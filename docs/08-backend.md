# 08 Backend (v1)

Owner of: backend responsibilities, tier 3 proxy contract, abuse and spend limits, remote config, license validation, contributions, telemetry intake, deletion, small web pages.
Privacy rules for every payload: `06`. Numbers: `CONSTANTS.md`.

## BE-00 Platform
- **Serverless on Cloudflare Workers.** Free to start, then $5/month for 10 million requests.
- **No user accounts.**
- Storage (Q-04, resolved 2026-10-31): **D1** for install tokens, daily cap counters, license activations, telemetry and contribution tallies; **Workers KV** for the signed remote config.
- Paths and versioning (Q-03, resolved 2026-10-31): every path starts with `/v1/`. Errors are JSON `{"error":{"code":"...","message":"..."}}` with a matching HTTP status. Paths live in `CONSTANTS.md` `API`:
  ```
  POST /v1/token/challenge   proof-of-work challenge (BE-05)
  POST /v1/token             install token after a solved challenge (BE-05)
  POST /v1/tier3             tier 3 proxy, kinds judge | override | infer_label (BE-01)
  GET  /v1/config            signed remote config (BE-03)            [beta2]
  POST /v1/license/activate  license activation (BE-04)               [v1]
  POST /v1/telemetry         telemetry intake (BE-07)
  POST /v1/contribute        shared-prior contributions (BE-06)
  POST /v1/delete            delete my data (BE-08)
  ```
- Daily caps count per **UTC day** [DERIVED; OPEN Q-58].
- **Request-body logging is off** in the Worker and in Cloudflare (INV-18). Titles are processed, not stored.

## BE-01 Tier 3 proxy
- Holds the LLM API key (never shipped to clients).
- Accepts requests only with a valid **install token**.
- Builds the prompt with titles and typed sentences **wrapped as quoted data** (INV-12), never concatenated as instructions.
- Calls OpenAI `gpt-5.4-nano` (reasoning effort `none`, JSON schema output, `store: false`), billed access (Q-60).
- **Validates the response against the fixed schema**; on failure returns `unsure` [DERIVED].
- Enforces per-install daily caps: **Free 40, Pro 300** (Pro determined by a validated license, BE-04).
- Must not log request bodies.

### Request shape [DERIVED from the data contract; field names are proposals]
```json
{
  "kind": "judge | override | infer_label",
  "task_label": "redacted task label",
  "domain": "example.com",
  "title": "redacted, ≤120 chars, control chars stripped; omitted for domain-only",
  "sentence": "redacted override or clarify sentence (override kind only)",
  "app_name": "v1.5 only",
  "front_titles": ["redacted titles (infer_label kind only)"]
}
```

### Response shape
```json
// judge / override
{ "verdict": "related | unrelated | unsure", "confidence": 0.0,
  "category": "work tool | reference | entertainment | social | games | shopping | other" }
// infer_label
{ "label": "≤ 5 words", "confidence": 0.0 }
```
An `override` with verdict `related` = accepted; `unrelated` = refused; `unsure` handling: [OPEN Q-38].

### Prompt rules
- System message: fixed, versioned in the repo, defines the schema and states that everything in the data block is untrusted data.
- Data block: a JSON object containing the fields above. Never interpolate raw title text into instruction text.
- Exact prompt text is written by the owner/agent and must pass the red-team suite (`15` QA-20) before release.

## BE-02 Abuse and spike limits (apply in this order)
```
1. Install-bound token issued at first install, after a small proof-of-work puzzle   [PoW spec OPEN Q-06]
2. IP rate limits                                                                     [values OPEN Q-07]
3. Per-install daily caps (Free 40 / Pro 300 tier 3 calls)
4. Waitlist invite waves during a traffic spike                                       [mechanics OPEN Q-07]
5. Global daily dollar limit, only as a last resort                                   [value OPEN Q-07]
```
Hitting any limit makes the client fail open into Limited mode or show the cap banner (`04` LOCK-08, `09` UI-08). Never block the user's browsing because the backend refused.

## BE-03 Signed remote config
- Serves **data only**: thresholds (all `[RC]` constants), the never-locked list, the global fail-open switch, a version number.
- **Signed**; the extension verifies before use [algorithm and key management OPEN Q-05].
- Never code, scripts, or commands.
- A version change invalidates all verdict cache keys on clients.
- Lets a bad threshold be fixed in minutes instead of waiting for a store update.

## BE-04 License validation
- Validates **Pro license keys issued by the merchant of record** (Paddle default; Lemon Squeezy fallback).
- Up to **5 activations per key**, counted per browser install or Mac app.
- Activations can be freed **self-serve** through the MoR customer portal.
- Lost keys recovered by email through the MoR.
- Sharing beyond the limit is against the terms but not policed hard.
- Integration details depend on the MoR's license API: verify against current MoR docs.

## BE-05 Install tokens
- Issued at first install after the proof-of-work puzzle: **SHA-256 hashcash, 18 leading zero bits** over `challenge ‖ nonce` (Q-06, resolved 2026-10-31). Contribution IDs cost exactly the same.
- Bound to the install; carried on tier 3 requests (linkability disclosed, `06` PRIV-21).
- Mac app (v1.5) additionally uses Apple **App Attest** on macOS 27+.

## BE-06 Shared-prior contributions
- Separate endpoint. Accepts (contribution ID, domain, category).
- Contribution IDs: separate from install tokens, never linked, minted with the same proof-of-work.
- **Logs no IP addresses** (configure Worker and Cloudflare accordingly).
- Aggregates: a tag counts at 25 distinct contribution IDs with ≥ 80% agreement. Published to clients as a nudge-only prior.

## BE-07 Telemetry intake
- Accepts only the PRIV-30 field allowlist; rejects anything else.
- Storage/retention: [OPEN Q-25].

## BE-08 Delete my data
- Erases the install ID and associated telemetry on the server. Triggered by the in-extension button.

## BE-09 Small web pages
- **Uninstall survey** (set as the extension uninstall URL) [questions OPEN Q-31].
- **"Email me the link"** page for visitors on phones, with platform detection.
- Landing page and waitlist host: [OPEN Q-26].

## Acceptance criteria
- [ ] No request body or title appears in any log (Worker logs, Cloudflare logs) during a load test.
- [ ] Malformed or injected LLM output returns `unsure`.
- [ ] Free install's 41st tier 3 call in a day is refused and the client shows the cap banner.
- [ ] Tampered remote config is rejected by the client.
- [ ] Sixth activation of a key is refused; after a portal deactivation it succeeds.
- [ ] Contribution endpoint stores no IP.
