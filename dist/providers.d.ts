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
export declare const MANAGED_ENV_KEYS: readonly ["ANTHROPIC_BASE_URL", "ANTHROPIC_AUTH_TOKEN", "ANTHROPIC_MODEL", "ANTHROPIC_SMALL_FAST_MODEL", "ANTHROPIC_DEFAULT_OPUS_MODEL", "ANTHROPIC_DEFAULT_SONNET_MODEL", "ANTHROPIC_DEFAULT_HAIKU_MODEL", "API_TIMEOUT_MS", "CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC"];
export declare const PROVIDERS: ProviderDefinition[];
export declare function getProvider(id: string): ProviderDefinition | undefined;
/**
 * Convert a CustomProviderConfig (JSON-serializable) into a ProviderDefinition
 * with a functional buildEnv() method.
 */
export declare function buildCustomProviderDefinition(def: CustomProviderConfig): ProviderDefinition;
/**
 * Merge built-in PROVIDERS with custom providers from config.
 * Skips custom providers with conflicting IDs or invalid env.
 */
export declare function getAllProviders(config: {
    customProviders?: CustomProviderConfig[];
}): ProviderDefinition[];
/**
 * Compute the full set of managed env keys: static built-in keys
 * + persisted historical keys + current custom provider keys.
 */
export declare function getAllManagedEnvKeys(config: {
    customProviders?: CustomProviderConfig[];
    managedEnvKeys?: string[];
}): string[];
