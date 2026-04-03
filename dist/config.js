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
