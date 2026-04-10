# 自定义 Provider 设计

## 问题

Provider 目前硬编码在 `src/providers.ts` 中。用户想接入自定义代理或新的 API 服务商时，必须 fork 仓库并修改源码。

## 目标

允许用户通过 TUI 或直接编辑配置文件来定义自定义 provider，获得与内置 provider 一致的切换体验。

## 数据模型

自定义 provider 存储在 `~/.claude-switch/config.json` 的 `customProviders` 字段中：

```json
{
  "customProviders": [
    {
      "id": "my-proxy",
      "displayName": "My Proxy",
      "baseUrl": "https://my-proxy.example.com/v1",
      "models": [
        { "name": "gpt-4o", "default": true },
        { "name": "claude-3.5-sonnet" }
      ],
      "envVars": {
        "ANTHROPIC_BASE_URL": "https://my-proxy.example.com/v1",
        "ANTHROPIC_AUTH_TOKEN": "{{API_KEY}}",
        "ANTHROPIC_MODEL": "{{MODEL}}",
        "API_TIMEOUT_MS": "3000000"
      }
    }
  ]
}
```

### 字段说明

| 字段 | 必填 | 说明 |
|------|------|------|
| `id` | 是 | 唯一标识符，用于 CLI quick-switch。不能与内置 provider ID 或保留词（`list`、`help`）冲突。 |
| `displayName` | 是 | TUI 菜单中显示的名称。 |
| `baseUrl` | 是 | API 基础 URL。也用于 `switcher.ts` 中的 provider 检测。 |
| `models` | 是（TUI 添加时至少 1 个） | `{ name, displayName?, description?, default? }` 数组。 |
| `envVars` | 否 | 显式 env 映射，直接写入 `~/.claude/settings.json`。支持 `{{API_KEY}}` 和 `{{MODEL}}` 占位符做运行时替换。 |

### 默认 env 行为

当 `envVars` 省略时，使用默认三件套模板：

```json
{
  "ANTHROPIC_BASE_URL": "<baseUrl>",
  "ANTHROPIC_AUTH_TOKEN": "<apiKey>",
  "ANTHROPIC_MODEL": "<model>"
}
```

### 占位符替换

- `{{API_KEY}}` → 该 provider 已存储的 API Key
- `{{MODEL}}` → 用户选择的模型名称

不含占位符的值原样写入（如 `"API_TIMEOUT_MS": "3000000"`）。

## Provider 统一化

### `getAllProviders()` 函数

在 `providers.ts` 中新增函数，合并内置 `PROVIDERS` 与配置中的自定义 provider，返回统一的 `ProviderDefinition[]`。

自定义 provider 的 `buildEnv()` 根据 `envVars` 配置（或默认模板）进行占位符替换：

```typescript
function buildEnvFromConfig(
  envVars: Record<string, string>,
  apiKey: string,
  model: string,
): Record<string, string | number> {
  const result: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(envVars)) {
    result[key] = value
      .replace(/\{\{API_KEY\}\}/g, apiKey)
      .replace(/\{\{MODEL\}\}/g, model);
  }
  return result;
}
```

### 需要更新的消费方

所有直接引用 `PROVIDERS` 数组的代码改为调用 `getAllProviders()`：

- `src/index.ts` — TUI 主菜单、provider 查找
- `src/cli.ts` — `runList()`、`runQuickSwitch()`、`printHelp()`
- `src/switcher.ts` — `detectActiveProviderFromSettings()`

由于 `getAllProviders()` 需要读取 config（异步），调用方需要在合适的时机传入 config 或调用此函数。

## TUI 设计

### 主菜单

自定义 provider 排在内置 provider 之后、分隔线之前：

```
  Claude (Native)      ● active
  Volcano Ark          ○ not configured
  Zhipu                ○ not configured
  MiniMax              ○ not configured
  My Proxy             ○ not configured        ← 自定义
  ──────────────────
  ⚙  Manage MCP Servers (0/5 active)
  ⚙  Manage Custom Providers                   ← 新入口
```

自定义 provider 使用与内置相同的切换流程（输入 API Key → 选择模型 → 切换）。

### Manage Custom Providers 子菜单

```
  + Add Provider
  ──────────────
  My Proxy                                     ← 已有的自定义 provider
  Another One
```

- 选择已有 provider → 进入编辑/删除子菜单
- ESC → 返回主菜单

### Add Provider 流程

逐步问答：

1. **Provider ID** — 文本输入，校验：无空格，不与内置 ID 或保留词冲突
2. **Display Name** — 文本输入
3. **Base URL** — 文本输入，校验：以 `http://` 或 `https://` 开头
4. **Models** — 循环：添加模型（name、displayName?、description?、default?），或结束
5. **Env Vars** — 选择输入方式：
   - 「Use default (3 vars)」→ 跳过，使用默认模板
   - 「Key-value pairs」→ 逐条输入 key 和 value，循环直到结束
   - 「Paste JSON」→ 粘贴一段 JSON 对象，解析校验
6. **Confirm** — 显示摘要，确认后保存

### Edit Provider

列出所有字段让用户选择要修改哪个，对应字段使用与添加流程相同的输入方式。

### Delete Provider

确认提示 → 从 `customProviders` 移除，同时清理已存的 API Key。

## CLI 兼容

- `claude-switch list` — 输出包含自定义 provider
- `claude-switch <custom-id> [model]` — quick-switch 支持自定义 provider ID
- `claude-switch --help` — 动态列出所有 provider ID（内置 + 自定义）

## 约束

- 内置 provider 不可编辑、不可删除
- 自定义 provider 不支持 MCP 关联（MCP 管理仅限内置 provider）
- 不做 provider 导入/导出/分享
- 自定义 provider 不支持 `apiKeyUrl`，API Key 提示使用通用文案
- `envVars` 的所有 value 必须是 string 类型（加载时校验，不合法则跳过并 warning）
- `ANTHROPIC_BASE_URL` 强制等于 `baseUrl`（确保 provider 检测一致性）

## MANAGED_ENV_KEYS 影响

自定义 provider 可能写入不在当前 `MANAGED_ENV_KEYS` 列表中的 env key。

策略：**动态合并 + 持久化历史 keys**。
- `SwitchConfig` 增加 `managedEnvKeys?: string[]` 字段，记录所有曾经写入过的自定义 env keys
- 每次 `switchProvider` 写入 env 时，将新 keys 追加到 `managedEnvKeys` 并持久化
- 清理时使用的 managed keys = 静态 `MANAGED_ENV_KEYS` ∪ `config.managedEnvKeys` ∪ 当前 `customProviders` 的 keys
- 删除自定义 provider 时不清理 `managedEnvKeys`（保守策略，确保残留 keys 能被清理）
