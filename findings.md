# Findings & Decisions

## Requirements
- 交互式 CLI 工具，快速切换 Claude Code 的 Model API Provider
- 支持 Provider：Claude 原生、火山方舟、智谱、MiniMax
- 文档已全部收集

## Research Findings

### Claude 原生
- 默认 Provider，无需额外配置 Base URL
- 环境变量：`ANTHROPIC_API_KEY`

### 火山方舟 (Volcano Engine Ark)
- **配置机制**：`~/.claude/settings.json` 的 `env` 字段
- **环境变量**：
  - `ANTHROPIC_BASE_URL`: `https://ark.cn-beijing.volces.com/api/coding`（Anthropic 协议）
  - `ANTHROPIC_AUTH_TOKEN`: 用户的 Ark API Key
  - `ANTHROPIC_MODEL`: 模型名称
- **支持模型**：
  - `doubao-seed-2.0-code` / `doubao-seed-2.0-pro` / `doubao-seed-2.0-lite` / `doubao-seed-code`
  - `minimax-m2.5`
  - `glm-4.7`
  - `deepseek-v3.2`
  - `kimi-k2.5`
  - `ark-code-latest`（控制台切换模型，支持 Auto 模式）
- **注意**：Model Name 不支持配置为 `Auto`，需通过控制台切换
- **警告**：不要使用 `https://ark.cn-beijing.volces.com/api/v3`，会产生额外费用而非消耗 Coding Plan 额度
- **运行时切换**：启动时 `claude --model <name>`，对话中 `/model <name>`

### 智谱 (Zhipu / GLM)
- **配置机制**：`~/.claude/settings.json` 的 `env` 字段
- **环境变量**：
  - `ANTHROPIC_BASE_URL`: `https://open.bigmodel.cn/api/anthropic`
  - `ANTHROPIC_AUTH_TOKEN`: 用户的智谱 API Key
  - `API_TIMEOUT_MS`: `3000000`
  - `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC`: `1`
- **模型切换方式**：与火山方舟不同！智谱用分层映射环境变量，不是 `ANTHROPIC_MODEL`
  - `ANTHROPIC_DEFAULT_OPUS_MODEL`: 默认 `GLM-4.7`
  - `ANTHROPIC_DEFAULT_SONNET_MODEL`: 默认 `GLM-4.7`
  - `ANTHROPIC_DEFAULT_HAIKU_MODEL`: 默认 `GLM-4.5-Air`
- **支持模型**：
  - `GLM-4.7`（默认 Opus/Sonnet）
  - `GLM-4.5-Air`（默认 Haiku）
  - `GLM-5.1` / `GLM-5-Turbo` / `GLM-5`（高阶模型，高峰期 3x、非高峰期 2x 额度消耗）
- **服务端模型映射**：UI 显示 Claude 模型名，实际调用 GLM 模型
- **高峰期**：每日 14:00-18:00 (UTC+8)
- **限时福利**：GLM-5.1/GLM-5-Turbo 非高峰期 1x 抵扣，持续到 4 月底
- **已知 Bug**：Claude Code v2.1.69 需设置 `ENABLE_TOOL_SEARCH=0 CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS=1` 才能正常使用 claude-opus-4-6

### MiniMax
- **配置机制**：`~/.claude/settings.json` 的 `env` 字段
- **环境变量**：
  - `ANTHROPIC_BASE_URL`: `https://api.minimaxi.com/anthropic`
  - `ANTHROPIC_AUTH_TOKEN`: 用户的 MiniMax API Key
  - `API_TIMEOUT_MS`: `3000000`
  - `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC`: `1`
  - `ANTHROPIC_MODEL`: `MiniMax-M2.7`
  - `ANTHROPIC_SMALL_FAST_MODEL`: `MiniMax-M2.7`（新增变量，其他 Provider 未出现）
  - `ANTHROPIC_DEFAULT_OPUS_MODEL`: `MiniMax-M2.7`
  - `ANTHROPIC_DEFAULT_SONNET_MODEL`: `MiniMax-M2.7`
  - `ANTHROPIC_DEFAULT_HAIKU_MODEL`: `MiniMax-M2.7`
- **支持模型**：仅 `MiniMax-M2.7`
- **重要**：配置前需清除 shell 环境中已有的 `ANTHROPIC_AUTH_TOKEN` 和 `ANTHROPIC_BASE_URL`（env 变量优先级高于配置文件）
- **推荐工具**：cc-switch（brew 安装，GUI 切换配置）

## Technical Decisions

| Decision | Rationale |
|----------|-----------|
| 核心机制：修改 `~/.claude/settings.json` 的 `env` 字段 | 火山方舟文档明确这是官方配置方式，Claude 原生也用同一文件 |
| 三种 Provider 的 env 变量组合各不同 | 火山方舟：`ANTHROPIC_MODEL`；智谱：`ANTHROPIC_DEFAULT_*_MODEL` 分层映射；MiniMax：全量设置（`ANTHROPIC_MODEL` + `ANTHROPIC_SMALL_FAST_MODEL` + `ANTHROPIC_DEFAULT_*_MODEL`）。CLI 工具需按 Provider 模板生成完整 env |

## Issues Encountered

| Issue | Resolution |
|-------|------------|
|       |            |

## Resources
- 火山方舟 Coding Plan 活动页：https://www.volcengine.com/activity/codingplan
- Ark API Key 管理：https://console.volcengine.com/ark/region:ark+cn-beijing/apikey
- Ark 开通管理页面：https://console.volcengine.com/ark/region:ark+cn-beijing/openManagement
- 智谱开放平台：https://open.bigmodel.cn
- 智谱 API Key 管理：https://bigmodel.cn/usercenter/proj-mgmt/apikeys
- 智谱 GLM Coding Plan：https://zhipuaishengchan.datasink.sensorsdata.cn/t/Nd
- 智谱文档索引：https://docs.bigmodel.cn/llms.txt
- MiniMax 平台：https://platform.minimaxi.com
- MiniMax API Base URL：https://api.minimaxi.com/anthropic
- MiniMax 文档索引：https://platform.minimaxi.com/docs/llms.txt
- cc-switch（MiniMax 推荐的切换工具）：https://github.com/farion1231/cc-switch

---
*Update this file after every 2 view/browser/search operations*
