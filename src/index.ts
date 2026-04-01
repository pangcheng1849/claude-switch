#!/usr/bin/env node

import { select, password, confirm, Separator } from "@inquirer/prompts";
import { CancelPromptError, ExitPromptError } from "@inquirer/core";
import { PROVIDERS, type ProviderModel } from "./providers.js";
import { readConfig, writeConfig, getProviderApiKey, setProviderApiKey, type SwitchConfig } from "./config.js";
import { detectActiveProvider, detectActiveModel, getActiveBaseUrl, switchProvider } from "./switcher.js";
import { log } from "./logger.js";

const RECONFIGURE_KEY = "__reconfigure_api_key__";
const ESC_BYTE = "\x1b";
const CLEAR = { clearPromptOnDone: true };

/**
 * Wrap an inquirer prompt with ESC-to-cancel support.
 */
function withEsc<T>(prompt: Promise<T> & { cancel?: () => void }): Promise<T> {
  const onData = (data: Buffer) => {
    if (data.length === 1 && data.toString() === ESC_BYTE) {
      prompt.cancel?.();
    }
  };
  process.stdin.on("data", onData);
  return prompt.finally(() => {
    process.stdin.removeListener("data", onData);
  });
}

function isCancelled(err: unknown): boolean {
  return err instanceof CancelPromptError || err instanceof ExitPromptError;
}

async function main(): Promise<void> {
  while (true) {
    const config = await readConfig();
    const activeProviderId = await detectActiveProvider();
    const activeModel = await detectActiveModel();

    const providerId = await selectProvider(activeProviderId, activeModel, config);
    if (providerId === null) return;

    const provider = PROVIDERS.find((p) => p.id === providerId);
    if (!provider) return;

    if (provider.id === "claude") {
      if (activeProviderId === "claude") {
        console.log("\n  Already on Claude (Native), no changes needed.");
        continue;
      }
      if (activeProviderId === "unknown") {
        const baseUrl = await getActiveBaseUrl();
        console.log(`\n⚠ Current config uses an unrecognized provider (${baseUrl})`);
        const ok = await confirmAction("Switching will remove these settings. Continue?");
        if (!ok) continue;
      }
      const warnings = await switchProvider(provider, "", "");
      printSwitchResult(provider.displayName, undefined, warnings);
      return;
    }

    let currentConfig = config;
    let apiKey = getProviderApiKey(currentConfig, provider.id);

    if (!apiKey) {
      const inputKey = await promptApiKeyLoop(provider.apiKeyUrl);
      if (inputKey === null) continue;
      apiKey = inputKey;
      currentConfig = setProviderApiKey(currentConfig, provider.id, apiKey);
      await writeConfig(currentConfig);
      console.log("✔ API Key saved\n");
      await log("api-key-configured", { provider: provider.id });
    }

    if (provider.models.length === 1) {
      const modelName = provider.models[0].name;
      if (activeProviderId === provider.id) {
        console.log(`\n  Already on ${provider.displayName} / ${modelName}, no changes needed.`);
        continue;
      }
      const action = await selectSingleModelAction(provider.displayName, modelName, provider.apiKeyUrl, currentConfig, provider.id);
      if (action === null) continue;
      const finalConfig = await readConfig();
      const finalApiKey = getProviderApiKey(finalConfig, provider.id);
      if (!finalApiKey) continue;
      const warnings = await switchProvider(provider, modelName, finalApiKey);
      printSwitchResult(provider.displayName, modelName, warnings);
      return;
    }

    const result = await selectModel(provider.displayName, provider.models, provider.apiKeyUrl, currentConfig, provider.id, activeProviderId === provider.id ? activeModel : undefined);
    if (result === null) continue;

    if (activeProviderId === provider.id && activeModel === result) {
      console.log(`\n  Already on ${provider.displayName} / ${result}, no changes needed.`);
      continue;
    }

    const finalConfig = await readConfig();
    const finalApiKey = getProviderApiKey(finalConfig, provider.id);
    if (!finalApiKey) continue;

    if (activeProviderId === "unknown") {
      const baseUrl = await getActiveBaseUrl();
      console.log(`\n⚠ Current config uses an unrecognized provider (${baseUrl})`);
      const ok = await confirmAction("Switching will remove these settings. Continue?");
      if (!ok) continue;
    }

    const warnings = await switchProvider(provider, result, finalApiKey);
    printSwitchResult(provider.displayName, result, warnings);
    return;
  }
}

