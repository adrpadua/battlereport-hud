---
sidebar_position: 1
---

# Installation

This guide covers installing and setting up the Battle Report HUD monorepo.

## Prerequisites

- **Node.js** 20.0 or higher
- **npm** 11.x or higher
- **PostgreSQL** 14+ (optional, for MCP server)
- **Chrome** (for extension testing)

## Quick Start

```bash
# Clone the repository
git clone https://github.com/adrpadua/battlereport-hud.git
cd battlereport-hud

# Install dependencies
npm install

# Start development servers
npm run dev
```

This starts all packages in development mode using Turborepo.

## Package-Specific Development

### Chrome Extension

```bash
npm run dev:extension
```

Then load the extension in Chrome:
1. Open `chrome://extensions`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select `packages/extension/dist`

### Web Application

```bash
npm run dev:web
```

Opens at http://localhost:5173

### MCP Server

Requires PostgreSQL. See [MCP Server Setup](/docs/architecture/mcp-server) for database configuration.

```bash
npm run dev:mcp
```

HTTP API runs at http://localhost:40401

### Documentation Site

```bash
npm run dev:docs
```

Opens at http://localhost:3001

## Build

Build all packages:

```bash
npm run build
```

Build specific package:

```bash
npm run build -w packages/extension
npm run build -w apps/web
npm run build -w mcp-server
```

## Type Checking

```bash
npm run typecheck
```

## Testing

```bash
# MCP server tests
cd mcp-server && npm test

# Run once without watch
cd mcp-server && npm run test:run
```

## Next Steps

- [Configure environment variables](/docs/getting-started/configuration)
- [Set up the MCP server database](/docs/architecture/mcp-server)
- [Learn the CLI commands](/docs/cli/overview)
- [Understand the architecture](/docs/architecture/overview)
