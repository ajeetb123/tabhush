// The single constants module. Mirrors CONSTANTS.md; CONSTANTS.md wins on any conflict.
// `[RC]` values can be overridden by the signed remote config (docs/08 BE-03, beta 2).
// A value written as "TODO_Q<nn>" is undecided (docs/16-open-questions.md). Code must
// treat it as "not available" via isTodo(); `npm run check:ship` fails while any remain.

export type Todo = `TODO_Q${number}`;

export function isTodo(value: unknown): value is Todo {
  return typeof value === "string" && /^TODO_Q\d+$/.test(value);
}

// ───────────────────────── Session lifecycle (docs/03) ─────────────────────────
export const SESSION = {
  MAX_LENGTH_MIN: 240, // [START][RC]
  EXTEND_INCREMENT_MIN: "TODO_Q32" as Todo | number,
  NO_ANSWER_TO_EXTEND_ENDS_AS: "normal",
  IDLE_PAUSE_AFTER_MIN: 30, // [START][RC]
  IDLE_END_AFTER_MIN: 120, // [START][RC]
  RESUME_AFTER_RESTART: true,
} as const;

// ───────────────────────── Active time and logging (docs/09) ─────────────────────────
export const ACTIVE_TIME = {
  NO_INPUT_STOP_MIN: 3, // [START]
  VIDEO_GRACE_MIN: 20, // [START]
  PDF_GRACE_MIN: 5, // [START]
  DAY_BOUNDARY_HOUR_LOCAL: 4,
} as const;

// ───────────────────────── Sweep (docs/03) ─────────────────────────
export const SWEEP = {
  CONFIRM_REQUIRED_FIRST_N_SESSIONS: 5,
  UNDO_WINDOW_SEC: 30, // [START]
  AUTO_COMMIT_MIN_CONFIDENCE: "TODO_Q16" as Todo | number,
  PREVIEW_MAX_GROUPS: "TODO_Q17" as Todo | number,
  JUDGE_ORDER: ["recent", "visible"],
} as const;

// ───────────────────────── Task switch (docs/03, docs/05) ─────────────────────────
export const SWITCH = {
  COUNTDOWN_SEC: 30, // [START]
  SUGGEST_AFTER_CONSECUTIVE_ITEMS: 3,
  SUGGEST_MIN_SPAN_MIN: 2,
  SUGGEST_SCORE_MARGIN: 0.15,
} as const;

// ───────────────────────── Breaks (docs/03) ─────────────────────────
export const BREAKS = {
  OPTIONS_MIN: [5, 10, 15],
  FOCUSED_MIN_PER_BREAK_MIN: 5, // [START] accrual details TODO_Q34
  COUNTS_AS_BAIL: false,
} as const;

// ───────────────────────── Exits (docs/04) ─────────────────────────
export const EXITS = {
  PASS_DURATION_MIN: 10, // [START]
  PASS_WAIT_SEC: 30, // [START]
  PASSES_PER_DAY: 2, // [START]
  END_COUNTDOWN_SEC: 120, // [START]
  BAIL_WINDOW_SEC: 120,
} as const;

export const STRICT_MODE = {
  PASSES_PER_DAY: 0,
  END_COUNTDOWN_SEC: 600, // [START]
} as const;

// ───────────────────────── Asking the user (docs/05) ─────────────────────────
export const ASK = {
  MAX_PER_HOUR: 4, // [START][RC]
  MIN_GAP_MIN: 5, // [START][RC]
  CLARIFY_GUESSES: 3,
  OVER_BUDGET_ACTION: "allow_and_flag",
} as const;

// ───────────────────────── Overrides -> labels (docs/05) ─────────────────────────
export const OVERRIDE_LABEL = {
  ACTIVE_MIN_REQUIRED: 3,
  INPUT_EVENTS_PER_ACTIVE_MIN: 10,
  PLAYBACK_COUNTS: false,
} as const;

// ───────────────────────── Labels and drift (docs/05) ─────────────────────────
export const LABELS = {
  STRONG_WEIGHT: 1.0,
  STRONG_HALF_LIFE_DAYS: 90,
  WEAK_WEIGHT: 0.3,
  WEAK_HALF_LIFE_DAYS: 14,
  DRIFT_PER_USER_WINDOW_ANSWERS: 15,
  DRIFT_CI_LEVEL: 0.9,
  DRIFT_DISAGREE_LOWER_BOUND: 0.1,
  DRIFT_POOLED_CHECK: "weekly",
} as const;

