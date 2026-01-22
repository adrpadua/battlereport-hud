---
sidebar_position: 1
---

# Features Overview

Battle Report HUD provides AI-powered tools for analyzing and enhancing Warhammer 40,000 battle report videos.

## Chrome Extension

The Chrome extension (`packages/extension/`) enhances YouTube battle report videos with:

### Real-Time Analysis
- Automatic faction detection from video title and description
- Transcript extraction and preprocessing
- AI-powered extraction of army lists, units, and events

### HUD Overlay
- Unit cards with stats and abilities
- Stratagem tracking
- Game state visualization (VP, CP, turn)

### Preprocessing Pipeline
- **Pattern Matching** - Exact term detection for known unit names
- **Alias Resolution** - Maps colloquial terms ("intercessors") to official names
- **Fuzzy Matching** - Handles typos and spelling variations
- **Phonetic Matching** - Corrects YouTube caption mishearings using Double Metaphone

## MCP Server

The MCP server (`mcp-server/`) provides Warhammer 40K rules data:

### Dual Protocol Support
- **MCP Protocol** - Integration with AI assistants (Claude, etc.)
- **HTTP API** - REST endpoints for the browser extension

### Comprehensive Data
- All 10th Edition factions with army rules
- Unit datasheets with stats, weapons, abilities
- Detachment rules and stratagems
- Enhancements and keywords
- Core rules and FAQs
- Matched play missions and terrain layouts

### Data Sources
- **Wahapedia** - Scraped rules text and abilities
- **BSData** - Canonical unit names and structure

## Unified CLI

The CLI (`cli/`) provides command-line tools for:

### Video Processing
- Extract transcripts from YouTube videos
- Test preprocessing pipelines
- Generate narration scripts

### Data Generation
- Generate faction constants from BSData XML
- Generate stratagem constants from database
- Generate unit aliases via LLM for fuzzy matching

### Database Management
- Run migrations
- Scrape faction data
- Manage extraction cache

## Web Application

The web app (`apps/web/`) provides:

- Battle report browsing and search
- Extraction result visualization
- Manual extraction triggering

## Key Technologies

| Component | Technologies |
|-----------|--------------|
| Extension | React, Vite, Tailwind CSS, Chrome Extension APIs |
| MCP Server | Node.js, Fastify, Drizzle ORM, PostgreSQL |
| CLI | Commander.js, TypeScript |
| AI | OpenAI GPT-4o-mini, Anthropic Claude |
| Build | Turborepo, TypeScript, Vite |
