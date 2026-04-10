import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SwitchConfig } from "../config.js";
import type { ClaudeSettings } from "../settings.js";

// --- Mock dependencies ---

const mockReadConfig = vi.fn<() => Promise<SwitchConfig>>();
const mockWriteConfig = vi.fn<(c: SwitchConfig) => Promise<void>>();

vi.mock("../config.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../config.js")>();
  return {
    ...actual,
    readConfig: (...args: unknown[]) => mockReadConfig(...(args as [])),
    writeConfig: (...args: unknown[]) => mockWriteConfig(...(args as [SwitchConfig])),
  };
});

const mockReadSettings = vi.fn<() => Promise<ClaudeSettings>>();
const mockWriteSettings = vi.fn<(s: ClaudeSettings) => Promise<void>>();
const mockReadMcpServers = vi.fn<() => Promise<Record<string, unknown>>>();
const mockWriteMcpServers = vi.fn<(s: Record<string, unknown>) => Promise<void>>();

vi.mock("../settings.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../settings.js")>();
  return {
    ...actual,
    readSettings: (...args: unknown[]) => mockReadSettings(...(args as [])),
    writeSettings: (...args: unknown[]) => mockWriteSettings(...(args as [ClaudeSettings])),
    readMcpServers: (...args: unknown[]) => mockReadMcpServers(...(args as [])),
    writeMcpServers: (...args: unknown[]) => mockWriteMcpServers(...(args as [Record<string, unknown>])),
  };
});

const mockLog = vi.fn();
vi.mock("../logger.js", () => ({
  log: (...args: unknown[]) => mockLog(...args),
}));

import { parseArgs, printVersion, printHelp, runList, runQuickSwitch } from "../cli.js";

beforeEach(() => {
  vi.clearAllMocks();
  mockWriteConfig.mockResolvedValue(undefined);
  mockWriteSettings.mockResolvedValue(undefined);
  mockWriteMcpServers.mockResolvedValue(undefined);
  mockLog.mockResolvedValue(undefined);
});

// ============================================================
// parseArgs
// ============================================================

describe("parseArgs", () => {
  it("returns null for no arguments (TUI mode)", () => {
    expect(parseArgs(["node", "claude-switch"])).toBeNull();
  });

  it("parses 'list' command", () => {
    expect(parseArgs(["node", "claude-switch", "list"])).toEqual({
      type: "list",
    });
  });

  it("parses provider-only switch command", () => {
    expect(parseArgs(["node", "claude-switch", "ark"])).toEqual({
      type: "switch",
      providerId: "ark",
      model: undefined,
    });
  });

  it("parses provider + model switch command", () => {
    expect(
      parseArgs(["node", "claude-switch", "ark", "doubao-seed-2.0-code"]),
    ).toEqual({
      type: "switch",
      providerId: "ark",
      model: "doubao-seed-2.0-code",
    });
  });

  it("parses 'claude' as provider for switching to native", () => {
    expect(parseArgs(["node", "claude-switch", "claude"])).toEqual({
      type: "switch",
      providerId: "claude",
      model: undefined,
    });
  });

  it("ignores extra arguments beyond model", () => {
    expect(
      parseArgs(["node", "claude-switch", "ark", "doubao-seed-2.0-code", "extra"]),
    ).toEqual({
      type: "switch",
      providerId: "ark",
      model: "doubao-seed-2.0-code",
    });
  });

  it("parses '--help' flag", () => {
    expect(parseArgs(["node", "claude-switch", "--help"])).toEqual({
      type: "help",
    });
  });

  it("parses '-h' flag", () => {
    expect(parseArgs(["node", "claude-switch", "-h"])).toEqual({
      type: "help",
    });
  });

  it("parses '--version' flag", () => {
    expect(parseArgs(["node", "claude-switch", "--version"])).toEqual({
      type: "version",
    });
  });

  it("parses '-v' flag", () => {
    expect(parseArgs(["node", "claude-switch", "-v"])).toEqual({
      type: "version",
    });
  });
});

// ============================================================
// printVersion
// ============================================================

describe("printVersion", () => {
  it("prints version string", () => {
    const logs: string[] = [];
    vi.spyOn(console, "log").mockImplementation((...args) => {
      logs.push(args.join(" "));
    });

    printVersion();

    const output = logs.join("\n");
    expect(output).toMatch(/\d+\.\d+\.\d+/);

    vi.restoreAllMocks();
  });
});

