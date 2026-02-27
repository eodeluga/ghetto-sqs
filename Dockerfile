FROM node:22-bookworm-slim

ARG DATABASE_URL

WORKDIR /app

COPY package.json ./
COPY tsconfig.json ./
COPY src ./src
COPY prisma ./prisma

# Install CA certificates and OpenSSL for TLS (for Prisma + HTTPS)
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates openssl \
    && rm -rf /var/lib/apt/lists/*

RUN npm install

# Generate Prisma client inside the image
RUN npx prisma generate

# Build the app
RUN npm run build
