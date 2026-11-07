# CONSTANTS.md: Every number in one place

This is the single source for numeric values, lists and prices. Code must import from one constants module that mirrors this file. Values marked `RC` must also be overridable by the signed remote config (`docs/08-backend.md` BE-03). Values marked `[START]` are starting values to tune on Gate A and beta data. Anything shown as `TODO_Q<nn>` is undecided: see `docs/16-open-questions.md`. Do not fill it in.

The block below is written as TypeScript for convenience. Names are implementation choices; values and comments are normative.

```ts
// ───────────────────────── Session lifecycle (docs/03) ─────────────────────────
export const SESSION = {
  MAX_LENGTH_MIN: 240,          // [START][RC] counts work + breaks, NOT idle pauses. Then one-tap extend prompt.
  EXTEND_INCREMENT_MIN: "TODO_Q32",
  NO_ANSWER_TO_EXTEND_ENDS_AS: "normal", // never "ended early"
  IDLE_PAUSE_AFTER_MIN: 30,     // [START][RC] no input -> pause; locks stay on; time stops counting
  IDLE_END_AFTER_MIN: 120,      // [START][RC] idle this long -> session ends (normal end)
  RESUME_AFTER_RESTART: true,   // only if still within MAX_LENGTH_MIN; restored tabs re-judged before showing
};

// ───────────────────────── Active time and logging (docs/09) ─────────────────────────
export const ACTIVE_TIME = {
  NO_INPUT_STOP_MIN: 2,         // [START] normal page: time stops counting after 2 min without input, back to the last input (owner 2026-11-07, Q-84; was 3)
  VIDEO_GRACE_MIN: 20,          // [START] a video or call in front counts up to 20 min after last input; on macOS only while it is actually playing (Q-84)
  PDF_GRACE_MIN: 5,             // [START] PDF in front counts up to 5 min after last input
  DAY_BOUNDARY_HOUR_LOCAL: 4,   // a "day" runs 4am to 4am local time
};

// ───────────────────────── Sweep (docs/03) ─────────────────────────
export const SWEEP = {
  CONFIRM_REQUIRED_FIRST_N_SESSIONS: 5, // nothing parked until user taps Confirm for the first 5 sessions
  UNDO_WINDOW_SEC: 30,                  // [START] every sweep
  AUTO_COMMIT_MIN_CONFIDENCE: "TODO_Q16",
  PREVIEW_MAX_GROUPS: "TODO_Q17",       // preview grouped by domain, capped to the largest groups
  JUDGE_ORDER: ["recent", "visible"],   // recent and visible tabs judged first
};

// ───────────────────────── Task switch (docs/03, docs/05) ─────────────────────────
export const SWITCH = {
  COUNTDOWN_SEC: 30,                    // [START]
  SUGGEST_AFTER_CONSECUTIVE_ITEMS: 3,   // 3 consecutive new items...
  SUGGEST_MIN_SPAN_MIN: 2,              // ...over at least 2 minutes...
  SUGGEST_SCORE_MARGIN: 0.15,           // ...each scoring 0.15 higher for another recent task
};

// ───────────────────────── Breaks (docs/03) ─────────────────────────
export const BREAKS = {
  OPTIONS_MIN: [5, 10, 15],             // free tier choices; Pro gets custom lengths
  FOCUSED_MIN_PER_BREAK_MIN: 5,         // [START] cap: roughly 1 break minute per 5 focused minutes
                                        // Q-34 (agent 2026-11-01): per-session bank = floor(on-task min / 5) − minutes used
  COUNTS_AS_BAIL: false,                // never
};

// ───────────────────────── Exits (docs/04) ─────────────────────────
export const EXITS = {
  PASS_DURATION_MIN: 10,                // [START] emergency pass unlocks ONE item
  PASS_WAIT_SEC: 30,                    // [START]
  PASSES_PER_DAY: 2,                    // [START]
  END_COUNTDOWN_SEC: 30,                // owner 2026-11-01 (Q-63; was 120) plus a one-line reason; "ended early"
  BAIL_WINDOW_SEC: 120,                 // emergency pass or early end within 2 min of a park = bail
  OVERRIDE_WITHOUT_TIER3: "accept_and_log", // Q-38 (owner 2026-10-31)
};

export const STRICT_MODE = {            // v1.5, opt-in, Pro
  PASSES_PER_DAY: 0,
  END_COUNTDOWN_SEC: 600,               // [START]
};

// ───────────────────────── Asking the user (docs/05) ─────────────────────────
export const ASK = {
  MAX_PER_HOUR: 4,                      // [START][RC]
  MIN_GAP_MIN: 5,                       // [START][RC] at most 1 ask every 5 minutes
  CLARIFY_GUESSES: 3,                   // clarify prompt shows 3 guesses + a text box
  OVER_BUDGET_ACTION: "allow_and_flag",
};

// ───────────────────────── Overrides -> labels (docs/05) ─────────────────────────
export const OVERRIDE_LABEL = {
  ACTIVE_MIN_REQUIRED: 3,               // 3 active minutes on that item in the session
  INPUT_EVENTS_PER_ACTIVE_MIN: 10,      // an active minute has >= 10 input events (keys, clicks, scrolls). Counts only.
  PLAYBACK_COUNTS: false,
};

// ───────────────────────── Labels and drift (docs/05) ─────────────────────────
export const LABELS = {
  STRONG_WEIGHT: 1.0,  STRONG_HALF_LIFE_DAYS: 90,
  WEAK_WEIGHT: 0.3,    WEAK_HALF_LIFE_DAYS: 14,
  DRIFT_PER_USER_WINDOW_ANSWERS: 15,    // last 15 sampled "Was this park right?" answers
  DRIFT_CI_LEVEL: 0.90,
  DRIFT_DISAGREE_LOWER_BOUND: 0.10,     // weak labels off for that user when 90% CI lower bound on disagreement > 10%
  DRIFT_POOLED_CHECK: "weekly",         // pooled across users; remote config can switch weak labels off for everyone
};

// ───────────────────────── Embedding model (docs/05) ─────────────────────────
export const EMBEDDING = {
  MODEL: "all-MiniLM-L6-v2",            // verify exact Hugging Face repo for quantized ONNX before use
  QUANTIZATION: "int8",
  APPROX_SIZE_MB: 23,
  DIMENSIONS: 384,
  MAX_INPUT_TOKENS: 64,                 // titles cut to 64 tokens
  RUNTIME: "Transformers.js on ONNX Runtime Web (WASM), bundled",
  BENCHMARK_ALTERNATIVE: "bge-small-en-v1.5", // one benchmark on Gate A set; switch only if clearly better within budget
  LOAD_BUDGET_MS: 3000,                 // [START]
  WARM_PER_ITEM_MS: 20,                 // [START]
  START_BATCH_SIZE: 16,                 // [START]
  LANGUAGE: "en",                       // English-only in v1
  HF_REPO: "Xenova/all-MiniLM-L6-v2",   // verified 2026-10-31: onnx/model_int8.onnx, 22,972,370 bytes, Apache-2.0
  HF_REVISION: "751bff37182d3f1213fa05d7196b954e230abad9",
  ONNX_FILE: "onnx/model_int8.onnx",
  TRANSFORMERS_DTYPE: "int8",
};

// ───────────────────────── Task representation and thresholds (docs/05) ─────────────────────────
export const TASK_REP = {
  MAX_ITEM_PROTOTYPES: 50,              // oldest dropped first
  TOP_K_FOR_AVG: 3,                     // s = max(sim(label), mean(top-3 sims to item prototypes))
  PROTOTYPE_SEED_MIN_S: 0.45,
  FEWER_THAN_K: "mean_of_existing",     // Q-53: 1-2 prototypes -> mean of those; 0 -> label term only
};

export const THRESHOLDS = {             // [START][RC]
  ALLOW_MIN_S: 0.45,                    // s >= 0.45 -> allow
  MIDDLE_MIN_S: 0.25,                   // 0.25 <= s < 0.45 -> middle (tier 3, or ask)
                                        // s < 0.25 -> "looks unrelated" (still needs a second signal to park)
  ON_DEVICE_PARK_CATEGORIES: ["entertainment", "social", "games", "shopping"],
  TIER3_PARK_MIN_CONFIDENCE: 0.80,     // Q-16b: "unrelated" at >= 0.80 parks; below, or "unsure", asks; "related" allows
  PRIOR_NUDGE_SIZE: "TODO_Q49",
};

// ───────────────────────── Personal memory (docs/05) ─────────────────────────
export const MEMORY = {                 // beta 2+
  K_NEIGHBORS: 5,                       // among labels for the SAME task ID
  MIN_SIMILARITY: 0.70,                 // [START] calibrate on Gate A data
  MIN_AGREEING_NEIGHBORS: 3,            // acts only when >= 3 qualifying neighbors agree
  MAX_ENTRIES: 5000,                    // per user, 8-bit vectors (~2 MB), least recently used dropped first
  VECTOR_FORMAT: "int8",
};

// ───────────────────────── Task registry and inference (docs/05) ─────────────────────────
export const REGISTRY = {
  SAME_AS_MIN_LABEL_SIM: 0.85,          // "Same as X?" if labels >= 0.85 similar,
  SAME_AS_SHARED_COURSE_CODE: true,     // or share a course-code-like token (letters + digits),
  SAME_AS_MIN_WORD_OVERLAP: 0.60,       // or overlap by >= 60% of words
  EXACT_MATCH_NORMALIZE: ["case", "punctuation"], // exact match after normalization merges silently
};

export const INFERENCE = {
  RECENT_TASK_WINDOW_DAYS: 14,
  FRONT_TAB_WEIGHT: 2,                  // front tab counted double
  TAB_SCORE_TOP_N: 3,                   // Q-51: task score = mean of the 3 highest tab s (front tab entered twice)
  AUTOFILL_MIN_SCORE: 0.60,
  AUTOFILL_MIN_MARGIN: 0.10,            // best must beat second best by 0.10, else clarify with top 3
  LLM_LABEL_MAX_WORDS: 5,
  ACCURACY_PLANNING_TARGET: 0.80,       // share of sessions where chip kept without rename
};

export const LEISURE = {
  MIN_SIM_TO_LEISURE_SET: 0.60,
  LEISURE_SET: ["break", "watch Netflix", "play games", "scroll"],
  LEISURE_KEYWORDS: "TODO_Q13",
  WORK_TERMS: ["class", "homework", "assignment", "project", "lecture", "edit"], // presence makes it a work task
};

export const NAMED_SITE_ALIASES = {     // short list; full list TODO_Q13
  yt: "YouTube",
  ig: "Instagram",
};

export const PROFILES = ["Homework", "Internship", "Projects", "Writing"]; // inferred, never picked by user

// ───────────────────────── Verdict cache (docs/05) ─────────────────────────
export const CACHE = {
  KEY: "taskId + itemKey",
  PAGE_KEY_TTL: "session_end",
  PATH_KEY_TTL_DAYS: 7,
  DOMAIN_KEY_TTL_DAYS: 30,
  INVALIDATE_ALL_ON_REMOTE_CONFIG_VERSION_CHANGE: true,
};

// ───────────────────────── Tier 3 / LLM (docs/05, docs/08) ─────────────────────────
export const LLM = {
  ENABLED: false,                       // Q-61 (owner 2026-10-31): no LLM; everything below is the switched-off fallback
  PROVIDER: "OpenAI API",
  MODEL: "GPT-5.4 nano",                // Q-60 (owner 2026-10-31); scope's GPT-5 nano is removed 2026-12-11
  REASONING: "lowest available setting",
  PRICE_INPUT_PER_MTOK_USD: 0.20,       // gpt-5.4-nano standard tier, checked 2026-10-31
  PRICE_OUTPUT_PER_MTOK_USD: 1.25,
  EST_INPUT_TOKENS: 250,
  EST_VISIBLE_OUTPUT_TOKENS: 20,        // reasoning tokens billed as output: treat cost as a floor; measure in setup week
  EST_COST_PER_CALL_USD: 0.000075,
  TITLE_MAX_CHARS: 120,                 // titles cut to 120 characters before sending
  STRIP_CONTROL_CHARS: true,
  CATEGORIES: ["work tool", "reference", "entertainment", "social", "games", "shopping", "other"],
  VERDICTS: ["related", "unrelated", "unsure"],
  BILLED_ACCESS_ONLY: true,             // never a free tier
  FALLBACK_IF_TOO_SLOW: "TODO_Q37",
  API_MODEL_ID: "gpt-5.4-nano",         // Q-60; snapshot gpt-5.4-nano-2026-03-17; removed from the API 2027-04-01
  API_REASONING_EFFORT: "none",         // lowest (and default) value per the model page
  STORE_RESPONSES: false,               // Responses API stores for 30+ days unless store: false (PRIV-20)
};

export const API = {                    // Q-03: /v1/ prefix, JSON errors {"error":{"code","message"}}
  PREFIX: "/v1",
  TOKEN_CHALLENGE: "/v1/token/challenge",
  TOKEN: "/v1/token",
  TIER3: "/v1/tier3",
  CONFIG: "/v1/config",                 // beta2
  LICENSE_ACTIVATE: "/v1/license/activate", // v1
  TELEMETRY: "/v1/telemetry",
  CONTRIBUTE: "/v1/contribute",
  DELETE: "/v1/delete",
  BASE_URL: "TODO_Q26",                 // https://tabhush-backend.<subdomain>.workers.dev once the owner gives the subdomain
};

export const POW = {                    // Q-06: SHA-256 hashcash; same cost for install tokens and contribution IDs
  ALGORITHM: "SHA-256",
  DIFFICULTY_BITS: 18,
  CHALLENGE_BYTES: 16,                  // [DERIVED] random challenge size
  INSTALL_TOKEN_BYTES: 32,              // [DERIVED] random install token size
};

export const AI_CAPS = {                // tier 3 calls per install per day [START][RC]
  FREE_PER_DAY: 40,
  PRO_PER_DAY: 300,
  // => at most about 9 cents per free user per month at gpt-5.4-nano prices (2.5 cents at the scope's GPT-5 nano prices)
};

// ───────────────────────── Redaction (docs/06) ─────────────────────────
export const REDACTION = {
  PATTERNS: ["email", "phone", "long_number", "url"],
  LONG_NUMBER_MIN_DIGITS: 5,            // Q-15: contiguous, or grouped in threes by , . or space
  PHONE_FORMATS: ["US/Canada with optional +1", "+ then 7 to 15 digits"], // Q-15; regexes in the constants module
  NAME_RULE: "capitalized word NOT in 50,000-word English dictionary, OR in first-name list -> [NAME]",
  DICTIONARY_SIZE: 50000,               // source TODO_Q14
  DICTIONARY_SOURCE: "SCOWL 2020.12.07 english-words + american-words, sizes 10-35", // Q-14, 49,811 words
  DICTIONARY_MAX_SCOWL_SIZE: 35,
  FIRST_NAME_LIST_SOURCE: "SSA national baby names (names.zip), top names by total births", // Q-14
  FIRST_NAME_COUNT: 2000,
  NAME_TOKEN: "[NAME]",
  TEST_SET_TITLES: 500,
  TARGET_NAME_RECALL: 0.95,             // over-redacting is fine
};

// ───────────────────────── Shipped domain-category list (docs/05 CLS-10, Q-08, Q-48) ─────────────────────────
export const CATEGORY_LIST = {
  SOURCE: "UT1 web blacklists, Université Toulouse Capitole",
  LICENSE: "CC BY-SA 4.0",
  MIRROR_REPO: "olbat/ut1-blacklists",
  MIRROR_COMMIT: "03501c64d230df9d84124176558d758351027be1", // 2026-10-12
  MAPPING: { games: "games", social_networks: "social", shopping: "shopping", "audio-video": "entertainment", sports: "entertainment" }, // sports: Q-64
  BANKING: "bank",                      // Q-48: domain-only; health still TODO_Q48
  EXCEPTIONS: [                         // Q-62: never inherit a category (subdomains included)
    "aws.amazon.com", "developers.facebook.com", "developer.amazon.com", "developer.spotify.com",
    "dev.twitch.tv", "developer.x.com", "developer.twitter.com", "studio.youtube.com",
    "business.facebook.com", "sellercentral.amazon.com",
  ],
};

// ───────────────────────── Owner rules (Q-63, 2026-11-01) ─────────────────────────
export const OWNER_RULES = {
  ASK_ENABLED: false,                   // never ask "Is this for the <task>?"; unsure items are allowed and flagged
  OVERRIDE_ENABLED: false,              // no "This is for my task", no emergency pass
  SWEEP_UNDO_ENABLED: false,            // blocks cannot be taken back; untick in the preview instead
  ALWAYS_ALLOWED_TOOLS: ["claude.ai", "chatgpt.com", "chat.openai.com", "blender.org", "stackoverflow.com"],
  MUSIC_SITES: ["spotify.com", "music.youtube.com"],
  MUSIC_YOUTUBE_GENRE: "Music",         // YouTube's own genre metadata for the playing video
  MUSIC_VOLUME: 0.3,
  MUSIC_TITLE_MARKERS: ["official video", "official audio", "official music video", "lyric video", "lyrics", "visualizer",
    "(feat", "feat.", " ft.", "remix", "lofi", "lo-fi", "ncs", "music video", "dnb", "edm", "playlist", "mix)"], // Q-67
  MUSIC_CHANNEL_MARKERS: [" - topic", "vevo", "ncs"],                                                       // Q-67
  CLOSE_BLOCKED_TABS: true,             // Q-67: blocked tabs are closed (to the reopen list), not covered
  DEV_INSTALL_ENDS_ANYTIME: true,       // Q-69: the owner's unpacked install can end any time
  EMERGENCY_HOLD_MS: 3000,              // Q-69: everyone else, before the goal: hold 3 s + reason,
  EMERGENCY_COUNTDOWN_SEC: 60,          //   then a 60 s countdown,
  EMERGENCY_STOPS_PER_DAY: 1,           //   once per day; shown as "Emergency stop" in the report
  REPORT_TITLE_MAX_CHARS: 120,          // Q-69: page titles kept for the full report, on this device only
  OTHER_WORK_MARGIN: 0.1,               // Q-72: other productive work = s(other task) >= ALLOW_MIN_S and beats
                                        //   s(session task) by this margin (agent's starting value)
  MAX_TASKS_PER_SESSION: 3,             // Q-78: tasks in one session; time is split between them per stretch
  MISTAKE_CANCEL_SEC: 120,              // Q-78: "Started by mistake? Cancel" window after Lock in,
  MISTAKE_CANCEL_FIRST_SESSIONS: 3,     //   offered during the first 3 recorded sessions only
  UNDERGROUND_LIST: "warez",            // UT1 category, blocked for the session
  UNDERGROUND_HOST_KEYWORDS: ["streameast"],
  MULTI_TASK_MIN_SCORE: 0.60,           // = INFERENCE.AUTOFILL_MIN_SCORE: two recent tasks this strong → both pre-selected
  // Q-64 search blocking (agent design from measured data; tune at Gate A)
  SEARCH_ENGINES: ["google", "bing.com", "duckduckgo.com"],
  SEARCH_DISTRACTION_TOPICS: ["sports scores and players", "basketball", "football", "celebrity gossip", "video games",
    "online shopping deals", "movies and tv shows", "funny videos", "restaurants and food", "concert tickets", "fashion and sneakers"],
  SEARCH_WORK_TOPICS: ["programming and software", "computer science", "math and science homework", "chemistry",
    "writing an essay", "jobs and careers", "research paper", "studying for an exam"],
  SEARCH_TOPIC_MIN: 0.25,
  SEARCH_TOPIC_MARGIN: 0.10,
  // Q-65 page topics: + topics "watch free movies and tv shows online", "movie trailers and film reviews",
  // "anime and manga", "torrents and pirated downloads", "live sports streams" (distraction) and
  // "documentation and tutorials", "online course and lectures", "spreadsheets and documents", "email and calendar" (work)
  PAGE_TOPIC_MIN: 0.30,
  PAGE_TOPIC_MARGIN: 0.10,
  PAGE_SNIPPET_MAX_CHARS: 400,          // about the model's 64-token input; read on device only (PRIV-01)
  // Q-64 time goal (agent design)
  GOAL_PRESETS_MIN: [25, 45, 60, 90],
  GOAL_MIN_MIN: 15,                     // max is SESSION.MAX_LENGTH_MIN
  GOAL_HISTORY_SESSIONS: 10,
  GOAL_ROUND_MIN: 5,
  GOAL_OVERAMBITIOUS_FACTOR: 1.5,
  AUTO_LABEL_MAX_WORDS: 5,              // = INFERENCE.LLM_LABEL_MAX_WORDS
};

// ───────────────────────── Shared domain prior (docs/05, docs/06) ─────────────────────────
export const REVIEW = {                 // docs/14, docs/06 PRIV-50
  SAMPLED_CHECK_RATE: "TODO_Q42",       // "Was this park right?" sample rate
  EXPORT_FORMAT: "TODO_Q28",
};

export const PROCTORING = { DETECTION: "TODO_Q20" };            // LOCK-03
export const COURSEWARE = { SCHOOL_MAPPING_SOURCE: "TODO_Q10", PAGE_FINGERPRINT: "TODO_Q10" };

// CLS-04 reference order, behind config so it can flip [RC][OPEN Q-52]
export const DECISION_ORDER = { LOW_S_TO_TIER3: true, TIER3_BEFORE_ASK: true };

export const SHARED_PRIOR = {
  MIN_DISTINCT_CONTRIBUTION_IDS: 25,
  MIN_CATEGORY_AGREEMENT: 0.80,
  CAN_PARK: false,                      // only nudges
};

// ───────────────────────── Testing, eval, red team (docs/15) ─────────────────────────
export const RED_TEAM = {
  SET_SIZE: 200,                        // adversarial titles + override sentences
  RUNS_INJECTED: 5,
  RUNS_NEUTRAL: 5,
  MAX_FLIP_RATE_DELTA_PP: 2,            // pass: injected flip rate <= neutral baseline + 2 percentage points
};

export const EVAL = {
  GATE_A_SELF_LABELED_PAIRS: [300, 400],
  BENCHMARK_TARGET_PAIRS: 1000,         // after beta 1, stratified by profile and site category
  TUNE_SHARE: 0.70,
  HOLDOUT_SHARE: 0.30,                  // held-out drawn ONLY from beta exports
  CI_METHOD: "cluster bootstrap by person and domain",
};

// ───────────────────────── Performance budgets [START] (docs/15) ─────────────────────────
export const PERF_EXTENSION = {
  IDLE_CPU: "no measurable",
  MAX_MEMORY_MB: 150,                   // including the model
  TIER1_TIER2_VERDICT_MS: 100,
  TIER3_P95_MS: 1500,
  START_JUDGE_RECENT_TABS: 30,          // 30 most recent tabs judged within 2s of Start, even with 80+ open
  START_JUDGE_WITHIN_MS: 2000,
  MAX_STORAGE_PER_USER_MB: 50,
};

export const PERF_MAC = {
  IDLE_CPU_PCT: 1,
  MAX_MEMORY_MB: 200,
};

// ───────────────────────── Platform (docs/07, docs/11) ─────────────────────────
export const PLATFORM = {
  MIN_CHROMIUM_VERSION: 120,            // Chrome, Edge, Brave
  MIN_MACOS: "13 Ventura",
  CHROME_STORAGE_LOCAL_CAP_MB: 10,      // without unlimitedStorage -> use IndexedDB
  SAFARI_WARM_JUDGE_MAX_MS: 50,         // Safari test pass criterion for classifying inside the extension
  SAFARI_TEST_BUDGET_HOURS: 2,
  APP_ATTEST_MIN_MACOS: 27,
};

export const CHROME_BUILTIN_AI = {      // NOT in v1; telemetry records availability only
  REQ_GPU_MEMORY_GB_GT: 4,              // > 4 GB GPU memory, OR
  REQ_RAM_GB: 16, REQ_CPU_CORES: 4,     // 16 GB RAM and 4 cores
  REQ_FREE_STORAGE_GB: 22,              // plus 22 GB free storage
  TEST_IN_V1_5_IF_ADOPTION_GTE: 0.30,
};

export const VSCODE_BRIDGE = {          // v1.1
  BIND_HOST: "127.0.0.1",
  FIXED_PORT_COUNT: 3,
  PORTS: "TODO_Q27",
  PAIRING_CODE_DIGITS: 6,
  MESSAGE_FIELDS: ["workspaceName", "active", "timestamp"],
};

// ───────────────────────── Business (docs/10) ─────────────────────────
export const PRICING_USD = {            // starting hypotheses
  PRO_ANNUAL: 39.99,                    // default plan
  PRO_MONTHLY_TEST: [6.99, 7.99],
  FOUNDING_FIRST_YEAR: 24.99,           // then renews at PRO_ANNUAL; jump shown at checkout and in renewal reminder
  REFUND_WINDOW_DAYS: 14,
  MAC_TARGET: "spring week 10",
  MAC_PUBLIC_DATE: "end of spring week 12", // missing this triggers full founding-plan refund
  MOR_FEE: "about 5% + $0.50 per sale",
};

export const LICENSE = {
  MAX_ACTIVATIONS_PER_KEY: 5,           // counted per browser install or Mac app
  SELF_SERVE_DEACTIVATION: "merchant of record customer portal",
  LOST_KEY_RECOVERY: "email via merchant of record",
};

export const AGE = {
  MIN_AGE: 13,                          // or higher where local law requires
  DIGITAL_CONSENT_RANGE: [13, 16],      // by country; table source TODO_Q40
  COUNTRY_TABLE: "TODO_Q40",
};

export const PROVIDER = {
  ZDR_APPROVED: false,                  // requested, not confirmed (docs/06 PRIV-20)
};

// ───────────────────────── Gates (docs/14) ─────────────────────────
export const GATES = {
  GATE_0: { WAITLIST_STRANGERS_MIN: 200, BY: "mid-December" },
  GATE_A: { PARKS_MIN: 200, WRONG_PARKS_MAX: 0, PEOPLE: 3, DISTINCT_SITES_MIN: 50,
            TAB_SWITCH_SAMPLE_PER_PERSON: 100, CATCH_RATE_MIN: 0.85, BY: "mid-December" },
  GATE_B: { PARKS_MIN: 500, WRONG_PARK_RATE_MAX: 0.02, CRITICAL_WRONG_PARKS_MAX: 0,
            CATCH_RATE_MIN: 0.85, LOST_WORK_REPORTS_MAX: 0, ON_DEVICE_ONLY_CATCH_START_TARGET: 0.70,
            TESTERS_PER_BETA: [60, 90] },
  GATE_P: { FOUNDING_PLANS_MIN: 50, BY: "Mac app launch" },
  GATE_C: { DAY7_RETENTION_MIN: 0.15, NON_FRIEND_INSTALLS_MIN: 200 },
  WATCH_SESSIONS_PER_ACTIVE_USER_PER_WEEK: 5,
};

// ───────────────────────── Report (UI-02, UI-04; Q-46 and Q-21 answered in Q-65) ─────────────────────────
export const REPORT = {
  STRIP_START_HOUR: 9,                  // day strip 9am to 9pm, widened to cover any session outside it (Q-46)
  STRIP_END_HOUR: 21,
  MORNING_ENDS_HOUR: 12,                // insight wording: morning / afternoon / evening (Q-21)
  AFTERNOON_ENDS_HOUR: 17,
  WEEK_DAYS: 7,
};
```

