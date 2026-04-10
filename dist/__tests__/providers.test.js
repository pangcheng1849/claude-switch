import { describe, it, expect, vi } from "vitest";
import { PROVIDERS, MANAGED_ENV_KEYS, getProvider, buildCustomProviderDefinition, getAllProviders, getAllManagedEnvKeys, } from "../providers.js";
describe("PROVIDERS", () => {
    it("all providers have unique IDs", () => {
        const ids = PROVIDERS.map((p) => p.id);
        expect(new Set(ids).size).toBe(ids.length);
    });
    it("non-Claude providers have unique base URLs", () => {
        const urls = PROVIDERS.filter((p) => p.id !== "claude").map((p) => p.baseUrl);
        expect(new Set(urls).size).toBe(urls.length);
    });
    it("each provider's models have unique names", () => {
        for (const provider of PROVIDERS) {
            const names = provider.models.map((m) => m.name);
            expect(new Set(names).size).toBe(names.length);
        }
    });
    it("Claude buildEnv returns empty object", () => {
        const claude = PROVIDERS.find((p) => p.id === "claude");
        expect(claude.buildEnv("", "")).toEqual({});
    });
});
describe("MANAGED_ENV_KEYS completeness", () => {
    it("includes every key written by any provider's buildEnv", () => {
        for (const provider of PROVIDERS) {
            if (provider.id === "claude")
                continue;
            const env = provider.buildEnv("test-key", "test-model");
            for (const key of Object.keys(env)) {
                expect(MANAGED_ENV_KEYS).toContain(key);
            }
        }
    });
});
describe("buildEnv", () => {
    it("Ark sets ANTHROPIC_MODEL, not tier variables", () => {
        const ark = PROVIDERS.find((p) => p.id === "ark");
        const env = ark.buildEnv("key", "doubao-seed-2.0-code");
        expect(env.ANTHROPIC_BASE_URL).toBe("https://ark.cn-beijing.volces.com/api/coding");
        expect(env.ANTHROPIC_AUTH_TOKEN).toBe("key");
        expect(env.ANTHROPIC_MODEL).toBe("doubao-seed-2.0-code");
        expect(env).not.toHaveProperty("ANTHROPIC_DEFAULT_OPUS_MODEL");
        expect(env).not.toHaveProperty("API_TIMEOUT_MS");
    });
    it("Zhipu sets tier variables, not ANTHROPIC_MODEL", () => {
        const zhipu = PROVIDERS.find((p) => p.id === "zhipu");
        const env = zhipu.buildEnv("key", "GLM-5.1");
        expect(env.ANTHROPIC_BASE_URL).toBe("https://open.bigmodel.cn/api/anthropic");
        expect(env.ANTHROPIC_AUTH_TOKEN).toBe("key");
        expect(env.ANTHROPIC_DEFAULT_OPUS_MODEL).toBe("GLM-5.1");
        expect(env.ANTHROPIC_DEFAULT_SONNET_MODEL).toBe("GLM-5.1");
        expect(env.ANTHROPIC_DEFAULT_HAIKU_MODEL).toBe("GLM-5.1");
        expect(env.API_TIMEOUT_MS).toBe("3000000");
        expect(env).not.toHaveProperty("ANTHROPIC_MODEL");
    });
    it("MiniMax sets all model variables", () => {
        const mm = PROVIDERS.find((p) => p.id === "minimax");
        const env = mm.buildEnv("key", "MiniMax-M2.7");
        expect(env.ANTHROPIC_MODEL).toBe("MiniMax-M2.7");
        expect(env.ANTHROPIC_SMALL_FAST_MODEL).toBe("MiniMax-M2.7");
        expect(env.ANTHROPIC_DEFAULT_OPUS_MODEL).toBe("MiniMax-M2.7");
        expect(env.ANTHROPIC_DEFAULT_SONNET_MODEL).toBe("MiniMax-M2.7");
        expect(env.ANTHROPIC_DEFAULT_HAIKU_MODEL).toBe("MiniMax-M2.7");
        expect(env.API_TIMEOUT_MS).toBe("3000000");
    });
});
describe("getProvider", () => {
    it("returns provider by ID", () => {
        expect(getProvider("ark")?.id).toBe("ark");
        expect(getProvider("zhipu")?.id).toBe("zhipu");
    });
    it("returns undefined for unknown ID", () => {
        expect(getProvider("nonexistent")).toBeUndefined();
    });
});
describe("provider constraints", () => {
    it("Claude provider has empty baseUrl", () => {
        const claude = PROVIDERS.find((p) => p.id === "claude");
        expect(claude.baseUrl).toBe("");
    });
    it("Claude provider has no models", () => {
        const claude = PROVIDERS.find((p) => p.id === "claude");
        expect(claude.models).toHaveLength(0);
    });
    it("all non-Claude providers have non-empty baseUrl", () => {
        for (const p of PROVIDERS.filter((p) => p.id !== "claude")) {
            expect(p.baseUrl.length).toBeGreaterThan(0);
        }
    });
    it("all non-Claude providers have at least one model", () => {
        for (const p of PROVIDERS.filter((p) => p.id !== "claude")) {
            expect(p.models.length).toBeGreaterThanOrEqual(1);
        }
    });
    it("all non-Claude providers have exactly one default model", () => {
        for (const p of PROVIDERS.filter((p) => p.id !== "claude")) {
            const defaults = p.models.filter((m) => m.default);
            expect(defaults).toHaveLength(1);
        }
    });
    it("all built-in non-Claude providers have apiKeyUrl set", () => {
        for (const p of PROVIDERS.filter((p) => p.id !== "claude")) {
            expect(p.apiKeyUrl.length).toBeGreaterThan(0);
        }
    });
    it("MANAGED_ENV_KEYS includes ANTHROPIC_BASE_URL and ANTHROPIC_AUTH_TOKEN", () => {
        expect(MANAGED_ENV_KEYS).toContain("ANTHROPIC_BASE_URL");
        expect(MANAGED_ENV_KEYS).toContain("ANTHROPIC_AUTH_TOKEN");
    });
});
describe("buildCustomProviderDefinition", () => {
    it("uses default 3-var template when env is omitted and models exist", () => {
        const cp = {
            id: "test",
            displayName: "Test",
            baseUrl: "https://test.com/v1",
            models: [{ name: "model-1", default: true }],
        };
        const def = buildCustomProviderDefinition(cp);
        const env = def.buildEnv("my-key", "model-1");
        expect(env).toEqual({
            ANTHROPIC_BASE_URL: "https://test.com/v1",
            ANTHROPIC_AUTH_TOKEN: "my-key",
            ANTHROPIC_MODEL: "model-1",
        });
    });
    it("uses default 3-var template even when no models defined", () => {
        const cp = {
            id: "test",
            displayName: "Test",
            baseUrl: "https://test.com/v1",
        };
        const def = buildCustomProviderDefinition(cp);
        const env = def.buildEnv("my-key", "some-model");
        expect(env).toEqual({
            ANTHROPIC_BASE_URL: "https://test.com/v1",
            ANTHROPIC_AUTH_TOKEN: "my-key",
            ANTHROPIC_MODEL: "some-model",
        });
    });
    it("substitutes {{API_KEY}} and {{MODEL}} placeholders in env", () => {
        const cp = {
            id: "test",
            displayName: "Test",
            baseUrl: "https://test.com/v1",
            env: {
                ANTHROPIC_BASE_URL: "https://test.com/v1",
                ANTHROPIC_AUTH_TOKEN: "{{API_KEY}}",
                ANTHROPIC_MODEL: "{{MODEL}}",
                API_TIMEOUT_MS: "3000000",
            },
        };
        const def = buildCustomProviderDefinition(cp);
        const env = def.buildEnv("my-key", "my-model");
        expect(env.ANTHROPIC_AUTH_TOKEN).toBe("my-key");
        expect(env.ANTHROPIC_MODEL).toBe("my-model");
        expect(env.API_TIMEOUT_MS).toBe("3000000");
        expect(env.ANTHROPIC_BASE_URL).toBe("https://test.com/v1");
    });
    it("forces ANTHROPIC_BASE_URL to match baseUrl", () => {
        const cp = {
            id: "test",
            displayName: "Test",
            baseUrl: "https://test.com/v1",
            env: {
                ANTHROPIC_AUTH_TOKEN: "{{API_KEY}}",
            },
        };
        const def = buildCustomProviderDefinition(cp);
        const env = def.buildEnv("key", "model");
        expect(env.ANTHROPIC_BASE_URL).toBe("https://test.com/v1");
    });
    it("sets models to empty array when omitted", () => {
        const cp = {
            id: "test",
            displayName: "Test",
            baseUrl: "https://test.com/v1",
        };
        const def = buildCustomProviderDefinition(cp);
        expect(def.models).toEqual([]);
    });
    it("preserves models from config", () => {
        const cp = {
            id: "test",
            displayName: "Test",
            baseUrl: "https://test.com/v1",
            models: [
                { name: "m1", displayName: "Model 1", default: true },
                { name: "m2" },
            ],
        };
        const def = buildCustomProviderDefinition(cp);
        expect(def.models).toHaveLength(2);
        expect(def.models[0].displayName).toBe("Model 1");
    });
    it("forces ANTHROPIC_BASE_URL to baseUrl even when template has different value", () => {
        const cp = {
            id: "test",
            displayName: "Test",
            baseUrl: "https://correct.com/v1",
            env: {
                ANTHROPIC_BASE_URL: "https://wrong.com/v1",
                ANTHROPIC_AUTH_TOKEN: "{{API_KEY}}",
            },
        };
        const def = buildCustomProviderDefinition(cp);
        const env = def.buildEnv("key", "model");
        expect(env.ANTHROPIC_BASE_URL).toBe("https://correct.com/v1");
    });
    it("passes through number values without placeholder substitution", () => {
        const cp = {
            id: "test",
            displayName: "Test",
            baseUrl: "https://test.com/v1",
            env: {
                ANTHROPIC_BASE_URL: "https://test.com/v1",
                ANTHROPIC_AUTH_TOKEN: "{{API_KEY}}",
                CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: 1,
                API_TIMEOUT_MS: "3000000",
            },
        };
        const def = buildCustomProviderDefinition(cp);
        const env = def.buildEnv("key", "model");
        expect(env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC).toBe(1);
        expect(env.API_TIMEOUT_MS).toBe("3000000");
    });
    it("sets apiKeyUrl to empty string", () => {
        const cp = {
            id: "test",
            displayName: "Test",
            baseUrl: "https://test.com/v1",
        };
        const def = buildCustomProviderDefinition(cp);
        expect(def.apiKeyUrl).toBe("");
    });
});
describe("getAllProviders", () => {
    it("returns only built-in providers when no custom providers", () => {
        const result = getAllProviders({});
        expect(result).toEqual(PROVIDERS);
    });
    it("appends custom providers after built-in ones", () => {
        const config = {
            customProviders: [
                { id: "custom-1", displayName: "Custom 1", baseUrl: "https://c1.com/v1" },
            ],
        };
        const result = getAllProviders(config);
        expect(result.length).toBe(PROVIDERS.length + 1);
        expect(result[result.length - 1].id).toBe("custom-1");
    });
    it("skips custom providers with IDs conflicting with built-in", () => {
        const spy = vi.spyOn(console, "warn").mockImplementation(() => { });
        const config = {
            customProviders: [
                { id: "ark", displayName: "Fake Ark", baseUrl: "https://fake.com/v1" },
                { id: "valid", displayName: "Valid", baseUrl: "https://valid.com/v1" },
            ],
        };
        const result = getAllProviders(config);
        expect(result.length).toBe(PROVIDERS.length + 1);
        expect(result.find((p) => p.id === "valid")).toBeDefined();
        expect(spy).toHaveBeenCalledWith(expect.stringContaining("ark"));
        spy.mockRestore();
    });
    it("accepts custom providers with number values in env", () => {
        const config = {
            customProviders: [
                {
                    id: "with-numbers",
                    displayName: "With Numbers",
                    baseUrl: "https://example.com/v1",
                    env: {
                        ANTHROPIC_BASE_URL: "https://example.com/v1",
                        ANTHROPIC_AUTH_TOKEN: "{{API_KEY}}",
                        CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: 1,
                    },
                },
            ],
        };
        const result = getAllProviders(config);
        expect(result.length).toBe(PROVIDERS.length + 1);
        const provider = result.find((p) => p.id === "with-numbers");
        const env = provider.buildEnv("key", "model");
        expect(env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC).toBe(1);
    });
    it("skips custom providers with invalid env values (objects/arrays)", () => {
        const spy = vi.spyOn(console, "warn").mockImplementation(() => { });
        const config = {
            customProviders: [
                {
                    id: "bad",
                    displayName: "Bad",
                    baseUrl: "https://bad.com/v1",
                    env: { SOME_KEY: { nested: true } },
                },
            ],
        };
        const result = getAllProviders(config);
        expect(result.length).toBe(PROVIDERS.length);
        expect(spy).toHaveBeenCalled();
        spy.mockRestore();
    });
});
describe("getAllManagedEnvKeys", () => {
    it("returns static keys when no custom providers", () => {
        const result = getAllManagedEnvKeys({});
        expect(result).toEqual([...MANAGED_ENV_KEYS]);
    });
    it("includes custom provider env keys", () => {
        const config = {
            customProviders: [
                {
                    id: "test",
                    displayName: "Test",
                    baseUrl: "https://test.com/v1",
                    env: {
                        ANTHROPIC_BASE_URL: "https://test.com/v1",
                        ANTHROPIC_AUTH_TOKEN: "{{API_KEY}}",
                        CUSTOM_TIMEOUT: "5000",
                    },
                },
            ],
        };
        const result = getAllManagedEnvKeys(config);
        expect(result).toContain("CUSTOM_TIMEOUT");
        expect(result).toContain("ANTHROPIC_BASE_URL");
    });
    it("includes persisted managedEnvKeys from config", () => {
        const config = {
            managedEnvKeys: ["OLD_DELETED_KEY"],
        };
        const result = getAllManagedEnvKeys(config);
        expect(result).toContain("OLD_DELETED_KEY");
    });
    it("deduplicates keys", () => {
        const config = {
            managedEnvKeys: ["ANTHROPIC_BASE_URL", "CUSTOM_KEY"],
            customProviders: [
                {
                    id: "test",
                    displayName: "Test",
                    baseUrl: "https://test.com/v1",
                    env: { ANTHROPIC_BASE_URL: "x", CUSTOM_KEY: "y" },
                },
            ],
        };
        const result = getAllManagedEnvKeys(config);
        const baseUrlCount = result.filter((k) => k === "ANTHROPIC_BASE_URL").length;
        expect(baseUrlCount).toBe(1);
    });
});
