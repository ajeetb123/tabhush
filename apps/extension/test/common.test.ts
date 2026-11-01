// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";

vi.stubGlobal("chrome", { runtime: { getURL: (p: string) => p, sendMessage: vi.fn() }, storage: { onChanged: { addListener() {} } } });

describe("domainsFrom", () => {
  it("turns pasted addresses into bare domains", async () => {
    const { domainsFrom } = await import("../src/ui/common");
    expect(domainsFrom("https://canvas.vt.edu/courses/1\n www.Notion.so , prairielearn.endeavour.cs.vt.edu/pl, nonsense")).toEqual([
      "canvas.vt.edu",
      "notion.so",
      "prairielearn.endeavour.cs.vt.edu",
    ]);
  });
});
