# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Node.js/React-based live audio transcription application using the Deepgram API. It provides a web interface for real-time audio transcription with WebSocket support.

## Environment Setup

The project uses Node.js with npm for dependency management.

**Install dependencies:**
```bash
npm install
```

## Configuration

The project requires API keys configured in `.env`:
```
DEEPGRAM_API_KEY=your_deepgram_api_key_here
OPENAI_API_KEY=your_openai_api_key_here
```

## Running the Application

**Development mode:**
```bash
# Backend
cd backend && npm run dev

# Frontend (separate terminal)
cd frontend && npm start
```

**Production mode:**
```bash
# Backend
cd backend && npm start

# Frontend
cd frontend && npm run build
```

**Docker deployment:**
```bash
docker compose up -d --build
```

## Architecture

The application consists of:

### Core Components
1. **React Frontend** (`frontend/`) - Web interface for audio transcription
2. **Node.js Backend** (`backend/`) - WebSocket server and API endpoints
3. **Docker Support** - Containerized deployment with docker-compose

### Key Features
- Real-time WebSocket communication
- Deepgram integration for live transcription
- Web-based audio input interface
- Responsive React UI

### Configuration
- Web UI: localhost:8004 (development) / localhost:8004 (Docker)
- API/WebSocket: localhost:8005 (Docker)
- Auto-detection of WebSocket URLs in client

## Dependencies

Core dependencies in `package.json`:
- React/Next.js for frontend
- WebSocket libraries for real-time communication
- Deepgram SDK for transcription services
- Express.js for backend API

## Error Handling

The application includes error handling for:
- Missing/invalid API keys
- WebSocket connection failures
- Network connectivity issues
- Audio input problems