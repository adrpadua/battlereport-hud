# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

BattleReport HUD is a monorepo for a Warhammer 40,000 battle report analysis tool. It extracts army lists, units, and stratagems from YouTube battle report videos using AI-powered transcript analysis.

## Commands

### Development
```bash
npm run dev              # Run all packages in dev mode (turbo)
npm run dev:extension    # Dev mode for browser extension only
npm run dev:mcp          # Dev mode for MCP server only
npm run dev:web          # Dev mode for web app only
npm run dev:docs         # Dev mode for Docusaurus docs (port 3001)
```

### Building & Type Checking
```bash
npm run build            # Build all packages
npm run typecheck        # Type check all packages
```

### CLI (Unified Interface)
```bash
npm run cli              # Interactive mode
npm run cli video extract <youtube-url>      # Extract transcript
npm run cli video preprocess <videoId>       # Test preprocessing
npm run cli video narrate <videoId>          # Generate narration
npm run cli generate factions                # Generate faction data from BSData
npm run cli generate stratagems              # Generate stratagem data
npm run cli generate aliases [faction]       # Generate unit aliases via LLM
npm run cli mcp server                       # Start MCP HTTP server
npm run cli mcp db migrate                   # Run database migrations
npm run cli mcp scrape faction <factionId>   # Scrape faction from Wahapedia
npm run cli mcp scrape unit <faction> <unit> # Scrape individual unit (e.g., tyranids Hive-Tyrant)
```

### MCP Server Tests
```bash
cd mcp-server && npm test           # Run all tests
cd mcp-server && npm run test:run   # Run tests once (no watch)
cd mcp-server && npm test -- <pattern>  # Run specific test file
```

### Data Generation
```bash
npm run generate:factions    # Generate faction data from BSData XML
npm run generate:stratagems  # Generate stratagem constants from DB
npm run generate:aliases     # Generate unit aliases via LLM
```

## Architecture

