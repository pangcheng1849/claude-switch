# 研究发现

## API 内置工具兼容性（2026-04-02 实测）

测试条件：退出 Anthropic auth 后，用各 Provider 的 API Key 直接调用。

| Provider | Web Search | Web Fetch | 图片理解 | 备注 |
|----------|-----------|-----------|---------|------|
| Claude Native | 原生 | 原生 | 原生 | 完全兼容 |
| 智谱 GLM | API 内置 | API 内置 | API 内置 | Provider 透明替换，返回 `🌐 Z.ai Built-in Tool` |
| MiniMax | API 内置 | API 内置 | 不支持 | 图片理解能力缺失 |
| Ark (doubao-code) | API 内置 | API 内置 | 模型多模态 | 取决于具体模型 |

### 关键发现
- 智谱 GLM 的 API 透明接管了 Claude Code 的 WebSearch 工具，无需配置 MCP 即可使用
- MiniMax WebSearch/WebFetch 正常可用，但图片理解不支持
- Ark doubao-seed-2.0-code 本身是多模态模型，图片理解走模型能力
- **切换 Provider 后不能复用旧会话** — 旧会话中的 tool call/参数可能与新 Provider 不兼容，导致 400 错误。这不是 Provider 本身的问题，是会话上下文冲突

## MCP Server 官方文档

### 智谱 MCP（来源：https://docs.bigmodel.cn）

智谱提供 4 个 MCP Server，涵盖视觉理解、联网搜索、网页读取、开源仓库。

#### 1. zai-mcp-server（视觉理解）
- **功能**: 图像分析、视频理解、OCR、UI-to-code、错误诊断、图表分析等
- **工具列表**: `ui_to_artifact`, `extract_text_from_screenshot`, `diagnose_error_screenshot`, `understand_technical_diagram`, `analyze_data_visualization`, `ui_diff_check`, `image_analysis`, `video_analysis`
- **类型**: stdio
- **包**: `@z_ai/mcp-server`（npx）
- **Claude Code 一键安装**: `claude mcp add -s user zai-mcp-server --env Z_AI_API_KEY=your_api_key -- npx -y "@z_ai/mcp-server"`
- **配置格式**:
```json
{
  "zai-mcp-server": {
    "type": "stdio",
    "command": "npx",
    "args": ["-y", "@z_ai/mcp-server"],
    "env": {
      "Z_AI_API_KEY": "<api_key>",
      "Z_AI_MODE": "ZHIPU"
    }
  }
}
```
- **环境变量**: `Z_AI_API_KEY`（必需），`Z_AI_MODE`（可选，默认 `ZHIPU`，可选 `ZAI`）
- **注意**: 需 Node.js >= v18.0.0；使用 `@z_ai/mcp-server@latest` 强制最新版

#### 2. web-search-prime（联网搜索）
- **功能**: 全网搜索，获取实时信息
- **工具**: `webSearchPrime` — 返回网页标题、URL、摘要、网站名称等
- **类型**: http 远程
- **Claude Code 一键安装**: `claude mcp add -s user -t http web-search-prime https://open.bigmodel.cn/api/mcp/web_search_prime/mcp --header "Authorization: Bearer your_api_key"`
- **配置格式**:
```json
{
  "web-search-prime": {
    "type": "http",
    "url": "https://open.bigmodel.cn/api/mcp/web_search_prime/mcp",
    "headers": {
      "Authorization": "Bearer <api_key>"
    }
  }
}
```

#### 3. web-reader（网页读取）
- **功能**: 抓取网页内容，提取结构化数据（标题、正文、元数据、链接）
- **工具**: `webReader` — 返回网页标题、正文内容、元数据、链接列表
- **类型**: http 远程
- **Claude Code 一键安装**: `claude mcp add -s user -t http web-reader https://open.bigmodel.cn/api/mcp/web_reader/mcp --header "Authorization: Bearer your_api_key"`
- **配置格式**:
```json
{
  "web-reader": {
    "type": "http",
    "url": "https://open.bigmodel.cn/api/mcp/web_reader/mcp",
    "headers": {
      "Authorization": "Bearer <api_key>"
    }
  }
}
```

#### 4. zread（开源仓库）
- **功能**: GitHub 仓库搜索、目录结构、代码阅读
- **工具**: `search_doc`, `get_repo_structure`, `read_file`
- **类型**: http 远程
- **Claude Code 一键安装**: `claude mcp add -s user -t http zread https://open.bigmodel.cn/api/mcp/zread/mcp --header "Authorization: Bearer your_api_key"`
- **配置格式**:
```json
{
  "zread": {
    "type": "http",
    "url": "https://open.bigmodel.cn/api/mcp/zread/mcp",
    "headers": {
      "Authorization": "Bearer <api_key>"
    }
  }
}
```

