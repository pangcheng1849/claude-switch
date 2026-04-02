# 进度日志

## Session 1 — 2026-04-02

### 已完成
- [x] brainstorming: 需求澄清（Provider MCP 兼容性调研）
- [x] 实测 Zhipu GLM-5.1 内置工具：WebSearch/WebFetch/图片理解均可用
- [x] 实测 MiniMax 内置工具：WebSearch/WebFetch 可用，图片理解不支持
- [x] 实测 Ark (doubao-code) 内置工具：WebSearch/WebFetch 可用，模型多模态
- [x] 设计文档: `docs/2026-04-02-mcp-management-design.md`
- [x] README 兼容性提示 + 切换后不要复用会话提示
- [x] 实现计划创建

### 设计决策
1. MCP 独立于 Provider — 用 Ark 模型时可启用 Zhipu 的 MCP
2. 切回 Native 时只移除 claude-switch 管理的 MCP，不备份
3. Ark 模型描述来自官方文档，需注明来源

### 待做
- [x] Phase 1-6 实现

### 实现完成
- [x] Phase 1: MCP 注册表 (src/mcps.ts) + config 扩展 + Ark 模型描述
- [x] Phase 2: settings.ts mcpServers 读写
- [x] Phase 3: switcher.ts 切回 Native 时清理 MCP
- [x] Phase 4: MCP 管理 TUI 菜单（一级入口 + 按 Provider 分组 + 启用/禁用）
- [x] Phase 5: 模型描述显示（30字符截断）
- [x] Phase 6: README 更新（MCP 表格 + 功能列表）
- [x] 编译通过，无 TypeScript 错误

## Session 2 — 2026-04-02

### Bug 修复
- [x] `printSwitchResult` 切回 Native 时不再显示 "built-in tools may not work" 提示
- [x] 移除 `ClaudeSettings` 接口中未使用的 `mcpServers` 字段（MCP 实际存于 `~/.claude.json`）
- [x] 修正 switcher.ts 中关于 MCP 清理的误导注释

### 待做
- [ ] 手动测试完整流程
- [ ] 提交 & PR
