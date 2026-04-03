import { describe, it, expect, vi, beforeEach } from "vitest";
import { setProviderApiKey, removeProviderApiKey, getProviderApiKey, } from "../config.js";
// --- File I/O tests for readConfig / writeConfig ---
const mockReadFile = vi.fn();
const mockWriteFile = vi.fn();
const mockMkdir = vi.fn();
vi.mock("node:fs/promises", () => ({
    readFile: (...args) => mockReadFile(...args),
    writeFile: (...args) => mockWriteFile(...args),
    mkdir: (...args) => mockMkdir(...args),
}));
// Must import after vi.mock
const { readConfig, writeConfig } = await import("../config.js");
beforeEach(() => {
    vi.clearAllMocks();
    mockMkdir.mockResolvedValue(undefined);
    mockWriteFile.mockResolvedValue(undefined);
});
describe("readConfig (file I/O)", () => {
    it("returns empty object when config.json does not exist", async () => {
        const err = new Error("ENOENT");
        err.code = "ENOENT";
        mockReadFile.mockRejectedValue(err);
        expect(await readConfig()).toEqual({});
    });
    it("parses valid config JSON", async () => {
        const data = {
            providers: { ark: { apiKey: "k" } },
            nativeEnvBackup: { ANTHROPIC_MODEL: "opus" },
            enabledMcps: ["web-search-prime"],
        };
        mockReadFile.mockResolvedValue(JSON.stringify(data));
        expect(await readConfig()).toEqual(data);
    });
    it("re-throws non-ENOENT errors", async () => {
        const err = new Error("EACCES");
        err.code = "EACCES";
        mockReadFile.mockRejectedValue(err);
        await expect(readConfig()).rejects.toThrow("EACCES");
    });
    it("throws on malformed JSON", async () => {
        mockReadFile.mockResolvedValue("not-json");
        await expect(readConfig()).rejects.toThrow();
    });
});
describe("writeConfig (file I/O)", () => {
    it("creates ~/.claude-switch directory recursively", async () => {
        await writeConfig({});
        expect(mockMkdir).toHaveBeenCalledWith(expect.stringContaining(".claude-switch"), { recursive: true });
    });
    it("writes JSON with trailing newline and mode 0o600", async () => {
        await writeConfig({ providers: { ark: { apiKey: "k" } } });
        const content = mockWriteFile.mock.calls[0][1];
        expect(content).toMatch(/\n$/);
        expect(() => JSON.parse(content)).not.toThrow();
        const opts = mockWriteFile.mock.calls[0][2];
        expect(opts).toMatchObject({ mode: 0o600 });
    });
    it("serializes all config fields", async () => {
        const config = {
            nativeEnvBackup: { ANTHROPIC_MODEL: "x" },
            providers: { zhipu: { apiKey: "z" } },
            enabledMcps: ["mcp-1"],
        };
        await writeConfig(config);
        const written = JSON.parse(mockWriteFile.mock.calls[0][1]);
        expect(written.nativeEnvBackup).toEqual({ ANTHROPIC_MODEL: "x" });
        expect(written.providers).toEqual({ zhipu: { apiKey: "z" } });
        expect(written.enabledMcps).toEqual(["mcp-1"]);
    });
});
describe("getProviderApiKey", () => {
    it("returns undefined for missing provider", () => {
        expect(getProviderApiKey({}, "ark")).toBeUndefined();
    });
    it("returns undefined when providers is undefined", () => {
        expect(getProviderApiKey({ providers: undefined }, "ark")).toBeUndefined();
    });
    it("returns key for existing provider", () => {
        const config = { providers: { ark: { apiKey: "key-123" } } };
        expect(getProviderApiKey(config, "ark")).toBe("key-123");
    });
});
describe("setProviderApiKey", () => {
    it("adds new provider to empty config", () => {
        const result = setProviderApiKey({}, "ark", "key-123");
        expect(result.providers?.ark?.apiKey).toBe("key-123");
    });
    it("replaces existing key", () => {
        const config = { providers: { ark: { apiKey: "old" } } };
        const result = setProviderApiKey(config, "ark", "new");
        expect(result.providers?.ark?.apiKey).toBe("new");
    });
    it("preserves other providers", () => {
        const config = {
            providers: { ark: { apiKey: "ark-key" }, zhipu: { apiKey: "zhipu-key" } },
        };
        const result = setProviderApiKey(config, "ark", "new-ark-key");
        expect(result.providers?.ark?.apiKey).toBe("new-ark-key");
        expect(result.providers?.zhipu?.apiKey).toBe("zhipu-key");
    });
    it("preserves non-provider fields", () => {
        const config = {
            enabledMcps: ["web-search-prime"],
            nativeEnvBackup: { ANTHROPIC_MODEL: "opus" },
        };
        const result = setProviderApiKey(config, "ark", "key");
        expect(result.enabledMcps).toEqual(["web-search-prime"]);
        expect(result.nativeEnvBackup).toEqual({ ANTHROPIC_MODEL: "opus" });
    });
});
describe("removeProviderApiKey", () => {
    it("removes provider", () => {
        const config = {
            providers: { ark: { apiKey: "k1" }, zhipu: { apiKey: "k2" } },
        };
        const result = removeProviderApiKey(config, "ark");
        expect(result.providers?.ark).toBeUndefined();
        expect(result.providers?.zhipu?.apiKey).toBe("k2");
    });
    it("sets providers to undefined when last provider removed", () => {
        const config = { providers: { ark: { apiKey: "k1" } } };
        const result = removeProviderApiKey(config, "ark");
        expect(result.providers).toBeUndefined();
    });
    it("no-op for non-existent provider", () => {
        const config = {};
        const result = removeProviderApiKey(config, "ark");
        expect(result.providers).toBeUndefined();
    });
    it("preserves enabledMcps", () => {
        const config = {
            providers: { ark: { apiKey: "k" } },
            enabledMcps: ["mcp-1"],
        };
        const result = removeProviderApiKey(config, "ark");
        expect(result.enabledMcps).toEqual(["mcp-1"]);
    });
});
