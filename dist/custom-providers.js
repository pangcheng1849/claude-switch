import { createInterface } from "node:readline";
import { input, select, confirm, password, Separator } from "@inquirer/prompts";
import { CancelPromptError, ExitPromptError } from "@inquirer/core";
import { PROVIDERS } from "./providers.js";
import { readConfig, writeConfig, addCustomProvider, updateCustomProvider, removeCustomProvider, removeProviderApiKey, setProviderApiKey, } from "./config.js";
import { log } from "./logger.js";
const ESC_BYTE = "\x1b";
const CLEAR = { clearPromptOnDone: true };
const ADD_KEY = "__add_custom_provider__";
// Reserved IDs that cannot be used for custom providers
const RESERVED_IDS = new Set([
    ...PROVIDERS.map((p) => p.id),
    "list",
    "help",
]);
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
 * Read multi-line JSON from stdin. Accumulates lines until
 * valid JSON is detected. ESC cancels, returns null.
 */
function readMultiLineJson(message) {
    return new Promise((resolve) => {
        process.stdout.write(`? ${message}\n`);
        let buffer = "";
        const rl = createInterface({ input: process.stdin, output: process.stdout, prompt: "  " });
        rl.prompt();
        const onStdinData = (data) => {
            if (data.length === 1 && data.toString() === ESC_BYTE) {
                rl.close();
                process.stdin.removeListener("data", onStdinData);
                resolve(null);
            }
        };
        process.stdin.on("data", onStdinData);
        rl.on("line", (line) => {
            if (line.trim() === "" && buffer.trim()) {
                // Empty line with content in buffer — finish and let caller handle parse errors
                rl.close();
                process.stdin.removeListener("data", onStdinData);
                resolve(buffer);
                return;
            }
            buffer += line;
            try {
                JSON.parse(buffer);
                rl.close();
                process.stdin.removeListener("data", onStdinData);
                resolve(buffer);
            }
            catch {
                rl.prompt();
            }
        });
        rl.on("close", () => {
            process.stdin.removeListener("data", onStdinData);
            if (buffer.trim()) {
                resolve(buffer);
            }
            else {
                resolve(null);
            }
        });
    });
}
/**
 * Validate a custom provider ID.
 */
function validateId(id, existingIds) {
    if (!id.trim())
        return "ID cannot be empty";
    if (/\s/.test(id))
        return "ID cannot contain spaces";
    if (RESERVED_IDS.has(id))
        return `"${id}" conflicts with a built-in provider or reserved word`;
    if (existingIds.has(id))
        return `"${id}" already exists`;
    return true;
}
/**
 * Validate a base URL.
 */
function validateBaseUrl(url) {
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
        return "Must start with http:// or https://";
    }
    return true;
}
/**
 * Prompt for models in a loop.
 */
async function promptModels() {
    const models = [];
    while (true) {
        try {
            if (models.length > 0) {
                const addMore = await withEsc(confirm({
                    message: "Add another model?",
                    default: false,
                }, CLEAR));
                if (!addMore)
                    break;
            }
            const name = await withEsc(input({
                message: "Model name",
                validate: (v) => v.trim().length > 0 || "Cannot be empty",
            }, CLEAR));
            const displayName = await withEsc(input({
                message: "Display name (Enter to skip)",
            }, CLEAR));
            const description = await withEsc(input({
                message: "Description (Enter to skip)",
            }, CLEAR));
            const isDefault = models.length === 0
                ? true
                : await withEsc(confirm({ message: "Set as default?", default: false }, CLEAR));
            const model = { name: name.trim() };
            if (displayName.trim())
                model.displayName = displayName.trim();
            if (description.trim())
                model.description = description.trim();
            // If setting this as default, unset previous default
            if (isDefault) {
                for (const m of models)
                    m.default = undefined;
                model.default = true;
            }
            models.push(model);
        }
        catch (err) {
            if (isCancelled(err))
                return null;
            throw err;
        }
    }
    return models;
}
/**
 * Prompt to add extra models (all optional).
 */
