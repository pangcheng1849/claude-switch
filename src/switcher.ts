import { MANAGED_ENV_KEYS, PROVIDERS, type ProviderDefinition } from "./providers.js";
import {
  readConfig,
  writeConfig,
  type SwitchConfig,
} from "./config.js";
import { readSettings, writeSettings, readMcpServers, writeMcpServers, type ClaudeSettings } from "./settings.js";
import { log } from "./logger.js";

const SHELL_OVERRIDE_KEYS = ["ANTHROPIC_AUTH_TOKEN", "ANTHROPIC_BASE_URL"] as const;

/**
 * Detect which provider is currently active from a settings object.
 * Returns "claude" only if no ANTHROPIC_BASE_URL is set.
 * Returns "unknown" if base URL is set but doesn't match any known provider.
 */
export function detectActiveProviderFromSettings(settings: ClaudeSettings): string {
  const env = settings.env ?? {};

  const baseUrl = env.ANTHROPIC_BASE_URL;
  if (typeof baseUrl === "string" && baseUrl.length > 0) {
    for (const provider of PROVIDERS) {
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
export async function detectActiveProvider(): Promise<string> {
  const settings = await readSettings();
  return detectActiveProviderFromSettings(settings);
}

/**
 * Get the current active model name from settings.json env.
 */
export async function detectActiveModel(): Promise<string | undefined> {
  const settings = await readSettings();
  const env = settings.env ?? {};
  // Check ANTHROPIC_MODEL first, then fall back to ANTHROPIC_DEFAULT_OPUS_MODEL
  const model = env.ANTHROPIC_MODEL ?? env.ANTHROPIC_DEFAULT_OPUS_MODEL;
  return typeof model === "string" ? model : undefined;
}

/**
 * Get the current ANTHROPIC_BASE_URL from settings, for warning messages.
 */
export async function getActiveBaseUrl(): Promise<string | undefined> {
  const settings = await readSettings();
  const url = settings.env?.ANTHROPIC_BASE_URL;
  return typeof url === "string" ? url : undefined;
}

/**
 * Backup native env keys before switching away from Claude native.
 */
async function backupNativeEnv(
  config: SwitchConfig,
  env: Record<string, string | number>,
): Promise<SwitchConfig> {
  const backup: Record<string, string | number> = {};
  for (const key of MANAGED_ENV_KEYS) {
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
function cleanManagedKeys(
  env: Record<string, string | number>,
): Record<string, string | number> {
  const cleaned = { ...env };
  for (const key of MANAGED_ENV_KEYS) {
    delete cleaned[key];
  }
  return cleaned;
}

/**
 * Switch to a specific provider and model.
 * Handles env cleanup, native backup/restore, and writing new env.
 */
export interface SwitchResult {
  warnings: string[];
  cleanedMcps: string[];
}

export async function switchProvider(
  provider: ProviderDefinition,
  model: string,
  apiKey: string,
): Promise<SwitchResult> {
  const config = await readConfig();
  const settings = await readSettings();
  const currentEnv = settings.env ?? {};

  // Detect current provider from already-read settings (no double read)
  const currentProviderId = detectActiveProviderFromSettings(settings);

  // Only backup when switching FROM native (not "unknown")
  let updatedConfig = config;
  if (currentProviderId === "claude" && provider.id !== "claude") {
    updatedConfig = await backupNativeEnv(config, currentEnv);
  }

  // Clean all managed keys
  let newEnv = cleanManagedKeys(currentEnv);
  let cleanedMcps: string[] = [];

  if (provider.id === "claude") {
    // Restore native backup if available
    if (updatedConfig.nativeEnvBackup) {
      newEnv = { ...newEnv, ...updatedConfig.nativeEnvBackup };
      // Clear backup after restore
      updatedConfig = { ...updatedConfig, nativeEnvBackup: undefined };
      await writeConfig(updatedConfig);
    }
  } else {
    // Write provider-specific env
    const providerEnv = provider.buildEnv(apiKey, model);
    newEnv = { ...newEnv, ...providerEnv };
  }

  // Write settings, preserving non-env fields
  await writeSettings({
    ...settings,
    env: Object.keys(newEnv).length > 0 ? newEnv : undefined,
  });

  // Remove managed MCP servers from ~/.claude.json when switching to Claude native
  if (provider.id === "claude") {
    cleanedMcps = await cleanupManagedMcps(updatedConfig);
  }

  const currentModel = typeof currentEnv.ANTHROPIC_MODEL === "string"
    ? currentEnv.ANTHROPIC_MODEL
    : typeof currentEnv.ANTHROPIC_DEFAULT_OPUS_MODEL === "string"
      ? currentEnv.ANTHROPIC_DEFAULT_OPUS_MODEL
      : undefined;

  // Redact API key from env for logging
  const logEnv = { ...newEnv };
  if ("ANTHROPIC_AUTH_TOKEN" in logEnv) {
    const token = String(logEnv.ANTHROPIC_AUTH_TOKEN);
    logEnv.ANTHROPIC_AUTH_TOKEN = token.length > 8
      ? token.slice(0, 4) + "****" + token.slice(-4)
      : "****";
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
export function checkShellOverrides(): string[] {
  const warnings: string[] = [];
  for (const key of SHELL_OVERRIDE_KEYS) {
    if (process.env[key]) {
      warnings.push(`  ⚠ Shell env ${key} is set and will override settings.json`);
    }
  }
  return warnings;
}

/**
 * Remove all claude-switch managed MCP servers from settings.json.
 * Only removes MCPs listed in config.enabledMcps, preserving user-configured ones.
 */
export async function cleanupManagedMcps(config: SwitchConfig): Promise<string[]> {
  const enabledMcps = config.enabledMcps;
  if (!enabledMcps || enabledMcps.length === 0) return [];

  const currentServers = await readMcpServers();
  const updated = { ...currentServers };
  const removed: string[] = [];

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
