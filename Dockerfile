FROM node:20-slim

# Install FFmpeg for video processing
RUN apt-get update && \
    apt-get install -y --no-install-recommends ffmpeg && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy application source
COPY . .

# Create data directories
RUN mkdir -p /data/captures /data/results

EXPOSE 3000

CMD ["node", "src/index.js"]
