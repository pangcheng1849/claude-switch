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

```bash
npm test             # vitest run
npm run test:watch   # vitest (watch mode)
```

## Architecture

claude-switch modifies the `env` field in `~/.claude/settings.json` to redirect Claude Code to different API providers. It maintains its own config at `~/.claude-switch/config.json` for API key storage.

### Three-file design

- **`~/.claude/settings.json`** (target) — only the `env` field is touched; all other fields (permissions, plugins, etc.) are preserved
- **`~/.claude-switch/config.json`** (self-managed) — stores per-provider API keys, native env backup, enabled MCP tracking, custom provider definitions, historical managed env keys, and `activeProviderId` for accurate provider detection; file mode 0600
- **`~/.claude.json`** (shared with Claude Code) — MCP server configurations are written to the `mcpServers` field; other fields preserved

### Switch algorithm (switcher.ts)

1. Detect current provider: use stored `activeProviderId` if its `baseUrl` matches current `ANTHROPIC_BASE_URL`, otherwise fall back to matching against all known provider base URLs
2. If leaving Claude Native → backup all managed env keys to config
3. Remove **all** managed keys from env (prevents stale cross-provider values)
4. Merge in new provider's `buildEnv()` output
5. If returning to Claude Native → restore from backup
6. Warn if shell env (`ANTHROPIC_AUTH_TOKEN`, `ANTHROPIC_API_KEY`, `ANTHROPIC_BASE_URL`) will override settings

### Provider definition pattern (providers.ts)

Each provider implements `ProviderDefinition` with a `buildEnv(apiKey, model)` method that returns the specific env vars it needs. Providers differ significantly in which env vars they set — e.g., Ark uses `ANTHROPIC_MODEL` while Zhipu maps all three tier variables (`ANTHROPIC_DEFAULT_OPUS/SONNET/HAIKU_MODEL`). The static `MANAGED_ENV_KEYS` array covers built-in provider keys; custom provider keys are tracked dynamically via `getAllManagedEnvKeys(config)`.

### Custom providers

Users can define custom providers via the TUI (`Manage Custom Providers`) or by editing `~/.claude-switch/config.json`. Custom providers are stored in `config.customProviders[]` and merged with built-in providers at runtime via `getAllProviders(config)`. Each custom provider specifies `id`, `displayName`, `baseUrl`, optional `models[]`, and optional `env` (with `{{API_KEY}}`/`{{MODEL}}` placeholders; values can be `string | number`). When `env` is omitted, a default template is used. See `docs/superpowers/specs/2026-04-10-custom-providers-design.md` for details.

### TUI flow (index.ts)

All inquirer prompts are wrapped with `withEsc()` for ESC-to-cancel. The main loop: select provider → input API key (if needed) → select model (multi-model) or confirm (single-model) → switch → exit. The main menu has `⚙ Manage MCP Servers` and `⚙ Manage Custom Providers` entries. Custom provider TUI logic lives in `src/custom-providers.ts`. ESC at any level returns to the previous menu.

**TUI language convention**: All user-facing strings in the TUI (prompts, labels, hints, descriptions) must be in English. This includes MCP display names, descriptions, provider hints, and model descriptions.

## Versioning

Follow [semver](https://semver.org/). Bump version in `package.json` before merging feature branches:

- **patch** (0.x.Y): bug fixes, docs, refactors
- **minor** (0.X.0): new features, non-breaking changes
- **major** (X.0.0): breaking changes to config format or CLI interface

**Always bump the version as part of the PR — do not merge without it.**

## Adding a New Provider

### Built-in (in source code)

1. Add a `ProviderDefinition` to `PROVIDERS` array in `src/providers.ts`
2. Implement `buildEnv(apiKey, model)` with the env vars Claude Code needs
3. Add any new env keys to `MANAGED_ENV_KEYS` — **forgetting this causes stale values on switch**
4. If the provider introduces a new auth env key, also add it to `SHELL_OVERRIDE_KEYS` in `src/switcher.ts` so shell-env overrides are warned about

### Custom (user-defined, no code changes)

1. Run `claude-switch` → `Manage Custom Providers` → `Add Provider` and follow the wizard
2. Or manually add to `~/.claude-switch/config.json` under `customProviders[]`
3. Custom env keys are tracked dynamically — no need to update `MANAGED_ENV_KEYS`
