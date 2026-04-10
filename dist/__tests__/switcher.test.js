import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
// --- Mock dependencies ---
const mockReadConfig = vi.fn();
const mockWriteConfig = vi.fn();
vi.mock("../config.js", async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...actual,
        readConfig: (...args) => mockReadConfig(...args),
        writeConfig: (...args) => mockWriteConfig(...args),
    };
});
const mockReadSettings = vi.fn();
const mockWriteSettings = vi.fn();
const mockReadMcpServers = vi.fn();
const mockWriteMcpServers = vi.fn();
vi.mock("../settings.js", async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...actual,
        readSettings: (...args) => mockReadSettings(...args),
        writeSettings: (...args) => mockWriteSettings(...args),
        readMcpServers: (...args) => mockReadMcpServers(...args),
        writeMcpServers: (...args) => mockWriteMcpServers(...args),
    };
});
const mockLog = vi.fn();
vi.mock("../logger.js", () => ({
    log: (...args) => mockLog(...args),
}));
import { PROVIDERS, MANAGED_ENV_KEYS, buildCustomProviderDefinition } from "../providers.js";
import { detectActiveProviderFromSettings, detectActiveProvider, detectActiveModel, getActiveBaseUrl, checkShellOverrides, switchProvider, cleanupManagedMcps, } from "../switcher.js";
beforeEach(() => {
    vi.clearAllMocks();
    mockWriteConfig.mockResolvedValue(undefined);
    mockWriteSettings.mockResolvedValue(undefined);
    mockWriteMcpServers.mockResolvedValue(undefined);
    mockLog.mockResolvedValue(undefined);
});
// ============================================================
// detectActiveProviderFromSettings (pure function, no mocking)
// ============================================================
describe("detectActiveProviderFromSettings", () => {
    it("returns 'claude' when env is undefined", () => {
        expect(detectActiveProviderFromSettings({})).toBe("claude");
    });
    it("returns 'claude' when env is empty object", () => {
        expect(detectActiveProviderFromSettings({ env: {} })).toBe("claude");
    });
    it("returns 'claude' when ANTHROPIC_BASE_URL is not set", () => {
        expect(detectActiveProviderFromSettings({ env: { OTHER: "x" } })).toBe("claude");
    });
    it("returns 'claude' when ANTHROPIC_BASE_URL is empty string", () => {
        expect(detectActiveProviderFromSettings({ env: { ANTHROPIC_BASE_URL: "" } })).toBe("claude");
    });
    it("returns 'ark' when ANTHROPIC_BASE_URL matches Ark", () => {
        expect(detectActiveProviderFromSettings({
            env: { ANTHROPIC_BASE_URL: "https://ark.cn-beijing.volces.com/api/coding" },
        })).toBe("ark");
    });
    it("returns 'zhipu' when ANTHROPIC_BASE_URL matches Zhipu", () => {
        expect(detectActiveProviderFromSettings({
            env: { ANTHROPIC_BASE_URL: "https://open.bigmodel.cn/api/anthropic" },
        })).toBe("zhipu");
    });
    it("returns 'minimax' when ANTHROPIC_BASE_URL matches MiniMax", () => {
        expect(detectActiveProviderFromSettings({
            env: { ANTHROPIC_BASE_URL: "https://api.minimaxi.com/anthropic" },
        })).toBe("minimax");
    });
    it("returns 'unknown' when ANTHROPIC_BASE_URL does not match any provider", () => {
        expect(detectActiveProviderFromSettings({
            env: { ANTHROPIC_BASE_URL: "https://custom.example.com/v1" },
        })).toBe("unknown");
    });
});
// ============================================================
// detectActiveProvider (async, delegates to readSettings)
// ============================================================
describe("detectActiveProvider", () => {
    it("delegates to readSettings and returns correct provider ID", async () => {
        mockReadConfig.mockResolvedValue({});
        mockReadSettings.mockResolvedValue({
            env: { ANTHROPIC_BASE_URL: "https://ark.cn-beijing.volces.com/api/coding" },
        });
        expect(await detectActiveProvider()).toBe("ark");
        expect(mockReadSettings).toHaveBeenCalled();
    });
});
// ============================================================
// detectActiveModel
// ============================================================
describe("detectActiveModel", () => {
    it("returns ANTHROPIC_MODEL when set", async () => {
        mockReadSettings.mockResolvedValue({ env: { ANTHROPIC_MODEL: "doubao-seed-2.0-code" } });
        expect(await detectActiveModel()).toBe("doubao-seed-2.0-code");
    });
    it("falls back to ANTHROPIC_DEFAULT_OPUS_MODEL when ANTHROPIC_MODEL is absent", async () => {
        mockReadSettings.mockResolvedValue({ env: { ANTHROPIC_DEFAULT_OPUS_MODEL: "GLM-5.1" } });
        expect(await detectActiveModel()).toBe("GLM-5.1");
    });
    it("returns undefined when neither model key is set", async () => {
        mockReadSettings.mockResolvedValue({ env: { ANTHROPIC_BASE_URL: "x" } });
        expect(await detectActiveModel()).toBeUndefined();
    });
    it("returns undefined when env is empty", async () => {
        mockReadSettings.mockResolvedValue({});
        expect(await detectActiveModel()).toBeUndefined();
    });
    it("returns undefined when model value is not a string", async () => {
        mockReadSettings.mockResolvedValue({ env: { ANTHROPIC_MODEL: 123 } });
        expect(await detectActiveModel()).toBeUndefined();
    });
});
// ============================================================
// getActiveBaseUrl
// ============================================================
describe("getActiveBaseUrl", () => {
    it("returns ANTHROPIC_BASE_URL when set", async () => {
        mockReadSettings.mockResolvedValue({
            env: { ANTHROPIC_BASE_URL: "https://example.com" },
        });
        expect(await getActiveBaseUrl()).toBe("https://example.com");
    });
    it("returns undefined when not set", async () => {
        mockReadSettings.mockResolvedValue({ env: {} });
        expect(await getActiveBaseUrl()).toBeUndefined();
    });
    it("returns undefined when value is not a string", async () => {
        mockReadSettings.mockResolvedValue({ env: { ANTHROPIC_BASE_URL: 123 } });
        expect(await getActiveBaseUrl()).toBeUndefined();
    });
});
// ============================================================
// checkShellOverrides
// ============================================================
describe("checkShellOverrides", () => {
    const savedEnv = {};
    beforeEach(() => {
        savedEnv.ANTHROPIC_AUTH_TOKEN = process.env.ANTHROPIC_AUTH_TOKEN;
        savedEnv.ANTHROPIC_BASE_URL = process.env.ANTHROPIC_BASE_URL;
        savedEnv.ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL;
        delete process.env.ANTHROPIC_AUTH_TOKEN;
        delete process.env.ANTHROPIC_BASE_URL;
        delete process.env.ANTHROPIC_MODEL;
    });
    afterEach(() => {
        for (const [k, v] of Object.entries(savedEnv)) {
            if (v === undefined)
                delete process.env[k];
            else
                process.env[k] = v;
        }
    });
    it("returns empty array when no shell overrides exist", () => {
        expect(checkShellOverrides()).toEqual([]);
    });
    it("returns warning for ANTHROPIC_AUTH_TOKEN in shell env", () => {
        process.env.ANTHROPIC_AUTH_TOKEN = "sk-test";
        const warnings = checkShellOverrides();
        expect(warnings).toHaveLength(1);
        expect(warnings[0]).toContain("ANTHROPIC_AUTH_TOKEN");
    });
    it("returns warning for ANTHROPIC_BASE_URL in shell env", () => {
        process.env.ANTHROPIC_BASE_URL = "https://example.com";
        const warnings = checkShellOverrides();
        expect(warnings).toHaveLength(1);
        expect(warnings[0]).toContain("ANTHROPIC_BASE_URL");
    });
    it("returns two warnings when both keys are set", () => {
        process.env.ANTHROPIC_AUTH_TOKEN = "sk-test";
        process.env.ANTHROPIC_BASE_URL = "https://example.com";
        expect(checkShellOverrides()).toHaveLength(2);
    });
    it("does not warn about other env vars like ANTHROPIC_MODEL", () => {
        process.env.ANTHROPIC_MODEL = "some-model";
        expect(checkShellOverrides()).toEqual([]);
    });
});
// ============================================================
// switchProvider
// ============================================================
describe("switchProvider", () => {
    const ark = PROVIDERS.find((p) => p.id === "ark");
    const zhipu = PROVIDERS.find((p) => p.id === "zhipu");
    const claude = PROVIDERS.find((p) => p.id === "claude");
    // Helper: set up clean "currently on Claude native" state
    function setupNativeState(env) {
        mockReadConfig.mockResolvedValue({});
        mockReadSettings.mockResolvedValue({ env: env ?? {} });
        mockReadMcpServers.mockResolvedValue({});
    }
    // Helper: set up "currently on Ark" state
    function setupArkState(apiKey = "ark-key-12345678") {
        mockReadConfig.mockResolvedValue({});
        mockReadSettings.mockResolvedValue({
            env: {
                ANTHROPIC_BASE_URL: ark.baseUrl,
                ANTHROPIC_AUTH_TOKEN: apiKey,
                ANTHROPIC_MODEL: "doubao-seed-2.0-code",
            },
        });
        mockReadMcpServers.mockResolvedValue({});
    }
    // Helper: set up "currently on Zhipu" state
    function setupZhipuState() {
        mockReadConfig.mockResolvedValue({});
        mockReadSettings.mockResolvedValue({
            env: {
                ANTHROPIC_BASE_URL: zhipu.baseUrl,
                ANTHROPIC_AUTH_TOKEN: "zhipu-key",
                API_TIMEOUT_MS: "3000000",
                ANTHROPIC_DEFAULT_OPUS_MODEL: "GLM-5.1",
                ANTHROPIC_DEFAULT_SONNET_MODEL: "GLM-5.1",
                ANTHROPIC_DEFAULT_HAIKU_MODEL: "GLM-5.1",
                CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: 1,
            },
        });
        mockReadMcpServers.mockResolvedValue({});
    }
    // --- Basic switching ---
    describe("basic switching", () => {
        it("switches from Claude native to Ark with correct env vars", async () => {
            setupNativeState();
            await switchProvider(ark, "doubao-seed-2.0-code", "my-ark-key");
            const writtenSettings = mockWriteSettings.mock.calls[0][0];
            expect(writtenSettings.env).toMatchObject({
                ANTHROPIC_BASE_URL: ark.baseUrl,
                ANTHROPIC_AUTH_TOKEN: "my-ark-key",
                ANTHROPIC_MODEL: "doubao-seed-2.0-code",
            });
        });
        it("switches from Ark to Zhipu, cleaning old env vars", async () => {
            setupArkState();
            await switchProvider(zhipu, "GLM-5.1", "zhipu-key-abc");
            const writtenSettings = mockWriteSettings.mock.calls[0][0];
            // Zhipu keys present
            expect(writtenSettings.env).toMatchObject({
                ANTHROPIC_BASE_URL: zhipu.baseUrl,
                ANTHROPIC_AUTH_TOKEN: "zhipu-key-abc",
                ANTHROPIC_DEFAULT_OPUS_MODEL: "GLM-5.1",
            });
            // Ark's ANTHROPIC_MODEL should be gone (replaced by Zhipu's tier vars)
            expect(writtenSettings.env?.ANTHROPIC_MODEL).toBeUndefined();
        });
        it("switches from Zhipu back to Claude native", async () => {
            setupZhipuState();
            await switchProvider(claude, "", "");
            const writtenSettings = mockWriteSettings.mock.calls[0][0];
            // All managed keys removed — env should be undefined or empty
            for (const key of MANAGED_ENV_KEYS) {
                expect(writtenSettings.env?.[key]).toBeUndefined();
            }
        });
        it("preserves non-managed env keys during switch", async () => {
            mockReadConfig.mockResolvedValue({});
            mockReadSettings.mockResolvedValue({
                env: {
                    ANTHROPIC_BASE_URL: ark.baseUrl,
                    ANTHROPIC_AUTH_TOKEN: "old-key",
                    ANTHROPIC_MODEL: "old-model",
                    MY_CUSTOM_VAR: "keep-me",
                },
            });
            mockReadMcpServers.mockResolvedValue({});
            await switchProvider(zhipu, "GLM-5.1", "zhipu-key");
            const writtenSettings = mockWriteSettings.mock.calls[0][0];
            expect(writtenSettings.env?.MY_CUSTOM_VAR).toBe("keep-me");
        });
    });
    // --- Native env backup/restore ---
    describe("native env backup/restore", () => {
        it("backs up native env keys when switching FROM Claude native", async () => {
            mockReadConfig.mockResolvedValue({});
            mockReadSettings.mockResolvedValue({
                env: { ANTHROPIC_MODEL: "claude-sonnet-4-6" },
            });
            mockReadMcpServers.mockResolvedValue({});
            await switchProvider(ark, "doubao-seed-2.0-code", "ark-key");
            // First writeConfig call is the backup
            const backupCall = mockWriteConfig.mock.calls[0][0];
            expect(backupCall.nativeEnvBackup).toMatchObject({
                ANTHROPIC_MODEL: "claude-sonnet-4-6",
            });
        });
        it("does NOT backup when switching between two third-party providers", async () => {
            setupArkState();
            await switchProvider(zhipu, "GLM-5.1", "zhipu-key");
            // writeConfig should only be called for logging, not for backup
            for (const call of mockWriteConfig.mock.calls) {
                const config = call[0];
                expect(config.nativeEnvBackup).toBeUndefined();
            }
        });
        it("restores native env backup when switching TO Claude native", async () => {
            mockReadConfig.mockResolvedValue({
                nativeEnvBackup: { ANTHROPIC_MODEL: "claude-opus-4-6" },
            });
            mockReadSettings.mockResolvedValue({
                env: {
                    ANTHROPIC_BASE_URL: ark.baseUrl,
                    ANTHROPIC_AUTH_TOKEN: "ark-key",
                    ANTHROPIC_MODEL: "doubao-seed-2.0-code",
                },
            });
            mockReadMcpServers.mockResolvedValue({});
            await switchProvider(claude, "", "");
            const writtenSettings = mockWriteSettings.mock.calls[0][0];
            expect(writtenSettings.env?.ANTHROPIC_MODEL).toBe("claude-opus-4-6");
        });
        it("clears nativeEnvBackup from config after restore", async () => {
            mockReadConfig.mockResolvedValue({
                nativeEnvBackup: { ANTHROPIC_MODEL: "opus" },
            });
            mockReadSettings.mockResolvedValue({
                env: { ANTHROPIC_BASE_URL: ark.baseUrl, ANTHROPIC_AUTH_TOKEN: "k", ANTHROPIC_MODEL: "m" },
            });
            mockReadMcpServers.mockResolvedValue({});
            await switchProvider(claude, "", "");
            // writeConfig should clear nativeEnvBackup
            const configCall = mockWriteConfig.mock.calls.find((call) => call[0].nativeEnvBackup === undefined);
            expect(configCall).toBeDefined();
        });
        it("handles missing nativeEnvBackup gracefully when returning to native", async () => {
            mockReadConfig.mockResolvedValue({});
            mockReadSettings.mockResolvedValue({
                env: { ANTHROPIC_BASE_URL: ark.baseUrl, ANTHROPIC_AUTH_TOKEN: "k", ANTHROPIC_MODEL: "m" },
            });
            mockReadMcpServers.mockResolvedValue({});
            // Should not throw
            await expect(switchProvider(claude, "", "")).resolves.toBeDefined();
        });
    });
    // --- Env cleanup ---
    describe("env cleanup", () => {
        it("removes all MANAGED_ENV_KEYS before applying new provider env", async () => {
            // Start with Zhipu's many keys
            setupZhipuState();
            await switchProvider(ark, "doubao-seed-2.0-code", "ark-key");
            const writtenSettings = mockWriteSettings.mock.calls[0][0];
            // Zhipu-specific keys should be gone
            expect(writtenSettings.env?.API_TIMEOUT_MS).toBeUndefined();
            expect(writtenSettings.env?.ANTHROPIC_DEFAULT_OPUS_MODEL).toBeUndefined();
            expect(writtenSettings.env?.ANTHROPIC_DEFAULT_SONNET_MODEL).toBeUndefined();
            expect(writtenSettings.env?.ANTHROPIC_DEFAULT_HAIKU_MODEL).toBeUndefined();
            expect(writtenSettings.env?.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC).toBeUndefined();
            // Ark keys should be present
            expect(writtenSettings.env?.ANTHROPIC_MODEL).toBe("doubao-seed-2.0-code");
        });
        it("sets env to undefined when resulting env is empty", async () => {
            // Start on native with no env, switch to native (edge case)
            setupNativeState();
            await switchProvider(claude, "", "");
            const writtenSettings = mockWriteSettings.mock.calls[0][0];
            expect(writtenSettings.env).toBeUndefined();
        });
    });
    // --- MCP cleanup on native return ---
    describe("MCP cleanup on native return", () => {
        it("cleans up managed MCPs when switching to Claude native", async () => {
            mockReadConfig.mockResolvedValue({
                enabledMcps: ["web-search-prime", "zai-mcp-server"],
            });
            mockReadSettings.mockResolvedValue({
                env: { ANTHROPIC_BASE_URL: zhipu.baseUrl, ANTHROPIC_AUTH_TOKEN: "k" },
            });
            mockReadMcpServers.mockResolvedValue({
                "web-search-prime": { type: "http" },
                "zai-mcp-server": { type: "stdio" },
                "user-custom-mcp": { type: "stdio" },
            });
            const result = await switchProvider(claude, "", "");
            expect(result.cleanedMcps).toContain("web-search-prime");
            expect(result.cleanedMcps).toContain("zai-mcp-server");
            // User MCP preserved
            const writtenServers = mockWriteMcpServers.mock.calls[0][0];
            expect(writtenServers["user-custom-mcp"]).toBeDefined();
        });
        it("does NOT cleanup MCPs when switching to a third-party provider", async () => {
            setupNativeState();
            const result = await switchProvider(ark, "doubao-seed-2.0-code", "ark-key");
            expect(result.cleanedMcps).toEqual([]);
        });
    });
    // --- Shell override warnings ---
    describe("shell override warnings", () => {
        const savedToken = process.env.ANTHROPIC_AUTH_TOKEN;
        const savedUrl = process.env.ANTHROPIC_BASE_URL;
        afterEach(() => {
            if (savedToken === undefined)
                delete process.env.ANTHROPIC_AUTH_TOKEN;
            else
                process.env.ANTHROPIC_AUTH_TOKEN = savedToken;
            if (savedUrl === undefined)
                delete process.env.ANTHROPIC_BASE_URL;
            else
                process.env.ANTHROPIC_BASE_URL = savedUrl;
        });
        it("returns shell override warnings in result", async () => {
            process.env.ANTHROPIC_AUTH_TOKEN = "shell-token";
            setupNativeState();
            const result = await switchProvider(ark, "doubao-seed-2.0-code", "ark-key");
            expect(result.warnings.length).toBeGreaterThan(0);
            expect(result.warnings[0]).toContain("ANTHROPIC_AUTH_TOKEN");
        });
    });
    // --- Logging ---
    describe("logging", () => {
        it("logs switch event with from/to provider and model", async () => {
            setupNativeState();
            await switchProvider(ark, "doubao-seed-2.0-code", "my-key-12345678");
            expect(mockLog).toHaveBeenCalledWith("switch", expect.objectContaining({
                from: expect.objectContaining({ provider: "claude" }),
                to: expect.objectContaining({ provider: "ark", model: "doubao-seed-2.0-code" }),
            }));
        });
        it("redacts API key in log, keeping first 4 and last 4 chars", async () => {
            setupNativeState();
            await switchProvider(ark, "doubao-seed-2.0-code", "abcd1234efgh5678");
            const logCall = mockLog.mock.calls.find((c) => c[0] === "switch");
            const detail = logCall[1];
            const envWritten = detail.envWritten;
            expect(envWritten.ANTHROPIC_AUTH_TOKEN).toBe("abcd****5678");
        });
        it("redacts short API keys (<=8 chars) as ****", async () => {
            setupNativeState();
            await switchProvider(ark, "doubao-seed-2.0-code", "short");
            const logCall = mockLog.mock.calls.find((c) => c[0] === "switch");
            const detail = logCall[1];
            const envWritten = detail.envWritten;
            expect(envWritten.ANTHROPIC_AUTH_TOKEN).toBe("****");
        });
    });
    // --- Preserves non-env settings fields ---
    describe("settings preservation", () => {
        it("preserves non-env fields in settings across switch", async () => {
            mockReadConfig.mockResolvedValue({});
            mockReadSettings.mockResolvedValue({
                env: {},
                permissions: { allow: ["Read", "Write"] },
                customPlugin: { enabled: true },
            });
            mockReadMcpServers.mockResolvedValue({});
            await switchProvider(ark, "doubao-seed-2.0-code", "ark-key");
            const writtenSettings = mockWriteSettings.mock.calls[0][0];
            expect(writtenSettings.permissions).toEqual({ allow: ["Read", "Write"] });
            expect(writtenSettings.customPlugin).toEqual({ enabled: true });
        });
    });
});
// ============================================================
// cleanupManagedMcps
// ============================================================
describe("cleanupManagedMcps", () => {
    beforeEach(() => {
        mockWriteConfig.mockResolvedValue(undefined);
        mockWriteMcpServers.mockResolvedValue(undefined);
        mockLog.mockResolvedValue(undefined);
    });
    it("returns empty array when enabledMcps is undefined", async () => {
        const result = await cleanupManagedMcps({});
        expect(result).toEqual([]);
        expect(mockWriteMcpServers).not.toHaveBeenCalled();
    });
    it("returns empty array when enabledMcps is empty array", async () => {
        const result = await cleanupManagedMcps({ enabledMcps: [] });
        expect(result).toEqual([]);
    });
    it("removes only MCPs listed in enabledMcps from mcpServers", async () => {
        mockReadMcpServers.mockResolvedValue({
            "web-search-prime": { type: "http" },
            "user-custom": { type: "stdio" },
        });
        const result = await cleanupManagedMcps({ enabledMcps: ["web-search-prime"] });
        expect(result).toEqual(["web-search-prime"]);
        const written = mockWriteMcpServers.mock.calls[0][0];
        expect(written["user-custom"]).toBeDefined();
        expect(written["web-search-prime"]).toBeUndefined();
    });
    it("skips MCPs in enabledMcps that are not present in mcpServers", async () => {
        mockReadMcpServers.mockResolvedValue({
            "user-custom": { type: "stdio" },
        });
        const result = await cleanupManagedMcps({ enabledMcps: ["nonexistent-mcp"] });
        expect(result).toEqual([]);
    });
    it("writes updated mcpServers after removal", async () => {
        mockReadMcpServers.mockResolvedValue({
            "web-search-prime": { type: "http" },
            "zai-mcp-server": { type: "stdio" },
        });
        await cleanupManagedMcps({ enabledMcps: ["web-search-prime"] });
        expect(mockWriteMcpServers).toHaveBeenCalled();
    });
    it("clears enabledMcps from config after cleanup", async () => {
        mockReadMcpServers.mockResolvedValue({
            "web-search-prime": { type: "http" },
        });
        await cleanupManagedMcps({ enabledMcps: ["web-search-prime"] });
        const configCall = mockWriteConfig.mock.calls[0][0];
        expect(configCall.enabledMcps).toBeUndefined();
    });
    it("logs mcp-cleanup event with removed IDs", async () => {
        mockReadMcpServers.mockResolvedValue({
            "web-search-prime": { type: "http" },
            "zai-mcp-server": { type: "stdio" },
        });
        await cleanupManagedMcps({ enabledMcps: ["web-search-prime", "zai-mcp-server"] });
        expect(mockLog).toHaveBeenCalledWith("mcp-cleanup", expect.objectContaining({
            removed: 2,
            removedIds: ["web-search-prime", "zai-mcp-server"],
        }));
    });
    it("does not call writeMcpServers when no MCPs were actually removed", async () => {
        mockReadMcpServers.mockResolvedValue({
            "user-custom": { type: "stdio" },
        });
        await cleanupManagedMcps({ enabledMcps: ["nonexistent-1", "nonexistent-2"] });
        expect(mockWriteMcpServers).not.toHaveBeenCalled();
    });
});
// ============================================================
// Custom provider switching
// ============================================================
describe("custom provider switching", () => {
    const customCp = {
        id: "my-proxy",
        displayName: "My Proxy",
        baseUrl: "https://my-proxy.example.com/v1",
        models: [{ name: "model-1", default: true }],
        env: {
            ANTHROPIC_BASE_URL: "https://my-proxy.example.com/v1",
            ANTHROPIC_AUTH_TOKEN: "{{API_KEY}}",
            ANTHROPIC_MODEL: "{{MODEL}}",
            CUSTOM_TIMEOUT: "5000",
        },
    };
    const customProvider = buildCustomProviderDefinition(customCp);
    it("detectActiveProviderFromSettings recognizes custom provider", () => {
        const allProviders = [...PROVIDERS, customProvider];
        const result = detectActiveProviderFromSettings({ env: { ANTHROPIC_BASE_URL: "https://my-proxy.example.com/v1" } }, allProviders);
        expect(result).toBe("my-proxy");
    });
    it("switches to custom provider with correct env vars", async () => {
        mockReadConfig.mockResolvedValue({
            customProviders: [customCp],
        });
        mockReadSettings.mockResolvedValue({ env: {} });
        mockReadMcpServers.mockResolvedValue({});
        await switchProvider(customProvider, "model-1", "my-api-key");
        const writtenSettings = mockWriteSettings.mock.calls[0][0];
        expect(writtenSettings.env?.ANTHROPIC_BASE_URL).toBe("https://my-proxy.example.com/v1");
        expect(writtenSettings.env?.ANTHROPIC_AUTH_TOKEN).toBe("my-api-key");
        expect(writtenSettings.env?.ANTHROPIC_MODEL).toBe("model-1");
        expect(writtenSettings.env?.CUSTOM_TIMEOUT).toBe("5000");
    });
    it("cleans custom env keys when switching away from custom provider", async () => {
        mockReadConfig.mockResolvedValue({
            customProviders: [customCp],
            managedEnvKeys: ["CUSTOM_TIMEOUT"],
        });
        mockReadSettings.mockResolvedValue({
            env: {
                ANTHROPIC_BASE_URL: "https://my-proxy.example.com/v1",
                ANTHROPIC_AUTH_TOKEN: "key",
                ANTHROPIC_MODEL: "model-1",
                CUSTOM_TIMEOUT: "5000",
            },
        });
        mockReadMcpServers.mockResolvedValue({});
        const ark = PROVIDERS.find((p) => p.id === "ark");
        await switchProvider(ark, "doubao-seed-2.0-code", "ark-key");
        const writtenSettings = mockWriteSettings.mock.calls[0][0];
        expect(writtenSettings.env?.CUSTOM_TIMEOUT).toBeUndefined();
        expect(writtenSettings.env?.ANTHROPIC_MODEL).toBe("doubao-seed-2.0-code");
    });
    it("persists new custom env keys to managedEnvKeys", async () => {
        mockReadConfig.mockResolvedValue({
            customProviders: [customCp],
        });
        mockReadSettings.mockResolvedValue({ env: {} });
        mockReadMcpServers.mockResolvedValue({});
        await switchProvider(customProvider, "model-1", "key");
        // Check that writeConfig was called with managedEnvKeys containing CUSTOM_TIMEOUT
        const configCalls = mockWriteConfig.mock.calls;
        const hasCustomKey = configCalls.some((call) => {
            const config = call[0];
            return config.managedEnvKeys?.includes("CUSTOM_TIMEOUT");
        });
        expect(hasCustomKey).toBe(true);
    });
});
