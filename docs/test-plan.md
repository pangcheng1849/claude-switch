# claude-switch Test Plan

Comprehensive test coverage for all modules. Grouped by source file.

---

## Current Coverage Summary

| Module | Existing Tests | Coverage Gaps |
|--------|---------------|---------------|
| `providers.ts` | Unique IDs, unique base URLs, unique model names, buildEnv per-provider, getProvider | No significant gaps |
| `mcps.ts` | Valid provider refs, unique IDs, buildConfig per-MCP type | No significant gaps |
| `config.ts` | getProviderApiKey, setProviderApiKey, removeProviderApiKey (pure functions only) | readConfig, writeConfig (file I/O) |
| `settings.ts` | **None** | readSettings, writeSettings, readMcpServers, writeMcpServers |
| `switcher.ts` | **None** | detectActiveProviderFromSettings, detectActiveProvider, detectActiveModel, getActiveBaseUrl, switchProvider, checkShellOverrides, cleanupManagedMcps |
| `logger.ts` | **None** | log function |
| `index.ts` | **None** | TUI integration (low priority, heavily interactive) |

---

## 1. Module: `settings.ts`

All functions do file I/O against `~/.claude/settings.json` and `~/.claude.json`. Tests must mock `node:fs/promises` (readFile, writeFile, mkdir) to avoid touching the real filesystem.

### 1.1 `readSettings()`

**Mock:** `readFile` from `node:fs/promises`

| # | Test name | Behavior verified | Key assertions |
|---|-----------|-------------------|----------------|
| 1 | `it("returns empty object when settings.json does not exist")` | ENOENT handling | Returns `{}` |
| 2 | `it("parses valid JSON from settings.json")` | Normal read path | Returns parsed object with env, permissions, etc. |
| 3 | `it("throws descriptive error on invalid JSON")` | Corrupt file handling | Error message contains file path and "invalid JSON" |
| 4 | `it("re-throws non-ENOENT filesystem errors")` | Permission denied, etc. | Throws the original error (e.g., EACCES) |
| 5 | `it("reads from ~/.claude/settings.json specifically")` | Correct file path | readFile called with correct absolute path |

### 1.2 `writeSettings()`

**Mock:** `writeFile`, `mkdir` from `node:fs/promises`

| # | Test name | Behavior verified | Key assertions |
|---|-----------|-------------------|----------------|
| 1 | `it("creates parent directory with recursive flag")` | mkdir behavior | `mkdir` called with `~/.claude` and `{ recursive: true }` |
| 2 | `it("writes JSON with 2-space indentation and trailing newline")` | Output format | Written content ends with `\n`, is valid JSON with 2-space indent |
| 3 | `it("writes with mode 0o600")` | File permissions | writeFile options include `mode: 0o600` |
| 4 | `it("preserves all fields in the settings object")` | No data loss | Given `{ env: {...}, permissions: {...}, foo: 1 }`, all fields appear in written JSON |
| 5 | `it("omits env field when it is undefined")` | Clean output | `JSON.parse(written)` reflects undefined env correctly |

### 1.3 `readMcpServers()`

**Mock:** `readFile` from `node:fs/promises` (via readClaudeJson)

| # | Test name | Behavior verified | Key assertions |
|---|-----------|-------------------|----------------|
| 1 | `it("returns empty object when ~/.claude.json does not exist")` | ENOENT handling | Returns `{}` |
| 2 | `it("returns empty object when mcpServers key is missing")` | Missing key fallback | Given `{ otherKey: 1 }`, returns `{}` |
| 3 | `it("returns mcpServers map from ~/.claude.json")` | Normal read | Returns the mcpServers record as-is |
| 4 | `it("throws on invalid JSON in ~/.claude.json")` | Corrupt file | Error message contains file path |
| 5 | `it("re-throws non-ENOENT errors")` | Permission errors | Original error propagated |

### 1.4 `writeMcpServers()`

**Mock:** `readFile`, `writeFile` from `node:fs/promises`

| # | Test name | Behavior verified | Key assertions |
|---|-----------|-------------------|----------------|
| 1 | `it("merges mcpServers into existing ~/.claude.json data")` | Read-modify-write | Existing keys (e.g., `projects`) preserved, `mcpServers` updated |
| 2 | `it("removes mcpServers key when passed empty object")` | Cleanup semantics | Written JSON has `mcpServers: undefined` (key absent) |
| 3 | `it("creates ~/.claude.json with mcpServers when file does not exist")` | ENOENT on read + write | File created with `{ mcpServers: { ... } }` |
| 4 | `it("writes with mode 0o600")` | Permissions | writeFile options include `mode: 0o600` |

