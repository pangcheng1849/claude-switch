// All env keys that any provider may write — used for cleanup
export const MANAGED_ENV_KEYS = [
    "ANTHROPIC_BASE_URL",
    "ANTHROPIC_AUTH_TOKEN",
    "ANTHROPIC_MODEL",
    "ANTHROPIC_SMALL_FAST_MODEL",
    "ANTHROPIC_DEFAULT_OPUS_MODEL",
    "ANTHROPIC_DEFAULT_SONNET_MODEL",
    "ANTHROPIC_DEFAULT_HAIKU_MODEL",
    "API_TIMEOUT_MS",
    "CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC",
];
export const PROVIDERS = [
    {
        id: "claude",
        displayName: "Claude (Native)",
        baseUrl: "",
        apiKeyUrl: "",
        models: [],
        buildEnv() {
            return {};
        },
    },
    {
        id: "ark",
        displayName: "Volcano Ark",
        baseUrl: "https://ark.cn-beijing.volces.com/api/coding",
        apiKeyUrl: "https://console.volcengine.com/ark/region:ark+cn-beijing/apikey",
        models: [
            { name: "doubao-seed-2.0-code", displayName: "Doubao Seed 2.0 Code", description: "Multimodal. Frontend-focused, multi-language", default: true },
            { name: "doubao-seed-2.0-pro", displayName: "Doubao Seed 2.0 Pro", description: "Multimodal. Flagship, complex reasoning" },
            { name: "doubao-seed-2.0-lite", displayName: "Doubao Seed 2.0 Lite", description: "Multimodal. Balanced quality & speed" },
            { name: "doubao-seed-code", displayName: "Doubao Seed Code", description: "Multimodal. Code generation & scheduling" },
            { name: "minimax-m2.5", displayName: "MiniMax M2.5", description: "Coding & tool-calling SOTA" },
            { name: "kimi-k2.5", displayName: "Kimi K2.5", description: "Multimodal. Frontend quality & design" },
            { name: "deepseek-v3.2", displayName: "DeepSeek V3.2", description: "Balanced reasoning, lightweight dev" },
            { name: "ark-code-latest", displayName: "Auto", description: "Smart scheduling, best model match" },
        ],
        buildEnv(apiKey, model) {
            return {
                ANTHROPIC_BASE_URL: this.baseUrl,
                ANTHROPIC_AUTH_TOKEN: apiKey,
                ANTHROPIC_MODEL: model,
            };
        },
    },
    {
        id: "zhipu",
        displayName: "Zhipu",
        baseUrl: "https://open.bigmodel.cn/api/anthropic",
        apiKeyUrl: "https://bigmodel.cn/usercenter/proj-mgmt/apikeys",
        models: [
            { name: "GLM-5.1", default: true },
            { name: "GLM-5-Turbo" },
            { name: "GLM-5" },
        ],
        buildEnv(apiKey, model) {
            return {
                ANTHROPIC_BASE_URL: this.baseUrl,
                ANTHROPIC_AUTH_TOKEN: apiKey,
                API_TIMEOUT_MS: "3000000",
                CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: 1,
                ANTHROPIC_DEFAULT_OPUS_MODEL: model,
                ANTHROPIC_DEFAULT_SONNET_MODEL: model,
                ANTHROPIC_DEFAULT_HAIKU_MODEL: model,
            };
        },
    },
    {
        id: "minimax",
        displayName: "MiniMax",
        baseUrl: "https://api.minimaxi.com/anthropic",
        apiKeyUrl: "https://platform.minimaxi.com",
        models: [{ name: "MiniMax-M2.7", default: true }],
        buildEnv(apiKey, model) {
            return {
                ANTHROPIC_BASE_URL: this.baseUrl,
                ANTHROPIC_AUTH_TOKEN: apiKey,
                API_TIMEOUT_MS: "3000000",
                CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: 1,
                ANTHROPIC_MODEL: model,
                ANTHROPIC_SMALL_FAST_MODEL: model,
                ANTHROPIC_DEFAULT_OPUS_MODEL: model,
                ANTHROPIC_DEFAULT_SONNET_MODEL: model,
                ANTHROPIC_DEFAULT_HAIKU_MODEL: model,
            };
        },
    },
];
export function getProvider(id) {
    return PROVIDERS.find((p) => p.id === id);
}
/**
 * Convert a CustomProviderConfig (JSON-serializable) into a ProviderDefinition
 * with a functional buildEnv() method.
 */
export function buildCustomProviderDefinition(def) {
    const template = def.env;
    return {
        id: def.id,
        displayName: def.displayName,
        baseUrl: def.baseUrl,
        apiKeyUrl: "",
        models: def.models ?? [],
        buildEnv(apiKey, model) {
            if (template) {
                const result = {};
                for (const [key, value] of Object.entries(template)) {
                    result[key] = value
                        .replace(/\{\{API_KEY\}\}/g, apiKey)
                        .replace(/\{\{MODEL\}\}/g, model);
                }
                // Force ANTHROPIC_BASE_URL to match baseUrl
                result.ANTHROPIC_BASE_URL = def.baseUrl;
                return result;
            }
            // Default template: always 3 vars
            return {
                ANTHROPIC_BASE_URL: def.baseUrl,
                ANTHROPIC_AUTH_TOKEN: apiKey,
                ANTHROPIC_MODEL: model,
            };
        },
    };
}
/**
 * Merge built-in PROVIDERS with custom providers from config.
 * Skips custom providers with conflicting IDs or invalid env.
 */
export function getAllProviders(config) {
    const builtInIds = new Set(PROVIDERS.map((p) => p.id));
    const custom = [];
    for (const cp of config.customProviders ?? []) {
        if (builtInIds.has(cp.id)) {
            console.warn(`Custom provider "${cp.id}" conflicts with built-in provider, skipping`);
            continue;
        }
        // Validate env values are all strings
        if (cp.env) {
            const invalid = Object.entries(cp.env).find(([, v]) => typeof v !== "string");
            if (invalid) {
                console.warn(`Custom provider "${cp.id}" has non-string env value for key "${invalid[0]}", skipping`);
                continue;
            }
        }
        custom.push(buildCustomProviderDefinition(cp));
    }
    return [...PROVIDERS, ...custom];
}
/**
 * Compute the full set of managed env keys: static built-in keys
 * + persisted historical keys + current custom provider keys.
 */
export function getAllManagedEnvKeys(config) {
    const keys = new Set(MANAGED_ENV_KEYS);
    // Add persisted historical keys
    for (const key of config.managedEnvKeys ?? []) {
        keys.add(key);
    }
    // Add current custom provider keys
    for (const cp of config.customProviders ?? []) {
        if (cp.env) {
            for (const key of Object.keys(cp.env)) {
                keys.add(key);
            }
        }
    }
    return [...keys];
}