## Desktop app (Q-70, owner 2026-11-02)

The product is a macOS app (Electron) instead of a Chrome extension. Values below are in `DESKTOP` in the constants module; the app lists are the agent's first cut from the owner's rules (Q-63) and wait for owner review.

```
POLL_MS: 1000                   front app, window title and browser tab, once a second
ACTIVITY_FLUSH_SEC: 15          activity log written at least this often
SEGMENT_MERGE_GAP_SEC: 5        same thing again within 5 s continues the stretch
GAP_MIN_SEC: 120                app not running this long mid-session = a gap (time stops)
REHIDE_AFTER_QUIT_SEC: 5        a blocked app that ignores quit is hidden every time it shows
APP_TITLE_MAX_CHARS: 120
Browsers read and closed with Apple Events: Chrome, Chromium, Brave, Edge, Vivaldi, Opera, Arc, Safari
Browsers with titles only: Firefox, Zen, DuckDuckGo, Orion (blocked tab closed with Cmd+W after re-checking the title)
System apps (never judged): Finder, System Settings, Activity Monitor, Terminal, Dock, Spotlight, Tabhush
Always allowed apps (Q-63): Claude, ChatGPT, Blender
Work app categories (allowed): developer tools, productivity, education, reference, graphics & design,
  business, utilities, finance, medical
Blocked app categories (Q-63): games (and every *-games), social networking, entertainment, sports
Blocked apps without a category: Steam, Discord, WhatsApp, Telegram, Roblox, Minecraft, Apple TV;
  by name: Epic Games Launcher, Battle.net, Messenger, League of Legends, Riot Client, Netflix, Prime Video
Music apps (allowed at MUSIC_VOLUME): Spotify, Music
Meeting apps (no-input time counts as watching): Zoom, Teams, FaceTime, Webex
Excluded apps (titles never stored, DSK-30): Messages, Mail, Slack, Discord, Passwords, 1Password
Proctoring (DSK-10, suspends enforcement): LockDown Browser
Windows (Q-71): the same lists also hold .exe names. Browsers chrome, msedge, brave, opera, vivaldi, arc,
  chromium, firefox, zen; system explorer, Task Manager, Start/Search hosts, Settings, terminals, Tabhush;
  always allowed claude, chatgpt, blender; work apps (TOOL_APPS): VS Code, Cursor, Visual Studio,
  JetBrains IDEs, Android Studio, Word, Excel, PowerPoint, OneNote, Notion, Obsidian, Acrobat, Notepad,
  Notepad++, Figma, MATLAB, RStudio, Anki, GoodNotes; blocked Steam, Epic, Battle.net, Discord, WhatsApp,
  Telegram, Roblox, Minecraft, League of Legends, Riot Client, Valorant, Fortnite; music Spotify;
  meetings Zoom, Teams, Webex; excluded Outlook, Slack, Discord, WhatsApp, 1Password, KeePassXC, Bitwarden
EMERGENCY_PASSAGE: "I am choosing to stop this session before my goal. My work will still be here when
  I come back, and this stop will show in my report."     retyped exactly, no paste (Q-70)
Job applications (Q-82; time counts for a task about applying, never blocks anything):
  JOB_HOST_SUFFIXES: myworkdayjobs.com, greenhouse.io, lever.co, jibeapply.com, icims.com,
    smartrecruiters.com, ashbyhq.com, workable.com, taleo.net, successfactors.com, jobvite.com,
    bamboohr.com, eightfold.ai, joinhandshake.com, simplify.jobs, wellfound.com, indeed.com,
    glassdoor.com, ziprecruiter.com
  JOB_HOST_WORDS: career, jobs, apply, recruit, talent, hiring        (in any host label but the TLD)
  JOB_PATH_PREFIXES: /jobs, /careers, /job/, /apply
  JOB_SITE_NAME_ENDINGS: careers, jobs                               ("… - Dell Careers")
  JOB_TITLE_WORDS: job application, my applications, submit application, candidate home, resume, cover letter
  APPLYING_TASK_WORDS: apply, applying, application(s), job search, job hunt(ing), recruiting
Career tasks (Q-82): a task with one of CAREER_TASK_WORDS (apply, applying, application(s), intern,
  internship(s), job(s), career(s), resume, interview(s), networking, recruiting, recruiter) keeps
  CAREER_SITES open: linkedin.com
Job searches (Q-82, never distraction searches): JOB_SEARCH_WORDS intern(s), internship(s), career(s),
  job(s), hiring, recruiting, recruiter, resume, interview, new grad; or a word starting "appli"
```

