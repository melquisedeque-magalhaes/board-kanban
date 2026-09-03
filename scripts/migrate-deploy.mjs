import { spawn } from "node:child_process";
import { isAdvisoryLockTimeout } from "./migrate-deploy-lib.mjs";

const MAX_ATTEMPTS = 4;
const RETRY_DELAYS_MS = [5_000, 10_000, 20_000];

function runMigrate() {
  return new Promise((resolve) => {
    const command = process.platform === "win32" ? "npx.cmd" : "npx";
    const child = spawn(command, ["prisma", "migrate", "deploy"], { env: process.env });
    let output = "";
    child.stdout.on("data", (chunk) => { output += chunk; process.stdout.write(chunk); });
    child.stderr.on("data", (chunk) => { output += chunk; process.stderr.write(chunk); });
    child.on("close", (code) => resolve({ code: code ?? 1, output }));
  });
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const result = await runMigrate();
    if (result.code === 0) return;
    if (!isAdvisoryLockTimeout(result.output) || attempt === MAX_ATTEMPTS) process.exitCode = result.code;
    if (process.exitCode) return;
    const waitMs = RETRY_DELAYS_MS[attempt - 1];
    console.warn(`Prisma migration lock ocupado; nova tentativa em ${waitMs / 1000}s (${attempt + 1}/${MAX_ATTEMPTS})`);
    await delay(waitMs);
  }
}

if (import.meta.url === new URL(`file://${process.argv[1]}`).href) await main();