async function promptExtraModels() {
    const models = [];
    while (true) {
        try {
            const addMore = await withEsc(confirm({
                message: "Add another model?",
                default: false,
            }, CLEAR));
            if (!addMore)
                break;
            const name = await withEsc(input({
                message: "Model name",
                validate: (v) => v.trim().length > 0 || "Cannot be empty",
            }, CLEAR));
            const displayName = await withEsc(input({
                message: "Display name (Enter to skip)",
            }, CLEAR));
            const description = await withEsc(input({
                message: "Description (Enter to skip)",
            }, CLEAR));
            const model = { name: name.trim() };
            if (displayName.trim())
                model.displayName = displayName.trim();
            if (description.trim())
                model.description = description.trim();
            models.push(model);
        }
        catch (err) {
            if (isCancelled(err))
                return null;
            throw err;
        }
    }
    return models;
}
/**
 * Prompt for API key (required, loop until non-empty).
 */
async function promptApiKey() {
    while (true) {
        try {
            const key = await withEsc(password({
                message: "Enter API Key",
                mask: "*",
            }, CLEAR));
            const trimmed = key?.trim() ?? "";
            if (trimmed.length === 0) {
                console.log("  API Key cannot be empty, please try again.");
                continue;
            }
            return trimmed;
        }
        catch (err) {
            if (isCancelled(err))
                return null;
            throw err;
        }
    }
}
/**
 * Prompt for env configuration.
 */
async function promptEnvVars() {
    try {
        const method = await withEsc(select({
            message: "env configuration",
            choices: [
                { name: "Use default (BASE_URL + AUTH_TOKEN + MODEL)", value: "default" },
                { name: "Paste JSON", value: "json" },
            ],
        }, CLEAR));
        if (method === "default")
            return undefined;
        const raw = await readMultiLineJson("Paste env JSON (ESC to cancel):");
        if (raw === null)
            return null;
        try {
            let parsed = JSON.parse(raw);
            // Unwrap if user pasted { "env": { ... } } format
            if (parsed.env && typeof parsed.env === "object" && !Array.isArray(parsed.env)) {
                parsed = parsed.env;
            }
            const env = {};
            for (const [key, value] of Object.entries(parsed)) {
                if (typeof value === "string" || typeof value === "number") {
                    env[key] = value;
                }
                else {
                    console.log(`  Error: value for "${key}" must be a string or number, got ${typeof value}`);
                    return null;
                }
            }
            // Auto-replace known keys with placeholders
            if (typeof env.ANTHROPIC_AUTH_TOKEN === "string" && env.ANTHROPIC_AUTH_TOKEN !== "{{API_KEY}}") {
                env.ANTHROPIC_AUTH_TOKEN = "{{API_KEY}}";
            }
            if (typeof env.ANTHROPIC_MODEL === "string" && env.ANTHROPIC_MODEL !== "{{MODEL}}") {
                env.ANTHROPIC_MODEL = "{{MODEL}}";
            }
            return env;
        }
        catch (e) {
            const msg = e instanceof SyntaxError ? e.message : "invalid JSON";
            console.log(`  Error: ${msg}`);
            return null;
        }
    }
    catch (err) {
        if (isCancelled(err))
            return null;
        throw err;
    }
}
/**
 * Parse pasted env JSON, extract API key and env template.
 * Returns { apiKey, env } or null on error.
 */
