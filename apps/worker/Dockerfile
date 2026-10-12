# Hesabu worker. Build from the repo root: docker build -f apps/worker/Dockerfile -t hesabu-worker .
FROM node:22-alpine AS build
RUN corepack enable && corepack prepare pnpm@10.28.0 --activate
WORKDIR /repo
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY apps/worker/package.json apps/worker/
COPY packages/db/package.json packages/db/
COPY packages/analytics/package.json packages/analytics/
COPY packages/agents/package.json packages/agents/
COPY packages/i18n/package.json packages/i18n/
COPY packages/renderer/package.json packages/renderer/
COPY packages/report-model/package.json packages/report-model/
RUN pnpm install --frozen-lockfile --filter "@hesabu/worker..."
COPY apps/worker apps/worker
COPY packages/db packages/db
COPY packages/analytics packages/analytics
COPY packages/agents packages/agents
COPY packages/i18n packages/i18n
COPY packages/renderer packages/renderer
COPY packages/report-model packages/report-model
COPY contracts contracts
RUN pnpm --filter "@hesabu/worker..." run build \
 && pnpm --filter @hesabu/worker --prod --legacy deploy /out

FROM node:22-alpine
ENV NODE_ENV=production TZ=Africa/Nairobi
WORKDIR /app
COPY --from=build /out /app
USER node
CMD ["node", "dist/main.js"]
