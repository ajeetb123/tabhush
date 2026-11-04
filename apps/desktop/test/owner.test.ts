// Q-83: the development build marks the owner's computer; an installed copy there gets the owner's rules.
import { describe, expect, it } from "vitest";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { isOwnersComputer, markOwnersComputer } from "../src/main/owner";
import { tempDir } from "./fakes";

describe("the owner's computer (Q-83)", () => {
  it("is unmarked until the development build marks it", () => {
    const dir = tempDir("owner-");
    expect(isOwnersComputer(dir)).toBe(false);
    markOwnersComputer(dir);
    expect(isOwnersComputer(dir)).toBe(true);
  });

  it("a mark from another computer, or a made-up one, doesn't count", () => {
    const dir = tempDir("owner-");
    writeFileSync(join(dir, "owner.json"), JSON.stringify({ machine: "0".repeat(64) }));
    expect(isOwnersComputer(dir)).toBe(false);
    writeFileSync(join(dir, "owner.json"), "not json");
    expect(isOwnersComputer(dir)).toBe(false);
  });
});
