# Build and run React dev server
FROM node:20-alpine

# Install libc6-compat for some native deps (optional)
RUN apk add --no-cache libc6-compat

WORKDIR /app

# Install deps first (cache layer)
COPY package.json package-lock.json* .npmrc* ./
RUN npm ci || npm install

# Copy source
COPY public ./public
COPY src ./src

# Expose React dev server port
EXPOSE 3000

# Default envs for CRA
ENV HOST=0.0.0.0
ENV PORT=3000
# Point client to API ws default (can override via compose)
ENV REACT_APP_WS_PORT=3001

# Start React dev server
CMD ["npm", "start"]
