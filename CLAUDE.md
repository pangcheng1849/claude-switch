# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Run

```bash
npm run build        # TypeScript → dist/
npm start            # Run compiled CLI
npm run dev          # tsc --watch
npm link             # Install globally from local source
claude-switch        # Run global CLI
```

No test framework or linter is configured yet.

## Architecture

claude-switch modifies the `env` field in `~/.claude/settings.json` to redirect Claude Code to different API providers. It maintains its own config at `~/.claude-switch/config.json` for API key storage.

### Two-file design

- **`~/.claude/settings.json`** (target) — only the `env` field is touched; all other fields (permissions, plugins, etc.) are preserved
- **`~/.claude-switch/config.json`** (self-managed) — stores per-provider API keys and native env backup; file mode 0600

### Switch algorithm (switcher.ts)

1. Detect current provider by matching `ANTHROPIC_BASE_URL` against known provider base URLs
2. If leaving Claude Native → backup all managed env keys to config
3. Remove **all** managed keys from env (prevents stale cross-provider values)
4. Merge in new provider's `buildEnv()` output
5. If returning to Claude Native → restore from backup
6. Warn if shell env (`ANTHROPIC_AUTH_TOKEN`, `ANTHROPIC_BASE_URL`) will override settings

### Provider definition pattern (providers.ts)

Each provider implements `ProviderDefinition` with a `buildEnv(apiKey, model)` method that returns the specific env vars it needs. Providers differ significantly in which env vars they set — e.g., Ark uses `ANTHROPIC_MODEL` while Zhipu maps all three tier variables (`ANTHROPIC_DEFAULT_OPUS/SONNET/HAIKU_MODEL`). The `MANAGED_ENV_KEYS` array must include every key any provider writes.

### TUI flow (index.ts)

All inquirer prompts are wrapped with `withEsc()` for ESC-to-cancel. The main loop: select provider → input API key (if needed) → select model (multi-model) or confirm (single-model) → switch → exit. ESC at any level returns to the previous menu.

**TUI language convention**: All user-facing strings in the TUI (prompts, labels, hints, descriptions) must be in English. This includes MCP display names, descriptions, provider hints, and model descriptions.

## Adding a New Provider

1. Add a `ProviderDefinition` to `PROVIDERS` array in `src/providers.ts`
2. Implement `buildEnv(apiKey, model)` with the env vars Claude Code needs
3. Add any new env keys to `MANAGED_ENV_KEYS` — **forgetting this causes stale values on switch**
