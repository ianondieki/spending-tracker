# Hesabu monorepo. `make check` is what CI runs; it never reaches a real LLM, email, WhatsApp, SMS or payment provider.
SHELL := /bin/sh
COMPOSE := docker compose -f infra/docker-compose.yml

# Lane B (api, worker, analytics, agents, db, i18n) and Lane D (pack-engine, taxonomy) packages.
BACKEND_FILTER := --filter "@hesabu/api..." --filter "@hesabu/worker..." --filter "@hesabu/agents" \
    --filter "@hesabu/db" --filter "@hesabu/i18n" --filter "@hesabu/pack-engine" --filter "@hesabu/taxonomy"
# Lane C packages: web and everything it depends on, plus renderer and report-model.
WEB_FILTER := --filter "@hesabu/web..." --filter "@hesabu/renderer..." --filter "@hesabu/report-model"

.PHONY: dev dev-app down migrate seed-demo check check-backend check-web check-android evals

## dev: start Postgres 16, Mailpit and MinIO in the background, then apply migrations
dev:
	$(COMPOSE) up -d
	pnpm --filter @hesabu/db migrate

## dev-app: also build and run the api and worker containers (profile app)
dev-app:
	$(COMPOSE) --profile app up -d --build

## migrate: apply pending database migrations (DATABASE_URL)
migrate:
	pnpm --filter @hesabu/db migrate

## seed-demo: load the demo inbox into a demo user and generate last week's and last month's reports
seed-demo:
	pnpm --filter @hesabu/db seed:demo

## down: stop the local stack (keeps volumes)
down:
	$(COMPOSE) down

## check: lint, typecheck, test and build every workspace package (same as CI)
check:
	pnpm lint && pnpm typecheck && pnpm test && pnpm build

## check-backend: the same four steps for the backend and parser packages only
check-backend:
	pnpm $(BACKEND_FILTER) --if-present run lint
	pnpm $(BACKEND_FILTER) --if-present run typecheck
	pnpm $(BACKEND_FILTER) --if-present run test
	pnpm $(BACKEND_FILTER) --if-present run build

## check-web: the same four steps for web, charts, renderer and report-model
check-web:
	pnpm $(WEB_FILTER) --if-present run lint
	pnpm $(WEB_FILTER) --if-present run typecheck
	pnpm $(WEB_FILTER) --if-present run test
	pnpm $(WEB_FILTER) --if-present run build

## check-android: unit tests and lint for the Android app (Lane A)
check-android:
	cd android && ./gradlew testDebugUnitTest lint

## evals: nightly only; needs ANTHROPIC_API_KEY and a spend cap. Exits 0 without the key so CI never pays.
evals:
	@if [ -z "$$ANTHROPIC_API_KEY" ]; then echo "nightly only; requires ANTHROPIC_API_KEY"; exit 0; fi; \
	pnpm -r --if-present run evals
