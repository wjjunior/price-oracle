# Price Oracle - local run control.
# Quickstart from a fresh clone: `make up`

COMPOSE := docker compose -f infra/docker-compose.yml
DASHBOARD_URL := http://localhost:5173
AGGREGATOR_URL := http://localhost:7402

.DEFAULT_GOAL := help
.PHONY: help up up-full down

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

down: ## Stop the local infra (NATS + MongoDB); keeps the Mongo volume
	$(COMPOSE) down
