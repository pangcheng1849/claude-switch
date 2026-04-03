export interface ProviderConfig {
    apiKey: string;
}
export interface SwitchConfig {
    nativeEnvBackup?: Record<string, string | number>;
    providers?: Record<string, ProviderConfig>;
    enabledMcps?: string[];
}
export declare function readConfig(): Promise<SwitchConfig>;
export declare function writeConfig(config: SwitchConfig): Promise<void>;
export declare function getProviderApiKey(config: SwitchConfig, providerId: string): string | undefined;
export declare function setProviderApiKey(config: SwitchConfig, providerId: string, apiKey: string): SwitchConfig;
export declare function removeProviderApiKey(config: SwitchConfig, providerId: string): SwitchConfig;