// ───────────────────────── Embedding model (docs/05) ─────────────────────────
export const EMBEDDING = {
  MODEL: "all-MiniLM-L6-v2",
  QUANTIZATION: "int8",
  APPROX_SIZE_MB: 23,
  DIMENSIONS: 384,
  MAX_INPUT_TOKENS: 64,
  RUNTIME: "Transformers.js on ONNX Runtime Web (WASM), bundled",
  BENCHMARK_ALTERNATIVE: "bge-small-en-v1.5",
  LOAD_BUDGET_MS: 3000, // [START]
  WARM_PER_ITEM_MS: 20, // [START]
  START_BATCH_SIZE: 16, // [START]
  LANGUAGE: "en",
  // Verified 2026-10-31 via the Hugging Face API: int8 ONNX, 22,972,370 bytes, Apache-2.0.
  HF_REPO: "Xenova/all-MiniLM-L6-v2",
  HF_REVISION: "751bff37182d3f1213fa05d7196b954e230abad9",
  ONNX_FILE: "onnx/model_int8.onnx",
  TRANSFORMERS_DTYPE: "int8",
} as const;

// ───────────────────────── Task representation and thresholds (docs/05) ─────────────────────────
export const TASK_REP = {
  MAX_ITEM_PROTOTYPES: 50,
  TOP_K_FOR_AVG: 3,
  PROTOTYPE_SEED_MIN_S: 0.45,
  FEWER_THAN_K: "mean_of_existing", // Q-53
} as const;

export const THRESHOLDS = {
  ALLOW_MIN_S: 0.45, // [START][RC]
  MIDDLE_MIN_S: 0.25, // [START][RC]
  ON_DEVICE_PARK_CATEGORIES: ["entertainment", "social", "games", "shopping"],
  TIER3_PARK_MIN_CONFIDENCE: 0.8, // [RC] Q-16b
  PRIOR_NUDGE_SIZE: "TODO_Q49" as Todo | number,
} as const;

// CLS-04 reference order. Both flags are interpretations awaiting confirmation (OPEN Q-52),
// kept behind config so the order can flip. [RC]
export const DECISION_ORDER = {
  LOW_S_TO_TIER3: true, // s < 0.25 items go to tier 3 when it is available
  TIER3_BEFORE_ASK: true, // middle band tries tier 3 before asking
} as const;

// ───────────────────────── Personal memory (docs/05) ─────────────────────────
export const MEMORY = {
  K_NEIGHBORS: 5,
  MIN_SIMILARITY: 0.7, // [START]
  MIN_AGREEING_NEIGHBORS: 3,
  MAX_ENTRIES: 5000,
  VECTOR_FORMAT: "int8",
} as const;

// ───────────────────────── Task registry and inference (docs/05) ─────────────────────────
export const REGISTRY = {
  SAME_AS_MIN_LABEL_SIM: 0.85,
  SAME_AS_SHARED_COURSE_CODE: true,
  SAME_AS_MIN_WORD_OVERLAP: 0.6,
  EXACT_MATCH_NORMALIZE: ["case", "punctuation"],
} as const;

export const INFERENCE = {
  RECENT_TASK_WINDOW_DAYS: 14,
  FRONT_TAB_WEIGHT: 2,
  TAB_SCORE_TOP_N: 3, // Q-51
  AUTOFILL_MIN_SCORE: 0.6,
  AUTOFILL_MIN_MARGIN: 0.1,
  LLM_LABEL_MAX_WORDS: 5,
  ACCURACY_PLANNING_TARGET: 0.8,
} as const;

export const LEISURE = {
  MIN_SIM_TO_LEISURE_SET: 0.6,
  LEISURE_SET: ["break", "watch Netflix", "play games", "scroll"],
  LEISURE_KEYWORDS: "TODO_Q13" as Todo | readonly string[],
  WORK_TERMS: ["class", "homework", "assignment", "project", "lecture", "edit"],
} as const;

export const NAMED_SITE_ALIASES: Readonly<Record<string, string>> = {
  yt: "YouTube",
  ig: "Instagram",
};

export const PROFILES = ["Homework", "Internship", "Projects", "Writing"] as const;

// ───────────────────────── Verdict cache (docs/05) ─────────────────────────
export const CACHE = {
  KEY: "taskId + itemKey",
  PAGE_KEY_TTL: "session_end",
  PATH_KEY_TTL_DAYS: 7,
  DOMAIN_KEY_TTL_DAYS: 30,
  INVALIDATE_ALL_ON_REMOTE_CONFIG_VERSION_CHANGE: true,
} as const;