function parseEnvJson(raw) {
    let parsed;
    try {
        parsed = JSON.parse(raw);
    }
    catch (e) {
        const msg = e instanceof SyntaxError ? e.message : "invalid JSON";
        console.log(`  Error: ${msg}`);
        return null;
    }
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        console.log("  Error: must be a JSON object");
        return null;
    }
    // Unwrap { "env": { ... } } format
    if (parsed.env && typeof parsed.env === "object" && !Array.isArray(parsed.env)) {
        parsed = parsed.env;
    }
    const env = {};
    for (const [key, value] of Object.entries(parsed)) {
        if (typeof value === "string" || typeof value === "number") {
            env[key] = value;
        }
        else {
            console.log(`  Error: value for "${key}" must be a string or number, got ${typeof value}`);
            return null;
        }
    }
    // Extract API key before replacing with placeholder
    const apiKey = env.ANTHROPIC_AUTH_TOKEN;
    if (!apiKey || typeof apiKey !== "string" || apiKey === "{{API_KEY}}") {
        console.log("  Error: ANTHROPIC_AUTH_TOKEN is required in JSON");
        return null;
    }
    // Extract base URL
    const baseUrl = typeof env.ANTHROPIC_BASE_URL === "string" ? env.ANTHROPIC_BASE_URL : undefined;
    // Extract model as a model entry
    const modelName = typeof env.ANTHROPIC_MODEL === "string" ? env.ANTHROPIC_MODEL : undefined;
    const models = [];
    if (modelName && modelName !== "{{MODEL}}") {
        models.push({ name: modelName, default: true });
    }
    // Replace known values with placeholders
    env.ANTHROPIC_AUTH_TOKEN = "{{API_KEY}}";
    if (env.ANTHROPIC_MODEL) {
        env.ANTHROPIC_MODEL = "{{MODEL}}";
    }
    return { apiKey, env, baseUrl, models: models.length > 0 ? models : undefined };
}
/**
 * Add custom provider wizard.
 */
async function addCustomProviderWizard(config) {
    const existingIds = new Set((config.customProviders ?? []).map((p) => p.id));
    try {
        // 1. Provider ID
        const id = await withEsc(input({
            message: "Provider ID (used for CLI quick-switch)",
            validate: (v) => validateId(v.trim(), existingIds),
        }, CLEAR));
        // 2. Display Name
        const displayName = await withEsc(input({
            message: "Display name",
            validate: (v) => v.trim().length > 0 || "Cannot be empty",
        }, CLEAR));
        // 3. Choose input method
        const method = await withEsc(select({
            message: "How to configure the provider?",
            choices: [
                { name: "Enter API Key (uses default env: BASE_URL + AUTH_TOKEN + MODEL)", value: "interactive" },
                { name: "Paste env JSON (full customization)", value: "json" },
            ],
        }, CLEAR));
        let baseUrl;
        let models;
        let apiKey;
        let env;
        if (method === "json") {
            // Paste JSON path
            const raw = await readMultiLineJson("Paste env JSON (ESC to cancel):");
            if (raw === null)
                return null;
            const result = parseEnvJson(raw);
            if (result === null)
                return null;
            apiKey = result.apiKey;
            env = result.env;
            baseUrl = result.baseUrl ?? "";
            models = result.models ?? [];
            if (!baseUrl) {
                console.log("  Error: ANTHROPIC_BASE_URL is required in JSON");
                return null;
            }
            // If no model extracted, ask for at least one
            if (models.length === 0) {
                const promptedModels = await promptModels();
                if (promptedModels === null)
                    return null;
                models = promptedModels;
            }
            else {
                // Offer to add more models for switching
                console.log(`  ✔ Model from JSON: ${models[0].name}`);
                const extra = await promptExtraModels();
                if (extra === null)
                    return null;
                models = [...models, ...extra];
            }
        }
        else {
            // Interactive path
            const baseUrlInput = await withEsc(input({
                message: "API base URL",
                validate: (v) => validateBaseUrl(v.trim()),
            }, CLEAR));
            baseUrl = baseUrlInput.trim();
            const promptedModels = await promptModels();
            if (promptedModels === null)
                return null;
            models = promptedModels;
            const promptedKey = await promptApiKey();
            if (promptedKey === null)
                return null;
            apiKey = promptedKey;
        }
        // Summary
        const cp = {
            id: id.trim(),
            displayName: displayName.trim(),
            baseUrl,
        };
        if (models.length > 0)
            cp.models = models;
        if (env)
            cp.env = env;
        console.log("\n  Provider summary:");
        console.log(`    ID:       ${cp.id}`);
        console.log(`    Name:     ${cp.displayName}`);
        console.log(`    Base URL: ${cp.baseUrl}`);
        console.log(`    Models:   ${models.map((m) => m.name).join(", ")}`);
        console.log(`    env:      ${env ? "custom" : "default"}`);
        console.log("");
        const ok = await withEsc(confirm({ message: "Save this provider?", default: true }, CLEAR));
        if (!ok)
            return null;
        let updated = addCustomProvider(config, cp);
        updated = setProviderApiKey(updated, cp.id, apiKey);
        await writeConfig(updated);
        await log("custom-provider-added", { id: cp.id, displayName: cp.displayName });
        console.log(`✔ Provider "${cp.displayName}" added\n`);
        return updated;
    }
    catch (err) {
        if (isCancelled(err))
            return null;
        throw err;
    }
}
/**
 * Edit custom provider wizard.
 */
