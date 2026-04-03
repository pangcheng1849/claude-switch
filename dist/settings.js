import { readFile, writeFile, mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
const SETTINGS_FILE = join(homedir(), ".claude", "settings.json");
const CLAUDE_JSON_FILE = join(homedir(), ".claude.json");
export async function readSettings() {
    let raw;
    try {
        raw = await readFile(SETTINGS_FILE, "utf-8");
    }
    catch (err) {
        if (err.code === "ENOENT")
            return {};
        throw err;
    }
    try {
        return JSON.parse(raw);
    }
    catch {
        throw new Error(`Failed to parse ${SETTINGS_FILE}: invalid JSON`);
    }
}
export async function writeSettings(settings) {
    await mkdir(dirname(SETTINGS_FILE), { recursive: true });
    await writeFile(SETTINGS_FILE, JSON.stringify(settings, null, 2) + "\n", { encoding: "utf-8", mode: 0o600 });
}
/**
 * Read ~/.claude.json (user-level Claude Code state).
 */
async function readClaudeJson() {
    let raw;
    try {
        raw = await readFile(CLAUDE_JSON_FILE, "utf-8");
    }
    catch (err) {
        if (err.code === "ENOENT")
            return {};
        throw err;
    }
    try {
        return JSON.parse(raw);
    }
    catch {
        throw new Error(`Failed to parse ${CLAUDE_JSON_FILE}: invalid JSON`);
    }
}
/**
 * Write ~/.claude.json.
 */
async function writeClaudeJson(data) {
    await writeFile(CLAUDE_JSON_FILE, JSON.stringify(data, null, 2) + "\n", { encoding: "utf-8", mode: 0o600 });
}
/**
 * Read MCP servers from ~/.claude.json (user scope).
 */
export async function readMcpServers() {
    const data = await readClaudeJson();
    return data.mcpServers ?? {};
}
/**
 * Write MCP servers to ~/.claude.json (user scope).
 */
export async function writeMcpServers(mcpServers) {
    const data = await readClaudeJson();
    data.mcpServers = Object.keys(mcpServers).length > 0 ? mcpServers : undefined;
    await writeClaudeJson(data);
}
