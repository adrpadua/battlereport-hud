---
sidebar_position: 1
---

# Introduction

Welcome to the Battle Report HUD documentation.

Battle Report HUD is a suite of tools for enhancing Warhammer 40,000 battle report content, including:

- **Web Application** - Interactive UI for viewing and managing battle reports
- **Chrome Extension** - Enhanced experience for watching battle reports on YouTube
- **MCP Server** - Machine Context Protocol server for Warhammer 40K rules lookup

## Project Structure

This project is organized as a monorepo using Turborepo:

```
battlereport-hud/
├── apps/
│   ├── web/           # Next.js web application
│   ├── extension/     # Chrome extension
│   └── docs/          # Documentation (you are here)
├── packages/
│   ├── transcript-parser/  # Battle report transcript parsing
│   └── shared/            # Shared utilities and types
└── mcp-server/            # WH40K rules MCP server
```

## Quick Links

- [Installation Guide](/docs/getting-started/installation)
- [Configuration](/docs/getting-started/configuration)
- [Features Overview](/docs/features/overview)