---

## 2. Module: `config.ts`

### 2.1 `readConfig()` (file I/O -- not yet tested)

**Mock:** `readFile` from `node:fs/promises`

| # | Test name | Behavior verified | Key assertions |
|---|-----------|-------------------|----------------|
| 1 | `it("returns empty object when config.json does not exist")` | ENOENT handling | Returns `{}` |
| 2 | `it("parses valid config JSON")` | Normal path | Returns SwitchConfig with providers, nativeEnvBackup, etc. |
| 3 | `it("re-throws non-ENOENT errors")` | Error propagation | Original error thrown |
| 4 | `it("throws on malformed JSON")` | JSON.parse failure | SyntaxError thrown |

### 2.2 `writeConfig()` (file I/O -- not yet tested)

**Mock:** `writeFile`, `mkdir` from `node:fs/promises`

| # | Test name | Behavior verified | Key assertions |
|---|-----------|-------------------|----------------|
| 1 | `it("creates ~/.claude-switch directory recursively")` | mkdir | Called with correct path and `{ recursive: true }` |
| 2 | `it("writes JSON with trailing newline and mode 0o600")` | Format + permissions | Content ends with `\n`, mode is `0o600` |
| 3 | `it("serializes all config fields")` | Complete serialization | nativeEnvBackup, providers, enabledMcps all present in output |

---

## 3. Module: `switcher.ts`

This is the most critical module. Contains core switching logic, backup/restore, MCP cleanup, and shell override detection.

### 3.1 `detectActiveProviderFromSettings()` (pure function)

No mocking needed.

| # | Test name | Behavior verified | Key assertions |
|---|-----------|-------------------|----------------|
| 1 | `it("returns 'claude' when env is undefined")` | No env at all | Returns `"claude"` |
| 2 | `it("returns 'claude' when env is empty object")` | Empty env | Returns `"claude"` |
| 3 | `it("returns 'claude' when ANTHROPIC_BASE_URL is not set")` | No base URL | Returns `"claude"` |
| 4 | `it("returns 'claude' when ANTHROPIC_BASE_URL is empty string")` | Empty string URL | Returns `"claude"` |
| 5 | `it("returns 'ark' when ANTHROPIC_BASE_URL matches Ark")` | Ark detection | Returns `"ark"` |
| 6 | `it("returns 'zhipu' when ANTHROPIC_BASE_URL matches Zhipu")` | Zhipu detection | Returns `"zhipu"` |
| 7 | `it("returns 'minimax' when ANTHROPIC_BASE_URL matches MiniMax")` | MiniMax detection | Returns `"minimax"` |
| 8 | `it("returns 'unknown' when ANTHROPIC_BASE_URL does not match any provider")` | Unknown provider | Returns `"unknown"` |
| 9 | `it("does not match 'claude' provider even if baseUrl is empty string")` | Claude has baseUrl "" | Claude provider is skipped in the loop |

### 3.2 `detectActiveProvider()` (async, reads settings)

**Mock:** `readSettings` from `./settings.js`

| # | Test name | Behavior verified | Key assertions |
|---|-----------|-------------------|----------------|
| 1 | `it("delegates to readSettings and detectActiveProviderFromSettings")` | Composition | Returns correct provider ID based on mocked settings |

### 3.3 `detectActiveModel()` (async, reads settings)

**Mock:** `readSettings` from `./settings.js`

| # | Test name | Behavior verified | Key assertions |
|---|-----------|-------------------|----------------|
| 1 | `it("returns ANTHROPIC_MODEL when set")` | Primary model key | Returns the model string |
| 2 | `it("falls back to ANTHROPIC_DEFAULT_OPUS_MODEL when ANTHROPIC_MODEL is absent")` | Fallback logic | Returns opus model string |
| 3 | `it("returns undefined when neither model key is set")` | No model | Returns `undefined` |
| 4 | `it("returns undefined when env is empty")` | Empty env | Returns `undefined` |
| 5 | `it("returns undefined when model value is not a string (e.g., number)")` | Type guard | Returns `undefined` |

### 3.4 `getActiveBaseUrl()` (async, reads settings)

**Mock:** `readSettings` from `./settings.js`

