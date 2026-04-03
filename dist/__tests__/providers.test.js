import { describe, it, expect } from "vitest";
import { PROVIDERS, MANAGED_ENV_KEYS, getProvider } from "../providers.js";
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
    it("all non-Claude providers have apiKeyUrl set", () => {
        for (const p of PROVIDERS.filter((p) => p.id !== "claude")) {
            expect(p.apiKeyUrl.length).toBeGreaterThan(0);
        }
    });
    it("MANAGED_ENV_KEYS includes ANTHROPIC_BASE_URL and ANTHROPIC_AUTH_TOKEN", () => {
        expect(MANAGED_ENV_KEYS).toContain("ANTHROPIC_BASE_URL");
        expect(MANAGED_ENV_KEYS).toContain("ANTHROPIC_AUTH_TOKEN");
    });
});
