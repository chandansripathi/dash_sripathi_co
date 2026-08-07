FROM node:22-bookworm-slim AS dependencies
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

FROM node:22-bookworm-slim AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
RUN corepack enable
COPY --from=dependencies /app/node_modules ./node_modules
COPY --from=dependencies /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml ./
COPY . .
RUN pnpm run build

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0 NEXUS_DATA_DIR=/data
RUN groupadd --system --gid 1001 nexus && useradd --system --uid 1001 --gid nexus nexus
COPY --from=builder --chown=nexus:nexus /app/public ./public
COPY --from=builder --chown=nexus:nexus /app/.next/standalone ./
COPY --from=builder --chown=nexus:nexus /app/.next/static ./.next/static
COPY --from=builder --chown=nexus:nexus /app/db ./db
COPY --from=builder --chown=nexus:nexus /app/seed ./seed
COPY --from=builder --chown=nexus:nexus /app/scripts ./scripts
RUN mkdir -p /data/uploads && chown -R nexus:nexus /data
USER nexus
EXPOSE 3000
CMD ["sh", "-c", "node scripts/migrate.mjs && node scripts/seed.mjs && node server.js"]

FROM node:22-bookworm-slim AS worker
WORKDIR /app
ENV NODE_ENV=production
COPY --from=dependencies /app/node_modules ./node_modules
COPY --from=builder /app/scripts/alert-worker.mjs ./scripts/alert-worker.mjs
CMD ["node", "scripts/alert-worker.mjs"]