async function editCustomProviderWizard(config, cp) {
    try {
        const field = await withEsc(select({
            message: `Edit "${cp.displayName}" (ESC to go back)`,
            choices: [
                { name: `ID: ${cp.id}`, value: "id" },
                { name: `Display Name: ${cp.displayName}`, value: "displayName" },
                { name: `Base URL: ${cp.baseUrl}`, value: "baseUrl" },
                { name: `Models: ${cp.models ? cp.models.map((m) => m.name).join(", ") : "(none)"}`, value: "models" },
                { name: `env: ${cp.env ? "custom" : "default"}`, value: "env" },
            ],
        }, CLEAR));
        const existingIds = new Set((config.customProviders ?? []).filter((p) => p.id !== cp.id).map((p) => p.id));
        let updates = {};
        switch (field) {
            case "id": {
                const newId = await withEsc(input({
                    message: "New ID",
                    default: cp.id,
                    validate: (v) => validateId(v.trim(), existingIds),
                }, CLEAR));
                updates = { id: newId.trim() };
                break;
            }
            case "displayName": {
                const newName = await withEsc(input({
                    message: "New display name",
                    default: cp.displayName,
                    validate: (v) => v.trim().length > 0 || "Cannot be empty",
                }, CLEAR));
                updates = { displayName: newName.trim() };
                break;
            }
            case "baseUrl": {
                const newUrl = await withEsc(input({
                    message: "New base URL",
                    default: cp.baseUrl,
                    validate: (v) => validateBaseUrl(v.trim()),
                }, CLEAR));
                updates = { baseUrl: newUrl.trim() };
                break;
            }
            case "models": {
                const currentModels = cp.models ?? [];
                const action = await withEsc(select({
                    message: `Models: ${currentModels.map((m) => m.name).join(", ") || "(none)"}`,
                    choices: [
                        { name: "+ Add model", value: "add" },
                        ...(currentModels.length > 0 ? [{ name: "- Remove model", value: "remove" }] : []),
                        { name: "↻ Replace all", value: "replace" },
                    ],
                }, CLEAR));
                if (action === "add") {
                    const name = await withEsc(input({
                        message: "Model name",
                        validate: (v) => v.trim().length > 0 || "Cannot be empty",
                    }, CLEAR));
                    const displayName = await withEsc(input({
                        message: "Display name (Enter to skip)",
                    }, CLEAR));
                    const description = await withEsc(input({
                        message: "Description (Enter to skip)",
                    }, CLEAR));
                    const model = { name: name.trim() };
                    if (displayName.trim())
                        model.displayName = displayName.trim();
                    if (description.trim())
                        model.description = description.trim();
                    if (currentModels.length === 0)
                        model.default = true;
                    updates = { models: [...currentModels, model] };
                }
                else if (action === "remove") {
                    const toRemove = await withEsc(select({
                        message: "Select model to remove",
                        choices: currentModels.map((m) => ({
                            name: m.displayName ?? m.name,
                            value: m.name,
                        })),
                    }, CLEAR));
                    const remaining = currentModels.filter((m) => m.name !== toRemove);
                    if (remaining.length === 0) {
                        console.log("  Cannot remove the last model");
                        return null;
                    }
                    // If removed model was default, set first remaining as default
                    if (!remaining.some((m) => m.default)) {
                        remaining[0] = { ...remaining[0], default: true };
                    }
                    updates = { models: remaining };
                }
                else {
                    const models = await promptModels();
                    if (models === null)
                        return null;
                    updates = { models: models.length > 0 ? models : undefined };
                }
                break;
            }
            case "env": {
                const hasModels = (cp.models ?? []).length > 0;
                const env = await promptEnvVars();
                if (env === null)
                    return null;
                updates = { env };
                break;
            }
        }
        const updated = updateCustomProvider(config, cp.id, updates);
        await writeConfig(updated);
        await log("custom-provider-edited", { id: cp.id, field, updates });
        console.log(`✔ Provider updated\n`);
        return updated;
    }
    catch (err) {
        if (isCancelled(err))
            return null;
        throw err;
    }
}
/**
 * Delete a custom provider.
 */
