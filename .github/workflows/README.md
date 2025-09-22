# GitHub Actions Workflows

This directory contains GitHub Actions workflows for building and deploying the Live Captioning application using self-hosted runners.

## Workflows Overview

### 🚀 `production.yml` - Production Deployment
**Triggers:** 
- Push to `main`/`master` branches
- Tagged releases (`v*`)
- Manual workflow dispatch

**Purpose:** Deploys the application to production environment with:
- Production API keys injected from GitHub secrets
- Full health checks and verification
- Graceful service restarts

### 🔨 `build.yml` - Build and Test
**Triggers:** 
- Push to `main`/`master`/`develop` branches
- Pull requests to `main`/`master`
- Manual workflow dispatch

**Purpose:** Builds and tests the application:
- Uses production secrets for main/master branches
- Uses placeholder keys for PR builds
- Runs smoke tests on PR builds
- Cleanup options available

### 🎯 `deploy.yml` - General Deploy
**Triggers:** 
- Push to `main`/`master` branches
- Pull requests to `main`/`master`
- Manual workflow dispatch

**Purpose:** General deployment workflow with:
- Docker Compose build and deploy
- Service verification
- Status reporting

## Required Secrets

Configure these secrets in your GitHub repository settings:

- `DEEPGRAM_API_KEY` - Your Deepgram API key for speech transcription
- `OPENAI_API_KEY` - Your OpenAI API key for translation services

## Self-Hosted Runner Requirements

The workflows are configured to run on `self-hosted` runners. Ensure your runner has:

- Docker Engine installed and running
- Docker Compose v2 installed
- Network access for pulling images and accessing APIs
- Sufficient disk space for building images
- Port 60005 available for frontend access

## Usage

### For Production Deployment
1. Push to `main` or `master` branch
2. The `production.yml` workflow will automatically:
   - Build the application using existing docker-compose.yml
   - Inject production API keys into backend configuration
   - Deploy services with health checks
   - Verify deployment success

### For Development/Testing
1. Create a PR or push to `develop` branch
2. The `build.yml` workflow will:
   - Build with test configuration
   - Run smoke tests
   - Clean up after testing

### Manual Deployment
1. Go to Actions tab in GitHub
2. Select desired workflow
3. Click "Run workflow"
4. Choose options if available

## Docker Compose Integration

All workflows use the existing `docker-compose.yml` file without modification:
- Frontend builds from `./frontend/Dockerfile`
- Backend builds from `./backend/Dockerfile`
- API keys are injected via environment variables
- Services communicate through `live-captioning-network`

## Monitoring and Troubleshooting

Check workflow runs in the GitHub Actions tab for:
- Build logs and error messages
- Health check results
- Container status and deployment verification
- API key injection confirmation (keys are masked in logs)

The workflows include comprehensive logging and verification steps to help diagnose any issues.