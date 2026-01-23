# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

BattleReport HUD is a monorepo for a Warhammer 40,000 battle report analysis tool. It extracts army lists, units, and stratagems from YouTube battle report videos using AI-powered transcript analysis.

## Commands

### CLI (Unified Interface)

The CLI uses consistent terminology:
- `sync` - Fetch from external API (costs credits)
- `parse` - Re-process cached data (no network)
- `import` - Load local files into database

```bash
npm run cli              # Interactive mode
```

#### Wahapedia Operations
```bash
# Sync from Wahapedia (uses Firecrawl credits - prompts for confirmation)
npm run cli wahapedia sync rules                    # Sync core rules
npm run cli wahapedia sync faction <slug>           # Sync specific faction
npm run cli wahapedia sync factions                 # Sync all factions
npm run cli wahapedia sync units <faction>          # Sync units for faction
npm run cli wahapedia sync unit <faction> <unit>    # Sync specific unit
npm run cli wahapedia sync faction tyranids --yes   # Skip confirmation with -y/--yes

# Parse cached data (no API calls)
npm run cli wahapedia parse all                     # Parse all cached data
npm run cli wahapedia parse factions                # Parse faction pages only
npm run cli wahapedia parse units                   # Parse unit datasheets only
npm run cli wahapedia parse all --dry-run           # Preview without saving

# Cache management
npm run cli wahapedia cache stats                   # Show cache statistics
npm run cli wahapedia cache analyze                 # Analyze HTML vs Markdown coverage
npm run cli wahapedia cache refresh                 # Re-fetch Markdown-only pages
```

#### BSData Operations
```bash
npm run cli bsdata fetch                # Download BSData XML from GitHub
npm run cli bsdata parse                # Parse XML files
npm run cli bsdata import               # Import into database
npm run cli bsdata all                  # Run full pipeline
```

#### Database Operations
```bash
npm run cli db migrate                  # Run database migrations
npm run cli db seed                     # Seed initial data
npm run cli db export                   # Export database to file
npm run cli db cleanup duplicates       # Clean up duplicate entries
npm run cli db clear abilities          # Clear abilities table
npm run cli db clear cache [videoId]    # Clear extraction cache
npm run cli db show faction-counts      # Show unit counts per faction
npm run cli db show unit <name>         # Debug unit data
npm run cli db query <unitName>         # Query a specific unit
npm run cli db validate                 # Validate ingested data
```

#### Code Generation
```bash
npm run cli codegen factions            # Generate faction constants
npm run cli codegen stratagems          # Generate stratagem constants
npm run cli codegen detachments         # Generate detachment constants
npm run cli codegen aliases [faction]   # Generate unit aliases (uses OpenAI - prompts)
npm run cli codegen all                 # Run all (excludes aliases)
```

#### Search Index
```bash
npm run cli search build                # Build search index
npm run cli search check                # Check index status
npm run cli search validate             # Validate search results
```

#### Video Processing
```bash
npm run cli video extract <url>         # Extract transcript from YouTube
npm run cli video preprocess <videoId>  # Test preprocessing
npm run cli video narrate <videoId>     # Generate narration
npm run cli video chapters <videoId>    # Test chapter detection
npm run cli video pipeline <url>        # Run E2E pipeline
```

#### Development Servers
```bash
npm run cli serve api                   # Start HTTP API server (port 40401)
npm run cli serve web                   # Start web app dev server
npm run cli serve extension             # Start browser extension dev server
npm run cli serve docs                  # Start documentation site
npm run cli serve all                   # Start all dev servers
```

#### Build Operations
```bash
npm run cli build all                   # Build all packages
npm run cli build typecheck             # Typecheck all packages
```

### MCP Server Tests
```bash
cd mcp-server && npm test           # Run all tests
cd mcp-server && npm run test:run   # Run tests once (no watch)
cd mcp-server && npm test -- <pattern>  # Run specific test file
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

**Parser Development Best Practice**: When modifying parsers (e.g., `unit-parser.ts`, `faction-parser.ts`), always favor re-parsing cached Firecrawl data rather than re-scraping from Wahapedia. The source HTML/markdown doesn't change—only our parsing logic does. This saves Firecrawl token usage and API calls. If you notice database discrepancies after parser changes, use `npm run cli wahapedia parse all` to apply the new parsing logic to existing cached content.

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
npm run cli db migrate                  # Run migrations
npm run cli wahapedia sync rules        # Scrape core rules
npm run cli wahapedia sync factions     # Scrape all factions
npm run cli bsdata import               # Import BSData files
```

### Syncing Individual Units
To sync a specific unit without re-syncing an entire faction:
```bash
npm run cli wahapedia sync unit <faction-slug> <unit-slug>
npm run cli wahapedia sync unit space-marines Intercessor-Squad
npm run cli wahapedia sync unit tyranids Hive-Tyrant
```

Unit slugs use Wahapedia URL format (capitalized with hyphens). Uses cached Firecrawl results when available.
