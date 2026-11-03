// Publishes a Windows release (Q-75): takes the installer, block map and update feed that the
// "windows" workflow built for the current commit and puts them on a new release in the public
// ajeetb123/tabhush-releases repo. Installed copies pick it up within a few hours.
//
// Steps: bump "version" in apps/desktop/package.json, commit and push, wait for the windows
// workflow to pass, then: npm run release:win -w @lockin/desktop
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const RELEASES = "ajeetb123/tabhush-releases";
const root = fileURLToPath(new URL("..", import.meta.url));
const gh = (...args) => execFileSync("gh", args, { cwd: root, encoding: "utf8" }).trim();

const version = JSON.parse(readFileSync(join(root, "apps/desktop/package.json"), "utf8")).version;
const tag = `v${version}`;
const sha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();

const existing = gh("release", "list", "--repo", RELEASES, "--json", "tagName", "--jq", ".[].tagName").split("\n");
if (existing.includes(tag)) throw new Error(`${tag} is already released. Bump the version in apps/desktop/package.json first.`);

const runs = JSON.parse(gh("run", "list", "--workflow", "windows", "--commit", sha, "--json", "databaseId,conclusion,status"));
const run = runs.find((r) => r.conclusion === "success");
if (!run) throw new Error(`No successful windows build for ${sha.slice(0, 7)} yet (${runs.map((r) => r.status + "/" + r.conclusion).join(", ") || "none"}). Push, wait for it, then retry.`);

const dir = mkdtempSync(join(tmpdir(), "tabhush-release-"));
gh("run", "download", String(run.databaseId), "-n", "Tabhush-Windows", "-D", dir);
const files = readdirSync(dir);
const feed = readFileSync(join(dir, "latest.yml"), "utf8");
if (!feed.includes(`version: ${version}`)) throw new Error(`latest.yml is not for ${version}:\n${feed}`);
for (const f of [`Tabhush-Setup-${version}.exe`, `Tabhush-Setup-${version}.exe.blockmap`, "latest.yml"]) {
  if (!files.includes(f)) throw new Error(`missing ${f} in the build (have: ${files.join(", ")})`);
}

gh(
  "release", "create", tag, ...files.map((f) => join(dir, f)),
  "--repo", RELEASES, "--title", `Tabhush ${version}`,
  "--notes", `Windows: download Tabhush-Setup-${version}.exe. Installed copies update themselves.`,
);
console.log(`Released ${tag}: https://github.com/${RELEASES}/releases/tag/${tag}`);
