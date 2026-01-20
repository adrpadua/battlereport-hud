---
sidebar_position: 1
---

# Installation

This guide covers installing and setting up the Battle Report HUD monorepo.

## Prerequisites

- Node.js 20.0 or higher
- npm 11.x or higher

## Clone the Repository

```bash
git clone https://github.com/battlereport/battlereport-hud.git
cd battlereport-hud
```

## Install Dependencies

From the root of the monorepo, run:

```bash
npm install
```

This will install all dependencies for all packages and applications in the monorepo.

## Development

To start development servers for specific apps:

```bash
# Start the web application
npm run dev:web

# Start the Chrome extension development build
npm run dev:extension

# Start the documentation site
npm run dev:docs

# Start the MCP server
npm run dev:mcp
```

## Build

To build all packages and applications:

```bash
npm run build
```

## Type Checking

To run TypeScript type checking across all packages:

```bash
npm run typecheck
```
