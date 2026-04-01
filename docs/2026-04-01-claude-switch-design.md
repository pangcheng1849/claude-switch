# claude-switch 设计文档

## 概述

交互式 CLI 工具，用于在 Claude Code 会话外快速切换 Model API Provider。支持 Claude 原生、火山方舟、智谱、MiniMax 四个 Provider。

## 技术栈

- **语言**：TypeScript (Node.js)
- **交互库**：@inquirer/prompts
- **运行方式**：全局安装后通过 `claude-switch` 命令调用

## 交互流程

### 一级菜单：选择 Provider

```
$ claude-switch

? Select Provider (↑↓ navigate, ESC quit)
❯ Claude (Native)        ● active
  Volcano Ark            ✔ configured
  Zhipu                  ✔ configured
  MiniMax                ○ not configured
```

状态标识：
- `● active`：当前 settings.json 激活的 Provider
- `✔ configured`：有 API Key，可直接切换
- `○ not configured`：无 API Key，选择后引导输入

ESC → 退出程序。

### API Key 处理

选择 Provider 后检查本地配置是否有该 Provider 的 API Key：

**未配置时**：拦截进入输入流程：
```
⚠ Volcano Ark API Key not configured

? Enter API Key (get it from https://console.volcengine.com/ark/.../apikey):
  ▸ ********

✔ API Key saved
```

**已配置时**：直接进入模型选择，但模型列表前增加一个操作选项：
```
? Select model (↑↓ navigate, ESC back)
  ── Actions ──
  🔑 Reconfigure API Key
  ── Models ──
❯ doubao-seed-2.0-code
  doubao-seed-2.0-pro
  ...
```

选「Reconfigure API Key」→ 进入 Key 输入流程 → 保存后回到模型选择。

### 二级菜单：选择模型

ESC → 返回一级 Provider 选择。

选择模型后直接执行切换：
```
✔ Switched to Volcano Ark / doubao-seed-2.0-code
  Please restart Claude Code to apply
```

Claude 原生无模型选择步骤，选择后直接切换。

## Provider 配置模板

### Claude 原生

无需写入 env，仅清除第三方变量。如有 nativeEnvBackup 则恢复。

### 火山方舟

```json
{
  "ANTHROPIC_BASE_URL": "https://ark.cn-beijing.volces.com/api/coding",
  "ANTHROPIC_AUTH_TOKEN": "<apiKey>",
  "ANTHROPIC_MODEL": "<selectedModel>"
}
```

可选模型：`doubao-seed-2.0-code`, `doubao-seed-2.0-pro`, `doubao-seed-2.0-lite`, `doubao-seed-code`, `minimax-m2.5`, `glm-4.7`, `deepseek-v3.2`, `kimi-k2.5`, `ark-code-latest`

### 智谱

```json
{
  "ANTHROPIC_BASE_URL": "https://open.bigmodel.cn/api/anthropic",
  "ANTHROPIC_AUTH_TOKEN": "<apiKey>",
  "API_TIMEOUT_MS": "3000000",
  "CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC": 1,
  "ANTHROPIC_DEFAULT_OPUS_MODEL": "<selectedModel>",
  "ANTHROPIC_DEFAULT_SONNET_MODEL": "<selectedModel>",
  "ANTHROPIC_DEFAULT_HAIKU_MODEL": "<selectedModel>"
}
```

可选模型：`GLM-4.7`, `GLM-4.5-Air`, `GLM-5.1`, `GLM-5-Turbo`, `GLM-5`

### MiniMax

```json
{
  "ANTHROPIC_BASE_URL": "https://api.minimaxi.com/anthropic",
  "ANTHROPIC_AUTH_TOKEN": "<apiKey>",
  "API_TIMEOUT_MS": "3000000",
  "CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC": 1,
  "ANTHROPIC_MODEL": "MiniMax-M2.7",
  "ANTHROPIC_SMALL_FAST_MODEL": "MiniMax-M2.7",
  "ANTHROPIC_DEFAULT_OPUS_MODEL": "MiniMax-M2.7",
  "ANTHROPIC_DEFAULT_SONNET_MODEL": "MiniMax-M2.7",
  "ANTHROPIC_DEFAULT_HAIKU_MODEL": "MiniMax-M2.7"
}
```

可选模型：仅 `MiniMax-M2.7`（MiniMax 只有一个模型，选择 Provider 后自动使用，跳过模型选择步骤）

## 配置管理

### 自身配置：`~/.claude-switch/config.json`

```json
{
  "nativeEnvBackup": {
    "ANTHROPIC_MODEL": "claude-opus-4-6"
  },
  "providers": {
    "ark": { "apiKey": "xxx" },
    "zhipu": { "apiKey": "yyy" },
    "minimax": { "apiKey": "zzz" }
  }
}
```

### 目标配置：`~/.claude/settings.json`

只读写 `env` 字段，不动 `permissions`、`plugins` 等其他字段。

## 切换逻辑

### env 清理全集

切换任何 Provider 前，先从 `settings.json` 的 `env` 中移除以下所有 key：

```
ANTHROPIC_BASE_URL
ANTHROPIC_AUTH_TOKEN
ANTHROPIC_MODEL
ANTHROPIC_SMALL_FAST_MODEL
ANTHROPIC_DEFAULT_OPUS_MODEL
ANTHROPIC_DEFAULT_SONNET_MODEL
ANTHROPIC_DEFAULT_HAIKU_MODEL
API_TIMEOUT_MS
CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC
```

然后仅写入目标 Provider 模板定义的 key。不在模板中的 key 不写入。

### 保护用户自定义变量

只清除上述全集中的 key，`env` 中其他用户自己加的变量原封不动。

### 原生 env 备份/恢复

- **切出 Claude 原生时**：将 `env` 中属于全集的 key-value 快照到 `config.json` 的 `nativeEnvBackup`
- **切回 Claude 原生时**：清除全集 key 后，将 `nativeEnvBackup` 写回 `env`
- **快照时机**：仅在当前为原生状态切出时做一次，第三方 Provider 间切换不覆盖 backup

### 边界情况

- `settings.json` 不存在：创建文件，写入 `{ "env": { ... } }`
- `settings.json` 无 `env` 字段：补充 `env` 字段
- `settings.json` 被外部工具改过：直接按上述逻辑覆写（最后写入者胜）

## 验收标准

1. 运行 `claude-switch` 显示 Provider 列表，含状态标识（当前使用/已配置/未配置）
2. 选择 Provider → 选择模型 → 正确写入 `~/.claude/settings.json` 的 `env` 字段
3. ESC 在模型选择返回 Provider 选择，在 Provider 选择退出程序
4. 未配置 API Key 的 Provider 选择后引导输入并持久化
5. 已配置的 Provider 提供「重新配置 API Key」选项
6. 切换时干净清除上一个 Provider 的 env key，不残留
7. 切出原生时备份 env，切回原生时恢复
8. 不影响 settings.json 中 env 以外的字段
9. MiniMax（仅一个模型）跳过模型选择步骤
