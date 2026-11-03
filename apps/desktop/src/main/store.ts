// Local storage for the app: small JSON files in the user-data folder (EXT-04's role on desktop).
// Writes go to a temp file and are renamed into place, so a crash never leaves half a file.
// Nothing here leaves the device (PRIV-01).

import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export class JsonStore {
  constructor(readonly dir: string) {
    mkdirSync(dir, { recursive: true });
  }

  path(name: string): string {
    return join(this.dir, `${name}.json`);
  }

  read<T>(name: string, fallback: T): T {
    try {
      return JSON.parse(readFileSync(this.path(name), "utf8")) as T;
    } catch {
      return fallback;
    }
  }

  write(name: string, value: unknown): void {
    const p = this.path(name);
    mkdirSync(dirname(p), { recursive: true });
    const tmp = `${p}.tmp`;
    writeFileSync(tmp, JSON.stringify(value));
    renameSync(tmp, p);
  }

  /** Removes a file, or a folder of them (`activity`). */
  remove(name: string): void {
    rmSync(this.path(name), { force: true });
    rmSync(join(this.dir, name), { recursive: true, force: true });
  }

  exists(name: string): boolean {
    return existsSync(this.path(name));
  }
}
