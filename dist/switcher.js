import { MANAGED_ENV_KEYS, PROVIDERS, getAllProviders, getAllManagedEnvKeys } from "./providers.js";
import { readConfig, writeConfig, } from "./config.js";
import { readSettings, writeSettings, readMcpServers, writeMcpServers } from "./settings.js";
import { log } from "./logger.js";
const SHELL_OVERRIDE_KEYS = ["ANTHROPIC_AUTH_TOKEN", "ANTHROPIC_API_KEY", "ANTHROPIC_BASE_URL"];
/**
 * Detect which provider is currently active from a settings object.
 * Returns "claude" only if no ANTHROPIC_BASE_URL is set.
 * Returns "unknown" if base URL is set but doesn't match any known provider.
 */
export function detectActiveProviderFromSettings(settings, providers = PROVIDERS, activeProviderId) {
    const env = settings.env ?? {};
    const baseUrl = env.ANTHROPIC_BASE_URL;
    if (typeof baseUrl === "string" && baseUrl.length > 0) {
        // If we have a stored active provider ID, verify its baseUrl still matches
        if (activeProviderId) {
            const stored = providers.find((p) => p.id === activeProviderId);
            if (stored && stored.baseUrl === baseUrl) {
                return activeProviderId;
            }
        }
        for (const provider of providers) {
            if (provider.id !== "claude" && provider.baseUrl === baseUrl) {
                return provider.id;
            }
        }
        return "unknown";
    }
    return "claude";
}
/**
 * Detect which provider is currently active by reading settings.json.
 */
export async function detectActiveProvider() {
    const config = await readConfig();
    const settings = await readSettings();
    const allProviders = getAllProviders(config);
    return detectActiveProviderFromSettings(settings, allProviders, config.activeProviderId);
}
/**
 * Get the current active model name from settings.json env.
 */
export async function detectActiveModel() {
    const settings = await readSettings();
    const env = settings.env ?? {};
    // Check ANTHROPIC_MODEL first, then fall back to ANTHROPIC_DEFAULT_OPUS_MODEL
    const model = env.ANTHROPIC_MODEL ?? env.ANTHROPIC_DEFAULT_OPUS_MODEL;
    return typeof model === "string" ? model : undefined;
}
/**
 * Get the current ANTHROPIC_BASE_URL from settings, for warning messages.
 */
export async function getActiveBaseUrl() {
    const settings = await readSettings();
    const url = settings.env?.ANTHROPIC_BASE_URL;
    return typeof url === "string" ? url : undefined;
}
/**
 * Backup native env keys before switching away from Claude native.
 */
async function backupNativeEnv(config, env, managedKeys = MANAGED_ENV_KEYS) {
    const backup = {};
    for (const key of managedKeys) {
        if (key in env) {
            backup[key] = env[key];
        }
    }
    const updated = {
        ...config,
        nativeEnvBackup: Object.keys(backup).length > 0 ? backup : undefined,
    };
    await writeConfig(updated);
    return updated;
}
/**
 * Clean all managed env keys from settings, preserving user-defined keys.
 */
