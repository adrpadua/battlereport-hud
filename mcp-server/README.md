# WH40K Rules MCP Server

An MCP (Model Context Protocol) server that provides Warhammer 40,000 10th Edition rules data to LLMs. Data is sourced from Wahapedia and BSData.

## Features

- **Core Rules**: Complete 10th edition core rules organized by category
- **Factions**: All playable factions with army rules and lore
- **Detachments**: Detachment rules, stratagems, and enhancements
- **Units**: Full datasheets with stats, weapons, abilities, and keywords
- **Stratagems**: Searchable by faction, detachment, and phase
- **Weapons**: Ranged and melee weapon profiles
- **Abilities**: Core, faction, and unit abilities
- **FAQs**: Rules clarifications and errata

## Prerequisites

- Node.js 18+
- PostgreSQL 14+
- Firecrawl API key (for Wahapedia scraping)

## Setup

### 1. Install dependencies

```bash
cd mcp-server
npm install
```

### 2. Configure environment

Copy `.env.example` to `.env` and fill in your credentials:

```bash
cp .env.example .env
```

Required variables:
- `DATABASE_URL`: PostgreSQL connection string
- `FIRECRAWL_API_KEY`: Your Firecrawl API key

### 3. Set up database

Create the PostgreSQL database:

```sql
CREATE DATABASE wh40k_rules;
```

Run migrations:

```bash
npm run db:migrate
```

### 4. Populate data

Run the full ingestion pipeline:

```bash
npm run ingest
```

Or run individual steps:

```bash
# Scrape Wahapedia only
npm run scrape:all

# Ingest BSData only
npm run ingest:bsdata
```

### 5. Build and run

```bash
npm run build
npm start
```

## Available Tools

### Core Rules

- `get_core_rules` - Get core rules, optionally filtered by category or search term

### Factions

- `list_factions` - List all available factions
- `get_faction` - Get detailed faction information including army rules

### Detachments

- `get_detachments` - Get all detachments for a faction
- `get_detachment_details` - Get detachment with stratagems and enhancements

### Units

- `search_units` - Search for units by name
- `get_unit` - Get complete unit datasheet

### Stratagems & Enhancements

- `get_stratagems` - Get stratagems for a faction/detachment
- `get_enhancements` - Get enhancements for a faction/detachment

### Weapons & Abilities

- `search_weapons` - Search weapon profiles
- `search_abilities` - Search abilities

### Other

- `get_keyword_info` - Get keyword description
- `get_missions` - Get mission rules
- `search_faqs` - Search FAQs and errata

## Available Resources

The server exposes resources for browsing:

- `wh40k://rules/core` - Core rules document
- `wh40k://factions/{slug}` - Faction overview
- `wh40k://factions/{slug}/detachments/{detachment}` - Detachment details

## Usage with Claude Desktop

Add to your Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "wh40k-rules": {
      "command": "node",
      "args": ["/path/to/mcp-server/dist/index.js"],
      "env": {
        "DATABASE_URL": "postgresql://user:pass@localhost:5432/wh40k_rules"
      }
    }
  }
}
```

## Data Sources

### Wahapedia

Wahapedia is scraped using Firecrawl for:
- Core game rules
- Faction and army rules
- Detachment rules
- Stratagems and enhancements
- Unit datasheets (with full rules text)
- FAQs and errata

### BSData

The [BSData/wh40k-10e](https://github.com/BSData/wh40k-10e) repository provides:
- Accurate points costs
- Complete unit stats
- Weapon profiles
- Keywords
- Army composition rules

Data from both sources is merged, with Wahapedia providing rich text content and BSData providing structured game data.

## Development

```bash
# Run in development mode
npm run dev

# Run specific scrapers
npm run scrape:core      # Core rules only
npm run scrape:factions  # Factions and detachments
npm run scrape:units     # Unit datasheets

# Type check
npx tsc --noEmit
```

## Updating Data

To refresh the data:

```bash
# Force refresh all data (ignores cache)
FORCE_REFRESH=true npm run ingest

# Or delete the cache directories
rm -rf .scrape-cache .bsdata-cache
npm run ingest
```

## License

This tool is for personal use. Warhammer 40,000 is a trademark of Games Workshop. All game rules and army data are © Games Workshop.
