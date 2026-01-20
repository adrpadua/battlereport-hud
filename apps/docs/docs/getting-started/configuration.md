---
sidebar_position: 2
---

# Configuration

This guide covers configuration options for the Battle Report HUD applications.

## Environment Variables

Each application may require specific environment variables. Create a `.env.local` file in the respective app directory to configure them.

### Web Application

The web application (`apps/web/`) uses the following environment variables:

```bash
# Example .env.local
NEXT_PUBLIC_API_URL=http://localhost:3000/api
```

### MCP Server

The MCP server (`mcp-server/`) can be configured with:

```bash
# Server port (default: 3002)
PORT=3002
```

## Workspace Configuration

The monorepo uses npm workspaces. The workspace configuration is defined in the root `package.json`:

```json
{
  "workspaces": [
    "packages/*",
    "apps/*",
    "mcp-server"
  ]
}
```

## Turborepo Configuration

Build pipeline configuration is managed by Turborepo in `turbo.json`. The pipeline defines build dependencies and caching behavior for each task.