#### 智谱 MCP 额度说明
- Lite: 联网搜索 + 网页读取 + ZRead 合计 100 次/月
- Pro: 合计 1000 次/月
- Max: 合计 4000 次/月
- 视觉理解 MCP 共享 5 小时 prompt 资源池

### MiniMax MCP（来源：https://platform.minimaxi.com）

#### MiniMax MCP（搜索 + 图片理解）
- **功能**: 网络搜索 + 图片理解分析
- **工具**: `web_search`（网络搜索）, `understand_image`（图片理解，支持 JPEG/PNG/GIF/WebP，最大 20MB）
- **类型**: stdio
- **包**: `minimax-coding-plan-mcp`（uvx，Python）
- **前置**: 需安装 uvx（`curl -LsSf https://astral.sh/uv/install.sh | sh`）
- **Claude Code 一键安装**: `claude mcp add -s user MiniMax --env MINIMAX_API_KEY=api_key --env MINIMAX_API_HOST=https://api.minimaxi.com -- uvx minimax-coding-plan-mcp -y`
- **配置格式**:
```json
{
  "MiniMax": {
    "command": "uvx",
    "args": ["minimax-coding-plan-mcp", "-y"],
    "env": {
      "MINIMAX_API_KEY": "<api_key>",
      "MINIMAX_API_HOST": "https://api.minimaxi.com"
    }
  }
}
```

### Ark 模型（来源：https://www.volcengine.com/docs/82379/1928261）

Ark 没有单独的 MCP Server，但支持多种模型，各模型能力不同。

**注意**: 务必使用 Coding Plan 指定的 Base URL：`https://ark.cn-beijing.volces.com/api/coding`（Anthropic 协议）

#### 模型列表与描述（官方原文）

| 模型 | 官方说明 |
|------|---------|
| Auto (ark-code-latest) | 默认选择。智能调度模型，基于「效果 + 速度」双维度智能匹配最优算力与模型组合，可优先体验最新模型能力 |
| Doubao-Seed-2.0-Code | 支持多模态视觉理解。依托 Seed 2.0 Agent 与视觉理解能力，强化代码能力：前端出众，多语言适配 |
| Doubao-Seed-2.0-pro | 支持多模态视觉理解。旗舰级全能通用模型，适合复杂推理与长链路任务执行场景，强调多模态理解、长上下文推理、结构化生成与工具增强执行 |
| Doubao-Seed-2.0-lite | 支持多模态视觉理解。兼顾生成质量与响应速度，适合作为通用生产级模型，胜任非结构化信息处理、内容创作、搜索推荐、数据分析等生产型工作 |
| Doubao-Seed-Code | 支持多模态视觉理解。豆包编程模型，具备精准的代码生成、任务调度与逻辑协同能力 |
| MiniMax-M2.5 | MiniMax 旗舰级开源大模型，在编程、工具调用和搜索、办公等生产力场景都达到或者刷新了行业的 SOTA。上下文 200k，最大输出 128k |
| Kimi-K2.5 | 支持多模态视觉理解。Moonshot AI 最新编程模型，强化了前端代码质量与设计表现力。上下文 256k，最大输出 32k |
| GLM-4.7 | 智谱 AI 旗舰代码大模型，在代码生成、调试、全链路理解场景中表现优异 |
| DeepSeek-V3.2 | 深度求索推理模型，平衡推理能力与输出长度，在通用问答、日常 Agent 任务、轻量级代码开发场景中稳定高效 |

#### Ark Coding Plan 套餐
- Lite: 每 5h ~1200 次，每周 ~9000 次，每月 ~18000 次
- Pro: Lite 的 5 倍

#### Ark 使用限制
- 仅限 AI 编程工具中使用，不可用于 API 调用
- 在非编程工具中使用 Base URL 和 API Key 可能被识别为滥用/违规

## 代码架构要点

- `settings.json` 的 `mcpServers` 字段当前未被 claude-switch 管理
- `ClaudeSettings` 接口已支持 `[key: string]: unknown`，可直接存取 mcpServers
- 切回 Native 时的 MCP 清理应在 `switchProvider` 中处理
- config.json 需新增 `enabledMcps` 追踪 claude-switch 管理的 MCP ID