Owner rules for task names (Q-82, Q-84, `OWNER_RULES`):

```
LABEL_FILLER_WORDS: a, an, the, for, of, to, and, on, in, my, with, at
  A page or window whose title has every other word of a task's name is related to that task
  (at least ALLOW_MIN_S), and its time counts for that task.
UNINFORMATIVE_TITLES: new tab, newtab, untitled, home, files, inbox, dashboard, loading, sign in, log in,
  login, welcome, settings, search, downloads, desktop, documents, trash, window, blank
  A title in this list, a blank one, or the app's own name ("Claude" in Claude) says nothing about the
  work. With several tasks it is no evidence: the time counts for the task you were on (nearest tagged
  entry before, else after); a session with none shows "Couldn't tell which task". So is a page under
  MIDDLE_MIN_S for every task. Neither becomes a learned example, nor does a search results page.
```

## Lists that are partially defined

Members given in the scope are normative. Extend only after the owner resolves the listed question.

```
Pure-distraction domains (blocked whole, never auto-lifted): Netflix, Steam, TikTok, ...   rest: TODO_Q09
Mixed sites (judged per page/path; from the cache path rules): YouTube (video ID or channel), Reddit (subreddit),
  Stack Overflow (question ID), X (account), ...                                          rest: TODO_Q09
  Note: scope lists TikTok as pure-distraction AND as having an account path rule. Conflict: TODO_Q41
Mirror domains (treated as the site they wrap): m.youtube.com, youtube-nocookie.com, Google Translate proxies
Learning platforms (NEVER parked): Canvas, Blackboard, Moodle, Brightspace, Gradescope, WebAssign,
  Pearson MyLab, McGraw Hill Connect, zyBooks, Top Hat, Piazza, Ed Discussion, Panopto, Kaltura
  + school-hosted instances (e.g. canvas.vt.edu) via onboarding school domains and page fingerprint (TODO_Q10)
Web meetings (never locked): Google Meet, Zoom, Teams
Developer pages (never locked): localhost, 127.0.0.1, file://, *.local, GitHub, package registries (TODO_Q11)
Domain-only (never send titles): webmail (Gmail, Outlook on the web), web chat (Discord, Messenger,
  WhatsApp Web), banking, health                                                          (banking/health domain list TODO_Q48)
Desktop excluded apps (never send titles): Messages, Mail, Slack, Discord
Proctoring tools: Honorlock (extension suspends), Respondus LockDown Browser (desktop, v1.5)
Content-script-unreachable pages (closed + restore list): Chrome Web Store, built-in PDF viewer
Regression sites: YouTube, Canvas, Google Docs, Gmail, Meet, GitHub
```