| # | Test name | Behavior verified | Key assertions |
|---|-----------|-------------------|----------------|
| 1 | `it("returns ANTHROPIC_BASE_URL when set")` | Normal | Returns the URL |
| 2 | `it("returns undefined when not set")` | Missing | Returns `undefined` |
| 3 | `it("returns undefined when value is not a string")` | Type guard | Returns `undefined` |

### 3.5 `checkShellOverrides()` (pure, reads process.env)

**Mock/setup:** Temporarily set/unset `process.env` keys

| # | Test name | Behavior verified | Key assertions |
|---|-----------|-------------------|----------------|
| 1 | `it("returns empty array when no shell overrides exist")` | Clean environment | Returns `[]` |
| 2 | `it("returns warning for ANTHROPIC_AUTH_TOKEN in shell env")` | Token override | Array contains warning string mentioning `ANTHROPIC_AUTH_TOKEN` |
| 3 | `it("returns warning for ANTHROPIC_BASE_URL in shell env")` | URL override | Array contains warning string mentioning `ANTHROPIC_BASE_URL` |
| 4 | `it("returns two warnings when both keys are set")` | Both overrides | Array length is 2 |
| 5 | `it("does not warn about other env vars like ANTHROPIC_MODEL")` | Only checks specific keys | Returns `[]` even with ANTHROPIC_MODEL set |

### 3.6 `switchProvider()` -- Core switching logic

**Mock:** `readConfig`, `writeConfig` from `./config.js`; `readSettings`, `writeSettings`, `readMcpServers`, `writeMcpServers` from `./settings.js`; `log` from `./logger.js`; `process.env` for shell override checks.

#### 3.6.1 Basic switching

| # | Test name | Behavior verified | Key assertions |
|---|-----------|-------------------|----------------|
| 1 | `it("switches from Claude native to Ark with correct env vars")` | Native-to-third-party | writeSettings called with Ark env vars (BASE_URL, AUTH_TOKEN, MODEL) |
| 2 | `it("switches from Ark to Zhipu, cleaning old env vars")` | Third-party-to-third-party | Old Ark keys removed, Zhipu keys set (tier variables, no ANTHROPIC_MODEL) |
| 3 | `it("switches from Zhipu back to Claude native")` | Third-party-to-native | All managed keys removed from env |
| 4 | `it("preserves non-managed env keys during switch")` | User custom env | If settings.env has `MY_CUSTOM_VAR`, it remains after switch |

#### 3.6.2 Native env backup/restore

| # | Test name | Behavior verified | Key assertions |
|---|-----------|-------------------|----------------|
| 5 | `it("backs up native env keys when switching FROM Claude native")` | Backup on departure | writeConfig called with nativeEnvBackup containing managed keys that were in env |
| 6 | `it("does NOT backup when switching between two third-party providers")` | No backup on third-party-to-third-party | writeConfig not called with nativeEnvBackup update |
| 7 | `it("does NOT backup when switching from 'unknown' provider")` | Unknown is not native | No backup created |
| 8 | `it("restores native env backup when switching TO Claude native")` | Restore on return | Backed-up keys merged into env |
| 9 | `it("clears nativeEnvBackup from config after restore")` | Cleanup after restore | writeConfig called with `nativeEnvBackup: undefined` |
| 10 | `it("handles missing nativeEnvBackup gracefully when returning to native")` | No backup to restore | No error, env is clean |

#### 3.6.3 Env cleanup

| # | Test name | Behavior verified | Key assertions |
|---|-----------|-------------------|----------------|
| 11 | `it("removes all MANAGED_ENV_KEYS before applying new provider env")` | Stale key prevention | Keys like ANTHROPIC_MODEL, API_TIMEOUT_MS etc. from old provider are gone |
| 12 | `it("sets env to undefined when resulting env is empty")` | Clean settings | writeSettings called with `env: undefined` when no keys remain |

#### 3.6.4 MCP cleanup on native return

| # | Test name | Behavior verified | Key assertions |
|---|-----------|-------------------|----------------|
| 13 | `it("calls cleanupManagedMcps when switching to Claude native")` | MCP cleanup triggered | cleanupManagedMcps called |
| 14 | `it("does NOT call cleanupManagedMcps when switching to a third-party provider")` | No cleanup on non-native | cleanupManagedMcps not called |
| 15 | `it("returns cleaned MCP IDs in result")` | Return value | result.cleanedMcps contains the removed MCP IDs |

#### 3.6.5 Shell override warnings