// ───────────────────────── Tier 3 / LLM (docs/05, docs/08) ─────────────────────────
export const LLM = {
  PROVIDER: "OpenAI API",
  MODEL: "GPT-5.4 nano", // Q-60
  REASONING: "lowest available setting",
  PRICE_INPUT_PER_MTOK_USD: 0.2, // gpt-5.4-nano standard tier, checked 2026-10-31
  PRICE_OUTPUT_PER_MTOK_USD: 1.25,
  EST_INPUT_TOKENS: 250,
  EST_VISIBLE_OUTPUT_TOKENS: 20,
  EST_COST_PER_CALL_USD: 0.000075,
  TITLE_MAX_CHARS: 120,
  STRIP_CONTROL_CHARS: true,
  CATEGORIES: ["work tool", "reference", "entertainment", "social", "games", "shopping", "other"],
  VERDICTS: ["related", "unrelated", "unsure"],
  BILLED_ACCESS_ONLY: true,
  FALLBACK_IF_TOO_SLOW: "TODO_Q37" as Todo | string,
  // Q-60 (owner 2026-10-31). Checked on OpenAI's model page: effort values none (default), low,
  // medium, high, xhigh. Default snapshot gpt-5.4-nano-2026-03-17; removed from the API 2027-04-01.
  API_MODEL_ID: "gpt-5.4-nano",
  API_REASONING_EFFORT: "none" as Todo | "none" | "minimal",
  STORE_RESPONSES: false, // Responses API stores by default; "processed, not stored by us" (PRIV-20)
} as const;

export type Category = (typeof LLM.CATEGORIES)[number];
export type Verdict = (typeof LLM.VERDICTS)[number];

export const API = {
  PREFIX: "/v1",
  TOKEN_CHALLENGE: "/v1/token/challenge",
  TOKEN: "/v1/token",
  TIER3: "/v1/tier3",
  CONFIG: "/v1/config", // beta2
  LICENSE_ACTIVATE: "/v1/license/activate", // v1
  TELEMETRY: "/v1/telemetry",
  CONTRIBUTE: "/v1/contribute",
  DELETE: "/v1/delete",
  BASE_URL: "TODO_Q26" as Todo | string, // https://lockin-backend.<subdomain>.workers.dev (Q-26)
} as const;

export const POW = {
  ALGORITHM: "SHA-256",
  DIFFICULTY_BITS: 18, // Q-06
  CHALLENGE_BYTES: 16, // [DERIVED] random challenge size
  INSTALL_TOKEN_BYTES: 32, // [DERIVED] random install token size
} as const;

export const AI_CAPS = {
  FREE_PER_DAY: 40, // [START][RC]
  PRO_PER_DAY: 300, // [START][RC]
} as const;

// ───────────────────────── Redaction (docs/06) ─────────────────────────
export const REDACTION = {
  PATTERNS: ["email", "phone", "long_number", "url"],
  LONG_NUMBER_MIN_DIGITS: 5 as Todo | number, // Q-15
  // Q-15: US/Canada with optional +1, e.g. (540) 555-0100, 540-555-0100, 540.555.0100; and "+" then 7-15 digits.
  PHONE_FORMATS: [
    String.raw`(?:\+?1[\s.-]?)?(?:\(\d{3}\)\s?|\b\d{3}[\s.-])\d{3}[\s.-]\d{4}\b`,
    String.raw`\+(?:\d[\s.-]?){6,14}\d\b`,
  ] as Todo | readonly string[],
  NAME_RULE: "capitalized word NOT in 50,000-word English dictionary, OR in first-name list -> [NAME]",
  DICTIONARY_SIZE: 50000,
  DICTIONARY_SOURCE: "SCOWL 2020.12.07 english-words + american-words, sizes 10-35" as Todo | string, // Q-14
  DICTIONARY_MAX_SCOWL_SIZE: 35, // 49,811 words per the SCOWL README
  FIRST_NAME_LIST_SOURCE: "SSA national baby names (names.zip), top names by total births" as Todo | string, // Q-14
  FIRST_NAME_COUNT: 2000,
  NAME_TOKEN: "[NAME]",
  TEST_SET_TITLES: 500,
  TARGET_NAME_RECALL: 0.95,
} as const;

// ───────────────────────── Shared domain prior (docs/05, docs/06) ─────────────────────────
export const SHARED_PRIOR = {
  MIN_DISTINCT_CONTRIBUTION_IDS: 25,
  MIN_CATEGORY_AGREEMENT: 0.8,
  CAN_PARK: false,
} as const;

// ───────────────────────── Statistics and review (docs/14, docs/06) ─────────────────────────
export const REVIEW = {
  SAMPLED_CHECK_RATE: "TODO_Q42" as Todo | number,
  EXPORT_FORMAT: "TODO_Q28" as Todo | string,
} as const;

