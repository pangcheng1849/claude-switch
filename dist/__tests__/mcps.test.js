import { describe, it, expect } from "vitest";
import { MCP_REGISTRY, MCP_PROVIDER_BUILTIN } from "../mcps.js";
import { PROVIDERS } from "../providers.js";
describe("MCP_REGISTRY", () => {
    it("all MCPs reference valid provider IDs", () => {
        for (const mcp of MCP_REGISTRY) {
            expect(PROVIDERS.find((p) => p.id === mcp.providerId)).toBeDefined();
        }
    });
    it("all MCPs have unique IDs", () => {
        const ids = MCP_REGISTRY.map((m) => m.id);
        expect(new Set(ids).size).toBe(ids.length);
    });
    it("MCP_PROVIDER_BUILTIN keys reference valid provider IDs", () => {
        for (const key of Object.keys(MCP_PROVIDER_BUILTIN)) {
            expect(PROVIDERS.find((p) => p.id === key)).toBeDefined();
        }
    });
});
describe("MCP data completeness", () => {
    it("all MCPs have non-empty displayName and description", () => {
        for (const mcp of MCP_REGISTRY) {
            expect(mcp.displayName.length).toBeGreaterThan(0);
            expect(mcp.description.length).toBeGreaterThan(0);
        }
    });
    it("MCP_PROVIDER_BUILTIN has entries only for providers that have MCPs", () => {
        for (const key of Object.keys(MCP_PROVIDER_BUILTIN)) {
            const hasMcps = MCP_REGISTRY.some((m) => m.providerId === key);
            expect(hasMcps).toBe(true);
        }
    });
});
describe("MCP buildConfig", () => {
    it("zai-mcp-server (stdio) injects API key into env", () => {
        const mcp = MCP_REGISTRY.find((m) => m.id === "zai-mcp-server");
        const config = mcp.buildConfig("zhipu-key-abc");
        expect(config).toMatchObject({
            type: "stdio",
            command: "npx",
            env: { Z_AI_API_KEY: "zhipu-key-abc", Z_AI_MODE: "ZHIPU" },
        });
    });
    it("web-search-prime (http) injects API key into Authorization header", () => {
        const mcp = MCP_REGISTRY.find((m) => m.id === "web-search-prime");
        const config = mcp.buildConfig("zhipu-key-abc");
        expect(config).toMatchObject({
            type: "http",
            url: "https://open.bigmodel.cn/api/mcp/web_search_prime/mcp",
            headers: { Authorization: "Bearer zhipu-key-abc" },
        });
    });
    it("web-reader (http) injects API key into Authorization header", () => {
        const mcp = MCP_REGISTRY.find((m) => m.id === "web-reader");
        const config = mcp.buildConfig("zhipu-key");
        expect(config).toMatchObject({
            type: "http",
            url: "https://open.bigmodel.cn/api/mcp/web_reader/mcp",
            headers: { Authorization: "Bearer zhipu-key" },
        });
    });
    it("zread (http) injects API key into Authorization header", () => {
        const mcp = MCP_REGISTRY.find((m) => m.id === "zread");
        const config = mcp.buildConfig("zhipu-key");
        expect(config).toMatchObject({
            type: "http",
            url: "https://open.bigmodel.cn/api/mcp/zread/mcp",
            headers: { Authorization: "Bearer zhipu-key" },
        });
    });
    it("MiniMax (stdio/uvx) injects API key and host", () => {
        const mcp = MCP_REGISTRY.find((m) => m.id === "MiniMax");
        const config = mcp.buildConfig("mm-key");
        expect(config).toMatchObject({
            command: "uvx",
            env: {
                MINIMAX_API_KEY: "mm-key",
                MINIMAX_API_HOST: "https://api.minimaxi.com",
            },
        });
    });
});
