import { readFile, writeFile, mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
const CONFIG_DIR = join(homedir(), ".claude-switch");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");
export async function readConfig() {
    let raw;
    try {
        raw = await readFile(CONFIG_FILE, "utf-8");
    }
    catch (err) {
        if (err.code === "ENOENT")
            return {};
        throw err;
    }
    return JSON.parse(raw);
}
export async function writeConfig(config) {
    await mkdir(CONFIG_DIR, { recursive: true });
    await writeFile(CONFIG_FILE, JSON.stringify(config, null, 2) + "\n", {
        encoding: "utf-8",
        mode: 0o600,
    });
}
export function getProviderApiKey(config, providerId) {
    return config.providers?.[providerId]?.apiKey;
}
export function setProviderApiKey(config, providerId, apiKey) {
    return {
        ...config,
        providers: {
            ...config.providers,
            [providerId]: { apiKey },
        },
    };
}
export function removeProviderApiKey(config, providerId) {
    const { [providerId]: _, ...rest } = config.providers ?? {};
    return {
        ...config,
        providers: Object.keys(rest).length > 0 ? rest : undefined,
    };
}
export function addCustomProvider(config, provider) {
    return {
        ...config,
        customProviders: [...(config.customProviders ?? []), provider],
    };
}
export function updateCustomProvider(config, id, updates) {
    const existing = config.customProviders ?? [];
    const idx = existing.findIndex((p) => p.id === id);
    if (idx === -1)
        return config;
    const updated = [...existing];
    updated[idx] = { ...updated[idx], ...updates };
    return {
        ...config,
        customProviders: updated,
    };
}
export function removeCustomProvider(config, id) {
    const existing = config.customProviders ?? [];
    const filtered = existing.filter((p) => p.id !== id);
    return {
        ...config,
        customProviders: filtered.length > 0 ? filtered : undefined,
    };
}
export function getCustomProvider(config, id) {
    return config.customProviders?.find((p) => p.id === id);
}
