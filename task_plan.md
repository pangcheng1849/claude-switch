# MCP 管理与模型描述增强 — 实现计划

## 目标
基于设计文档 `docs/2026-04-02-mcp-management-design.md`，为 claude-switch 添加：
1. MCP Server 管理功能（独立于 Provider 的 MCP 注册表）
2. Ark 模型描述增强（显示官方模型说明）

## 设计文档
- `docs/2026-04-02-mcp-management-design.md`

## Phase 1: 数据层 — MCP 注册表与配置扩展
**状态**: complete
**文件**: `src/mcps.ts`（新建）, `src/config.ts`, `src/providers.ts`

1. 新建 `src/mcps.ts`：定义 `MCPDefinition` 接口和 `MCP_REGISTRY` 常量
   - 5 个 MCP 定义：4 个 Zhipu + 1 个 MiniMax
   - 每个 MCP 的 `buildConfig(apiKey)` 生成完整 mcpServers 条目
   - Zhipu MCP 带 hint: "Provider 已内置此能力，MCP 作为 fallback"
2. `src/config.ts`：`SwitchConfig` 加 `enabledMcps?: string[]` 字段
3. `src/providers.ts`：`ProviderModel` 加 `description?: string` 字段；更新 Ark 模型列表加 description

**验收**:
- `npm run build` 编译通过
- MCP_REGISTRY 导出正确，5 个条目
- Ark 每个模型有 description

## Phase 2: Settings 层 — MCP 读写操作
**状态**: complete
**文件**: `src/settings.ts`

1. 扩展 `ClaudeSettings` 接口，明确 `mcpServers` 字段类型
2. 新增 `readMcpServers()`: 读取 settings.json 的 mcpServers
3. 新增 `writeMcpServers(mcpServers)`: 写入 settings.json 的 mcpServers（保留其他字段）
4. 新增 `getEnabledMcpIds(config)`: 从 config 读取已启用的 MCP ID 列表

**验收**:
- 能正确读写 mcpServers 字段
- 不影响 settings.json 其他字段

## Phase 3: Switcher 层 — 切回 Native 时清理 MCP
**状态**: complete
**文件**: `src/switcher.ts`

1. 在 `switchProvider` 中，当切回 Claude Native 时：
   - 读取 `config.enabledMcps`
   - 从 settings.json 的 mcpServers 中移除这些 MCP
   - 清空 `config.enabledMcps`
2. 导出 `cleanupManagedMcps()` 供 index.ts 调用

**验收**:
- 切回 Native 后，claude-switch 管理的 MCP 被移除
- 用户手动配的 MCP 不受影响

## Phase 4: TUI 层 — MCP 管理菜单
**状态**: complete
**文件**: `src/index.ts`

1. 一级菜单 `selectProvider` 底部加 `⚙ Manage MCP Servers` 入口
   - 显示 `(N/M active)` 启用数/总数
   - 选择后进入 MCP 管理菜单
2. 新增 `manageMcps()` 函数：
   - 按 Provider 分组显示 MCP 列表
   - 已有 API Key 的 Provider 下 MCP 可操作（启用/禁用）
   - 无 API Key 的 Provider 下 MCP 显示 `✘ requires API Key`
   - 选择已启用的 MCP → 禁用（从 settings.json 移除，从 config.enabledMcps 移除）
   - 选择未启用的 MCP → 启用（写入 settings.json，加入 config.enabledMcps）
3. MCP 操作后显示结果，循环直到 ESC
4. 切换 Provider 成功后提示：`💡 Tip: Use "Manage MCP Servers" to add alternatives.`

**验收**:
- 一级菜单显示 MCP 入口和计数
- MCP 管理菜单正确分组和状态显示
- 启用/禁用操作正确写入 settings.json 和 config.json
- ESC 返回一级菜单

## Phase 5: TUI 层 — 模型描述显示
**状态**: complete
**文件**: `src/index.ts`

1. 修改 `selectModel` 函数中 modelChoices 的 name 生成逻辑
   - 有 description 时：`displayName  description截断(30字符)  ● active`
   - 无 description 时：保持原样
2. `selectSingleModelAction` 也显示 description（在标题中）

**验收**:
- Ark 模型选择时显示描述
- 描述截断合理，不破坏菜单排版
- 其他 Provider 不受影响

## Phase 6: 文档更新与构建验证
**状态**: complete
**文件**: `README.md`

1. 更新 README 功能列表：添加 MCP 管理说明
2. `npm run build` 最终验证
3. 手动测试完整流程

**验收**:
- README 反映新功能
- 编译无错误
