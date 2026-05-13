# telegram-search-mcp

基于 [telegram-search](https://github.com/groupultra/telegram-search) 的 MCP 服务，让 Claude Code 可以直接查询已同步的 Telegram 群消息，无需手动复制粘贴。

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

在 `~/.claude/mcp.json` 中添加：

```json
{
  "mcpServers": {
    "telegram-search": {
      "command": "npx",
      "args": ["tsx", "/path/to/telegram-search-mcp/src/index.ts"],
      "env": {
        "DATABASE_URL": "postgresql://postgres:YOUR_PASSWORD@localhost:5433/postgres"
      }
    }
  }
}
```

重启 Claude Code 后生效。

## 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `DATABASE_URL` | PostgreSQL 连接字符串 | `postgresql://postgres:postgres@localhost:5433/postgres` |

> 端口默认 `5433`（telegram-search Docker Compose 映射的端口），注意不是标准的 5432。

## 使用示例

接入后直接在 Claude Code 中说：

> "列出所有已同步的 Telegram 群"
> "查一下群 1234567890 最近一周的消息"
> "在群 1234567890 里搜索'进度'"

## 架构说明

本项目直接查询 telegram-search 的 PostgreSQL 数据库，不依赖其 WebSocket API。telegram-search 负责同步消息，本项目负责让 Claude 读取。

## License

MIT
