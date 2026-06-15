# telegram-search-mcp

基于 [telegram-search](https://github.com/groupultra/telegram-search) 的 MCP 扩展，让 Claude Code 可以直接查询已同步的 Telegram 群消息。支持按群、关键词、时间段检索。

解决痛点：
1. 无需手动复制聊天记录
2. Telegram 自带搜索不加 # 标签基本搜不到内容

接入后可以让 Claude 帮你搜关键词、梳理项目进展、整合多个群的内容、找出没跟进的待办。

## 功能

- `list_chats` — 列出所有已同步的群/频道及消息数量
- `get_messages` — 获取指定群的消息记录（支持日期筛选和翻页）
- `search_messages` — 在指定群中搜索关键词
- `get_chat_summary` — 查看群统计：总消息数、活跃成员、时间跨度

## 前置条件

1. [telegram-search](https://github.com/groupultra/telegram-search) 已通过 Docker Compose 启动并完成 Telegram 登录
2. Node.js 18+

## 安装

```bash
git clone https://github.com/xx0x0/telegram-search-mcp
cd telegram-search-mcp
npm install
```

在 Claude Code 的配置中添加 MCP 服务器。注意 Claude Code 实际读取的是 `~/.claude.json` 里 **项目级** 的 `projects.<项目路径>.mcpServers`，不是 `~/.claude/mcp.json`。如果你想在某个项目目录下用，就把配置写到那个项目下：

```json
{
  "projects": {
    "/绝对/项目/路径": {
      "mcpServers": {
        "telegram-search": {
          "command": "/绝对/路径/telegram-search-mcp/node_modules/.bin/tsx",
          "args": ["/绝对/路径/telegram-search-mcp/src/index.ts"],
          "env": {
            "DATABASE_URL": "postgresql://postgres:YOUR_PASSWORD@localhost:5433/postgres"
          }
        }
      }
    }
  }
}
```

> **为什么用 `node_modules/.bin/tsx` 绝对路径而不是 `tsx` 或 `npx tsx`**：MCP 子进程不一定继承你 shell 的 PATH（取决于 Claude Code 怎么启动），全局没装 tsx 时 `command: "tsx"` 会直接 spawn 失败；`npx tsx` 在没缓存时会触发交互式确认，也会卡住。绝对路径最稳。

改完 **完整退出 Claude Code**（不是新开 tab，是杀进程重开），新会话才会加载 MCP。

## 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `DATABASE_URL` | PostgreSQL 连接字符串 | `postgresql://postgres:postgres@localhost:5433/postgres` |

> 端口默认 `5433`（telegram-search Docker Compose 映射的端口），注意不是标准的 5432。

## 故障排查（踩过的坑）

按下面这套从上到下检查，覆盖了实际部署中遇到的所有失败模式。

### 1. Claude 没调用 MCP 工具，反而 `docker exec psql` 直连数据库

**根因**：MCP 没注册成功，Claude 看不到工具，就退而求其次走容器内 SQL。

**确认**：

```bash
# 看 ~/.claude.json 里目标项目下是否真的有 mcpServers
python3 -c "import json; d=json.load(open('$HOME/.claude.json')); \
  print(d.get('projects',{}).get('/你的/项目/路径',{}).get('mcpServers',{}))"
```

输出 `{}` 就是没注册。在 Claude 会话里直接问"现在挂着哪些 MCP"，没出现 `telegram-search` 也是同一个症状。

**修复**：按上面 [安装](#安装) 章节把 mcpServers 写进 **项目级** 配置，然后完整退出 Claude Code 重开。

### 2. pgvector 端口在宿主机访问不到

`telegram-search` 仓库自带的 `docker/docker-compose.yml` **没有暴露 pgvector 端口**，MCP server 跑在宿主机上是连不进容器的。

**确认**：

```bash
lsof -iTCP:5433 -sTCP:LISTEN
# 没输出 = 端口没暴露
```

**修复**：在 `docker/docker-compose.yml` 的 `pgvector` 服务下加：

```yaml
  pgvector:
    image: ghcr.io/tensorchord/pgvecto-rs:pg17-v0.4.0
    ports:
      - "5433:5432"   # 加这两行
```

然后 `docker compose down && docker compose up -d` 让映射生效。

### 3. `command: "tsx"` 或 `command: "npx"` 启动失败

见上面安装章节的说明。永远用 `node_modules/.bin/tsx` 的绝对路径。

### 4. 改了配置但 Claude 仍然看不到 MCP

MCP **不会热加载**。新开 tab、新开窗口都不够，必须完全退出 Claude Code 进程再重新启动。验证方式：重开后让 Claude 列出可用 MCP，应该能看到 `telegram-search` 以及它的 4 个工具。

### 5. MCP 加载了但调用报错

最常见是数据库连不上。手动测一下连接：

```bash
psql "postgresql://postgres:123456@localhost:5433/postgres" -c "SELECT count(*) FROM joined_chats;"
```

- 连接被拒 → Docker 没起 / 端口没暴露（回到 #2）
- 密码错 → 检查 `DATABASE_URL` 里的密码是否和 `docker-compose.yml` 里 `POSTGRES_PASSWORD` 一致
- 表不存在 → telegram-search 还没完成首次同步，先在 web UI 里登录账号并触发同步

### 验证清单

配置完成后，按顺序确认：

- [ ] `lsof -iTCP:5433 -sTCP:LISTEN` 有 docker-proxy 监听
- [ ] `psql ... -c "SELECT 1"` 能连上数据库
- [ ] `~/.claude.json` 里目标项目的 `mcpServers` 含 `telegram-search`
- [ ] 完整退出 Claude Code 后重开
- [ ] 新会话里能看到 `telegram-search` MCP 及其 4 个工具
- [ ] 让 Claude 调 `list_chats`，返回 JSON 而不是手写 SQL

## 使用示例

接入后直接在 Claude Code 中说：

> "列出所有已同步的 Telegram 群"
> "查一下群 1234567890 最近一周的消息"
> "在群 1234567890 里搜索'进度'"

## 架构说明

本项目直接查询 telegram-search 的 PostgreSQL 数据库，不依赖其 WebSocket API。telegram-search 负责同步消息，本项目负责让 Claude 读取。

## 应用场景

### 管理层：项目进度跟踪

每天定时搜索项目群消息，按关键词过滤，汇总成日报。可以追踪谁在跟进什么、谁长时间没有动静，也可以把关键决策和待办事项沉淀下来，不让重要结论被消息流冲走。

```
> 总结群 1234567890 本周的主要决策和待办事项
> 帮我分析一下这个群从开始到现在的进展，按模块梳理
> 搜索最近两周出现过"延期"或"问题"的消息
```

### 运营/商务：内容检索与数据整合

素材、参考案例、竞品信息、客户需求——这些内容散落在各个群里，用完就沉。接入后可以按关键词随时检索，把分散在多个群的相关内容整合到一起，不用人肉翻记录。

```
> 在所有群里搜索"方案"相关的讨论
> 把群 1234567890 里提到竞品的消息都找出来
> 整合最近一个月客户群里的需求反馈
```

### 异常预警

关键词触发——出现"延期""紧急""问题"时，主动搜出来，不用等人汇报。

```
> 搜索本周所有群里出现过"紧急"或"延期"的消息
```

---

## 部署方式

### 本机单人使用

在本机跑 telegram-search，Claude Code 通过 MCP 直接查本地数据库。适合一个人管多个项目群。

```
telegram-search（本机 Docker）→ PostgreSQL（本机）→ MCP server（本机）→ Claude Code
```

### 团队共享（需要服务器）

把 telegram-search 和 PostgreSQL 部署到服务器，MCP server 暴露远端 HTTP 接口，团队所有人的 Claude Code 连同一个数据源。产品、研发、项目经理各自用 Claude 查同一个群，不用每个人都自己同步。

```
telegram-search（服务器）→ PostgreSQL（服务器）→ MCP server（服务器，HTTP/SSE）
                                                        ↓
                                          团队所有人的 Claude Code
```

服务器配置参考：2核2G 即可，国内云服务器约 ¥50-100/月。

部署步骤：
1. 服务器上按 telegram-search 文档跑 Docker Compose
2. 修改 `src/index.ts` 中的 transport 从 `StdioServerTransport` 改为 `SSEServerTransport`
3. 团队成员在各自 `~/.claude/mcp.json` 中填写服务器地址即可

### 接入其他 AI 工具

同一个 MCP server 可以同时接入 Cursor、Windsurf、任何支持 MCP 协议的工具，不需要重复配置。

## License

MIT
