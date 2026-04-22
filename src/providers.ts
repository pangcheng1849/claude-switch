export interface ProviderModel {
  name: string;
  displayName?: string;
  description?: string;
  default?: boolean;
}

export interface ProviderDefinition {
  id: string;
  displayName: string;
  baseUrl: string;
  apiKeyUrl?: string;
  models: ProviderModel[];
  buildEnv(apiKey: string, model: string): Record<string, string | number>;
}

export interface CustomProviderConfig {
  id: string;
  displayName: string;
  baseUrl: string;
  models?: ProviderModel[];
  env?: Record<string, string | number>;
}

// All env keys that any provider may write — used for cleanup
export const MANAGED_ENV_KEYS = [
  "ANTHROPIC_BASE_URL",
  "ANTHROPIC_AUTH_TOKEN",
  "ANTHROPIC_API_KEY",
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
      { name: "doubao-seed-2.0-code", displayName: "Doubao Seed 2.0 Code", description: "Seed 2.0 Agent + VLM. Frontend-strong, multi-language", default: true },
      { name: "doubao-seed-2.0-pro", displayName: "Doubao Seed 2.0 Pro", description: "Flagship. Complex reasoning, multimodal, long context" },
      { name: "doubao-seed-2.0-lite", displayName: "Doubao Seed 2.0 Lite", description: "Balanced quality & speed for production" },
      { name: "doubao-seed-code", displayName: "Doubao Seed Code", description: "Agentic coding. Precise generation & task scheduling" },
      { name: "minimax-m2.7", displayName: "MiniMax M2.7", description: "Builds Agent Harness with Teams, Skills & Tools" },
      { name: "glm-5.1", displayName: "GLM-5.1", description: "Zhipu flagship. Long-horizon autonomous tasks up to 8h" },
      { name: "deepseek-v3.2", displayName: "DeepSeek V3.2", description: "Balanced reasoning, lightweight dev" },
      { name: "kimi-k2.6", displayName: "Kimi K2.6", description: "Preview. Strong reasoning, multi-step tools, logic/math/code" },
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
    displayName: "Zhipu (CN)",
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
    displayName: "MiniMax (CN)",
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
  {
    // Kimi Coding Plan uses ANTHROPIC_API_KEY (not AUTH_TOKEN).
    id: "kimi",
    displayName: "Kimi (CN)",
    baseUrl: "https://api.kimi.com/coding/",
    apiKeyUrl: "https://www.kimi.com/code/console",
    models: [{ name: "kimi-for-coding", default: true }],
    buildEnv(apiKey, model) {
      return {
        ANTHROPIC_BASE_URL: this.baseUrl,
        ANTHROPIC_API_KEY: apiKey,
        ANTHROPIC_MODEL: model,
      };
    },
  },
];

export function getProvider(id: string): ProviderDefinition | undefined {
  return PROVIDERS.find((p) => p.id === id);
}

/**
 * Convert a CustomProviderConfig (JSON-serializable) into a ProviderDefinition
 * with a functional buildEnv() method.
 */
export function buildCustomProviderDefinition(
  def: CustomProviderConfig,
): ProviderDefinition {
  const template = def.env;

  return {
    id: def.id,
    displayName: def.displayName,
    baseUrl: def.baseUrl,
    apiKeyUrl: "",
    models: def.models ?? [],
    buildEnv(apiKey: string, model: string): Record<string, string | number> {
      if (template) {
        const result: Record<string, string | number> = {};
        for (const [key, value] of Object.entries(template)) {
          if (typeof value === "string") {
            result[key] = value
              .replace(/\{\{API_KEY\}\}/g, apiKey)
              .replace(/\{\{MODEL\}\}/g, model);
          } else {
            result[key] = value;
          }
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
export function getAllProviders(
  config: { customProviders?: CustomProviderConfig[] },
): ProviderDefinition[] {
  const builtInIds = new Set(PROVIDERS.map((p) => p.id));
  const custom: ProviderDefinition[] = [];

  for (const cp of config.customProviders ?? []) {
    if (builtInIds.has(cp.id)) {
      console.warn(`Custom provider "${cp.id}" conflicts with built-in provider, skipping`);
      continue;
    }
    // Validate env values are strings or numbers
    if (cp.env) {
      const invalid = Object.entries(cp.env).find(([, v]) => typeof v !== "string" && typeof v !== "number");
      if (invalid) {
        console.warn(`Custom provider "${cp.id}" has invalid env value for key "${invalid[0]}", skipping`);
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
export function getAllManagedEnvKeys(
  config: { customProviders?: CustomProviderConfig[]; managedEnvKeys?: string[] },
): string[] {
  const keys = new Set<string>(MANAGED_ENV_KEYS);

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