## Domain mapping [DERIVED, owner to verify: Q-57]

The scope names platforms; these are the domains the code uses for them. A listed domain also covers its subdomains.

```
Learning platforms   Canvas: instructure.com · Blackboard: blackboard.com, bbcollab.com · Moodle: moodlecloud.com
                     Brightspace: brightspace.com, desire2learn.com, d2l.com · Gradescope: gradescope.com
                     WebAssign: webassign.net, webassign.com · Pearson MyLab: pearson.com, pearsonmylabandmastering.com
                     McGraw Hill Connect: mheducation.com · zyBooks: zybooks.com · Top Hat: tophat.com
                     Piazza: piazza.com · Ed Discussion: edstem.org · Panopto: panopto.com, panopto.eu · Kaltura: kaltura.com
Web meetings         Google Meet: meet.google.com · Zoom: zoom.us, zoom.com · Teams: teams.microsoft.com, teams.live.com
Developer pages      GitHub: github.com
Pure-distraction     Netflix: netflix.com · Steam: steampowered.com, steamcommunity.com · TikTok: tiktok.com
Mixed sites          YouTube: youtube.com · Reddit: reddit.com · Stack Overflow: stackoverflow.com · X: x.com, twitter.com
Mirrors              m.youtube.com, youtube-nocookie.com -> youtube.com · <host>.translate.goog -> decoded host
Webmail              Gmail: mail.google.com · Outlook on the web: outlook.live.com, outlook.office.com, outlook.office365.com
Web chat             Discord: discord.com · Messenger: messenger.com · WhatsApp Web: web.whatsapp.com
Unreachable          Chrome Web Store: chromewebstore.google.com, chrome.google.com/webstore
Named-site aliases   Instagram: instagram.com (alias "ig" from NAMED_SITE_ALIASES)
```
