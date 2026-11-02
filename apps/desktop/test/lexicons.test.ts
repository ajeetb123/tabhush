// Q-14 build step against small fixture archives (no network): SCOWL sizes above 35 and other
// categories are left out, names are ranked by total births across years and sexes, and the
// SCOWL notice ships with the list.
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { REDACTION } from "@lockin/core";

const script = join(__dirname, "../../../scripts/build-lexicons.mjs");

function fixtures() {
  const dir = mkdtempSync(join(tmpdir(), "lexfix-"));
  const scowl = join(dir, "scowl-2020.12.07");
  mkdirSync(join(scowl, "final"), { recursive: true });
  writeFileSync(join(scowl, "Copyright"), "Copyright 2000-2020 by Kevin Atkinson\n");
  writeFileSync(join(scowl, "final", "english-words.10"), "Report\nlab\n");
  writeFileSync(join(scowl, "final", "american-words.35"), "color\n");
  writeFileSync(join(scowl, "final", "english-words.50"), "zygote\n");
  writeFileSync(join(scowl, "final", "english-upper.10"), "London\n");
  execFileSync("tar", ["-czf", join(dir, "scowl.tar.gz"), "-C", dir, "scowl-2020.12.07"]);
  writeFileSync(join(dir, "yob2000.txt"), "Mary,F,10\nWill,M,3\nMary,M,1\n");
  writeFileSync(join(dir, "yob2001.txt"), "Will,M,20\nZed,M,1\n");
  execFileSync("zip", ["-q", "-j", join(dir, "names.zip"), join(dir, "yob2000.txt"), join(dir, "yob2001.txt")]);
  return dir;
}

describe("build-lexicons (Q-14)", () => {
  it("builds the dictionary, the first-name list and the notice", () => {
    const dir = fixtures();
    const out = join(dir, "out");
    execFileSync("node", [script, "--names", join(dir, "names.zip"), "--scowl", join(dir, "scowl.tar.gz"), "--out", out]);
    expect(readFileSync(join(out, "dictionary.txt"), "utf8").trim().split("\n")).toEqual(["color", "lab", "report"]);
    expect(readFileSync(join(out, "first-names.txt"), "utf8").trim().split("\n")).toEqual(["will", "mary", "zed"]);
    expect(readFileSync(join(out, "SCOWL-NOTICE.txt"), "utf8")).toContain("Kevin Atkinson");
  });
  it("uses the decided sizes", () => {
    expect(REDACTION.DICTIONARY_MAX_SCOWL_SIZE).toBe(35);
    expect(REDACTION.FIRST_NAME_COUNT).toBe(2000);
  });
});
