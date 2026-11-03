// A stand-in OS helper for HelperSystem tests: speaks the JSON-lines protocol.
// Modes: ok (answers), noisy (junk lines around answers), crash (exits 1 on first command),
// silent (never answers), bom (byte-order mark before the first reply).
import { createInterface } from "node:readline";
const mode = process.argv[2] ?? "ok";
let first = true;
createInterface({ input: process.stdin }).on("line", (line) => {
  let m;
  try {
    m = JSON.parse(line);
  } catch {
    return; // garbage in: ignored, like the real helpers
  }
  if (mode === "crash") process.exit(1);
  if (mode === "silent") return;
  const reply = m.cmd === "front"
    ? { app: { name: "Code", bundleId: "com.microsoft.VSCode", pid: 7, category: "", regular: true }, title: "t" }
    : m.cmd === "unknown" ? { error: "unknown command unknown" } : { done: true };
  if (mode === "noisy") process.stdout.write("not json\n{broken\n");
  const out = JSON.stringify({ ...reply, id: m.id, ok: !reply.error });
  process.stdout.write((mode === "bom" && first ? "﻿" : "") + out + "\n");
  if (mode === "noisy") process.stderr.write("some warning\n");
  first = false;
});
