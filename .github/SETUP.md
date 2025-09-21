# GitHub Actions Setup Guide

## Required Repository Configuration

To enable the CI/CD pipeline, you need to configure your GitHub repository with the necessary environment secrets.

### Step 1: Create Production Environment

1. Go to your repository on GitHub
2. Click **Settings** → **Environments**  
3. Click **New environment**
4. Name it `production`
5. Click **Configure environment**

### Step 2: Add Environment Secrets

In the production environment, add these secrets:

| Secret Name | Value | Description |
|-------------|-------|-------------|
| `DEEPGRAM_API_KEY` | `sk_xxx...` | Your Deepgram API key for audio transcription |
| `OPENAI_API_KEY` | `sk-xxx...` | Your OpenAI API key for text processing |

### Step 3: Configure Environment Protection (Optional)

For additional security, you can:
- Enable **Required reviewers** before deployment
- Set **Wait timer** to delay deployments
- Add **Deployment branches** rule to only allow specific branches

### Step 4: Verify Setup

Once configured, any push to the `main` branch will:
1. ✅ Build optimized Docker images
2. ✅ Push to GitHub Container Registry 
3. ✅ Extract secrets from production environment
4. ✅ Generate deployment artifacts
5. ✅ Run health checks

### Manual Deployment Trigger

You can also trigger deployment manually:
1. Go to **Actions** tab
2. Select **Production Deployment** workflow
3. Click **Run workflow** → **Run workflow**

### Monitoring Deployments

- View deployment status in **Actions** tab
- Check deployment logs for details
- Monitor image builds at `ghcr.io/[username]/live_captioning-*`

### Required Permissions

The workflow uses these GitHub permissions:
- `contents: read` - Read repository code
- `packages: write` - Push to Container Registry  
- `GITHUB_TOKEN` - Automatically provided by GitHub

No additional tokens or permissions are required!