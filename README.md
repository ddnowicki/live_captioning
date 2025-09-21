# Live Audio Transcription with Deepgram

A Node.js/React web application for real-time audio transcription using the Deepgram API. Features a modern web interface with WebSocket-based live transcription.

## Quick Start with Docker

This project ships with Docker for easy deployment.

1. **Configure environment:**
   ```bash
   cp .env.example .env
   # Edit .env with your API keys
   ```

2. **Build and run:**
   ```bash
   docker compose up -d --build
   ```

3. **Access the application:**
   - Frontend runs on port 3000
   - Backend API/WebSocket runs on port 3001
   - Frontend connects to backend via WebSocket on port 3001

4. **Stop services:**
   ```bash
   docker compose down
   ```

## Production Deployment with CI/CD

This repository includes a complete CI/CD pipeline for production deployment:

### Automated Deployment
- **Trigger**: Push to `main`/`master` branch
- **Registry**: GitHub Container Registry (ghcr.io)
- **Images**: Optimized multi-stage Docker builds
- **Environment**: Production secrets from GitHub

### Production Setup
1. Configure GitHub repository secrets:
   - `DEEPGRAM_API_KEY` - Your Deepgram API key
   - `OPENAI_API_KEY` - Your OpenAI API key

2. Deploy to production server:
   ```bash
   # Pull and run production images
   ./deploy.sh
   ```

3. Access production application:
   - Frontend: http://localhost:3000
   - Backend: http://localhost:3001

📖 **Complete deployment guide**: [DEPLOYMENT.md](DEPLOYMENT.md)

## Development Setup

### Prerequisites
- Node.js 16+
- npm or yarn
- Deepgram API key (get one free at [console.deepgram.com](https://console.deepgram.com/))

### Installation

1. **Configure environment:**
   ```bash
   cp .env.example .env
   ```

   Edit `.env` with your API keys:
   ```env
   DEEPGRAM_API_KEY=your_deepgram_api_key_here
   OPENAI_API_KEY=your_openai_api_key_here
   ```

2. **Install frontend dependencies:**
   ```bash
   cd frontend
   npm install
   ```

3. **Install backend dependencies:**
   ```bash
   cd ../backend
   npm install
   ```

4. **Run in development mode:**
   ```bash
   # Terminal 1 - Backend (runs on :3001)
   cd backend
   npm run dev

   # Terminal 2 - Frontend (runs on :3000)
   cd frontend
   npm start
   ```

5. **Run in production mode:**
   ```bash
   # Backend (runs on :3001)
   cd backend
   npm start

   # Frontend (build and serve on :3000)
   cd frontend
   npm run build
   # Serve build directory with your preferred static server
   ```

## Features

- **Real-time transcription** with WebSocket communication
- **Web-based audio input** through browser microphone
- **Modern React UI** with responsive design
- **Docker support** for easy deployment
- **Smart formatting** for numbers, dates, and currency
- **Interim and final results** display
- **Voice activity detection**

## Architecture

### Core Components
- **React Frontend** (`frontend/`): Web interface for audio transcription
- **Node.js Backend** (`backend/`): WebSocket server and API endpoints
- **Docker Support**: Containerized deployment with docker-compose

### Configuration
- **Development**: Frontend runs on port 3000, Backend on port 3001
- **Production**: Same ports (3000 for frontend, 3001 for backend)
- **Network Communication**: Frontend connects to backend WebSocket on port 3001
- **Environment variables**: Configure with `REACT_APP_WS_URL` or `REACT_APP_WS_PORT`

## Project Structure

```
live_captioning/
├── frontend/              # React frontend
│   ├── src/              # React source code
│   ├── public/           # Static assets
│   ├── package.json      # Frontend dependencies
│   └── Dockerfile        # Frontend container
├── backend/               # Node.js backend
│   ├── server.js         # Express server and WebSocket
│   ├── package.json      # Backend dependencies
│   └── Dockerfile        # Backend container
├── docker-compose.yml     # Docker orchestration
├── .env.example           # Environment template
└── README.md              # This file
```

## API Integration

### Deepgram Configuration
- Model: Nova-2 (latest accuracy)
- Language: English (configurable)
- Features: Punctuation, smart formatting, interim results
- Real-time WebSocket streaming

### WebSocket Events
- Connection management
- Audio stream processing
- Transcription result handling
- Error recovery

## Troubleshooting

### API Key Issues
- Verify API keys in `.env` file
- Check key validity at [console.deepgram.com](https://console.deepgram.com/)

### Docker Issues
- Ensure Docker is running
- Check port availability (8004, 8005)
- Verify environment variables are set

### Browser Issues
- Grant microphone permissions
- Use HTTPS in production for microphone access
- Check browser console for WebSocket errors

### Development Issues
- Run `npm install` if dependencies are missing
- Check Node.js version (16+ required)
- Verify environment variables are loaded

## License

This project is provided as a working example for Deepgram API integration.

## Resources

- [Deepgram Documentation](https://developers.deepgram.com/docs)
- [Deepgram Node.js SDK](https://github.com/deepgram/deepgram-node-sdk)
- [Get API Key](https://console.deepgram.com/)