| # | Test name | Behavior verified | Key assertions |
|---|-----------|-------------------|----------------|
| 16 | `it("returns shell override warnings in result")` | Warning passthrough | result.warnings contains expected warning strings |

#### 3.6.6 Logging

| # | Test name | Behavior verified | Key assertions |
|---|-----------|-------------------|----------------|
| 17 | `it("logs switch event with from/to provider and model")` | Audit trail | log called with "switch" event |
| 18 | `it("redacts API key in log, keeping first 4 and last 4 chars")` | Security | Logged ANTHROPIC_AUTH_TOKEN is `xxxx****yyyy` format |
| 19 | `it("redacts short API keys (<=8 chars) as ****")` | Short key edge case | Logged token is `"****"` |

### 3.7 `cleanupManagedMcps()`

**Mock:** `readMcpServers`, `writeMcpServers` from `./settings.js`; `writeConfig` from `./config.js`; `log` from `./logger.js`

| # | Test name | Behavior verified | Key assertions |
|---|-----------|-------------------|----------------|
| 1 | `it("returns empty array when enabledMcps is undefined")` | No MCPs tracked | Returns `[]`, no writeMcpServers call |
| 2 | `it("returns empty array when enabledMcps is empty array")` | Empty list | Returns `[]` |
| 3 | `it("removes only MCPs listed in enabledMcps from mcpServers")` | Selective removal | User-configured MCPs (not in enabledMcps) preserved |
| 4 | `it("skips MCPs in enabledMcps that are not present in mcpServers")` | Idempotent | No error; only actually-present ones removed |
| 5 | `it("writes updated mcpServers after removal")` | Persistence | writeMcpServers called with reduced map |
| 6 | `it("clears enabledMcps from config after cleanup")` | Config cleanup | writeConfig called with `enabledMcps: undefined` |
| 7 | `it("logs mcp-cleanup event with removed IDs")` | Audit trail | log called with correct event and detail |
| 8 | `it("does not call writeMcpServers when no MCPs were actually removed")` | No-op optimization | If enabledMcps has IDs but none exist in mcpServers, writeMcpServers not called |

---

## 4. Module: `logger.ts`

**Mock:** `appendFile`, `mkdir` from `node:fs/promises`

| # | Test name | Behavior verified | Key assertions |
|---|-----------|-------------------|----------------|
| 1 | `it("creates log directory recursively")` | mkdir | Called with `~/.claude-switch/logs` and `{ recursive: true }` |
| 2 | `it("writes log entry with ISO timestamp and event name")` | Basic format | Entry matches `[YYYY-MM-DDTHH:mm:ss.sssZ] eventName\n` |
| 3 | `it("appends JSON detail when provided")` | Detail serialization | Entry contains `JSON.stringify(detail)` |
| 4 | `it("omits detail section when not provided")` | No detail | Entry is just timestamp + event + newline |
| 5 | `it("uses date-based log filename (YYYY-MM-DD.log)")` | File naming | appendFile path ends with correct date string |
| 6 | `it("writes with mode 0o600")` | Permissions | appendFile options include `mode: 0o600` |

---

## 5. Module: `providers.ts` (supplement to existing tests)

Existing coverage is solid. A few additional edge cases:

| # | Test name | Behavior verified | Key assertions |
|---|-----------|-------------------|----------------|
| 1 | `it("Claude provider has empty baseUrl")` | Special-case design | `claude.baseUrl === ""` |
| 2 | `it("Claude provider has no models")` | Native provider | `claude.models.length === 0` |
| 3 | `it("all non-Claude providers have non-empty baseUrl")` | Constraint | Every non-claude provider has `baseUrl.length > 0` |
| 4 | `it("all non-Claude providers have at least one model")` | Constraint | Every non-claude provider has `models.length >= 1` |
| 5 | `it("all non-Claude providers have apiKeyUrl set")` | Constraint | `apiKeyUrl.length > 0` |
| 6 | `it("MANAGED_ENV_KEYS includes ANTHROPIC_BASE_URL and ANTHROPIC_AUTH_TOKEN")` | Critical keys | Both present in the array |

---

## 6. Module: `mcps.ts` (supplement to existing tests)

Existing coverage is solid. Additional cases:

| # | Test name | Behavior verified | Key assertions |
|---|-----------|-------------------|----------------|
| 1 | `it("all MCPs have non-empty displayName and description")` | Data completeness | Strings are non-empty |
| 2 | `it("web-reader buildConfig returns correct URL and auth header")` | Untested MCP | Specific assertions for web-reader |
| 3 | `it("zread buildConfig returns correct URL and auth header")` | Untested MCP | Specific assertions for zread |
| 4 | `it("MCP_PROVIDER_BUILTIN has entries only for providers that have MCPs")` | Consistency | Every key in MCP_PROVIDER_BUILTIN has at least one MCP in MCP_REGISTRY |

---

## 7. Module: `index.ts` (TUI Integration)

The TUI module is heavily interactive (inquirer prompts). Full automated testing is impractical. The following can be tested by extracting or mocking:

### 7.1 `refreshMcpsForProvider()` (internal helper, can be tested if exported or extracted)

**Mock:** `readMcpServers`, `writeMcpServers` from `./settings.js`; `writeConfig` from `./config.js`; `log` from `./logger.js`

| # | Test name | Behavior verified | Key assertions |
|---|-----------|-------------------|----------------|
| 1 | `it("rebuilds enabled MCPs with new API key")` | Key rotation | writeMcpServers called with rebuilt configs using new key |
| 2 | `it("removes MCPs when apiKey is null (key deleted)")` | Key removal cascade | MCPs deleted from mcpServers, removed from enabledMcps |
| 3 | `it("does nothing when provider has no MCPs in registry")` | No-op | Returns config unchanged |
| 4 | `it("only affects MCPs that are currently in mcpServers")` | Selective rebuild | MCPs not currently enabled are not added |
| 5 | `it("preserves non-provider MCPs in mcpServers")` | Isolation | Other provider MCPs untouched |
| 6 | `it("clears enabledMcps for removed provider MCPs")` | Config sync | enabledMcps updated to exclude removed IDs |

### 7.2 `printSwitchResult()` (output formatting, low priority)

Could be tested by capturing console.log, but low value.

### 7.3 `isCancelled()` and `withEsc()` (TUI utilities)

| # | Test name | Behavior verified | Key assertions |
|---|-----------|-------------------|----------------|
| 1 | `it("isCancelled returns true for CancelPromptError")` | Error classification | Returns `true` |
| 2 | `it("isCancelled returns true for ExitPromptError")` | Error classification | Returns `true` |
| 3 | `it("isCancelled returns false for other errors")` | Negative case | Returns `false` |

---

## 8. Integration Scenarios

These tests exercise multiple modules together, using a mocked filesystem layer.

**Mock:** All file I/O (`readFile`, `writeFile`, `mkdir`, `appendFile`); `process.env`

| # | Test name | Modules exercised | Behavior verified |
|---|-----------|-------------------|-------------------|
| 1 | `it("full round-trip: native -> Ark -> native preserves original env")` | switcher, settings, config | Switch to Ark, switch back; original env vars restored exactly |
| 2 | `it("full round-trip: native -> Zhipu -> Ark removes Zhipu-specific keys")` | switcher, settings, providers | After Zhipu->Ark, no API_TIMEOUT_MS or tier variables remain (only Ark keys) |
| 3 | `it("switching to same provider/model is idempotent")` | switcher | No errors, env unchanged |
| 4 | `it("MCP lifecycle: enable MCP -> switch away -> switch back cleans up")` | switcher, settings, config, mcps | MCPs removed from claude.json when returning to native |
| 5 | `it("API key stored in config is used correctly by switchProvider")` | config, switcher, providers | Key from config flows through to buildEnv output |
| 6 | `it("settings.json non-env fields preserved across multiple switches")` | settings, switcher | permissions, plugins, etc. survive switch cycles |

---

## 9. Testing Strategy Notes

### Mocking approach
- Use `vi.mock("node:fs/promises")` for all file I/O tests
- Use `vi.mock("./settings.js")`, `vi.mock("./config.js")`, `vi.mock("./logger.js")` for unit tests of switcher
- Use `vi.spyOn(process, "env", "get")` or direct assignment + cleanup for shell env tests

### Test isolation
- Each test must restore `process.env` changes in `afterEach`
- Mock filesystem state should be reset between tests

### Priority order for implementation
1. **`switcher.ts`** -- highest risk, most complex logic, zero current coverage
2. **`settings.ts`** -- file I/O layer, zero current coverage
3. **`config.ts` file I/O** -- readConfig/writeConfig gap
4. **`logger.ts`** -- simple but untested
5. **Integration scenarios** -- validate module interactions
6. **`index.ts` helpers** -- only if extracted from TUI
7. **Provider/MCP supplements** -- existing coverage is already good
