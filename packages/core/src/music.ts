// Music on YouTube (Q-63, Q-67): YouTube's own genre label when it is fresh, otherwise clear
// music markers in the video title or channel name. Errs toward allowing, the safe direction.

import { OWNER_RULES } from "./constants";

export function looksLikeMusic(title: string, channel = ""): boolean {
  const t = ` ${title.toLowerCase()} `;
  const c = ` ${channel.toLowerCase()} `;
  return OWNER_RULES.MUSIC_TITLE_MARKERS.some((m) => t.includes(m)) || OWNER_RULES.MUSIC_CHANNEL_MARKERS.some((m) => c.includes(m));
}