// ============================================================
// printHelp
// ============================================================

describe("printHelp", () => {
  it("prints usage info with available commands", () => {
    const logs: string[] = [];
    vi.spyOn(console, "log").mockImplementation((...args) => {
      logs.push(args.join(" "));
    });

    printHelp();

    const output = logs.join("\n");
    expect(output).toContain("Usage:");
    expect(output).toContain("claude-switch");
    expect(output).toContain("<provider>");
    expect(output).toContain("list");
    expect(output).toContain("--help");

    vi.restoreAllMocks();
  });
});

// ============================================================
// runList
// ============================================================

describe("runList", () => {
  it("lists all providers with status", async () => {
    const logs: string[] = [];
    vi.spyOn(console, "log").mockImplementation((...args) => {
      logs.push(args.join(" "));
    });

    mockReadConfig.mockResolvedValue({
      providers: { ark: { apiKey: "test-key" } },
    });
    mockReadSettings.mockResolvedValue({
      env: {
        ANTHROPIC_BASE_URL: "https://ark.cn-beijing.volces.com/api/coding",
        ANTHROPIC_MODEL: "doubao-seed-2.0-code",
      },
    });

    await runList();

    const output = logs.join("\n");
    // Active provider shows active indicator
    expect(output).toContain("ark");
    expect(output).toContain("active");
    // Configured providers show configured
    // Non-configured providers show not configured
    expect(output).toContain("claude");
    expect(output).toContain("zhipu");

    vi.restoreAllMocks();
  });

  it("shows current model for active provider", async () => {
    const logs: string[] = [];
    vi.spyOn(console, "log").mockImplementation((...args) => {
      logs.push(args.join(" "));
    });

    mockReadConfig.mockResolvedValue({
      providers: { ark: { apiKey: "test-key" } },
    });
    mockReadSettings.mockResolvedValue({
      env: {
        ANTHROPIC_BASE_URL: "https://ark.cn-beijing.volces.com/api/coding",
        ANTHROPIC_MODEL: "doubao-seed-2.0-code",
      },
    });

    await runList();

    const output = logs.join("\n");
    expect(output).toContain("doubao-seed-2.0-code");

    vi.restoreAllMocks();
  });
});

// ============================================================
// runQuickSwitch
// ============================================================

