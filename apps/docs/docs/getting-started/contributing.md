---
sidebar_position: 3
---

# Contributing Guide

This guide covers development setup and conventions for contributing to Battle Report HUD.

## Development Setup

### Prerequisites

- Node.js 20+
- npm 11+
- PostgreSQL 14+ (for MCP server development)
- Chrome browser (for extension testing)

### Initial Setup

```bash
# Clone the repository
git clone https://github.com/adrpadua/battlereport-hud.git
cd battlereport-hud

# Install dependencies
npm install

# Set up environment variables
cp mcp-server/.env.example mcp-server/.env
# Edit .env with your database credentials and API keys
```

### Running Development Servers

```bash
# Run all packages in dev mode
npm run dev

# Or run specific packages
npm run dev:extension    # Chrome extension
npm run dev:web          # Web application
npm run dev:mcp          # MCP server
npm run dev:docs         # Documentation site
```

## Project Structure

```text
battlereport-hud/
├── apps/
│   ├── web/              # React web application
│   └── docs/             # Docusaurus documentation
├── packages/
│   ├── extension/        # Chrome extension
│   │   ├── src/
│   │   │   ├── background/   # Service worker
│   │   │   ├── content/      # Content scripts
│   │   │   ├── components/   # React components
│   │   │   └── data/         # Generated constants
│   │   └── public/
│   ├── hud/              # Shared HUD components
│   └── shared/           # Shared TypeScript types
├── mcp-server/           # MCP server
│   ├── src/
│   │   ├── api/          # HTTP API routes
│   │   ├── db/           # Database schema and queries
│   │   ├── mcp/          # MCP protocol handlers
│   │   ├── scraper/      # Wahapedia scrapers
│   │   └── scripts/      # Seed scripts
│   └── drizzle/          # Database migrations
├── cli/                  # Unified CLI
└── scripts/              # Build and data scripts
```

## Code Conventions

### TypeScript

- Use strict TypeScript (`strict: true`)
- Prefer `interface` over `type` for object shapes
- Use explicit return types on exported functions

### Import Aliases

The extension uses `@/` as an alias for `src/`:

```typescript
import { BattleReport } from '@/types/battle-report';
```

### Faction IDs

Use kebab-case faction IDs matching BSData catalogs:

```typescript
'space-marines'
'astra-militarum'
'tyranids'
'necrons'
```

### Commit Messages

Follow conventional commits:

```text
feat: add terrain layouts table and seed script
fix: filter out unvalidated units from extraction
docs: update architecture documentation
test: add unit tests for preprocessing pipeline
```

## Testing

### MCP Server Tests

```bash
cd mcp-server

# Run all tests
npm test

# Run tests once (no watch)
npm run test:run

# Run specific test file
npm test -- preprocessing
```

### Extension Testing

1. Build the extension: `npm run build -w packages/extension`
2. Open Chrome → `chrome://extensions`
3. Enable "Developer mode"
4. Click "Load unpacked" → Select `packages/extension/dist`
5. Navigate to a YouTube battle report video

## Common Tasks

### Adding a New Faction

1. Add faction to BSData catalogs
2. Run `npm run generate:factions`
3. Scrape from Wahapedia: `npm run cli mcp scrape faction <faction-id>`

### Updating Unit Data

1. Re-run BSData ingestion: `cd mcp-server && npm run ingest:bsdata`
2. Regenerate constants: `npm run generate:factions`

### Adding a New Stratagem

1. Scrape the faction: `npm run cli mcp scrape faction <faction-id>`
2. Regenerate stratagem constants: `npm run generate:stratagems`

### Testing Preprocessing

```bash
# Test with auto-detected factions
npm run cli video preprocess <videoId>

# Test with specific factions
npm run cli video preprocess <videoId> space-marines tyranids
```

## Environment Variables

| Variable | Description | Where |
|----------|-------------|-------|
| `OPENAI_API_KEY` | OpenAI API key for extraction | Root `.env` |
| `DATABASE_URL` | PostgreSQL connection string | `mcp-server/.env` |
| `MCP_SERVER_PORT` | HTTP API port (default: 40401) | `mcp-server/.env` |

## Getting Help

- Check the [Architecture Overview](/docs/architecture/overview) for system design
- Review the [CLI Reference](/docs/cli/overview) for available commands
- Read `CLAUDE.md` in the project root for detailed development notes
