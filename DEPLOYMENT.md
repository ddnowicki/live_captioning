# CI/CD Deployment Guide

## Overview

This repository includes a complete CI/CD pipeline that automatically builds and deploys Docker images to production when changes are pushed to the `main` branch.

## Architecture

- **Frontend**: React application built with multi-stage Docker build and served with Nginx
- **Backend**: Node.js API server with WebSocket support
- **Registry**: GitHub Container Registry (ghcr.io)
- **Orchestration**: Docker Compose for production deployment

## Setup Instructions

### 1. GitHub Repository Settings

#### Configure Environment
1. Go to your repository on GitHub
2. Navigate to **Settings** → **Environments**
3. Create a new environment named `production`
4. Add the following environment secrets:

| Secret Name | Description | Example |
|-------------|-------------|---------|
| `DEEPGRAM_API_KEY` | Your Deepgram API key for transcription | `sk_xxx...` |
| `OPENAI_API_KEY` | Your OpenAI API key for translation | `sk-xxx...` |

#### Container Registry Access
The workflow uses GitHub Container Registry (ghcr.io) which is automatically configured using `GITHUB_TOKEN`.

### 2. Workflow Triggers

The CI/CD pipeline runs automatically on:
- Push to `main` or `master` branch
- Manual trigger via GitHub Actions UI

### 3. Production Images

The pipeline builds and pushes two Docker images:
- `ghcr.io/[username]/live_captioning-frontend:latest`
- `ghcr.io/[username]/live_captioning-backend:latest`

### 4. Local Deployment

#### Prerequisites
- Docker and Docker Compose installed
- Environment variables set

#### Quick Start
```bash
# Set environment variables
export DEEPGRAM_API_KEY="your_deepgram_api_key"
export OPENAI_API_KEY="your_openai_api_key"

# Deploy using the deployment script
./deploy.sh

# Or manually with docker compose
docker compose -f docker-compose.prod.yml up -d
```

#### Application Access
- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:3001
- **Health Check**: http://localhost:3001/health

### 5. Production Server Deployment

On your production server:

```bash
# 1. Clone the repository
git clone https://github.com/[username]/live_captioning.git
cd live_captioning

# 2. Set environment variables
export DEEPGRAM_API_KEY="your_production_key"
export OPENAI_API_KEY="your_production_key"

# 3. Login to GitHub Container Registry
echo $GITHUB_TOKEN | docker login ghcr.io -u USERNAME --password-stdin

# 4. Deploy
./deploy.sh production
```

### 6. Monitoring and Logs

#### View Container Logs
```bash
# All services
docker compose -f docker-compose.prod.yml logs -f

# Specific service
docker compose -f docker-compose.prod.yml logs -f api
docker compose -f docker-compose.prod.yml logs -f web
```

#### Health Checks
Both services include built-in health checks:
- **Backend**: `GET /health` endpoint
- **Frontend**: HTTP 200 response check

#### Container Status
```bash
docker compose -f docker-compose.prod.yml ps
```

### 7. Environment Variables Reference

| Variable | Service | Required | Description |
|----------|---------|----------|-------------|
| `DEEPGRAM_API_KEY` | Backend | Yes | Deepgram API key for audio transcription |
| `OPENAI_API_KEY` | Backend | Yes | OpenAI API key for text processing |
| `NODE_ENV` | Both | Auto | Set to `production` automatically |
| `HOST` | Both | Auto | Set to `0.0.0.0` automatically |
| `PORT` | Both | Auto | Backend: 3001, Frontend: 3000 |

### 8. Troubleshooting

#### Common Issues

**Images not pulling**
```bash
# Check if you're logged into the registry
docker login ghcr.io
```

**Services failing to start**
```bash
# Check logs for errors
docker compose -f docker-compose.prod.yml logs
```

**API keys not working**
- Verify environment variables are set correctly
- Check GitHub environment configuration
- Ensure keys have proper permissions

#### Debug Commands
```bash
# Interactive shell in containers
docker compose -f docker-compose.prod.yml exec api sh
docker compose -f docker-compose.prod.yml exec web sh

# Restart specific service
docker compose -f docker-compose.prod.yml restart api
```

### 9. Security Considerations

- Environment variables are injected securely via GitHub Secrets
- Docker images run as non-root user (backend)
- Nginx serves static files with security headers
- All external ports are explicitly configured

### 10. Customization

#### Custom Deployment Target
Modify the `deploy.sh` script or create custom docker-compose files for different environments:

```bash
# Copy and customize
cp docker-compose.prod.yml docker-compose.staging.yml
# Edit for staging-specific configuration
```

#### Additional Environment Variables
Add new secrets in GitHub repository settings and reference them in the workflow file.

## Pipeline Status

The workflow includes:
- ✅ Automated Docker builds
- ✅ Multi-stage production optimization  
- ✅ GitHub Container Registry integration
- ✅ Environment variable injection
- ✅ Health checks
- ✅ Deployment artifacts
- ✅ Production docker-compose generation