describe("runQuickSwitch", () => {
  it("switches to a provider with saved API key", async () => {
    const logs: string[] = [];
    vi.spyOn(console, "log").mockImplementation((...args) => {
      logs.push(args.join(" "));
    });

    mockReadConfig.mockResolvedValue({
      providers: { ark: { apiKey: "test-key" } },
    });
    mockReadSettings.mockResolvedValue({});
    mockReadMcpServers.mockResolvedValue({});

    const code = await runQuickSwitch("ark", "doubao-seed-2.0-code");

    expect(code).toBe(0);
    expect(mockWriteSettings).toHaveBeenCalled();
    const output = logs.join("\n");
    expect(output).toContain("Switched to");
    expect(output).toContain("Volcano Ark");
    expect(output).toContain("doubao-seed-2.0-code");

    vi.restoreAllMocks();
  });

  it("returns error for unknown provider", async () => {
    const errors: string[] = [];
    vi.spyOn(console, "error").mockImplementation((...args) => {
      errors.push(args.join(" "));
    });
    vi.spyOn(console, "log").mockImplementation(() => {});

    const code = await runQuickSwitch("nonexistent");

    expect(code).toBe(1);
    const output = errors.join("\n");
    expect(output).toContain("nonexistent");

    vi.restoreAllMocks();
  });

  it("returns error when no API key is configured", async () => {
    const errors: string[] = [];
    vi.spyOn(console, "error").mockImplementation((...args) => {
      errors.push(args.join(" "));
    });
    vi.spyOn(console, "log").mockImplementation(() => {});

    mockReadConfig.mockResolvedValue({});

    const code = await runQuickSwitch("ark", "doubao-seed-2.0-code");

    expect(code).toBe(1);
    const output = errors.join("\n");
    expect(output).toContain("API key");
    // Should suggest using TUI
    expect(output).toContain("claude-switch");

    vi.restoreAllMocks();
  });

  it("returns error for invalid model name", async () => {
    const errors: string[] = [];
    vi.spyOn(console, "error").mockImplementation((...args) => {
      errors.push(args.join(" "));
    });
    vi.spyOn(console, "log").mockImplementation(() => {});

    mockReadConfig.mockResolvedValue({
      providers: { ark: { apiKey: "test-key" } },
    });

    const code = await runQuickSwitch("ark", "invalid-model");

    expect(code).toBe(1);
    const output = errors.join("\n");
    expect(output).toContain("invalid-model");
    // Should list valid models
    expect(output).toContain("doubao-seed-2.0-code");

    vi.restoreAllMocks();
  });

  it("switches to claude native without API key", async () => {
    const logs: string[] = [];
    vi.spyOn(console, "log").mockImplementation((...args) => {
      logs.push(args.join(" "));
    });

    mockReadConfig.mockResolvedValue({});
    mockReadSettings.mockResolvedValue({
      env: {
        ANTHROPIC_BASE_URL: "https://ark.cn-beijing.volces.com/api/coding",
        ANTHROPIC_MODEL: "doubao-seed-2.0-code",
      },
    });
    mockReadMcpServers.mockResolvedValue({});

    const code = await runQuickSwitch("claude");

    expect(code).toBe(0);
    const output = logs.join("\n");
    expect(output).toContain("Claude (Native)");

    vi.restoreAllMocks();
  });

  it("uses default model when no model specified", async () => {
    const logs: string[] = [];
    vi.spyOn(console, "log").mockImplementation((...args) => {
      logs.push(args.join(" "));
    });

    mockReadConfig.mockResolvedValue({
      providers: { ark: { apiKey: "test-key" } },
    });
    mockReadSettings.mockResolvedValue({});
    mockReadMcpServers.mockResolvedValue({});

    const code = await runQuickSwitch("ark");

    expect(code).toBe(0);
    // Should use first model (doubao-seed-2.0-code)
    expect(mockWriteSettings).toHaveBeenCalled();
    const output = logs.join("\n");
    expect(output).toContain("doubao-seed-2.0-code");

    vi.restoreAllMocks();
  });

  it("handles single-model provider without explicit model", async () => {
    const logs: string[] = [];
    vi.spyOn(console, "log").mockImplementation((...args) => {
      logs.push(args.join(" "));
    });

    mockReadConfig.mockResolvedValue({
      providers: { minimax: { apiKey: "test-key" } },
    });
    mockReadSettings.mockResolvedValue({});
    mockReadMcpServers.mockResolvedValue({});

    const code = await runQuickSwitch("minimax");

    expect(code).toBe(0);
    const output = logs.join("\n");
    expect(output).toContain("MiniMax-M2.7");

    vi.restoreAllMocks();
  });

  it("quick-switches to a custom provider", async () => {
    const logs: string[] = [];
    vi.spyOn(console, "log").mockImplementation((...args) => {
      logs.push(args.join(" "));
    });

    mockReadConfig.mockResolvedValue({
      providers: { "my-proxy": { apiKey: "proxy-key" } },
      customProviders: [
        {
          id: "my-proxy",
          displayName: "My Proxy",
          baseUrl: "https://proxy.example.com/v1",
          models: [{ name: "model-a", default: true }],
        },
      ],
    });
    mockReadSettings.mockResolvedValue({});
    mockReadMcpServers.mockResolvedValue({});

    const code = await runQuickSwitch("my-proxy", "model-a");

    expect(code).toBe(0);
    const output = logs.join("\n");
    expect(output).toContain("My Proxy");
    expect(output).toContain("model-a");

    vi.restoreAllMocks();
  });

  it("quick-switch skips model validation for custom provider with no models", async () => {
    const logs: string[] = [];
    vi.spyOn(console, "log").mockImplementation((...args) => {
      logs.push(args.join(" "));
    });

    mockReadConfig.mockResolvedValue({
      providers: { "my-proxy": { apiKey: "proxy-key" } },
      customProviders: [
        {
          id: "my-proxy",
          displayName: "My Proxy",
          baseUrl: "https://proxy.example.com/v1",
        },
      ],
    });
    mockReadSettings.mockResolvedValue({});
    mockReadMcpServers.mockResolvedValue({});

    const code = await runQuickSwitch("my-proxy", "any-model");

    expect(code).toBe(0);
    const output = logs.join("\n");
    expect(output).toContain("My Proxy");

    vi.restoreAllMocks();
  });

  it("unknown provider error lists custom provider IDs", async () => {
    const errors: string[] = [];
    vi.spyOn(console, "error").mockImplementation((...args) => {
      errors.push(args.join(" "));
    });
    vi.spyOn(console, "log").mockImplementation(() => {});

    mockReadConfig.mockResolvedValue({
      customProviders: [
        {
          id: "my-proxy",
          displayName: "My Proxy",
          baseUrl: "https://proxy.example.com/v1",
        },
      ],
    });

    const code = await runQuickSwitch("nonexistent");

    expect(code).toBe(1);
    const output = errors.join("\n");
    expect(output).toContain("my-proxy");

    vi.restoreAllMocks();
  });

  it("quick-switch custom provider with no model specified uses default", async () => {
    const logs: string[] = [];
    vi.spyOn(console, "log").mockImplementation((...args) => {
      logs.push(args.join(" "));
    });

    mockReadConfig.mockResolvedValue({
      providers: { "my-proxy": { apiKey: "proxy-key" } },
      customProviders: [
        {
          id: "my-proxy",
          displayName: "My Proxy",
          baseUrl: "https://proxy.example.com/v1",
          models: [
            { name: "model-a", default: true },
            { name: "model-b" },
          ],
        },
      ],
    });
    mockReadSettings.mockResolvedValue({});
    mockReadMcpServers.mockResolvedValue({});

    const code = await runQuickSwitch("my-proxy");

    expect(code).toBe(0);
    const output = logs.join("\n");
    expect(output).toContain("model-a");

    vi.restoreAllMocks();
  });

  it("quick-switch custom provider with invalid model shows error", async () => {
    const errors: string[] = [];
    vi.spyOn(console, "error").mockImplementation((...args) => {
      errors.push(args.join(" "));
    });
    vi.spyOn(console, "log").mockImplementation(() => {});

    mockReadConfig.mockResolvedValue({
      providers: { "my-proxy": { apiKey: "proxy-key" } },
      customProviders: [
        {
          id: "my-proxy",
          displayName: "My Proxy",
          baseUrl: "https://proxy.example.com/v1",
          models: [{ name: "model-a", default: true }],
        },
      ],
    });

    const code = await runQuickSwitch("my-proxy", "bad-model");

    expect(code).toBe(1);
    const output = errors.join("\n");
    expect(output).toContain("bad-model");
    expect(output).toContain("model-a");

    vi.restoreAllMocks();
  });
});

