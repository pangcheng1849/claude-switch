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
export declare const MANAGED_ENV_KEYS: readonly ["ANTHROPIC_BASE_URL", "ANTHROPIC_AUTH_TOKEN", "ANTHROPIC_MODEL", "ANTHROPIC_SMALL_FAST_MODEL", "ANTHROPIC_DEFAULT_OPUS_MODEL", "ANTHROPIC_DEFAULT_SONNET_MODEL", "ANTHROPIC_DEFAULT_HAIKU_MODEL", "API_TIMEOUT_MS", "CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC"];
export declare const PROVIDERS: ProviderDefinition[];
export declare function getProvider(id: string): ProviderDefinition | undefined;
