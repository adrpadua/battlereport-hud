---
sidebar_position: 1
---

# Introduction

Welcome to the Battle Report HUD documentation.

Battle Report HUD is an AI-powered tool for analyzing Warhammer 40,000 battle report videos. It extracts army lists, units, and stratagems from YouTube battle report transcripts using advanced preprocessing and GPT-powered extraction.

## Key Features

- **YouTube Integration** - Chrome extension that overlays unit information on battle report videos
- **AI-Powered Extraction** - Automatically identifies units, stratagems, and game events from transcripts
- **Rules Lookup** - MCP server providing Warhammer 40K rules data for AI assistants
- **Multi-Stage Preprocessing** - Pattern matching, fuzzy search, and phonetic matching to handle YouTube's caption errors

## Project Structure

This project is organized as a monorepo using Turborepo:

```text
battlereport-hud/
├── apps/
│   ├── web/              # React web application
│   └── docs/             # Documentation (you are here)
├── packages/
│   ├── extension/        # Chrome extension (React + Vite)
│   ├── hud/              # Shared HUD React components
│   └── shared/           # Shared TypeScript types
├── mcp-server/           # WH40K rules MCP server + HTTP API
├── cli/                  # Unified CLI tool
└── scripts/              # Data processing scripts
```

## How It Works

1. **Video Detection** - Extension detects when you're watching a battle report on YouTube
2. **Transcript Extraction** - Pulls the video transcript, chapters, and metadata
3. **Faction Detection** - Identifies factions from video title/description
4. **Preprocessing** - Corrects YouTube caption errors using pattern matching and phonetic analysis
5. **AI Extraction** - Sends preprocessed transcript to GPT-4o-mini for structured extraction
6. **Validation** - Validates extracted units against BSData/MCP database
7. **HUD Overlay** - Renders unit cards and game state on the video

## Quick Links

- [Installation Guide](/docs/getting-started/installation)
- [Configuration](/docs/getting-started/configuration)
- [CLI Reference](/docs/cli/overview)
- [Architecture](/docs/architecture/overview)
