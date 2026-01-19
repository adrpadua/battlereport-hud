#!/bin/bash

CONTAINER_NAME="wh40k-postgres"

if docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
    echo "🛑 Stopping PostgreSQL container..."
    docker stop "$CONTAINER_NAME"
    echo "✅ PostgreSQL container stopped"
else
    echo "ℹ️  PostgreSQL container is not running"
fi
