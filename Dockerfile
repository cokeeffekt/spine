FROM oven/bun:1-alpine AS base
WORKDIR /app
RUN apk add --no-cache ffmpeg

FROM base AS deps
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

FROM base AS release
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN mkdir -p /data
EXPOSE 3000
CMD ["bun", "run", "src/server.ts"]
