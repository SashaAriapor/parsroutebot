FROM node:22-slim

RUN apt-get update -y && \
    apt-get install -y openssl ca-certificates && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

RUN npm install -g pnpm@9.15.0

# Install bot dependencies
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# Install and build frontend
COPY panel/frontend/package.json panel/frontend/package-lock.json ./panel/frontend/
RUN cd panel/frontend && npm install

COPY . .

RUN cd panel/frontend && npm run build

RUN pnpm prisma generate

CMD ["sh", "-c", "pnpm prisma migrate deploy && pnpm tsx src/main.ts"]