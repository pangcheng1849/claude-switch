# 自定义 Provider 实现计划

## 背景

Provider 硬编码在 `src/providers.ts`，用户无法自行添加。本次改动让用户通过 TUI 或编辑 config 文件定义自定义 provider，获得与内置 provider 一致的切换体验。

设计文档：`docs/superpowers/specs/2026-04-10-custom-providers-design.md`

---

## Phase 1: 数据模型层

### Step 1.1: 扩展 config 数据结构

**测试** `src/__tests__/config.test.ts`：
- `customProviders` 数组在 `readConfig`/`writeConfig` 中正确序列化和反序列化
- CRUD helper 函数：`addCustomProvider`、`updateCustomProvider`、`removeCustomProvider`、`getCustomProvider`

**改动** `src/config.ts`：
- `SwitchConfig` 增加 `customProviders?: CustomProviderConfig[]`（引用 `providers.ts` 定义的类型）
- 添加 CRUD helper 函数

### Step 1.2: 新增类型和动态解析函数

**测试** `src/__tests__/providers.test.ts`：
- `buildCustomProviderDefinition(def)` 正确转换自定义 provider 为 `ProviderDefinition`：
  - 无 `env` 时 `buildEnv` 生成默认三件套
  - 有 `env` 时 `{{API_KEY}}` 和 `{{MODEL}}` 占位符被替换
  - 无 `models` 时 `models` 为 `[]`
- `getAllProviders(config)` 合并内置 + 自定义，ID 冲突时打 warning 并跳过自定义
- `getAllManagedEnvKeys(config)` 动态合并自定义 provider 的 env keys

**改动** `src/providers.ts`：
- 新增 `CustomProviderConfig` 接口：`{ id, displayName, baseUrl, models?, env? }`
- `apiKeyUrl` 改为可选（自定义 provider 不需要）
- 新增 `buildCustomProviderDefinition(def)` — 转换函数
- 新增 `getAllProviders(config)` — 合并内置 + 自定义
- 新增 `getAllManagedEnvKeys(config)` — 动态 env keys
- `PROVIDERS` 和 `MANAGED_ENV_KEYS` 保持不变（作为内置常量）

---

## Phase 2: Switcher 层

### Step 2.1: 参数化 provider 列表和 managed keys

**测试** `src/__tests__/switcher.test.ts`：
- `detectActiveProviderFromSettings` 传入包含自定义 provider 的列表时能正确识别
- 切换到自定义 provider 写入正确的 env vars
- 从自定义 provider 切走时清理所有 env keys（包括自定义的 key）

**改动** `src/switcher.ts`：
- `detectActiveProviderFromSettings(settings, providers?)` — 增加可选 `providers` 参数，默认 `PROVIDERS`
- `cleanManagedKeys(env, managedKeys?)` — 增加可选 `managedKeys` 参数
- `backupNativeEnv(config, env, managedKeys?)` — 同上
- `switchProvider` 内部：读 config → `getAllProviders(config)` → `getAllManagedEnvKeys(config)` → 传入上述函数
- `detectActiveProvider()` 同样更新

---

## Phase 3: CLI 层

### Step 3.1: list/quick-switch/help 支持自定义 provider

**测试** `src/__tests__/cli.test.ts`：
- `runList` 输出包含自定义 provider
- `runQuickSwitch` 支持自定义 provider ID
- 无 models 的自定义 provider：跳过 model 验证

**改动** `src/cli.ts`：
- `runList()`、`runQuickSwitch()` 用 `getAllProviders(config)` 替换 `PROVIDERS`
- `printHelp()` 保持同步，加一行说明自定义 provider 可通过 TUI 添加
- 无 models 的 provider：`runQuickSwitch` 跳过 model 验证，直接传入用户指定的 model 或 `""`

---

## Phase 4: TUI 层

### Step 4.1: 新建 custom-providers.ts

**新文件** `src/custom-providers.ts`：
- `manageCustomProviders(config)` — 子菜单循环（列出已有 + Add 入口）
- `addCustomProviderWizard(config)` — 添加向导：
  1. Provider ID（校验：无空格、不与内置 ID/保留词 `list`/`help` 冲突、不与已有自定义冲突）
  2. Display Name
  3. Base URL（校验：http/https）
  4. Models（至少一个，循环添加 name/displayName/description/default）
  5. API Key（必填）
  6. env（二选一：默认三件套 / 粘贴 JSON）
  7. 确认保存
- `editCustomProviderWizard(config, provider)` — 选字段编辑
- `deleteCustomProvider(config, id)` — 确认删除 + 清理 API Key

### Step 4.2: 集成到主菜单

**改动** `src/index.ts`：
- 用 `getAllProviders(config)` 构建菜单项，自定义 provider 排在内置之后
- 底部增加「Manage Custom Providers」入口
- `main()` 处理自定义 provider 的切换流程：
  - API Key 提示不带 URL（通用文案）
  - 无 models 时跳过模型选择
  - MCP refresh 对自定义 provider 跳过

---

## Phase 5: 文档更新

**改动** `CLAUDE.md`：
- "Adding a New Provider" 部分增加自定义 provider 的说明
- 说明 `getAllProviders` / `getAllManagedEnvKeys` 的用法

---

## ID 冲突处理策略

