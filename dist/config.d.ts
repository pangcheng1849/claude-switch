import type { CustomProviderConfig } from "./providers.js";
export interface ProviderConfig {
    apiKey: string;
}
export interface SwitchConfig {
    nativeEnvBackup?: Record<string, string | number>;
    providers?: Record<string, ProviderConfig>;
    enabledMcps?: string[];
    customProviders?: CustomProviderConfig[];
    managedEnvKeys?: string[];
    activeProviderId?: string;
}
export declare function readConfig(): Promise<SwitchConfig>;
export declare function writeConfig(config: SwitchConfig): Promise<void>;
export declare function getProviderApiKey(config: SwitchConfig, providerId: string): string | undefined;
export declare function setProviderApiKey(config: SwitchConfig, providerId: string, apiKey: string): SwitchConfig;
export declare function removeProviderApiKey(config: SwitchConfig, providerId: string): SwitchConfig;
export declare function addCustomProvider(config: SwitchConfig, provider: CustomProviderConfig): SwitchConfig;
export declare function updateCustomProvider(config: SwitchConfig, id: string, updates: Partial<CustomProviderConfig>): SwitchConfig;
export declare function removeCustomProvider(config: SwitchConfig, id: string): SwitchConfig;
export declare function getCustomProvider(config: SwitchConfig, id: string): CustomProviderConfig | undefined;
