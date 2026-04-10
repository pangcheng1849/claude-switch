import { readFile, writeFile, mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { CustomProviderConfig } from "./providers.js";

const CONFIG_DIR = join(homedir(), ".claude-switch");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");

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

export async function readConfig(): Promise<SwitchConfig> {
  let raw: string;
  try {
    raw = await readFile(CONFIG_FILE, "utf-8");
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw err;
  }
  return JSON.parse(raw) as SwitchConfig;
}

export async function writeConfig(config: SwitchConfig): Promise<void> {
  await mkdir(CONFIG_DIR, { recursive: true });
  await writeFile(CONFIG_FILE, JSON.stringify(config, null, 2) + "\n", {
    encoding: "utf-8",
    mode: 0o600,
  });
}

export function getProviderApiKey(
  config: SwitchConfig,
  providerId: string,
): string | undefined {
  return config.providers?.[providerId]?.apiKey;
}

export function setProviderApiKey(
  config: SwitchConfig,
  providerId: string,
  apiKey: string,
): SwitchConfig {
  return {
    ...config,
    providers: {
      ...config.providers,
      [providerId]: { apiKey },
    },
  };
}

export function removeProviderApiKey(
  config: SwitchConfig,
  providerId: string,
): SwitchConfig {
  const { [providerId]: _, ...rest } = config.providers ?? {};
  return {
    ...config,
    providers: Object.keys(rest).length > 0 ? rest : undefined,
  };
}

export function addCustomProvider(
  config: SwitchConfig,
  provider: CustomProviderConfig,
): SwitchConfig {
  return {
    ...config,
    customProviders: [...(config.customProviders ?? []), provider],
  };
}

export function updateCustomProvider(
  config: SwitchConfig,
  id: string,
  updates: Partial<CustomProviderConfig>,
): SwitchConfig {
  const existing = config.customProviders ?? [];
  const idx = existing.findIndex((p) => p.id === id);
  if (idx === -1) return config;

  const updated = [...existing];
  updated[idx] = { ...updated[idx], ...updates };
  return {
    ...config,
    customProviders: updated,
  };
}

export function removeCustomProvider(
  config: SwitchConfig,
  id: string,
): SwitchConfig {
  const existing = config.customProviders ?? [];
  const filtered = existing.filter((p) => p.id !== id);
  return {
    ...config,
    customProviders: filtered.length > 0 ? filtered : undefined,
  };
}

export function getCustomProvider(
  config: SwitchConfig,
  id: string,
): CustomProviderConfig | undefined {
  return config.customProviders?.find((p) => p.id === id);
}