describe("runList with custom providers", () => {
  it("shows custom provider as active when activeProviderId matches", async () => {
    const logs: string[] = [];
    vi.spyOn(console, "log").mockImplementation((...args) => {
      logs.push(args.join(" "));
    });

    mockReadConfig.mockResolvedValue({
      providers: { "my-proxy": { apiKey: "key" } },
      activeProviderId: "my-proxy",
      customProviders: [
        {
          id: "my-proxy",
          displayName: "My Proxy",
          baseUrl: "https://open.bigmodel.cn/api/anthropic", // same as zhipu
          models: [{ name: "custom-model", default: true }],
        },
      ],
    });
    mockReadSettings.mockResolvedValue({
      env: {
        ANTHROPIC_BASE_URL: "https://open.bigmodel.cn/api/anthropic",
        ANTHROPIC_MODEL: "custom-model",
      },
    });

    await runList();

    const output = logs.join("\n");
    // My Proxy should show as active, not Zhipu
    const myProxyLine = logs.find((l) => l.includes("My Proxy"));
    expect(myProxyLine).toContain("active");

    vi.restoreAllMocks();
  });

  it("lists custom providers", async () => {
    const logs: string[] = [];
    vi.spyOn(console, "log").mockImplementation((...args) => {
      logs.push(args.join(" "));
    });

    mockReadConfig.mockResolvedValue({
      customProviders: [
        {
          id: "my-proxy",
          displayName: "My Proxy",
          baseUrl: "https://proxy.example.com/v1",
          models: [{ name: "model-a" }],
        },
      ],
    });
    mockReadSettings.mockResolvedValue({});

    await runList();

    const output = logs.join("\n");
    expect(output).toContain("my-proxy");
    expect(output).toContain("My Proxy");
    expect(output).toContain("model-a");

    vi.restoreAllMocks();
  });
});
