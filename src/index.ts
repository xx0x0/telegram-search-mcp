import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { Pool } from 'pg'
import { z } from 'zod'

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:123456@localhost:5433/postgres',
})

const server = new McpServer({
  name: 'telegram-search-mcp',
  version: '1.0.0',
})

server.tool(
  'list_chats',
  '列出所有已同步的 Telegram 群/频道及消息数量',
  {},
  async () => {
    const result = await pool.query(`
      SELECT jc.chat_id, jc.name, jc.type, COUNT(cm.id) as msg_count
      FROM joined_chats jc
      LEFT JOIN chat_messages cm ON cm.in_chat_id = jc.chat_id::text
      GROUP BY jc.chat_id, jc.name, jc.type
      ORDER BY msg_count DESC
    `)
    return {
      content: [{
        type: 'text',
        text: JSON.stringify(result.rows, null, 2),
      }],
    }
  },
)

server.tool(
  'get_messages',
  '获取指定群的消息记录',
  {
    chat_id: z.string().describe('群 ID，如 3695601502'),
    limit: z.number().optional().default(100).describe('返回条数，默认100'),
    offset: z.number().optional().default(0).describe('跳过条数，用于翻页'),
    start_date: z.string().optional().describe('开始日期 YYYY-MM-DD'),
    end_date: z.string().optional().describe('结束日期 YYYY-MM-DD'),
  },
  async ({ chat_id, limit, offset, start_date, end_date }) => {
    let query = `
      SELECT from_name, content, to_timestamp(platform_timestamp)::timestamptz as time
      FROM chat_messages
      WHERE in_chat_id = $1 AND content != ''
    `
    const params: (string | number)[] = [chat_id]

    if (start_date) {
      params.push(start_date)
      query += ` AND to_timestamp(platform_timestamp)::date >= $${params.length}`
    }
    if (end_date) {
      params.push(end_date)
      query += ` AND to_timestamp(platform_timestamp)::date <= $${params.length}`
    }

    params.push(limit, offset)
    query += ` ORDER BY platform_timestamp ASC LIMIT $${params.length - 1} OFFSET $${params.length}`

    const result = await pool.query(query, params)
    return {
      content: [{
        type: 'text',
        text: result.rows.map(r => `[${r.time.toISOString().slice(0, 16)}] ${r.from_name}: ${r.content}`).join('\n'),
      }],
    }
  },
)

server.tool(
  'search_messages',
  '在指定群中搜索关键词',
  {
    chat_id: z.string().describe('群 ID'),
    keyword: z.string().describe('搜索关键词'),
    limit: z.number().optional().default(50).describe('返回条数'),
  },
  async ({ chat_id, keyword, limit }) => {
    const result = await pool.query(`
      SELECT from_name, content, to_timestamp(platform_timestamp)::timestamptz as time
      FROM chat_messages
      WHERE in_chat_id = $1 AND content ILIKE $2
      ORDER BY platform_timestamp DESC
      LIMIT $3
    `, [chat_id, `%${keyword}%`, limit])

    return {
      content: [{
        type: 'text',
        text: result.rows.length === 0
          ? `未找到包含"${keyword}"的消息`
          : result.rows.map(r => `[${r.time.toISOString().slice(0, 16)}] ${r.from_name}: ${r.content}`).join('\n'),
      }],
    }
  },
)

server.tool(
  'get_chat_summary',
  '获取群的消息统计摘要（时间范围、活跃成员、消息数）',
  {
    chat_id: z.string().describe('群 ID'),
  },
  async ({ chat_id }) => {
    const result = await pool.query(`
      SELECT
        COUNT(*) as total_messages,
        COUNT(DISTINCT from_name) as unique_senders,
        MIN(to_timestamp(platform_timestamp)) as first_message,
        MAX(to_timestamp(platform_timestamp)) as last_message,
        json_agg(json_build_object('name', from_name, 'count', cnt) ORDER BY cnt DESC) as top_senders
      FROM (
        SELECT from_name, COUNT(*) as cnt
        FROM chat_messages
        WHERE in_chat_id = $1 AND content != ''
        GROUP BY from_name
      ) sub
    `, [chat_id])

    const row = result.rows[0]
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          total_messages: row.total_messages,
          unique_senders: row.unique_senders,
          first_message: row.first_message,
          last_message: row.last_message,
          top_senders: row.top_senders?.slice(0, 10),
        }, null, 2),
      }],
    }
  },
)

async function main() {
  const transport = new StdioServerTransport()
  await server.connect(transport)
}

main().catch(console.error)
