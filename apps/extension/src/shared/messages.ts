// Messages between the service worker, content scripts, the offscreen document and UI pages.

export type ToContent =
  | { type: "overlay:show"; taskLabel: string; canOverride: boolean; overrideNote?: string; sampledCheck?: boolean }
  | { type: "overlay:hide" }
  | { type: "ask:show"; taskLabel: string }
  | { type: "ask:hide" }
  | { type: "snippet:request" }
  | { type: "music:on"; volume: number }
  | { type: "music:off" };

export type FromContent =
  | { type: "content:ready" }
  | { type: "input:counts"; minuteStart: number; count: number }
  | { type: "ask:answer"; related: boolean }
  | { type: "override:submit"; sentence: string }
  | { type: "check:answer"; right: boolean }
  | { type: "youtube:meta"; videoId: string; genre: string | null; title: string; channel: string }
  | { type: "page:snippet"; url: string; text: string }
  | { type: "open:session" };

export type ToOffscreen = { target: "offscreen"; type: "embed"; texts: string[] };
export type OffscreenReply = { ok: true; vectors: number[][] } | { ok: false; error: string };

export type FromUi =
  | { type: "ui:start" }
  | { type: "ui:get" }
  | { type: "ui:setTasks"; labels: string[] }
  | { type: "ui:toggle"; tabId: number; park: boolean }
  | { type: "ui:confirm"; goalMin: number }
  | { type: "ui:stop" }
  | { type: "ui:break"; min: number }
  | { type: "ui:breakEnd" }
  | { type: "ui:undo" }
  | { type: "ui:end"; reason: string }
  | { type: "ui:emergency"; reason: string }
  | { type: "ui:stepAway" }
  | { type: "ui:resume" }
  | { type: "ui:dismiss" }
  | { type: "ui:consent"; granted: boolean }
  | { type: "ui:settings"; patch: Partial<import("../background/settings").UserSettings> }
  | { type: "ui:blocked"; url: string }
  | { type: "ui:overrideBlocked"; url: string; sentence: string };
