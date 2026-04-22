import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { PROVIDERS, getAllProviders } from "./providers.js";
import { readConfig, getProviderApiKey } from "./config.js";
import {
  detectActiveProviderFromSettings,
  switchProvider,
} from "./switcher.js";
import { readSettings } from "./settings.js";

export type CliCommand =
  | { type: "help" }
  | { type: "version" }
  | { type: "list" }
  | { type: "switch"; providerId: string; model: string | undefined }
  | null;

/**
 * Parse process.argv into a CLI command.
 * Returns null when no arguments are given (fall through to TUI).
 */
export function parseArgs(argv: string[]): CliCommand {
  // argv[0] = node, argv[1] = script
  const args = argv.slice(2);
  if (args.length === 0) return null;

  const command = args[0];

  if (command === "--help" || command === "-h") {
    return { type: "help" };
  }

  if (command === "--version" || command === "-v") {
    return { type: "version" };
  }

  if (command === "list") {
    return { type: "list" };
  }

  return {
    type: "switch",
    providerId: command,
    model: args[1] ?? undefined,
  };
}

function getVersion(): string {
  try {
    const __dirname = dirname(fileURLToPath(import.meta.url));
    const pkg = JSON.parse(readFileSync(join(__dirname, "..", "package.json"), "utf-8"));
    return pkg.version;
  } catch {
    return "unknown";
  }
}

/**
 * Print version string.
 */
export function printVersion(): void {
  console.log(getVersion());
}

/**
 * Print help / usage information.
 */
export function printHelp(): void {
  const version = getVersion();

  const providerIds = PROVIDERS.map((p) => p.id).join(", ");

  console.log(`
claude-switch v${version}

Usage:
  claude-switch                        Interactive TUI
  claude-switch <provider> [model]     Quick switch to a provider/model
  claude-switch list                   List available providers and status
  claude-switch --help, -h             Show this help

Built-in providers: ${providerIds}
Custom providers can be added via the TUI (Manage Custom Providers).

Examples:
  claude-switch ark                    Switch to Ark (default model)
  claude-switch ark kimi-k2.6          Switch to Ark with Kimi K2.6
  claude-switch claude                 Switch back to Claude (Native)
  claude-switch list                   Show all providers and models
`);
}

/**
 * List all providers with their current status.
 */
export async function runList(): Promise<void> {
  const config = await readConfig();
  const settings = await readSettings();
  const allProviders = getAllProviders(config);
  const activeProviderId = detectActiveProviderFromSettings(settings, allProviders, config.activeProviderId);
  const env = settings.env ?? {};
  const activeModel =
    typeof env.ANTHROPIC_MODEL === "string"
      ? env.ANTHROPIC_MODEL
      : typeof env.ANTHROPIC_DEFAULT_OPUS_MODEL === "string"
        ? env.ANTHROPIC_DEFAULT_OPUS_MODEL
        : undefined;

  console.log("\nAvailable providers:\n");

  for (const provider of allProviders) {
    const isActive = provider.id === activeProviderId;
    const hasKey = provider.id === "claude" || !!getProviderApiKey(config, provider.id);

    let status: string;
    if (isActive) {
      status = activeModel && provider.id !== "claude"
        ? `● active (${activeModel})`
        : "● active";
    } else if (hasKey) {
      status = "✔ configured";
    } else {
      status = "○ not configured";
    }

    const id = provider.id.padEnd(10);
    console.log(`  ${id} ${provider.displayName}  ${status}`);

    if (provider.models.length > 0) {
      const modelNames = provider.models.map((m) => m.name).join(", ");
      console.log(`${"".padEnd(13)}models: ${modelNames}`);
    }
  }

  console.log("");
}

/**
 * Quick-switch to a provider/model without interactive prompts.
 * Returns exit code (0 = success, 1 = error).
 */
export async function runQuickSwitch(
  providerId: string,
  model?: string,
): Promise<number> {
  // Find provider (built-in + custom)
  const config = await readConfig();
  const allProviders = getAllProviders(config);
  const provider = allProviders.find((p) => p.id === providerId);
  if (!provider) {
    const validIds = allProviders.map((p) => p.id).join(", ");
    console.error(`Error: Unknown provider "${providerId}". Valid providers: ${validIds}`);
    return 1;
  }

  // Claude native doesn't need API key or model
  if (provider.id === "claude") {
    const result = await switchProvider(provider, "", "");
    console.log(`\n✔ Switched to ${provider.displayName}`);
    for (const w of result.warnings) console.log(w);
    if (result.cleanedMcps.length > 0) {
      console.log(`  ✔ Removed ${result.cleanedMcps.length} managed MCP server(s): ${result.cleanedMcps.join(", ")}`);
    }
    console.log("  Please restart Claude Code to apply");
    return 0;
  }

  // Check API key
  const apiKey = getProviderApiKey(config, provider.id);
  if (!apiKey) {
    console.error(
      `Error: No API key configured for ${provider.displayName}. Run \`claude-switch\` to configure it interactively.`,
    );
    return 1;
  }

  // Resolve model
  let resolvedModel = model;
  if (!resolvedModel) {
    const defaultModel = provider.models.find((m) => m.default);
    resolvedModel = defaultModel?.name ?? provider.models[0]?.name ?? "";
  } else if (provider.models.length > 0) {
    // Validate model exists (skip for providers with no model list)
    const validModel = provider.models.find((m) => m.name === resolvedModel);
    if (!validModel) {
      const validNames = provider.models.map((m) => m.name).join(", ");
      console.error(
        `Error: Unknown model "${resolvedModel}" for ${provider.displayName}. Valid models: ${validNames}`,
      );
      return 1;
    }
  }

  // Perform switch
  const result = await switchProvider(provider, resolvedModel, apiKey);

  const target = resolvedModel
    ? `${provider.displayName} / ${resolvedModel}`
    : provider.displayName;
  console.log(`\n✔ Switched to ${target}`);
  for (const w of result.warnings) console.log(w);
  if (result.cleanedMcps.length > 0) {
    console.log(`  ✔ Removed ${result.cleanedMcps.length} managed MCP server(s): ${result.cleanedMcps.join(", ")}`);
  }
  console.log("  Please restart Claude Code to apply");

  return 0;
}