### Monorepo Structure
- **packages/extension/** - Chrome extension (React + Vite + Tailwind)
- **packages/hud/** - Shared HUD React components
- **packages/shared/** - Shared TypeScript types
- **apps/web/** - Web application (React + Vite)
- **apps/docs/** - Docusaurus documentation site
- **mcp-server/** - MCP server with PostgreSQL database and HTTP API
- **cli/** - Unified CLI built with Commander.js
- **scripts/** - Standalone scripts for data processing

### Extension Architecture (`packages/extension/`)
The extension processes YouTube battle report videos through a multi-stage pipeline:

1. **Content Scripts** (`src/content/`)
   - `caption-observer.ts` - Observes YouTube captions in real-time
   - `youtube-extractor.ts` - Extracts video metadata, chapters, transcript
   - `hud-injector.ts` - Injects HUD overlay into YouTube player

2. **Background Service** (`src/background/`)
   - `ai-service.ts` - Orchestrates AI extraction using OpenAI
   - `transcript-preprocessor.ts` - Legacy preprocessor (use pipeline.ts)
   - `preprocessing/pipeline.ts` - Unified preprocessing pipeline with 3 modes:
     - `basic`: Pattern-based detection only
     - `llm`: Adds LLM term mappings to pattern detection
     - `full`: Loads generated aliases + LLM mappings
   - `llm-preprocess-service.ts` - LLM-based term correction
   - `cache-manager.ts` - Caches preprocessed results

3. **Preprocessing Matchers** (`src/background/preprocessing/matchers/`)
   - `exact-matcher.ts` - Direct string matching
   - `alias-matcher.ts` - Colloquial term resolution
   - `fuzzy-matcher.ts` - Fuse.js fuzzy matching
   - `phonetic-matcher.ts` - Double Metaphone for YouTube mishearings

4. **Data Constants** (`src/data/constants/`)
   - `factions.ts`, `units.ts`, `stratagems.ts`, `detachments.ts`, `objectives.ts`
   - Generated from BSData XML and MCP database

### MCP Server Architecture (`mcp-server/`)
Dual-protocol server providing Warhammer 40k rules data:

- **MCP Protocol** (stdio) - For LLM tool integration
- **HTTP API** (port 40401) - For browser extension
  - `/api/units/search` - Fuzzy unit search
  - `/api/stratagems/search` - Stratagem lookup
  - `/api/validation/*` - Unit/stratagem validation

Database schema (`src/db/schema.ts`) uses Drizzle ORM with PostgreSQL:
- `factions`, `detachments`, `units`, `weapons`, `abilities`
- `stratagems`, `enhancements`, `keywords`
- `missions`, `secondary_objectives`

### Wahapedia Scraping Pipeline (`mcp-server/src/scraper/`)

The MCP server populates its database by scraping Wahapedia using Firecrawl:

- **Firecrawl Client** (`firecrawl-client.ts`) - Web scraping with rate limiting, caching, retry logic
- **Unit Parser** (`parsers/unit-parser.ts`) - Dual-format parser preferring HTML over markdown
- **Run Scraper** (`run-scraper.ts`) - Orchestrates core rules, factions, and unit scraping

**Key Design**: HTML parsing (via Cheerio) is preferred over markdown because Firecrawl's markdown conversion creates artifacts (e.g., `'blastpsychic'` instead of `'[BLAST], [PSYCHIC]'`). The parser auto-detects content format and routes to the appropriate parser:
- `parseHtmlDatasheet()` - Cheerio DOM parsing for HTML content
- `parseMarkdownDatasheet()` - Regex-based fallback for cached markdown content

**Weapon Ability Extraction**: HTML parsing extracts weapon abilities from `<span class="kwb2">` elements in Wahapedia's HTML structure, preserving proper formatting like `[BLAST], [PSYCHIC]`.

**Parser Development Best Practice**: When modifying parsers (e.g., `unit-parser.ts`, `faction-parser.ts`), always favor re-parsing cached Firecrawl data rather than re-scraping from Wahapedia. The source HTML/markdown doesn't change—only our parsing logic does. This saves Firecrawl token usage and API calls. If you notice database discrepancies after parser changes, re-run the scraper with cached data (it will use the cache automatically) to apply the new parsing logic to existing content.

### Data Flow
1. YouTube video URL -> Extract transcript, chapters, metadata
2. Detect factions from title/description -> Load faction-specific unit names
3. Preprocess transcript (pattern matching + phonetic + LLM corrections)
4. Send preprocessed transcript to GPT-5-mini for structured extraction
5. Validate extracted units against BSData/MCP database
6. Render HUD overlay with unit cards, stratagems, game state

## Key Conventions

### Import Aliases
The extension uses `@/` as an alias for `src/`:
```typescript
import { BattleReport } from '@/types/battle-report';
```

### Faction IDs
Use kebab-case faction IDs matching BSData catalogs:
- `space-marines`, `astra-militarum`, `tyranids`, `necrons`, etc.

### Environment Variables
```bash
OPENAI_API_KEY=         # Required for AI extraction
DATABASE_URL=           # PostgreSQL connection for MCP server
```

### Testing Preprocessing
Use the CLI to test preprocessing on specific videos:
```bash
npm run cli video preprocess <videoId> [faction1] [faction2]
npm run cli video llm-preprocess <videoId>
```

## MCP Database Setup

```bash
cd mcp-server
npm run db:migrate       # Run migrations
npm run scrape:core      # Scrape core rules
npm run scrape:factions  # Scrape all factions
npm run ingest:bsdata    # Ingest BSData files
```

### Scraping Individual Units
To scrape a specific unit without re-scraping an entire faction:
```bash
npm run cli mcp scrape unit <faction-slug> <unit-slug>
npm run cli mcp scrape unit space-marines Intercessor-Squad
npm run cli mcp scrape unit tyranids Hive-Tyrant --force  # Overwrite existing
```

Unit slugs use Wahapedia URL format (capitalized with hyphens). Uses cached Firecrawl results when available.
