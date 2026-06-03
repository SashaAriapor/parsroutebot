FROM node:22-slim

RUN apt-get update -y && \
    apt-get install -y openssl ca-certificates curl unzip && \
    rm -rf /var/lib/apt/lists/*

RUN curl -Lo /tmp/xray.zip \
    https://github.com/XTLS/Xray-core/releases/download/v1.8.24/Xray-linux-64.zip && \
    unzip /tmp/xray.zip -d /usr/local/bin xray && \
    chmod +x /usr/local/bin/xray && \
    rm /tmp/xray.zip

WORKDIR /app

RUN npm install -g pnpm@9.15.0

# Install bot dependencies
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# Install and build frontend
COPY panel/frontend/package.json ./panel/frontend/
RUN cd panel/frontend && npm install

COPY . .

RUN cd panel/frontend && npm run build

RUN pnpm prisma generate

CMD ["sh", "-c", "pnpm prisma migrate deploy && pnpm tsx src/main.ts"]