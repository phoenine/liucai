import { execFile } from "node:child_process";
import { mkdir, readFile, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dist = resolve(root, "dist");
const artifacts = resolve(root, "artifacts");
const packageJson = JSON.parse(await readFile(resolve(root, "package.json"), "utf8"));
const manifest = JSON.parse(await readFile(resolve(dist, "manifest.json"), "utf8"));

if (packageJson.version !== manifest.version) {
  throw new Error(`package.json version ${packageJson.version} does not match manifest ${manifest.version}`);
}

await mkdir(artifacts, { recursive: true });
const output = resolve(artifacts, `liucai-extension-v${packageJson.version}.zip`);
await rm(output, { force: true });
await execFileAsync("zip", ["-qr", output, ".", "-x", "*.map", "*.DS_Store"], { cwd: dist });
console.info(output);
