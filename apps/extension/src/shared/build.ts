// One ID per build, baked into the service worker and the UI pages alike. An unpacked extension's
// pages load fresh from disk on every open, but its service worker keeps running the old code
// until the extension is reloaded; comparing the two IDs catches that.
declare const __BUILD_ID__: string;

export const BUILD_ID: string = __BUILD_ID__;