async function deleteCustomProviderFlow(config, cp) {
    try {
        const ok = await withEsc(confirm({
            message: `Delete "${cp.displayName}"? This will also remove the stored API key.`,
            default: false,
        }, CLEAR));
        if (!ok)
            return null;
        let updated = removeCustomProvider(config, cp.id);
        updated = removeProviderApiKey(updated, cp.id);
        await writeConfig(updated);
        await log("custom-provider-deleted", { id: cp.id });
        console.log(`✔ Provider "${cp.displayName}" deleted\n`);
        return updated;
    }
    catch (err) {
        if (isCancelled(err))
            return null;
        throw err;
    }
}
/**
 * Manage custom providers sub-menu.
 */
export async function manageCustomProviders(config) {
    let currentConfig = config;
    while (true) {
        currentConfig = await readConfig();
        const customProviders = currentConfig.customProviders ?? [];
        const choices = [
            { name: "+ Add Provider", value: ADD_KEY },
        ];
        if (customProviders.length > 0) {
            choices.push(new Separator(""));
            for (const cp of customProviders) {
                choices.push({ name: cp.displayName, value: cp.id });
            }
        }
        try {
            const selected = await withEsc(select({
                message: "Manage Custom Providers (ESC to go back)",
                loop: false,
                theme: { keybindings: ["vim"] },
                choices,
            }, CLEAR));
            if (selected === ADD_KEY) {
                const result = await addCustomProviderWizard(currentConfig);
                if (result)
                    currentConfig = result;
                continue;
            }
            // Selected an existing custom provider
            const cp = customProviders.find((p) => p.id === selected);
            if (!cp)
                continue;
            // Show edit/delete menu
            try {
                const action = await withEsc(select({
                    message: `${cp.displayName} (ESC to go back)`,
                    choices: [
                        { name: "✏  Edit", value: "edit" },
                        { name: "🗑  Delete", value: "delete" },
                    ],
                }, CLEAR));
                if (action === "edit") {
                    const result = await editCustomProviderWizard(currentConfig, cp);
                    if (result)
                        currentConfig = result;
                }
                else if (action === "delete") {
                    const result = await deleteCustomProviderFlow(currentConfig, cp);
                    if (result)
                        currentConfig = result;
                }
            }
            catch (err) {
                if (isCancelled(err))
                    continue;
                throw err;
            }
        }
        catch (err) {
            if (isCancelled(err))
                return;
            throw err;
        }
    }
}
