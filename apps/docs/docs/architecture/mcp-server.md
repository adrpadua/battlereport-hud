---
sidebar_position: 2
---

# MCP Server Setup

The MCP server provides Warhammer 40K rules data via both MCP protocol and HTTP API.

## Prerequisites

- PostgreSQL 14+ running locally or accessible remotely
- Node.js 20+

## Database Setup

### 1. Create Database

```bash
# Using psql
createdb battlereport_hud

# Or connect to postgres and create
psql -U postgres
CREATE DATABASE battlereport_hud;
```

### 2. Configure Connection

Create `mcp-server/.env`:

```bash
DATABASE_URL=postgresql://username:password@localhost:5432/battlereport_hud
```

### 3. Run Migrations

```bash
cd mcp-server
npm run db:migrate
```

## Populating Data

### Scrape Core Rules

```bash
cd mcp-server
npm run scrape:core
```

### Scrape All Factions

```bash
npm run scrape:factions
```

This scrapes faction data, detachments, stratagems, and enhancements from Wahapedia.

### Ingest BSData

```bash
npm run ingest:bsdata
```

This imports unit data from BSData XML catalogs.

## Scraping Architecture

The scraper uses Firecrawl to fetch Wahapedia pages and parse them for structured data.

### Components

| File | Purpose |
|------|---------|
| `src/scraper/firecrawl-client.ts` | Firecrawl API client with caching, rate limiting |
| `src/scraper/parsers/unit-parser.ts` | Dual-format parser (HTML preferred, markdown fallback) |
| `src/scraper/run-scraper.ts` | Orchestration for core rules, factions, units |
| `src/scraper/config.ts` | URL patterns and faction slugs |

### HTML vs Markdown Parsing

The scraper requests both HTML and markdown from Firecrawl (`includeHtml: true`) but **prefers HTML parsing**:

**Why HTML?**
- Firecrawl's markdown conversion creates artifacts (concatenated text)
- Example: `'blastpsychic'` instead of `'[BLAST], [PSYCHIC]'`
- HTML preserves original structure for accurate extraction

**Smart Format Detection:**
```typescript
// Detects format and routes to appropriate parser
const isHtml = content.trim().startsWith('<') || content.includes('<html');
if (isHtml) {
  return parseHtmlDatasheet(content, sourceUrl);  // Cheerio DOM parsing
} else {
  return parseMarkdownDatasheet(content, sourceUrl);  // Regex fallback
}
```

**Markdown Fallback:**
- Used for cached content from before HTML parsing was added
- Includes `CONCATENATION_FIXES` map for common Firecrawl artifacts

### Scrape Pipeline Stages

```text
1. Core Rules → /wh40k10ed/the-rules/core-rules/
2. Factions → Detachments, Enhancements, Stratagems
3. Units → Individual datasheets with weapons and abilities
```

Each stage upserts data to PostgreSQL, with scrape logs tracking success/failure.

### Seed Additional Data

```bash
# Weapon ability definitions
npm run db:seed:weapon-abilities

# Terrain layouts (Chapter Approved 2025-26)
npm run db:seed:terrain-layouts
```

## Running the Server

### HTTP API Mode

```bash
# Development
npm run dev

# Production
npm run build && npm start
```

The HTTP API runs on port 40401 by default.

### MCP Mode (for AI assistants)

The server can run as an MCP server for integration with Claude and other AI tools. Configure it in your MCP client settings.

## HTTP API Endpoints

### Unit Search

```http
GET /api/units/search?q=intercessor&faction=space-marines
```

### Stratagem Search

```http
GET /api/stratagems/search?q=fire&faction=space-marines
```

### Validation

```http
POST /api/validation/units
Content-Type: application/json

{
  "units": ["Intercessor Squad", "Bladeguard Veterans"],
  "faction": "space-marines"
}
```

### Extraction

```http
POST /api/extract
Content-Type: application/json

{
  "videoId": "abc123",
  "factions": ["space-marines", "tyranids"]
}
```

## Database Schema

Key tables:

| Table | Description |
|-------|-------------|
| `factions` | Faction definitions and army rules |
| `detachments` | Detachment rules and restrictions |
| `units` | Unit datasheets with stats |
| `weapons` | Weapon profiles |
| `abilities` | Unit and weapon abilities |
| `stratagems` | Stratagem definitions by detachment |
| `enhancements` | Character enhancements |
| `keywords` | Unit keywords for filtering |
| `extraction_cache` | Cached extraction results |
| `terrain_layouts` | Matched play terrain layouts |

## MCP Tools

When running as an MCP server, the following tools are available:

- `search_units` - Search for units by name
- `get_unit` - Get full unit datasheet
- `get_stratagems` - Get stratagems for a faction/detachment
- `get_faction` - Get faction army rules
- `get_core_rules` - Get core game rules
- `validate_terms` - Validate Warhammer terminology
- `fuzzy_search` - Fuzzy search across all categories

## Troubleshooting

### Connection Refused

Ensure PostgreSQL is running:

```bash
# macOS
brew services start postgresql

# Linux
sudo systemctl start postgresql
```

### Migration Errors

If migrations fail, check:
1. Database exists and is accessible
2. `DATABASE_URL` is correct
3. User has CREATE TABLE permissions

### Scraping Errors

Wahapedia scraping may fail if:
- Rate limited (add delays between requests)
- Page structure changed (update scrapers)
- Network issues (retry)
