import { input, select, confirm, editor, Separator } from "@inquirer/prompts";
import { CancelPromptError, ExitPromptError } from "@inquirer/core";
import { PROVIDERS } from "./providers.js";
import { readConfig, writeConfig, addCustomProvider, updateCustomProvider, removeCustomProvider, removeProviderApiKey, } from "./config.js";
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
 * Prompt for env vars.
 */
async function promptEnvVars() {
    try {
        const method = await withEsc(select({
            message: "Env vars configuration",
            choices: [
                { name: "Use default (BASE_URL + AUTH_TOKEN + MODEL)", value: "default" },
                { name: "Define key-value pairs", value: "kv" },
                { name: "Paste JSON", value: "json" },
            ],
        }, CLEAR));
        if (method === "default")
            return undefined;
        if (method === "json") {
            const raw = await withEsc(editor({
                message: "Paste env vars JSON (use {{API_KEY}} and {{MODEL}} as placeholders)",
                default: JSON.stringify({ ANTHROPIC_BASE_URL: "", ANTHROPIC_AUTH_TOKEN: "{{API_KEY}}", ANTHROPIC_MODEL: "{{MODEL}}" }, null, 2),
            }));
            try {
                const parsed = JSON.parse(raw);
                if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
                    console.log("  Error: must be a JSON object");
                    return null;
                }
                // Validate all values are strings
                for (const [key, value] of Object.entries(parsed)) {
                    if (typeof value !== "string") {
                        console.log(`  Error: value for "${key}" must be a string, got ${typeof value}`);
                        return null;
                    }
                }
                return parsed;
            }
            catch {
                console.log("  Error: invalid JSON");
                return null;
            }
        }
        // Key-value pairs
        const envVars = {};
        while (true) {
            const addMore = await withEsc(confirm({
                message: Object.keys(envVars).length === 0
                    ? "Add an env var?"
                    : "Add another env var?",
                default: true,
            }, CLEAR));
            if (!addMore)
                break;
            const key = await withEsc(input({
                message: "Env var key (e.g. ANTHROPIC_MODEL)",
                validate: (v) => v.trim().length > 0 || "Cannot be empty",
            }, CLEAR));
            const value = await withEsc(input({
                message: `Value for ${key.trim()} (use {{API_KEY}} / {{MODEL}} for placeholders)`,
            }, CLEAR));
            envVars[key.trim()] = value;
        }
        return Object.keys(envVars).length > 0 ? envVars : undefined;
    }
    catch (err) {
        if (isCancelled(err))
            return null;
        throw err;
    }
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
        // 3. Base URL
        const baseUrl = await withEsc(input({
            message: "API base URL",
            validate: (v) => validateBaseUrl(v.trim()),
        }, CLEAR));
        // 4. Models
        const models = await promptModels();
        if (models === null)
            return null;
        // 5. Env Vars
        const envVars = await promptEnvVars();
        if (envVars === null)
            return null;
        // 6. Summary
        const cp = {
            id: id.trim(),
            displayName: displayName.trim(),
            baseUrl: baseUrl.trim(),
        };
        if (models.length > 0)
            cp.models = models;
        if (envVars)
            cp.envVars = envVars;
        console.log("\n  Provider summary:");
        console.log(`    ID:       ${cp.id}`);
        console.log(`    Name:     ${cp.displayName}`);
        console.log(`    Base URL: ${cp.baseUrl}`);
        console.log(`    Models:   ${models.length > 0 ? models.map((m) => m.name).join(", ") : "(none)"}`);
        console.log(`    Env Vars: ${envVars ? "custom" : "default"}`);
        console.log("");
        const ok = await withEsc(confirm({ message: "Save this provider?", default: true }, CLEAR));
        if (!ok)
            return null;
        const updated = addCustomProvider(config, cp);
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
                { name: `Env Vars: ${cp.envVars ? "custom" : "default"}`, value: "envVars" },
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
                const models = await promptModels();
                if (models === null)
                    return null;
                updates = { models: models.length > 0 ? models : undefined };
                break;
            }
            case "envVars": {
                const hasModels = (cp.models ?? []).length > 0;
                const envVars = await promptEnvVars();
                if (envVars === null)
                    return null;
                updates = { envVars };
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
