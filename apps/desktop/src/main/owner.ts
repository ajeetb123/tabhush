// The owner's own computer (Q-83). The development build marks it with owner.json in the app's data
// folder, tied to this computer's account; an installed copy that finds the mark gets the owner's
// rules (end and quit any time, Q-69/Q-70). A tester's computer never runs the development build,
// so it never has the mark, and a mark copied from another computer doesn't match.

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { homedir, userInfo } from "node:os";
import { join } from "node:path";

const FILE = "owner.json";

const stamp = (): string => createHash("sha256").update(`tabhush-owner\n${userInfo().username}\n${homedir()}`).digest("hex");

/** Called by the development build: this computer is the owner's. */
export function markOwnersComputer(dataDir: string): void {
  try {
    writeFileSync(join(dataDir, FILE), JSON.stringify({ machine: stamp(), at: Date.now() }));
  } catch {
    // a read-only data folder: the installed copy keeps the regular rules
  }
}

export function isOwnersComputer(dataDir: string): boolean {
  try {
    return (JSON.parse(readFileSync(join(dataDir, FILE), "utf8")) as { machine?: string }).machine === stamp();
  } catch {
    return false;
  }
}
