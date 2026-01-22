---
sidebar_position: 1
---

# Architecture Overview

Battle Report HUD is built as a monorepo with several interconnected components.

## System Architecture

```text
┌─────────────────────────────────────────────────────────────────┐
│                        YouTube Video                             │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Chrome Extension                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │   Content    │  │  Background  │  │     HUD      │          │
│  │   Scripts    │──│   Service    │──│   Overlay    │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
└─────────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
┌──────────────────┐ ┌──────────────┐ ┌──────────────────┐
│   Preprocessing  │ │   OpenAI     │ │   MCP Server     │
│     Pipeline     │ │   GPT-4o     │ │   (Rules DB)     │
└──────────────────┘ └──────────────┘ └──────────────────┘
```

## Component Overview

### Chrome Extension (`packages/extension/`)

The extension is the primary user interface, processing YouTube battle report videos.

**Content Scripts** (`src/content/`):
- `caption-observer.ts` - Observes YouTube captions in real-time
- `youtube-extractor.ts` - Extracts video metadata, chapters, transcript
- `hud-injector.ts` - Injects HUD overlay into YouTube player

**Background Service** (`src/background/`):
- `ai-service.ts` - Orchestrates AI extraction using OpenAI
- `preprocessing/pipeline.ts` - Unified preprocessing with 3 modes
- `llm-preprocess-service.ts` - LLM-based term correction
- `cache-manager.ts` - Caches preprocessed results

**Preprocessing Matchers** (`src/background/preprocessing/matchers/`):
- `exact-matcher.ts` - Direct string matching against known terms
- `alias-matcher.ts` - Colloquial term resolution (e.g., "intercessors" → "Intercessor Squad")
- `fuzzy-matcher.ts` - Fuse.js fuzzy matching for typos
- `phonetic-matcher.ts` - Double Metaphone for YouTube caption mishearings

### MCP Server (`mcp-server/`)

Dual-protocol server providing Warhammer 40K rules data:

**Protocols**:
- **MCP (stdio)** - For LLM tool integration (Claude, etc.)
- **HTTP API (port 40401)** - For browser extension

**Key Endpoints**:
- `/api/units/search` - Fuzzy unit search
- `/api/stratagems/search` - Stratagem lookup
- `/api/validation/*` - Unit/stratagem validation

**Database** (PostgreSQL + Drizzle ORM):
- `factions`, `detachments`, `units`, `weapons`, `abilities`
- `stratagems`, `enhancements`, `keywords`
- `missions`, `secondary_objectives`
- `extraction_cache`, `ai_response_cache`

### Unified CLI (`cli/`)

Command-line interface built with Commander.js for:
- Video extraction and preprocessing
- Data generation from BSData/Wahapedia
- Database management and migrations

### Shared Packages

- `packages/hud/` - Shared React components for the HUD overlay
- `packages/shared/` - TypeScript types shared across packages

## Data Flow

### Video Processing Pipeline

```text
1. YouTube URL
   │
   ▼
2. Extract transcript, chapters, metadata
   │
   ▼
3. Detect factions from title/description
   │
   ▼
4. Load faction-specific unit names
   │
   ▼
5. Preprocess transcript
   ├── Pattern matching (exact terms)
   ├── Alias resolution (colloquial terms)
   ├── Fuzzy matching (typos)
   └── Phonetic matching (caption errors)
   │
   ▼
6. Send to GPT-4o-mini for structured extraction
   │
   ▼
7. Validate extracted units against database
   │
   ▼
8. Render HUD overlay with validated data
```

### Preprocessing Modes

The preprocessing pipeline supports three modes:

| Mode | Description | Speed | Accuracy |
|------|-------------|-------|----------|
| `basic` | Pattern-based detection only | Fast | Good |
| `llm` | Adds LLM term mappings | Medium | Better |
| `full` | Loads generated aliases + LLM | Slower | Best |

## Key Design Decisions

### Why Preprocessing?

YouTube's auto-generated captions frequently mishear Warhammer 40K terminology:
- "Intercessors" → "intercesses" or "in the senses"
- "Tyranids" → "tyrannize" or "to ran its"

The preprocessing pipeline corrects these errors before AI extraction, significantly improving accuracy.

### Why Dual-Protocol MCP Server?

- **MCP Protocol**: Enables AI assistants (Claude) to query rules during conversations
- **HTTP API**: Allows the browser extension to validate units without MCP client

### Why BSData + Wahapedia?

- **BSData**: Canonical unit names, points costs, faction structure (XML)
- **Wahapedia**: Rich rules text, abilities, stratagems (scraped HTML)

Both sources are combined for comprehensive game data.
