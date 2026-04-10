import { type ProviderDefinition } from "./providers.js";
import { type SwitchConfig } from "./config.js";
import { type ClaudeSettings } from "./settings.js";
/**
 * Detect which provider is currently active from a settings object.
 * Returns "claude" only if no ANTHROPIC_BASE_URL is set.
 * Returns "unknown" if base URL is set but doesn't match any known provider.
 */
export declare function detectActiveProviderFromSettings(settings: ClaudeSettings, providers?: ProviderDefinition[], activeProviderId?: string): string;
/**
 * Detect which provider is currently active by reading settings.json.
 */
export declare function detectActiveProvider(): Promise<string>;
/**
 * Get the current active model name from settings.json env.
 */
export declare function detectActiveModel(): Promise<string | undefined>;
/**
 * Get the current ANTHROPIC_BASE_URL from settings, for warning messages.
 */
export declare function getActiveBaseUrl(): Promise<string | undefined>;
/**
 * Switch to a specific provider and model.
 * Handles env cleanup, native backup/restore, and writing new env.
 */
export interface SwitchResult {
    warnings: string[];
    cleanedMcps: string[];
}
export declare function switchProvider(provider: ProviderDefinition, model: string, apiKey: string): Promise<SwitchResult>;
/**
 * Check if shell environment variables may override settings.json.
 * Returns warning messages if conflicting vars are found.
 */
export declare function checkShellOverrides(): string[];
/**
 * Remove all claude-switch managed MCP servers from ~/.claude.json.
 * Only removes MCPs listed in config.enabledMcps, preserving user-configured ones.
 */
export declare function cleanupManagedMcps(config: SwitchConfig): Promise<string[]>;
