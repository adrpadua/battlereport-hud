---
sidebar_position: 2
---

# Configuration

This guide covers environment variables and configuration options.

## Environment Variables

### Root `.env`

Create a `.env` file in the project root for shared variables:

```bash
# OpenAI API key for AI extraction
OPENAI_API_KEY=sk-...
```

### MCP Server `.env`

Create `mcp-server/.env` for server-specific configuration:

```bash
# PostgreSQL connection string
DATABASE_URL=postgresql://username:password@localhost:5432/battlereport_hud

# HTTP API port (default: 40401)
MCP_SERVER_PORT=40401
```

## Workspace Configuration

The monorepo uses npm workspaces defined in the root `package.json`:

```json
{
  "workspaces": [
    "packages/*",
    "apps/*",
    "mcp-server",
    "cli"
  ]
}
```

## Turborepo Configuration

Build pipeline configuration is managed by Turborepo in `turbo.json`. Key pipelines:

- `build` - Build all packages
- `dev` - Run development servers
- `typecheck` - TypeScript type checking
- `test` - Run tests

## Extension Configuration

### Manifest (`packages/extension/manifest.json`)

Chrome Extension Manifest V3 configuration including:
- Permissions (storage, activeTab, scripting)
- Content script injection rules
- Service worker registration

### Build (`packages/extension/vite.config.ts`)

Vite bundler configuration with:
- React plugin
- Chrome extension plugin
- Path aliases (`@/` → `src/`)

## MCP Server Configuration

### Database (`mcp-server/drizzle.config.ts`)

Drizzle ORM configuration for migrations:

```typescript
export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
```

### CORS

The HTTP API allows cross-origin requests from:
- `chrome-extension://*` - Browser extensions
- `http://localhost:*` - Local development

## Feature Configuration

### Preprocessing Modes

The extraction pipeline supports three modes:

| Mode | Features | Performance |
|------|----------|-------------|
| `basic` | Pattern matching only | Fastest |
| `llm` | + LLM term corrections | Moderate |
| `full` | + Generated aliases | Best accuracy |

### Cache Settings

Extraction results are cached with configurable TTL:
- Default: 7 days
- Clear via CLI: `npm run cli mcp cache clear`