function cleanManagedKeys(env, managedKeys = MANAGED_ENV_KEYS) {
    const cleaned = { ...env };
    for (const key of managedKeys) {
        delete cleaned[key];
    }
    return cleaned;
}
export async function switchProvider(provider, model, apiKey) {
    const config = await readConfig();
    const settings = await readSettings();
    const currentEnv = settings.env ?? {};
    // Use dynamic provider list and managed keys for custom provider support
    const allProviders = getAllProviders(config);
    const allManagedKeys = getAllManagedEnvKeys(config);
    // Detect current provider from already-read settings (no double read)
    const currentProviderId = detectActiveProviderFromSettings(settings, allProviders, config.activeProviderId);
    // Only backup when switching FROM native (not "unknown")
    let updatedConfig = config;
    if (currentProviderId === "claude" && provider.id !== "claude") {
        updatedConfig = await backupNativeEnv(config, currentEnv, allManagedKeys);
    }
    // Clean all managed keys
    let newEnv = cleanManagedKeys(currentEnv, allManagedKeys);
    let cleanedMcps = [];
    if (provider.id === "claude") {
        // Restore native backup if available
        if (updatedConfig.nativeEnvBackup) {
            newEnv = { ...newEnv, ...updatedConfig.nativeEnvBackup };
            // Clear backup after restore
            updatedConfig = { ...updatedConfig, nativeEnvBackup: undefined };
            await writeConfig(updatedConfig);
        }
    }
    else {
        // Write provider-specific env
        const providerEnv = provider.buildEnv(apiKey, model);
        newEnv = { ...newEnv, ...providerEnv };
        // Persist any new env keys not already in the static managed set
        const newCustomKeys = Object.keys(providerEnv).filter((k) => !MANAGED_ENV_KEYS.includes(k));
        if (newCustomKeys.length > 0) {
            const existing = new Set(updatedConfig.managedEnvKeys ?? []);
            for (const k of newCustomKeys)
                existing.add(k);
            updatedConfig = { ...updatedConfig, managedEnvKeys: [...existing] };
            await writeConfig(updatedConfig);
        }
    }
    // Write settings, preserving non-env fields
    await writeSettings({
        ...settings,
        env: Object.keys(newEnv).length > 0 ? newEnv : undefined,
    });
    // Save active provider ID for accurate detection (handles same-baseUrl providers)
    updatedConfig = { ...updatedConfig, activeProviderId: provider.id === "claude" ? undefined : provider.id };
    await writeConfig(updatedConfig);
    // Remove managed MCP servers from ~/.claude.json when switching to Claude native
    if (provider.id === "claude") {
        cleanedMcps = await cleanupManagedMcps(updatedConfig);
    }
    const currentModel = typeof currentEnv.ANTHROPIC_MODEL === "string"
        ? currentEnv.ANTHROPIC_MODEL
        : typeof currentEnv.ANTHROPIC_DEFAULT_OPUS_MODEL === "string"
            ? currentEnv.ANTHROPIC_DEFAULT_OPUS_MODEL
            : undefined;
    // Redact API key from all env values that contain it
    const logEnv = { ...newEnv };
    const redact = (token) => token.length > 8 ? token.slice(0, 4) + "****" + token.slice(-4) : "****";
    if (apiKey) {
        for (const [key, value] of Object.entries(logEnv)) {
            if (typeof value === "string" && value === apiKey) {
                logEnv[key] = redact(value);
            }
        }
    }
    else if ("ANTHROPIC_AUTH_TOKEN" in logEnv) {
        const token = String(logEnv.ANTHROPIC_AUTH_TOKEN);
        logEnv.ANTHROPIC_AUTH_TOKEN = redact(token);
    }
    await log("switch", {
        from: { provider: currentProviderId, model: currentModel },
        to: { provider: provider.id, model: model || undefined },
        envWritten: Object.keys(logEnv).length > 0 ? logEnv : null,
    });
    return {
        warnings: checkShellOverrides(),
        cleanedMcps,
    };
}
/**
 * Check if shell environment variables may override settings.json.
 * Returns warning messages if conflicting vars are found.
 */
export function checkShellOverrides() {
    const warnings = [];
    for (const key of SHELL_OVERRIDE_KEYS) {
        if (process.env[key]) {
            warnings.push(`  ⚠ Shell env ${key} is set and will override settings.json`);
        }
    }
    return warnings;
}
/**
 * Remove all claude-switch managed MCP servers from ~/.claude.json.
 * Only removes MCPs listed in config.enabledMcps, preserving user-configured ones.
 */
export async function cleanupManagedMcps(config) {
    const enabledMcps = config.enabledMcps;
    if (!enabledMcps || enabledMcps.length === 0)
        return [];
    const currentServers = await readMcpServers();
    const updated = { ...currentServers };
    const removed = [];
    for (const mcpId of enabledMcps) {
        if (mcpId in updated) {
            delete updated[mcpId];
            removed.push(mcpId);
        }
    }
    if (removed.length > 0) {
        await writeMcpServers(updated);
        await log("mcp-cleanup", { removed: removed.length, removedIds: removed, requestedIds: enabledMcps });
    }
    // Clear enabledMcps from config
    const cleanConfig = { ...config, enabledMcps: undefined };
    await writeConfig(cleanConfig);
    return removed;
}
