#!/bin/bash

# Production deployment script for Live Captioning app
# Usage: ./deploy.sh [environment]

set -e

ENVIRONMENT="${1:-production}"
COMPOSE_FILE="docker-compose.prod.yml"

echo "🚀 Deploying Live Captioning to $ENVIRONMENT environment..."

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker and try again."
    exit 1
fi

# Check if required environment variables are set
if [ -z "$DEEPGRAM_API_KEY" ]; then
    echo "⚠️  Warning: DEEPGRAM_API_KEY is not set. The application may not work properly."
fi

if [ -z "$OPENAI_API_KEY" ]; then
    echo "⚠️  Warning: OPENAI_API_KEY is not set. Some features may not work properly."
fi

# Pull the latest images
echo "📦 Pulling latest Docker images..."
docker compose -f $COMPOSE_FILE pull

# Stop existing containers
echo "🛑 Stopping existing containers..."
docker compose -f $COMPOSE_FILE down

# Start new containers
echo "▶️  Starting new containers..."
docker compose -f $COMPOSE_FILE up -d

# Wait for services to be ready
echo "⏳ Waiting for services to be ready..."
sleep 10

# Health check
echo "🏥 Performing health checks..."
if wget -nv -t1 --spider http://localhost:3001/health > /dev/null 2>&1; then
    echo "✅ Backend health check passed"
else
    echo "❌ Backend health check failed"
    docker compose -f $COMPOSE_FILE logs api
    exit 1
fi

if wget -nv -t1 --spider http://localhost:3000 > /dev/null 2>&1; then
    echo "✅ Frontend health check passed"
else
    echo "❌ Frontend health check failed"
    docker compose -f $COMPOSE_FILE logs web
    exit 1
fi

echo "🎉 Deployment completed successfully!"
echo "📱 Frontend: http://localhost:3000"
echo "🔌 Backend API: http://localhost:3001"
echo "📊 View logs: docker compose -f $COMPOSE_FILE logs -f"