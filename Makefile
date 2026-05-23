# Price Oracle - local run control.
# Quickstart from a fresh clone: `make up`

COMPOSE := docker compose -f infra/docker-compose.yml
COMPOSE_FULL := docker compose -f infra/docker-compose.yml -f infra/docker-compose.full.yml
DASHBOARD_URL := http://localhost:5173
AGGREGATOR_URL := http://localhost:7402

# Load .env (when present) and pass it to the app processes, so overrides like
# ANTHROPIC_API_KEY take effect. Absent .env keeps the zero-secret core path.
ifneq (,$(wildcard .env))
include .env
export
endif

.DEFAULT_GOAL := help
.PHONY: help up up-full up-real up-docker down

help: ## Show available commands
	@echo "Price Oracle - local run control"
	@echo ""
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-9s\033[0m %s\n", $$1, $$2}'
	@echo ""
	@echo "Core path needs no secrets. Ctrl-C stops the apps; infra stays up until 'make down'."

# Install only when the manifests change so re-runs stay fast.
node_modules: package.json pnpm-lock.yaml
	pnpm install
	@touch node_modules

up: node_modules ## Start infra + core apps (mock, aggregator, dashboard) in the foreground
	$(COMPOSE) up -d --wait
	@echo ""
	@echo "Infra healthy. Dashboard: $(DASHBOARD_URL)  |  Aggregator API: $(AGGREGATOR_URL)"
	@echo ""
	pnpm run dev:core

up-full: node_modules ## Same as 'up' plus the real binance + coinbase ingestors (needs network)
	$(COMPOSE) up -d --wait
	@echo ""
	@echo "Infra healthy. Dashboard: $(DASHBOARD_URL)  |  Aggregator API: $(AGGREGATOR_URL)"
	@echo ""
	pnpm run dev:full

up-real: node_modules ## Real feeds only (binance + coinbase, no mock; needs network)
	$(COMPOSE) up -d --wait
	@echo ""
	@echo "Infra healthy. Dashboard: $(DASHBOARD_URL)  |  Aggregator API: $(AGGREGATOR_URL)"
	@echo ""
	pnpm run dev:real

up-docker: ## Build + run the full containerized stack (infra + every app); slow first build
	$(COMPOSE_FULL) up -d --build --wait
	@echo ""
	@echo "Containerized stack up. Dashboard: $(DASHBOARD_URL)  |  Aggregator API: $(AGGREGATOR_URL)"

down: ## Stop the local infra (NATS + MongoDB); keeps the Mongo volume
	$(COMPOSE_FULL) down --remove-orphans
