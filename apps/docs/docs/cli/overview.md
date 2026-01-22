---
sidebar_position: 1
---

# CLI Overview

Battle Report HUD includes a unified CLI for video processing, data generation, and server management.

## Running the CLI

```bash
# Interactive mode
npm run cli

# Direct command execution
npm run cli <command> [options]
```

## Command Groups

### Video Commands

Process YouTube battle report videos:

```bash
# Extract transcript and metadata from a video
npm run cli video extract <youtube-url>

# Test preprocessing on a video (pattern matching + phonetic analysis)
npm run cli video preprocess <videoId> [faction1] [faction2]

# Test LLM-based preprocessing
npm run cli video llm-preprocess <videoId>

# Generate narration from extracted data
npm run cli video narrate <videoId>
```

### Data Generation Commands

Generate game data constants from source files:

```bash
# Generate faction data from BSData XML catalogs
npm run cli generate factions

# Generate stratagem constants from database
npm run cli generate stratagems

# Generate unit aliases via LLM (for fuzzy matching)
npm run cli generate aliases [faction]
```

### MCP Server Commands

Manage the MCP server and database:

```bash
# Start the MCP HTTP server
npm run cli mcp server

# Run database migrations
npm run cli mcp db migrate

# Scrape faction data from Wahapedia
npm run cli mcp scrape faction <factionId>

# Clear extraction cache
npm run cli mcp cache clear [videoId]
```

## Examples

### Extract a Battle Report

```bash
# Full URL
npm run cli video extract "https://www.youtube.com/watch?v=abc123"

# Just the video ID
npm run cli video extract abc123
```

### Test Preprocessing

```bash
# Auto-detect factions
npm run cli video preprocess kMi4wgIHBDA

# Specify factions for better accuracy
npm run cli video preprocess kMi4wgIHBDA space-marines tyranids
```

### Scrape All Faction Data

```bash
# Scrape core rules first
cd mcp-server && npm run scrape:core

# Then scrape all factions
npm run scrape:factions

# Or scrape a specific faction
npm run cli mcp scrape faction necrons
```

## Environment Variables

The CLI requires certain environment variables:

| Variable | Description | Required For |
|----------|-------------|--------------|
| `OPENAI_API_KEY` | OpenAI API key | AI extraction, LLM preprocessing |
| `DATABASE_URL` | PostgreSQL connection string | MCP server, data generation |

Set these in a `.env` file in the project root or `mcp-server/` directory.
