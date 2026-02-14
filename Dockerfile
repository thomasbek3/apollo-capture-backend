FROM node:20-slim

# Install FFmpeg and native dependencies for sharp
RUN apt-get update && \
    apt-get install -y --no-install-recommends ffmpeg python3 make g++ && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm ci --omit=dev

# Copy application source
COPY . .

# Create data directories
RUN mkdir -p /data/captures /data/results

EXPOSE 3000

CMD ["node", "src/index.js"]
