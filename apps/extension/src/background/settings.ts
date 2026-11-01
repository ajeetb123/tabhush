// Small settings in chrome.storage.local (EXT-04). Large data lives in IndexedDB.

import { emptyCounts, type Consent, type TelemetryCounts } from "@lockin/core";

export interface UserSettings {
  consent: Consent;
  /** PRIV-03 "Domain only": titles never leave the device. */
  domainOnly: boolean;
  /** PRIV-70 on-device only mode, chosen by the user. */
  onDeviceOnly: boolean;
  /** LOCK-02 user essentials (domains), locked during a session (LOCK-01). */
  essentials: string[];
  /** Self-declared under the local age of digital consent (PRIV-61; onboarding is beta 2). */
  underDigitalConsentAge: boolean;
  /** School-hosted courseware and sign-in sites, never blocked (LOCK-02, EXT-12; set in onboarding). */
  schoolSites: string[];
  /** Confirmed 13 or older (Terms: minimum age 13). */
  ageConfirmed: boolean;
  /** Finished the first-run setup (EXT-12). */
  onboarded: boolean;
}

export interface InternalState {
  installId: string;
  installToken: string | null;
  /** Sessions that reached ACTIVE; the first 5 always need Confirm (LOOP-04). */
  committedSessions: number;
  /** Remote config version; a change clears the verdict cache (beta 2 fetches it). */
  configVersion: number;
  /** UTC day on which the backend refused with cap_reached. */
  capReachedDay: string | null;
  /** INV-14: an update arrived mid-session and waits for End. */
  pendingUpdate: boolean;
  telemetry: TelemetryCounts;
  consentPromptShown: boolean;
}

export const DEFAULT_SETTINGS: UserSettings = {
  consent: "unknown",
  domainOnly: false,
  onDeviceOnly: false,
  essentials: [],
  underDigitalConsentAge: false,
  schoolSites: [],
  ageConfirmed: false,
  onboarded: false,
};

export async function getSettings(): Promise<UserSettings> {
  const { settings } = await chrome.storage.local.get("settings");
  return { ...DEFAULT_SETTINGS, ...(settings as Partial<UserSettings> | undefined) };
}

export async function setSettings(patch: Partial<UserSettings>): Promise<UserSettings> {
  const next = { ...(await getSettings()), ...patch };
  await chrome.storage.local.set({ settings: next });
  return next;
}

export async function getInternal(): Promise<InternalState> {
  const { internal } = await chrome.storage.local.get("internal");
  const current = internal as Partial<InternalState> | undefined;
  if (current?.installId) return { ...defaultInternal(current.installId), ...current };
  const fresh = defaultInternal(crypto.randomUUID());
  await chrome.storage.local.set({ internal: fresh });
  return fresh;
}

function defaultInternal(installId: string): InternalState {
  return {
    installId,
    installToken: null,
    committedSessions: 0,
    configVersion: 0,
    capReachedDay: null,
    pendingUpdate: false,
    telemetry: emptyCounts(),
    consentPromptShown: false,
  };
}

export async function setInternal(patch: Partial<InternalState>): Promise<InternalState> {
  const next = { ...(await getInternal()), ...patch };
  await chrome.storage.local.set({ internal: next });
  return next;
}

export async function bump(field: keyof TelemetryCounts, by = 1): Promise<void> {
  const s = await getInternal();
  await setInternal({ telemetry: { ...s.telemetry, [field]: s.telemetry[field] + by } });
}