- **TUI 添加时**：校验 ID 不与内置 provider ID（`claude`、`ark`、`zhipu`、`minimax`）和保留词（`list`、`help`）冲突，冲突直接报错不让创建
- **手动编辑 config 时**：`getAllProviders` 加载时发现冲突打 console warning 并跳过该自定义 provider

---

## Review 修正项（来自 Codex 独立审查）

### HIGH: `baseUrl` 必须与 `ANTHROPIC_BASE_URL` 一致

**问题**：`detectActiveProviderFromSettings` 通过 `settings.env.ANTHROPIC_BASE_URL` 匹配 `provider.baseUrl` 来识别当前 provider。如果自定义 provider 的 `env` 没写 `ANTHROPIC_BASE_URL`、或值和 `baseUrl` 不同，会导致识别失败和 native 备份逻辑误触发。

**修正**：
- `buildCustomProviderDefinition` 中，无论用户是否显式写了 `env`，**都强制保证** `env.ANTHROPIC_BASE_URL === baseUrl`
- 默认模板已满足；显式 `env` 场景下，若用户没写 `ANTHROPIC_BASE_URL` 则自动注入，若写了但值不等于 `baseUrl` 则以 `baseUrl` 为准并打 warning
- TUI 添加向导中提示：`ANTHROPIC_BASE_URL` 会自动设置为 Base URL 的值

### HIGH: 删除 provider 后残留 env keys

**问题**：`getAllManagedEnvKeys` 只从当前 config 的 `customProviders` 收集 keys。如果某个自定义 provider 被删除后，它之前写入的 env keys 不会被下次切换时清理。

**修正**：
- 在 `SwitchConfig` 中增加 `managedEnvKeys?: string[]` 字段，记录所有曾经写入过的 env keys
- 每次 `switchProvider` 写入 env 时，将新 keys 追加到 `managedEnvKeys` 并持久化
- `getAllManagedEnvKeys` = 静态 `MANAGED_ENV_KEYS` ∪ `config.managedEnvKeys` ∪ 当前 `customProviders` 的 keys
- 删除自定义 provider 时**不清理** `managedEnvKeys`（保守策略，确保残留 keys 能被清理）
- 可选：提供一个 `claude-switch cleanup` 命令来清理 `managedEnvKeys` 中已无引用的条目（v1 不做）

### MEDIUM: 无 models 时默认模板仍写空 ANTHROPIC_MODEL

**修正**：
- 默认模板：当 `models` 为空/省略时，模板只生成 `ANTHROPIC_BASE_URL` + `ANTHROPIC_AUTH_TOKEN` 两件套，不写 `ANTHROPIC_MODEL`
- 显式 `env` 中包含 `{{MODEL}}` 但无 models 时：TUI 添加向导给 warning 提示

### MEDIUM: env schema 校验

**修正**：
- `getAllProviders` 加载自定义 provider 时做基本校验：
  - `env` 所有 value 必须是 string 类型，否则跳过该 provider 并打 warning
  - `id` 不能为空字符串或包含空白字符
  - `baseUrl` 必须以 `http://` 或 `https://` 开头
- TUI Paste JSON 模式：解析后校验所有 value 为 string，否则报错要求重新输入

### MEDIUM: apiKeyUrl 可选后的文案处理

**修正**：
- 提取 API Key 提示为两种文案：
  - 有 `apiKeyUrl`：`Enter API Key (get it from ${apiKeyUrl})`（现有逻辑）
  - 无 `apiKeyUrl`：`Enter API Key`（自定义 provider）
- 不需要重构 prompt helper，只在调用处判断

### LOW: 类型归属

**修正**：
- `CustomProviderConfig` 放在 `providers.ts`，`config.ts` type-only import 它
- `getAllProviders(config)` 接受 `SwitchConfig` 的 pick 子集 `{ customProviders?, managedEnvKeys? }`，避免 `providers.ts` 依赖完整 `SwitchConfig`
- 这样 `providers.ts` → `config.ts` 无运行时依赖，只有 `config.ts` → `providers.ts` 的 type-only import

---

## 关键文件

| 文件 | 改动类型 |
|------|---------|
| `src/providers.ts` | 新增类型、`apiKeyUrl` 可选、3 个新函数 |
| `src/config.ts` | 扩展 `SwitchConfig`、CRUD helpers |
| `src/switcher.ts` | 函数参数化，支持动态 provider/keys |
| `src/cli.ts` | 用动态列表替换静态 `PROVIDERS` |
| `src/index.ts` | 动态菜单 + 新入口 |
| `src/custom-providers.ts` | **新文件**，TUI 管理流程 |
| `src/__tests__/providers.test.ts` | 新增自定义 provider 测试 |
| `src/__tests__/config.test.ts` | 新增 customProviders 测试 |
| `src/__tests__/switcher.test.ts` | 新增自定义 provider 切换测试 |
| `src/__tests__/cli.test.ts` | 新增自定义 provider CLI 测试 |

## 执行顺序

Phase 1 → Phase 2 & 3（可并行）→ Phase 4 → Phase 5

每个 Step 遵循 TDD：先写失败测试 → 实现 → 回归验证。

## 验证方式

1. `npm test` 全部通过
2. `npm run build` 编译成功
3. 手动测试 TUI：添加自定义 provider → 切换 → 切回 → 编辑 → 删除
4. 手动测试 CLI：`claude-switch list`、`claude-switch <custom-id>`
5. 手动编辑 `~/.claude-switch/config.json` 添加 customProviders，验证 TUI 正确显示
