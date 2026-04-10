#!/usr/bin/env node
import { select, password, confirm, Separator } from "@inquirer/prompts";
import { CancelPromptError, ExitPromptError } from "@inquirer/core";
import { PROVIDERS, getAllProviders } from "./providers.js";
import { MCP_REGISTRY, MCP_PROVIDER_BUILTIN } from "./mcps.js";
import { readConfig, writeConfig, getProviderApiKey, setProviderApiKey, removeProviderApiKey } from "./config.js";
import { readMcpServers, writeMcpServers } from "./settings.js";
import { detectActiveProvider, detectActiveModel, getActiveBaseUrl, switchProvider } from "./switcher.js";
import { log } from "./logger.js";
import { manageCustomProviders } from "./custom-providers.js";
import { parseArgs, printVersion, printHelp, runList, runQuickSwitch } from "./cli.js";
const RECONFIGURE_KEY = "__reconfigure_api_key__";
const REMOVE_KEY = "__remove_api_key__";
const MANAGE_MCP_KEY = "__manage_mcp__";
const MANAGE_CUSTOM_PROVIDERS_KEY = "__manage_custom_providers__";
const ESC_BYTE = "\x1b";
const CLEAR = { clearPromptOnDone: true };
/**
 * Wrap an inquirer prompt with ESC-to-cancel support.
 */
function withEsc(prompt) {
    const onData = (data) => {
        if (data.length === 1 && data.toString() === ESC_BYTE) {
            prompt.cancel?.();
        }
    };
    process.stdin.on("data", onData);
    return prompt.finally(() => {
        process.stdin.removeListener("data", onData);
    });
}
function isCancelled(err) {
    return err instanceof CancelPromptError || err instanceof ExitPromptError;
}
/**
 * Refresh MCP configs in settings.json after an API key change for a provider.
 * Rebuilds all enabled MCPs for that provider with the new key.
 * If apiKey is null (key removed), removes those MCPs instead.
 */
