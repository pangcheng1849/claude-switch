# MCP 管理与模型描述增强 设计文档

## 概述

为 claude-switch 添加两个功能：
1. **MCP Server 管理**：独立于 Provider 的 MCP 注册表，用户可跨 Provider 启用/禁用 MCP Server
2. **Ark 模型描述**：在模型选择时显示官方模型说明（来源：[火山方舟 Coding Plan 文档](https://www.volcengine.com/docs/82379/1928261)）

## 背景：API 内置工具兼容性

经实测，各 Provider 对 Claude Code 内置服务端工具（Web Search、Web Fetch、图片理解）的支持情况：

| Provider | Web Search | Web Fetch | 图片理解 | 备注 |
|----------|-----------|-----------|---------|------|
| Claude Native | 原生 | 原生 | 原生 | 完全兼容 |
| 智谱 GLM | API 内置 | API 内置 | API 内置 | Provider 透明替换 |
| MiniMax | API 内置 | API 内置 | 不支持 | 缺图片理解 |
| Ark (doubao-code) | API 内置 | API 内置 | 模型多模态 | 取决于具体模型 |

> 注意：以上能力由 Provider API 提供，可能随 Provider 变更。MCP Server 作为显式配置的 fallback/补充。

## 功能一：MCP Server 管理

### 设计原则

- **MCP 独立于 Provider**：用户可以用 Ark 作为模型 Provider，同时启用 Zhipu 的 MCP Server
- **API Key 是唯一门槛**：只要对应 Provider 已配置 API Key，其 MCP 就可启用
- **只管理 claude-switch 写入的 MCP**：不碰用户手动配置的 MCP Server

### 数据结构

#### MCP 注册表（内置，src/mcps.ts）

```typescript
interface MCPDefinition {
  id: string;                    // mcpServers 中的 key
  displayName: string;           // 显示名
  providerId: string;            // 需要哪个 Provider 的 API Key
  description: string;           // 功能说明
  hint?: string;                 // 额外提示（如"Provider 已内置此能力"）
  buildConfig(apiKey: string): Record<string, unknown>;  // 生成 mcpServers 条目
}
```

#### 已启用的 MCP 存储

在 `~/.claude-switch/config.json` 中新增 `enabledMcps` 字段：

```json
{
  "nativeEnvBackup": { ... },
  "providers": { ... },
  "enabledMcps": ["web-search-prime", "zai-mcp-server"]
}
```

#### MCP 配置写入

启用/禁用 MCP 时，写入 `~/.claude/settings.json` 的 `mcpServers` 字段。只操作 claude-switch 管理的 MCP（记录在 `enabledMcps` 中），不碰其他条目。

### MCP 注册表定义

| id | Provider | 类型 | 说明 |
|----|----------|------|------|
| zai-mcp-server | zhipu | stdio/npx | 视觉理解（图片分析、视频理解）|
| web-search-prime | zhipu | http 远程 | 联网搜索 |
| web-reader | zhipu | http 远程 | 网页读取 |
| zread | zhipu | http 远程 | 开源仓库问答 |
| MiniMax | minimax | stdio/uvx | 联网搜索 + 图片理解 |

智谱 MCP 的 hint：`"Provider 已内置此能力，MCP 作为 fallback"`

### TUI 交互流程

#### 一级菜单变更

```
? Select Provider (ESC to quit)
  Claude (Native)        ● active
  Volcano Ark            ✔ configured
  Zhipu                  ✔ configured
  MiniMax                ○ not configured
  ──────────
  ⚙  Manage MCP Servers (3/5 active)
```

底部入口显示当前启用数/总数。

#### MCP 管理菜单

```
? Manage MCP Servers (ESC to go back)

  Zhipu (API Key configured)
    web-search-prime   联网搜索        ✔ enabled
    web-reader         网页读取        ○ disabled
    zai-mcp-server     视觉理解        ○ disabled
    zread              开源仓库        ○ disabled
    hint: Provider 已内置此能力，MCP 作为 fallback

  MiniMax (API Key not configured)
    MiniMax            搜索+图片理解   ✘ requires API Key
```

- 已启用 → 选择后可禁用
- 未启用 + 有 API Key → 选择后可启用
- 无 API Key → 显示 `✘ requires API Key`，不可操作
- ESC → 返回一级菜单

#### 切回 Claude Native 时的行为

切回 Native 时，**自动移除所有 claude-switch 管理的 MCP**。但保留 `nativeMcpBackup`。

在 config 中备份：

```json
{
  "nativeMcpBackup": { "user-mcp-1": { ... } }
}
```

切回 Native 时：
1. 记录当前 settings.json 中所有 MCP 到 `nativeMcpBackup`
2. 移除 `enabledMcps` 中列出的 MCP
3. 恢复 `nativeMcpBackup` 中用户原有的 MCP（如之前有的话）

简化方案：**不做 backup/restore**，只在切回 Native 时移除 claude-switch 管理的 MCP，不动其他条目。用户自己配的 MCP 不受影响。

### 切换 Provider 后的提示

切换到非 Native Provider 后，提示：
```
✔ Switched to Volcano Ark / doubao-seed-2.0-code
  Please restart Claude Code to apply
  ⚠ Do NOT reuse the previous session
  💡 Tip: Some built-in tools may not work. Use "Manage MCP Servers" to add alternatives.
```

## 功能二：Ark 模型描述

### ProviderModel 扩展

```typescript
interface ProviderModel {
  name: string;
  displayName?: string;
  description?: string;  // 模型说明，来自官方文档
}
```

### Ark 模型列表（来源：火山方舟 Coding Plan 官方文档）

| name | displayName | description |
|------|-------------|-------------|
| ark-code-latest | Auto | 智能调度模型，基于「效果 + 速度」双维度智能匹配最优算力与模型组合 |
| doubao-seed-2.0-code | Doubao Seed 2.0 Code | 支持多模态视觉理解。前端出众，多语言适配 |
| doubao-seed-2.0-pro | Doubao Seed 2.0 Pro | 支持多模态视觉理解。旗舰级全能通用模型，适合复杂推理与长链路任务 |
| doubao-seed-2.0-lite | Doubao Seed 2.0 Lite | 支持多模态视觉理解。兼顾生成质量与响应速度 |
| doubao-seed-code | Doubao Seed Code | 支持多模态视觉理解。精准的代码生成、任务调度与逻辑协同 |
| minimax-m2.5 | MiniMax M2.5 | MiniMax 旗舰开源大模型，编程、工具调用 SOTA |
| kimi-k2.5 | Kimi K2.5 | 支持多模态视觉理解。强化前端代码质量与设计表现力 |
| glm-4.7 | GLM 4.7 | 智谱 AI 旗舰代码大模型，代码生成、调试、全链路理解 |
| deepseek-v3.2 | DeepSeek V3.2 | 平衡推理能力与输出长度，通用问答、轻量级代码开发 |

### 模型选择显示

```
? Select model (Volcano Ark) (ESC to go back)
❯ doubao-seed-2.0-code  前端出众，多语言适配  ● active
  doubao-seed-2.0-pro   旗舰级，复杂推理与长链路任务
  kimi-k2.5             前端代码质量与设计表现力
  ...
```

description 截断显示（最长 ~30 字符），避免菜单过宽。

## 文件变更清单

| 文件 | 变更 |
|------|------|
| `src/mcps.ts` | **新建** — MCP 注册表定义 |
| `src/providers.ts` | 扩展 `ProviderModel` 加 `description`；更新 Ark 模型列表 |
| `src/config.ts` | 扩展 `SwitchConfig` 加 `enabledMcps` |
| `src/settings.ts` | 新增 `readMcpServers` / `writeMcpServers` 操作 |
| `src/switcher.ts` | 切回 Native 时清理管理的 MCP |
| `src/index.ts` | 一级菜单加 MCP 入口；新增 MCP 管理菜单；模型选择显示 description |
| `README.md` | 更新功能列表和兼容性说明 |

## 验收标准

1. 一级菜单底部显示 `⚙ Manage MCP Servers` 入口，附带启用数/总数
2. MCP 管理菜单按 Provider 分组，只有已配 API Key 的 Provider 下的 MCP 可操作
3. 启用 MCP 后正确写入 `settings.json` 的 `mcpServers`，API Key 动态注入
4. 禁用 MCP 后从 `settings.json` 移除对应条目
5. 切回 Claude Native 时自动移除所有 claude-switch 管理的 MCP，保留用户手动配的
6. 不影响用户手动配置的 MCP Server
7. Ark 模型选择时显示模型描述
8. 切换 Provider 后提示不要复用上个会话
9. 编译通过，无 TypeScript 错误
