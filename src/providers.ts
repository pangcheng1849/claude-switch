export interface ProviderModel {
  name: string;
  displayName?: string;
  description?: string;
}

export interface ProviderDefinition {
  id: string;
  displayName: string;
  baseUrl: string;
  apiKeyUrl: string;
  models: ProviderModel[];
  buildEnv(apiKey: string, model: string): Record<string, string | number>;
}

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
] as const;

export const PROVIDERS: ProviderDefinition[] = [
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
      { name: "doubao-seed-2.0-code", displayName: "Doubao Seed 2.0 Code", description: "Multimodal. Frontend-focused, multi-language" },
      { name: "doubao-seed-2.0-pro", displayName: "Doubao Seed 2.0 Pro", description: "Multimodal. Flagship, complex reasoning" },
      { name: "doubao-seed-2.0-lite", displayName: "Doubao Seed 2.0 Lite", description: "Multimodal. Balanced quality & speed" },
      { name: "doubao-seed-code", displayName: "Doubao Seed Code", description: "Multimodal. Code generation & scheduling" },
      { name: "minimax-m2.5", displayName: "MiniMax M2.5", description: "Coding & tool-calling SOTA" },
      { name: "kimi-k2.5", displayName: "Kimi K2.5", description: "Multimodal. Frontend quality & design" },
      { name: "glm-4.7", displayName: "GLM 4.7", description: "Code gen, debugging, full-chain" },
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
      { name: "GLM-4.7" },
      { name: "GLM-4.5-Air" },
      { name: "GLM-5.1" },
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
    models: [{ name: "MiniMax-M2.7" }],
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

export function getProvider(id: string): ProviderDefinition | undefined {
  return PROVIDERS.find((p) => p.id === id);
}
