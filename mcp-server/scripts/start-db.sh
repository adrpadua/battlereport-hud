#!/bin/bash

# PostgreSQL Docker configuration
CONTAINER_NAME="wh40k-postgres"
DB_NAME="wh40k_rules"
DB_USER="postgres"
DB_PASSWORD="postgres"
DB_PORT="5432"

# Check if container already exists
if docker ps -a --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
    # Container exists, check if running
    if docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
        echo "✅ PostgreSQL container is already running"
    else
        echo "🔄 Starting existing PostgreSQL container..."
        docker start "$CONTAINER_NAME"
        echo "✅ PostgreSQL container started"
    fi
else
    echo "🚀 Creating new PostgreSQL container..."
    docker run -d \
        --name "$CONTAINER_NAME" \
        -e POSTGRES_USER="$DB_USER" \
        -e POSTGRES_PASSWORD="$DB_PASSWORD" \
        -e POSTGRES_DB="$DB_NAME" \
        -p "$DB_PORT:5432" \
        -v wh40k-postgres-data:/var/lib/postgresql/data \
        postgres:16-alpine

    echo "⏳ Waiting for PostgreSQL to be ready..."
    sleep 3

    # Wait for postgres to be ready
    until docker exec "$CONTAINER_NAME" pg_isready -U "$DB_USER" > /dev/null 2>&1; do
        sleep 1
    done

    echo "✅ PostgreSQL container created and ready"
fi

echo ""
echo "📋 Connection details:"
echo "   Host:     localhost"
echo "   Port:     $DB_PORT"
echo "   Database: $DB_NAME"
echo "   User:     $DB_USER"
echo "   Password: $DB_PASSWORD"
echo ""
echo "🔗 DATABASE_URL=postgresql://${DB_USER}:${DB_PASSWORD}@localhost:${DB_PORT}/${DB_NAME}"
echo ""
echo "💡 Add this to your .env file"
