#!/usr/bin/env node
import 'dotenv/config';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { getDb, closeConnection } from './db/connection.js';
import { createTools, handleToolCall } from './tools/index.js';
import { createResources, handleResourceRead } from './resources/index.js';

const server = new Server(
  {
    name: 'wh40k-rules-mcp',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
      resources: {},
    },
  }
);

// Tool handlers
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools: createTools() };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const db = getDb();
  return handleToolCall(db, request.params.name, request.params.arguments ?? {});
});

// Resource handlers
server.setRequestHandler(ListResourcesRequestSchema, async () => {
  const db = getDb();
  return { resources: await createResources(db) };
});

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const db = getDb();
  return handleResourceRead(db, request.params.uri);
});

// Start server
async function main() {
  const transport = new StdioServerTransport();

  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    await closeConnection();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    await closeConnection();
    process.exit(0);
  });

  await server.connect(transport);
  console.error('WH40K Rules MCP Server running on stdio');
}

main().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
