# claude-switch

Interactive TUI tool to switch [Claude Code](https://docs.anthropic.com/en/docs/claude-code) between API providers.

```
? Select Provider (ESC to quit)
❯ Claude (Native)  ● active
  Volcano Ark      ○ not configured
  Zhipu            ✔ configured
  MiniMax          ○ not configured
```

## Features

- Switch Claude Code between multiple API providers with one command
- Per-provider API key management (configure / reconfigure / remove)
- MCP Server management — enable/disable MCP servers across providers
- Model descriptions for Ark models (from official documentation)
- Native env backup & restore when switching away from Claude
- Shell env override detection (`ANTHROPIC_AUTH_TOKEN`, `ANTHROPIC_BASE_URL`)
- ESC key navigation at every menu level
- File-based logging with API key redaction

## Supported Providers

| Provider | Models |
|---|---|
| **Claude (Native)** | Default Anthropic API |
| **Volcano Ark** | doubao-seed-2.0-code, doubao-seed-2.0-pro, deepseek-v3.2, kimi-k2.5, and more |
| **Zhipu** | GLM-4.7, GLM-5.1, GLM-5, GLM-5-Turbo, GLM-4.5-Air |
| **MiniMax** | MiniMax-M2.7 |

## Install

```bash
npm install -g github:pangcheng1849/claude-switch
```

Or clone and link locally:

```bash
git clone https://github.com/pangcheng1849/claude-switch.git
cd claude-switch
npm install && npm run build
npm link
```

Then run:

```bash
claude-switch
```

## How It Works

claude-switch writes provider-specific environment variables to `~/.claude/settings.json` (the `env` field). After switching, restart Claude Code to apply changes.

**Config** is stored at `~/.claude-switch/config.json` (API keys, native env backup).

**Logs** are written to `~/.claude-switch/logs/YYYY-MM-DD.log` with daily rotation and sensitive data redacted.

## Built-in Tool Compatibility

Claude Code has server-side tools (Web Search, Web Fetch, etc.) that rely on Anthropic's infrastructure. When using a third-party provider, these tools may be unavailable or behave differently.

> **Important:** After switching providers, always start a **new Claude Code session**. Reusing the previous session may cause API errors due to tool or parameter incompatibility between providers.

## MCP Server Management

Use the `⚙ Manage MCP Servers` entry in the main menu to enable/disable MCP servers. MCPs are independent of providers — you can use Zhipu's MCP servers while running on Ark's model, as long as you have the corresponding API key configured.

| MCP Server | Provider | Type | Description |
|---|---|---|---|
| zai-mcp-server | Zhipu | stdio/npx | Image analysis, video understanding |
| web-search-prime | Zhipu | http | Web search |
| web-reader | Zhipu | http | Web page reading |
| zread | Zhipu | http | GitHub repo exploration |
| MiniMax | MiniMax | stdio/uvx | Web search + image understanding |

> Zhipu MCPs: Provider already includes these capabilities via API. MCPs serve as fallback.
> MiniMax MCP: Requires [uvx](https://github.com/astral-sh/uv) installed.

## Development

```bash
npm install
npm run build
npm start
```

## License

MIT
