// When tier 3 may be called at all.
//   INV-10  no tier 3 call before explicit consent; declining turns on on-device-only mode
//   INV-11  under the local age of digital consent → on-device only until ZDR is approved
//   INV-08  nothing is sent unless on-device redaction can run
//   CLS-12  never in on-device-only mode; subject to daily caps
//   Q-61    the owner switched the LLM off for everyone: every install is on-device only

export type Consent = "unknown" | "granted" | "declined";

export interface Tier3Gate {
  /** LLM.ENABLED (Q-61). */
  llmEnabled: boolean;
  consent: Consent;
  onDeviceOnlySetting: boolean;
  underDigitalConsentAge: boolean;
  providerZdrApproved: boolean;
  capReached: boolean;
  redactorReady: boolean;
  backendConfigured: boolean;
}

type ModeInputs = Pick<Tier3Gate, "llmEnabled" | "consent" | "onDeviceOnlySetting" | "underDigitalConsentAge" | "providerZdrApproved">;

export function onDeviceOnly(g: ModeInputs): boolean {
  if (!g.llmEnabled) return true;
  if (g.onDeviceOnlySetting) return true;
  if (g.consent === "declined") return true;
  return g.underDigitalConsentAge && !g.providerZdrApproved;
}

export function tier3Available(g: Tier3Gate): boolean {
  if (onDeviceOnly(g)) return false;
  if (g.consent !== "granted") return false;
  return !g.capReached && g.redactorReady && g.backendConfigured;
}

/** Whether the consent screen should be shown before the first tier 3 need (PRIV-60). */
export function needsConsentPrompt(g: ModeInputs): boolean {
  return g.consent === "unknown" && !onDeviceOnly(g);
}
