FROM node:22-alpine AS base
WORKDIR /app

# Install dependencies
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

# Copy source
COPY tsconfig.json ./
COPY src/ ./src/
COPY public/ ./public/

EXPOSE 3000

CMD ["node", "--import", "tsx/esm", "src/server.ts"]
