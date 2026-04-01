import { appendFile, mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

const LOG_DIR = join(homedir(), ".claude-switch", "logs");

function getLogFile(): string {
  const date = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  return join(LOG_DIR, `${date}.log`);
}

function timestamp(): string {
  return new Date().toISOString();
}

export async function log(event: string, detail?: Record<string, unknown>): Promise<void> {
  await mkdir(LOG_DIR, { recursive: true });
  const entry = detail
    ? `[${timestamp()}] ${event} ${JSON.stringify(detail)}\n`
    : `[${timestamp()}] ${event}\n`;
  await appendFile(getLogFile(), entry, { encoding: "utf-8", mode: 0o600 });
}
