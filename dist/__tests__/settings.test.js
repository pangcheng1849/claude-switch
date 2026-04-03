import { describe, it, expect, vi, beforeEach } from "vitest";
import { homedir } from "node:os";
import { join } from "node:path";
const SETTINGS_FILE = join(homedir(), ".claude", "settings.json");
const CLAUDE_JSON_FILE = join(homedir(), ".claude.json");
// Mock node:fs/promises
const mockReadFile = vi.fn();
const mockWriteFile = vi.fn();
const mockMkdir = vi.fn();
vi.mock("node:fs/promises", () => ({
    readFile: (...args) => mockReadFile(...args),
    writeFile: (...args) => mockWriteFile(...args),
    mkdir: (...args) => mockMkdir(...args),
}));
import { readSettings, writeSettings, readMcpServers, writeMcpServers } from "../settings.js";
beforeEach(() => {
    vi.clearAllMocks();
    mockMkdir.mockResolvedValue(undefined);
    mockWriteFile.mockResolvedValue(undefined);
});
// ---------- readSettings ----------
describe("readSettings", () => {
    it("returns empty object when settings.json does not exist", async () => {
        const err = new Error("ENOENT");
        err.code = "ENOENT";
        mockReadFile.mockRejectedValue(err);
        expect(await readSettings()).toEqual({});
    });
    it("parses valid JSON from settings.json", async () => {
        const data = { env: { ANTHROPIC_MODEL: "opus" }, permissions: { allow: [] } };
        mockReadFile.mockResolvedValue(JSON.stringify(data));
        expect(await readSettings()).toEqual(data);
    });
    it("throws descriptive error on invalid JSON", async () => {
        mockReadFile.mockResolvedValue("not json {{{");
        await expect(readSettings()).rejects.toThrow(/invalid JSON/);
        await expect(readSettings()).rejects.toThrow(SETTINGS_FILE);
    });
    it("re-throws non-ENOENT filesystem errors", async () => {
        const err = new Error("EACCES");
        err.code = "EACCES";
        mockReadFile.mockRejectedValue(err);
        await expect(readSettings()).rejects.toThrow("EACCES");
    });
    it("reads from ~/.claude/settings.json", async () => {
        mockReadFile.mockResolvedValue("{}");
        await readSettings();
        expect(mockReadFile).toHaveBeenCalledWith(SETTINGS_FILE, "utf-8");
    });
});
// ---------- writeSettings ----------
describe("writeSettings", () => {
    it("creates parent directory with recursive flag", async () => {
        await writeSettings({ env: { X: "1" } });
        expect(mockMkdir).toHaveBeenCalledWith(join(homedir(), ".claude"), { recursive: true });
    });
    it("writes JSON with 2-space indentation and trailing newline", async () => {
        const settings = { env: { KEY: "val" } };
        await writeSettings(settings);
        const written = mockWriteFile.mock.calls[0][1];
        expect(written).toBe(JSON.stringify(settings, null, 2) + "\n");
    });
    it("writes with mode 0o600", async () => {
        await writeSettings({});
        const opts = mockWriteFile.mock.calls[0][2];
        expect(opts).toMatchObject({ mode: 0o600 });
    });
    it("preserves all fields in the settings object", async () => {
        const settings = { env: { A: "1" }, permissions: { allow: ["Read"] }, customField: 42 };
        await writeSettings(settings);
        const written = JSON.parse(mockWriteFile.mock.calls[0][1]);
        expect(written).toEqual(settings);
    });
    it("writes to ~/.claude/settings.json", async () => {
        await writeSettings({});
        expect(mockWriteFile.mock.calls[0][0]).toBe(SETTINGS_FILE);
    });
});
// ---------- readMcpServers ----------
describe("readMcpServers", () => {
    it("returns empty object when ~/.claude.json does not exist", async () => {
        const err = new Error("ENOENT");
        err.code = "ENOENT";
        mockReadFile.mockRejectedValue(err);
        expect(await readMcpServers()).toEqual({});
    });
    it("returns empty object when mcpServers key is missing", async () => {
        mockReadFile.mockResolvedValue(JSON.stringify({ otherKey: 1 }));
        expect(await readMcpServers()).toEqual({});
    });
    it("returns mcpServers map from ~/.claude.json", async () => {
        const servers = { "my-mcp": { type: "stdio", command: "node" } };
        mockReadFile.mockResolvedValue(JSON.stringify({ mcpServers: servers }));
        expect(await readMcpServers()).toEqual(servers);
    });
    it("throws on invalid JSON in ~/.claude.json", async () => {
        mockReadFile.mockResolvedValue("{bad");
        await expect(readMcpServers()).rejects.toThrow(CLAUDE_JSON_FILE);
    });
    it("re-throws non-ENOENT errors", async () => {
        const err = new Error("EPERM");
        err.code = "EPERM";
        mockReadFile.mockRejectedValue(err);
        await expect(readMcpServers()).rejects.toThrow("EPERM");
    });
});
// ---------- writeMcpServers ----------
describe("writeMcpServers", () => {
    it("merges mcpServers into existing ~/.claude.json data", async () => {
        const existing = { projects: { "/foo": {} }, mcpServers: { old: {} } };
        mockReadFile.mockResolvedValue(JSON.stringify(existing));
        await writeMcpServers({ "new-mcp": { type: "http", url: "https://example.com" } });
        const written = JSON.parse(mockWriteFile.mock.calls[0][1]);
        expect(written.projects).toEqual({ "/foo": {} });
        expect(written.mcpServers).toEqual({ "new-mcp": { type: "http", url: "https://example.com" } });
    });
    it("removes mcpServers key when passed empty object", async () => {
        mockReadFile.mockResolvedValue(JSON.stringify({ mcpServers: { x: {} } }));
        await writeMcpServers({});
        const written = JSON.parse(mockWriteFile.mock.calls[0][1]);
        expect(written.mcpServers).toBeUndefined();
    });
    it("creates ~/.claude.json with mcpServers when file does not exist", async () => {
        const err = new Error("ENOENT");
        err.code = "ENOENT";
        mockReadFile.mockRejectedValue(err);
        await writeMcpServers({ "my-mcp": { type: "stdio", command: "npx" } });
        const written = JSON.parse(mockWriteFile.mock.calls[0][1]);
        expect(written.mcpServers).toEqual({ "my-mcp": { type: "stdio", command: "npx" } });
    });
    it("writes with mode 0o600", async () => {
        mockReadFile.mockResolvedValue("{}");
        await writeMcpServers({ x: { type: "http" } });
        const opts = mockWriteFile.mock.calls[0][2];
        expect(opts).toMatchObject({ mode: 0o600 });
    });
    it("writes to ~/.claude.json", async () => {
        mockReadFile.mockResolvedValue("{}");
        await writeMcpServers({ x: {} });
        expect(mockWriteFile.mock.calls[0][0]).toBe(CLAUDE_JSON_FILE);
    });
});
