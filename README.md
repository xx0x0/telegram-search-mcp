# telegram-search-mcp

MCP server for [telegram-search](https://github.com/groupultra/telegram-search) — query your synced Telegram messages directly from Claude Code.

## Tools

- `list_chats` — list all synced chats with message counts
- `get_messages` — fetch messages from a chat (with date filtering and pagination)
- `search_messages` — keyword search within a chat
- `get_chat_summary` — stats: total messages, active senders, time range

## Prerequisites

1. [telegram-search](https://github.com/groupultra/telegram-search) running via Docker Compose
2. Node.js 18+

## Setup

```bash
git clone https://github.com/YOUR_USERNAME/telegram-search-mcp
cd telegram-search-mcp
npm install
```

Add to `~/.claude/mcp.json`:

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

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://postgres:postgres@localhost:5433/postgres` |

## Usage

After restarting Claude Code, you can ask:

> "List all my synced Telegram chats"
> "Show me messages from chat 1234567890 in the last week"
> "Search for '进度' in chat 1234567890"
