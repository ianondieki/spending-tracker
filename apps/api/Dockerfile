# Hesabu API. Build from the repo root: docker build -f apps/api/Dockerfile -t hesabu-api .
FROM node:22-alpine AS build
RUN corepack enable && corepack prepare pnpm@10.28.0 --activate
WORKDIR /repo
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY apps/api/package.json apps/api/
COPY packages/db/package.json packages/db/
COPY packages/analytics/package.json packages/analytics/
COPY packages/agents/package.json packages/agents/
COPY packages/i18n/package.json packages/i18n/
RUN pnpm install --frozen-lockfile --filter "@hesabu/api..."
COPY apps/api apps/api
COPY packages/db packages/db
COPY packages/analytics packages/analytics
COPY packages/agents packages/agents
COPY packages/i18n packages/i18n
COPY contracts contracts
RUN pnpm --filter "@hesabu/api..." run build \
 && pnpm --filter @hesabu/api --prod --legacy deploy /out

FROM node:22-alpine
ENV NODE_ENV=production TZ=Africa/Nairobi PORT=8787
WORKDIR /app
COPY --from=build /out /app
USER node
EXPOSE 8787
HEALTHCHECK --interval=15s --timeout=3s CMD wget -qO- http://localhost:8787/health || exit 1
CMD ["node", "dist/index.js"]