async function refreshMcpsForProvider(providerId, apiKey, config) {
    const providerMcps = MCP_REGISTRY.filter((m) => m.providerId === providerId);
    if (providerMcps.length === 0)
        return config;
    const currentServers = await readMcpServers();
    const updated = { ...currentServers };
    let changed = false;
    for (const mcp of providerMcps) {
        if (mcp.id in updated) {
            if (apiKey) {
                // Rebuild with new key
                updated[mcp.id] = mcp.buildConfig(apiKey);
            }
            else {
                // Remove MCP since key was removed
                delete updated[mcp.id];
            }
            changed = true;
        }
    }
    if (changed) {
        await writeMcpServers(updated);
        const affectedIds = providerMcps.filter((m) => m.id in currentServers).map((m) => m.id);
        await log("mcp-refreshed", { provider: providerId, action: apiKey ? "rebuild" : "remove", affectedMcpIds: affectedIds });
        if (!apiKey) {
            // Remove from enabledMcps
            const remaining = (config.enabledMcps ?? []).filter((id) => !providerMcps.some((m) => m.id === id));
            config = { ...config, enabledMcps: remaining.length > 0 ? remaining : undefined };
            await writeConfig(config);
        }
    }
    return config;
}
async function manageMcps(config) {
    let changed = false;
    let lastSelected;
    while (true) {
        const currentServers = await readMcpServers();
        // Build choices grouped by provider
        const choices = [];
        const providerGroups = new Map();
        for (const mcp of MCP_REGISTRY) {
            const group = providerGroups.get(mcp.providerId) ?? [];
            group.push(mcp);
            providerGroups.set(mcp.providerId, group);
        }
        for (const [providerId, mcps] of providerGroups) {
            const provider = PROVIDERS.find((p) => p.id === providerId);
            const apiKey = getProviderApiKey(config, providerId);
            const hasKey = !!apiKey;
            choices.push(new Separator(`── ${provider?.displayName ?? providerId} ${hasKey ? "(API Key configured)" : "(API Key not configured)"} ──`));
            const builtIn = MCP_PROVIDER_BUILTIN[providerId];
            if (builtIn) {
                choices.push(new Separator(`  ${builtIn}`));
            }
            for (const mcp of mcps) {
                const isEnabled = mcp.id in currentServers;
                const label = mcp.id;
                const desc = mcp.description ? `  ${mcp.description}` : "";
                if (!hasKey) {
                    choices.push({ name: `${label}${desc}  ✘ configure API Key first`, value: mcp.id, disabled: true });
                }
                else if (isEnabled) {
                    choices.push({ name: `${label}${desc}  ✔ enabled`, value: mcp.id });
                }
                else {
                    choices.push({ name: `${label}${desc}  ○ disabled`, value: mcp.id });
                }
            }
        }
        try {
            const selected = await withEsc(select({
                message: "Manage MCP Servers (ESC to go back)",
                loop: false,
                default: lastSelected,
                theme: { keybindings: ["vim"] },
                choices,
            }));
            if (!selected)
                continue;
            lastSelected = selected;
            const mcp = MCP_REGISTRY.find((m) => m.id === selected);
            if (!mcp)
                continue;
            const apiKey = getProviderApiKey(config, mcp.providerId);
            if (!apiKey)
                continue;
            const isEnabled = selected in currentServers;
            if (isEnabled) {
                // Disable (toggle on Enter)
                const updated = { ...currentServers };
                delete updated[selected];
                await writeMcpServers(updated);
                config = {
                    ...config,
                    enabledMcps: (config.enabledMcps ?? []).filter((id) => id !== selected),
                };
                if (config.enabledMcps.length === 0)
                    config.enabledMcps = undefined;
                await writeConfig(config);
                changed = true;
                await log("mcp-disabled", { mcpId: mcp.id, provider: mcp.providerId, remainingEnabled: config.enabledMcps ?? [] });
            }
            else {
                // Enable (toggle on Enter, deduplicate enabledMcps)
                const updated = {
                    ...currentServers,
                    [selected]: mcp.buildConfig(apiKey),
                };
                await writeMcpServers(updated);
                const newEnabled = [...new Set([...(config.enabledMcps ?? []), selected])];
                config = {
                    ...config,
                    enabledMcps: newEnabled,
                };
                await writeConfig(config);
                changed = true;
                await log("mcp-enabled", { mcpId: mcp.id, provider: mcp.providerId, allEnabled: config.enabledMcps ?? [] });
            }
        }
        catch (err) {
            if (isCancelled(err)) {
                if (changed) {
                    console.log("  Please restart Claude Code to apply MCP changes");
                }
                return;
            }
            throw err;
        }
    }
}
async function main() {
    let lastProviderId;
    while (true) {
        const config = await readConfig();
        const activeProviderId = await detectActiveProvider();
        const activeModel = await detectActiveModel();
        const currentServers = await readMcpServers();
        const mcpActiveCount = MCP_REGISTRY.filter((m) => m.id in currentServers).length;
        const providerId = await selectProvider(activeProviderId, activeModel, config, mcpActiveCount, lastProviderId);
        if (providerId === null)
            return;
        lastProviderId = providerId;
        if (providerId === MANAGE_MCP_KEY) {
            await manageMcps(config);
            continue;
        }
        if (providerId === MANAGE_CUSTOM_PROVIDERS_KEY) {
            await manageCustomProviders(config);
            continue;
        }
        const allProviders = getAllProviders(config);
        const provider = allProviders.find((p) => p.id === providerId);
        if (!provider)
            return;
        if (provider.id === "claude") {
            if (activeProviderId === "claude") {
                console.log("\n  Already on Claude (Native), no changes needed.");
                continue;
            }
            if (activeProviderId === "unknown") {
                const baseUrl = await getActiveBaseUrl();
                console.log(`\n⚠ Current config uses an unrecognized provider (${baseUrl})`);
                const ok = await confirmAction("Switching will remove these settings. Continue?");
                if (!ok)
                    continue;
            }
            const switchResult = await switchProvider(provider, "", "");
            printSwitchResult(provider.displayName, undefined, switchResult, true);
            return;
        }
        let currentConfig = config;
        let apiKey = getProviderApiKey(currentConfig, provider.id);
        if (!apiKey) {
            const inputKey = await promptApiKeyLoop(provider.apiKeyUrl);
            if (inputKey === null)
                continue;
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
            if (action === null)
                continue;
            const finalConfig = await readConfig();
            const finalApiKey = getProviderApiKey(finalConfig, provider.id);
            if (!finalApiKey)
                continue;
            const switchResult = await switchProvider(provider, modelName, finalApiKey);
            printSwitchResult(provider.displayName, modelName, switchResult, false);
            return;
        }
        const result = await selectModel(provider.displayName, provider.models, provider.apiKeyUrl, currentConfig, provider.id, activeProviderId === provider.id ? activeModel : undefined);
        if (result === null)
            continue;
        if (activeProviderId === provider.id && activeModel === result) {
            console.log(`\n  Already on ${provider.displayName} / ${result}, no changes needed.`);
            continue;
        }
        const finalConfig = await readConfig();
        const finalApiKey = getProviderApiKey(finalConfig, provider.id);
        if (!finalApiKey)
            continue;
        if (activeProviderId === "unknown") {
            const baseUrl = await getActiveBaseUrl();
            console.log(`\n⚠ Current config uses an unrecognized provider (${baseUrl})`);
            const ok = await confirmAction("Switching will remove these settings. Continue?");
            if (!ok)
                continue;
        }
        const switchResult = await switchProvider(provider, result, finalApiKey);
        printSwitchResult(provider.displayName, result, switchResult, false);
        return;
    }
}
async function selectProvider(activeProviderId, activeModel, config, mcpActiveCount, defaultValue) {
    const totalCount = MCP_REGISTRY.length;
    const allProviders = getAllProviders(config);
    const customProviders = config.customProviders ?? [];
    try {
        const providerChoices = allProviders.map((p) => {
            let hint;
            if (p.id === activeProviderId) {
                hint = activeModel ? `● active (${activeModel})` : "● active";
            }
            else if (p.id !== "claude" && getProviderApiKey(config, p.id)) {
                hint = "✔ configured";
            }
            else if (p.id === "claude") {
                hint = activeProviderId === "claude" ? "● active" : "";
            }
            else {
                hint = "○ not configured";
            }
            return {
                name: hint ? `${p.displayName}  ${hint}` : p.displayName,
                short: p.displayName,
                value: p.id,
            };
        });
        // Insert separator before custom providers if any
        const builtInCount = PROVIDERS.length;
        const choices = [];
        choices.push(...providerChoices.slice(0, builtInCount));
        if (customProviders.length > 0) {
            choices.push(new Separator("── Custom ──"));
            choices.push(...providerChoices.slice(builtInCount));
        }
        choices.push(new Separator(""));
        choices.push({
            name: `⚙  Manage MCP Servers (${mcpActiveCount}/${totalCount} active)`,
            short: "Manage MCP Servers",
            value: MANAGE_MCP_KEY,
        });
        choices.push({
            name: `⚙  Manage Custom Providers${customProviders.length > 0 ? ` (${customProviders.length})` : ""}`,
            short: "Manage Custom Providers",
            value: MANAGE_CUSTOM_PROVIDERS_KEY,
        });
        return await withEsc(select({
            message: "Select Provider (ESC to quit)",
            loop: false,
            default: defaultValue,
            theme: { keybindings: ["vim"] },
            choices,
        }));
    }
    catch (err) {
        if (isCancelled(err))
            return null;
        throw err;
    }
}
async function promptApiKeyLoop(apiKeyUrl) {
    while (true) {
        const result = await promptApiKey(apiKeyUrl);
        if (result === null)
            return null;
        if (result === "") {
            console.log("  API Key cannot be empty, please try again.");
            continue;
        }
        return result;
    }
}
async function promptApiKey(apiKeyUrl) {
    try {
        const message = apiKeyUrl
            ? `Enter API Key (get it from ${apiKeyUrl})`
            : "Enter API Key";
        const key = await withEsc(password({
            message,
            mask: "*",
        }, CLEAR));
        const trimmed = key?.trim() ?? "";
        return trimmed.length > 0 ? trimmed : "";
    }
    catch (err) {
        if (isCancelled(err))
            return null;
        throw err;
    }
}
async function confirmAction(message) {
    try {
        return await withEsc(confirm({ message, default: false }, CLEAR));
    }
    catch (err) {
        if (isCancelled(err))
            return false;
        throw err;
    }
}
function printSwitchResult(providerName, model, result, isNative) {
    const target = model ? `${providerName} / ${model}` : providerName;
    console.log(`\n✔ Switched to ${target}`);
    for (const w of result.warnings) {
        console.log(w);
    }
    if (result.cleanedMcps.length > 0) {
        console.log(`  ✔ Removed ${result.cleanedMcps.length} managed MCP server(s): ${result.cleanedMcps.join(", ")}`);
    }
    console.log("  Please restart Claude Code to apply");
    console.log("  ⚠ Do NOT reuse the previous session — tool calls or parameters from the old provider may not be supported and will cause errors.");
    if (!isNative) {
        console.log("  💡 Tip: Some built-in tools may not work. Use \"Manage MCP Servers\" to add alternatives.");
    }
}
async function selectSingleModelAction(providerName, modelName, apiKeyUrl, config, providerId) {
    while (true) {
        try {
            const result = await withEsc(select({
                message: `${providerName} (${modelName}) (ESC to go back)`,
                loop: false,
                choices: [
                    { name: `Switch to ${modelName}`, value: "switch" },
                    { name: "🔑 Reconfigure API Key", value: RECONFIGURE_KEY },
                    { name: "🗑  Remove API Key (also removes related MCPs)", value: REMOVE_KEY },
                ],
            }, CLEAR));
            if (result === RECONFIGURE_KEY) {
                const newKey = await promptApiKeyLoop(apiKeyUrl);
                if (newKey) {
                    let updated = setProviderApiKey(config, providerId, newKey);
                    await writeConfig(updated);
                    updated = await refreshMcpsForProvider(providerId, newKey, updated);
                    config = updated;
                    console.log("✔ API Key updated\n");
                    await log("api-key-reconfigured", { provider: providerId });
                }
                continue;
            }
            if (result === REMOVE_KEY) {
                let updated = removeProviderApiKey(config, providerId);
                await writeConfig(updated);
                updated = await refreshMcpsForProvider(providerId, null, updated);
                config = updated;
                console.log("✔ API Key removed\n");
                await log("api-key-removed", { provider: providerId });
                return null;
            }
            return "switch";
        }
        catch (err) {
            if (isCancelled(err))
                return null;
            throw err;
        }
    }
}
async function selectModel(providerName, models, apiKeyUrl, config, providerId, currentActiveModel) {
    while (true) {
        try {
            const modelChoices = models.map((m) => {
                const isActive = m.name === currentActiveModel;
                const label = m.displayName ?? m.name;
                const desc = m.description ? `  ${m.description.length > 30 ? m.description.slice(0, 30) + "…" : m.description}` : "";
                return {
                    name: isActive ? `${label}${desc}  ● active` : `${label}${desc}`,
                    short: label,
                    value: m.name,
                };
            });
            const result = await withEsc(select({
                message: `Select model (${providerName}) (ESC to go back)`,
                loop: false,
                default: modelChoices[0].value,
                choices: [
                    ...(providerId === "ark"
                        ? [new Separator("  Descriptions from Ark official docs — verify for your use case"), ...modelChoices]
                        : modelChoices),
                    new Separator(""),
                    { name: "🔑 Reconfigure API Key", value: RECONFIGURE_KEY },
                    { name: "🗑  Remove API Key (also removes related MCPs)", value: REMOVE_KEY },
                ],
            }, CLEAR));
            if (result === RECONFIGURE_KEY) {
                const newKey = await promptApiKeyLoop(apiKeyUrl);
                if (newKey) {
                    let updated = setProviderApiKey(config, providerId, newKey);
                    await writeConfig(updated);
                    updated = await refreshMcpsForProvider(providerId, newKey, updated);
                    config = updated;
                    console.log("✔ API Key updated\n");
                    await log("api-key-reconfigured", { provider: providerId });
                }
                continue;
            }
            if (result === REMOVE_KEY) {
                let updated = removeProviderApiKey(config, providerId);
                await writeConfig(updated);
                updated = await refreshMcpsForProvider(providerId, null, updated);
                config = updated;
                console.log("✔ API Key removed\n");
                await log("api-key-removed", { provider: providerId });
                return null;
            }
            return result;
        }
        catch (err) {
            if (isCancelled(err))
                return null;
            throw err;
        }
    }
}
const command = parseArgs(process.argv);
if (command) {
    if (command.type === "help") {
        printHelp();
    }
    else if (command.type === "version") {
        printVersion();
    }
    else {
        (async () => {
            if (command.type === "list") {
                await runList();
            }
            else {
                const code = await runQuickSwitch(command.providerId, command.model);
                process.exit(code);
            }
        })().catch((err) => {
            console.error("Error:", err);
            process.exit(1);
        });
    }
}
else {
    main().catch((err) => {
        console.error("Error:", err);
        process.exit(1);
    });
}