// ───────────────────────── Testing, eval, red team (docs/15) ─────────────────────────
export const RED_TEAM = {
  SET_SIZE: 200,
  RUNS_INJECTED: 5,
  RUNS_NEUTRAL: 5,
  MAX_FLIP_RATE_DELTA_PP: 2,
} as const;

export const EVAL = {
  GATE_A_SELF_LABELED_PAIRS: [300, 400],
  BENCHMARK_TARGET_PAIRS: 1000,
  TUNE_SHARE: 0.7,
  HOLDOUT_SHARE: 0.3,
  CI_METHOD: "cluster bootstrap by person and domain",
} as const;

// ───────────────────────── Performance budgets [START] (docs/15) ─────────────────────────
export const PERF_EXTENSION = {
  IDLE_CPU: "no measurable",
  MAX_MEMORY_MB: 150,
  TIER1_TIER2_VERDICT_MS: 100,
  TIER3_P95_MS: 1500,
  START_JUDGE_RECENT_TABS: 30,
  START_JUDGE_WITHIN_MS: 2000,
  MAX_STORAGE_PER_USER_MB: 50,
} as const;

// ───────────────────────── Platform (docs/07, docs/11) ─────────────────────────
export const PLATFORM = {
  MIN_CHROMIUM_VERSION: 120,
  MIN_MACOS: "13 Ventura",
  CHROME_STORAGE_LOCAL_CAP_MB: 10,
  SAFARI_WARM_JUDGE_MAX_MS: 50,
  SAFARI_TEST_BUDGET_HOURS: 2,
  APP_ATTEST_MIN_MACOS: 27,
} as const;

// ───────────────────────── Not yet decided, beta 1 code paths ─────────────────────────
export const PROCTORING = {
  DETECTION: "TODO_Q20" as Todo | string, // how Honorlock is detected (LOCK-03)
} as const;

export const COURSEWARE = {
  SCHOOL_MAPPING_SOURCE: "TODO_Q10" as Todo | string,
  PAGE_FINGERPRINT: "TODO_Q10" as Todo | string,
} as const;

// ───────────────────────── Business (docs/10) ─────────────────────────
export const PRICING_USD = {
  PRO_ANNUAL: 39.99,
  PRO_MONTHLY_TEST: [6.99, 7.99],
  FOUNDING_FIRST_YEAR: 24.99,
  REFUND_WINDOW_DAYS: 14,
} as const;

export const LICENSE = {
  MAX_ACTIVATIONS_PER_KEY: 5,
} as const;

export const AGE = {
  MIN_AGE: 13,
  DIGITAL_CONSENT_RANGE: [13, 16],
  COUNTRY_TABLE: "TODO_Q40" as Todo | Readonly<Record<string, number>>,
} as const;

// ZDR has been requested, not confirmed (docs/06 PRIV-20). Flip only when the provider approves.
export const PROVIDER = {
  ZDR_APPROVED: false,
} as const;

// ───────────────────────── Gates (docs/14) ─────────────────────────
export const GATES = {
  GATE_0: { WAITLIST_STRANGERS_MIN: 200, BY: "mid-December" },
  GATE_A: {
    PARKS_MIN: 200,
    WRONG_PARKS_MAX: 0,
    PEOPLE: 3,
    DISTINCT_SITES_MIN: 50,
    TAB_SWITCH_SAMPLE_PER_PERSON: 100,
    CATCH_RATE_MIN: 0.85,
    BY: "mid-December",
  },
  GATE_B: {
    PARKS_MIN: 500,
    WRONG_PARK_RATE_MAX: 0.02,
    CRITICAL_WRONG_PARKS_MAX: 0,
    CATCH_RATE_MIN: 0.85,
    LOST_WORK_REPORTS_MAX: 0,
    ON_DEVICE_ONLY_CATCH_START_TARGET: 0.7,
    TESTERS_PER_BETA: [60, 90],
  },
  GATE_P: { FOUNDING_PLANS_MIN: 50, BY: "Mac app launch" },
  GATE_C: { DAY7_RETENTION_MIN: 0.15, NON_FRIEND_INSTALLS_MIN: 200 },
  WATCH_SESSIONS_PER_ACTIVE_USER_PER_WEEK: 5,
} as const;

// ───────────────────────── Time units (not product values) ─────────────────────────
export const MS = {
  SECOND: 1000,
  MINUTE: 60_000,
  HOUR: 3_600_000,
  DAY: 86_400_000,
} as const;
