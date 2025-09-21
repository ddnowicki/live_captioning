# Node API for live transcription
FROM node:20-alpine

WORKDIR /app

# Install deps
COPY package.json package-lock.json* .npmrc* ./
RUN npm ci || npm install

# Copy only server-side code and any needed assets
COPY server.js ./
# Optional: copy build if serving static assets from API in production
# COPY build ./build

EXPOSE 3001
ENV HOST=0.0.0.0
ENV PORT=3001

# Expect API keys from environment
# ENV DEEPGRAM_API_KEY=changeme
# ENV OPENAI_API_KEY=changeme

CMD ["npm", "start"]
