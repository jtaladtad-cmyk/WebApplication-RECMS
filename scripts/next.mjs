// Runs the Next.js CLI, turning on two features that older Node 22 releases
// keep behind flags. Newer Node needs neither, so nothing is added there.
//  - node:sqlite (the database): flagged before Node 22.13 / 23.4
//  - require() of ES modules (used by Tailwind's build tooling): flagged before 22.12
// Usage (via package.json): node scripts/next.mjs dev | build | start
import { spawn } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const env = { ...process.env };

let hasSqlite = true;
try {
  require("node:sqlite");
} catch {
  hasSqlite = false;
}
const flags = [];
if (!hasSqlite) flags.push("--experimental-sqlite");
if (process.features.require_module !== true) flags.push("--experimental-require-module");
if (flags.length) {
  // NODE_OPTIONS is inherited by every worker process Next starts.
  env.NODE_OPTIONS = [env.NODE_OPTIONS, ...flags].filter(Boolean).join(" ");
}

const child = spawn(process.execPath, [require.resolve("next/dist/bin/next"), ...process.argv.slice(2)], {
  stdio: "inherit",
  env,
});
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => child.kill(sig));
child.on("exit", (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
