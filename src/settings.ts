import { readFile, writeFile, mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join, dirname } from "node:path";

const SETTINGS_FILE = join(homedir(), ".claude", "settings.json");
const CLAUDE_JSON_FILE = join(homedir(), ".claude.json");

export interface ClaudeSettings {
  env?: Record<string, string | number>;
  [key: string]: unknown;
}

export interface McpServerConfig {
  type?: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
  [key: string]: unknown;
}

export async function readSettings(): Promise<ClaudeSettings> {
  let raw: string;
  try {
    raw = await readFile(SETTINGS_FILE, "utf-8");
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw err;
  }
  try {
    return JSON.parse(raw) as ClaudeSettings;
  } catch {
    throw new Error(`Failed to parse ${SETTINGS_FILE}: invalid JSON`);
  }
}

export async function writeSettings(settings: ClaudeSettings): Promise<void> {
  await mkdir(dirname(SETTINGS_FILE), { recursive: true });
  await writeFile(
    SETTINGS_FILE,
    JSON.stringify(settings, null, 2) + "\n",
    { encoding: "utf-8", mode: 0o600 },
  );
}

/**
 * Read ~/.claude.json (user-level Claude Code state).
 */
async function readClaudeJson(): Promise<Record<string, unknown>> {
  let raw: string;
  try {
    raw = await readFile(CLAUDE_JSON_FILE, "utf-8");
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw err;
  }
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    throw new Error(`Failed to parse ${CLAUDE_JSON_FILE}: invalid JSON`);
  }
}

/**
 * Write ~/.claude.json.
 */
async function writeClaudeJson(data: Record<string, unknown>): Promise<void> {
  await writeFile(
    CLAUDE_JSON_FILE,
    JSON.stringify(data, null, 2) + "\n",
    { encoding: "utf-8", mode: 0o600 },
  );
}

/**
 * Read MCP servers from ~/.claude.json (user scope).
 */
export async function readMcpServers(): Promise<Record<string, McpServerConfig>> {
  const data = await readClaudeJson();
  return (data.mcpServers as Record<string, McpServerConfig> | undefined) ?? {};
}

/**
 * Write MCP servers to ~/.claude.json (user scope).
 */
export async function writeMcpServers(
  mcpServers: Record<string, McpServerConfig>,
): Promise<void> {
  const data = await readClaudeJson();
  data.mcpServers = Object.keys(mcpServers).length > 0 ? mcpServers : undefined;
  await writeClaudeJson(data);
}
