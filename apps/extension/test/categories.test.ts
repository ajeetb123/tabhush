// Q-08 / Q-48 build step against a fixture copy of the UT1 layout (no network).
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const script = join(__dirname, "../../../scripts/build-categories.mjs");

describe("build-categories (Q-08, Q-48)", () => {
  it("keeps only the mapped categories plus bank, renamed, with the CC BY-SA notice", () => {
    const dir = mkdtempSync(join(tmpdir(), "ut1fix-"));
    const put = (cat: string, body: string) => {
      mkdirSync(join(dir, "blacklists", cat), { recursive: true });
      writeFileSync(join(dir, "blacklists", cat, "domains"), body);
    };
    put("games", "Miniclip.com\nminiclip.com\n# comment\n\nkongregate.com\n");
    put("social_networks", "example-social.com\n");
    put("shopping", "etsy.com\n");
    put("audio-video", "example-video.com\n");
    put("bank", "mybank.com\n");
    put("adult", "should-not-ship.com\n");
    const out = join(dir, "out");
    execFileSync("node", [script, "--from", dir, "--out", out]);
    expect(readFileSync(join(out, "games.txt"), "utf8")).toBe("kongregate.com\nminiclip.com\n");
    expect(readFileSync(join(out, "entertainment.txt"), "utf8")).toBe("example-video.com\n");
    expect(readFileSync(join(out, "social.txt"), "utf8")).toBe("example-social.com\n");
    expect(readFileSync(join(out, "banking.txt"), "utf8")).toBe("mybank.com\n");
    const notice = readFileSync(join(out, "NOTICE.txt"), "utf8");
    expect(notice).toContain("CC BY-SA 4.0");
    expect(notice).toContain("Université Toulouse Capitole");
    expect(notice).toContain("Changes:");
    expect(() => readFileSync(join(out, "adult.txt"))).toThrow();
  });
});