async function selectProvider(
  activeProviderId: string,
  activeModel: string | undefined,
  config: SwitchConfig,
): Promise<string | null> {
  try {
    return await withEsc(select({
      message: "Select Provider (ESC to quit)",
      loop: false,
      choices: PROVIDERS.map((p) => {
        let hint: string;
        if (p.id === activeProviderId) {
          hint = activeModel ? `● active (${activeModel})` : "● active";
        } else if (p.id !== "claude" && getProviderApiKey(config, p.id)) {
          hint = "✔ configured";
        } else if (p.id === "claude") {
          hint = activeProviderId === "claude" ? "● active" : "";
        } else {
          hint = "○ not configured";
        }
        return {
          name: hint ? `${p.displayName}  ${hint}` : p.displayName,
          short: p.displayName,
          value: p.id,
        };
      }),
    }, CLEAR));
  } catch (err) {
    if (isCancelled(err)) return null;
    throw err;
  }
}

async function promptApiKeyLoop(apiKeyUrl: string): Promise<string | null> {
  while (true) {
    const result = await promptApiKey(apiKeyUrl);
    if (result === null) return null;
    if (result === "") {
      console.log("  API Key cannot be empty, please try again.");
      continue;
    }
    return result;
  }
}

async function promptApiKey(apiKeyUrl: string): Promise<string | null | ""> {
  try {
    const key = await withEsc(password({
      message: `Enter API Key (get it from ${apiKeyUrl})`,
      mask: "*",
    }, CLEAR));
    const trimmed = key?.trim() ?? "";
    return trimmed.length > 0 ? trimmed : "";
  } catch (err) {
    if (isCancelled(err)) return null;
    throw err;
  }
}

async function confirmAction(message: string): Promise<boolean> {
  try {
    return await withEsc(confirm({ message, default: false }, CLEAR));
  } catch (err) {
    if (isCancelled(err)) return false;
    throw err;
  }
}

function printSwitchResult(providerName: string, model: string | undefined, warnings: string[]): void {
  const target = model ? `${providerName} / ${model}` : providerName;
  console.log(`\n✔ Switched to ${target}`);
  for (const w of warnings) {
    console.log(w);
  }
  console.log("  Please restart Claude Code to apply");
}

async function selectSingleModelAction(
  providerName: string,
  modelName: string,
  apiKeyUrl: string,
  config: SwitchConfig,
  providerId: string,
): Promise<"switch" | null> {
  while (true) {
    try {
      const result = await withEsc(select({
        message: `${providerName} (${modelName}) (ESC to go back)`,
        loop: false,
        choices: [
          { name: `Switch to ${modelName}`, value: "switch" as const },
          { name: "🔑 Reconfigure API Key", value: RECONFIGURE_KEY },
        ],
      }, CLEAR));

      if (result === RECONFIGURE_KEY) {
        const newKey = await promptApiKeyLoop(apiKeyUrl);
        if (newKey) {
          const updated = setProviderApiKey(config, providerId, newKey);
          await writeConfig(updated);
          config = updated;
          console.log("✔ API Key updated\n");
          await log("api-key-reconfigured", { provider: providerId });
        }
        continue;
      }

      return "switch";
    } catch (err) {
      if (isCancelled(err)) return null;
      throw err;
    }
  }
}

async function selectModel(
  providerName: string,
  models: ProviderModel[],
  apiKeyUrl: string,
  config: SwitchConfig,
  providerId: string,
  currentActiveModel: string | undefined,
): Promise<string | null> {
  while (true) {
    try {
      const modelChoices = models.map((m) => {
        const isActive = m.name === currentActiveModel;
        const label = m.displayName ?? m.name;
        return {
          name: isActive ? `${label}  ● active` : label,
          short: label,
          value: m.name,
        };
      });
      const result = await withEsc(select({
        message: `Select model (${providerName}) (ESC to go back)`,
        loop: false,
        default: modelChoices[0].value,
        choices: [
          ...modelChoices,
          new Separator(""),
          { name: "🔑 Reconfigure API Key", value: RECONFIGURE_KEY },
        ],
      }, CLEAR));

      if (result === RECONFIGURE_KEY) {
        const newKey = await promptApiKeyLoop(apiKeyUrl);
        if (newKey) {
          const updated = setProviderApiKey(config, providerId, newKey);
          await writeConfig(updated);
          config = updated;
          console.log("✔ API Key updated\n");
          await log("api-key-reconfigured", { provider: providerId });
        }
        continue;
      }

      return result;
    } catch (err) {
      if (isCancelled(err)) return null;
      throw err;
    }
  }
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
