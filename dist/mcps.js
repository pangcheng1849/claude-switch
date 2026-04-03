/** Per-provider built-in tool support, shown in MCP management */
export const MCP_PROVIDER_BUILTIN = {
    zhipu: "Built-in: WebSearch · WebFetch · Image Understanding — MCPs serve as fallback",
    minimax: "Built-in: WebSearch · WebFetch — Image Understanding requires MCP",
};
export const MCP_REGISTRY = [
    {
        id: "zai-mcp-server",
        displayName: "Vision",
        providerId: "zhipu",
        description: "Image analysis, video understanding, OCR",
        buildConfig(apiKey) {
            return {
                type: "stdio",
                command: "npx",
                args: ["-y", "@z_ai/mcp-server"],
                env: {
                    Z_AI_API_KEY: apiKey,
                    Z_AI_MODE: "ZHIPU",
                },
            };
        },
    },
    {
        id: "web-search-prime",
        displayName: "Web Search",
        providerId: "zhipu",
        description: "Real-time web search",
        buildConfig(apiKey) {
            return {
                type: "http",
                url: "https://open.bigmodel.cn/api/mcp/web_search_prime/mcp",
                headers: {
                    Authorization: `Bearer ${apiKey}`,
                },
            };
        },
    },
    {
        id: "web-reader",
        displayName: "Web Reader",
        providerId: "zhipu",
        description: "Fetch and extract web page content",
        buildConfig(apiKey) {
            return {
                type: "http",
                url: "https://open.bigmodel.cn/api/mcp/web_reader/mcp",
                headers: {
                    Authorization: `Bearer ${apiKey}`,
                },
            };
        },
    },
    {
        id: "zread",
        displayName: "Repo Reader",
        providerId: "zhipu",
        description: "GitHub repo search, structure, code reading",
        buildConfig(apiKey) {
            return {
                type: "http",
                url: "https://open.bigmodel.cn/api/mcp/zread/mcp",
                headers: {
                    Authorization: `Bearer ${apiKey}`,
                },
            };
        },
    },
    {
        id: "MiniMax",
        displayName: "Search + Vision",
        providerId: "minimax",
        description: "Web search + image understanding (requires uvx)",
        buildConfig(apiKey) {
            return {
                type: "stdio",
                command: "uvx",
                args: ["minimax-coding-plan-mcp", "-y"],
                env: {
                    MINIMAX_API_KEY: apiKey,
                    MINIMAX_API_HOST: "https://api.minimaxi.com",
                },
            };
        },
    },
];
