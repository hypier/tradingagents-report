# TradingAgents Report — Makefile

-include docker/config.env
export

REGISTRY ?= ghcr.io
NAMESPACE ?= hypier
API_VERSION ?= latest
WEB_VERSION ?= latest

API_IMAGE ?= $(REGISTRY)/$(NAMESPACE)/tradingagents-api:$(API_VERSION)
WEB_IMAGE ?= $(REGISTRY)/$(NAMESPACE)/tradingagents-web:$(WEB_VERSION)

COMPOSE = docker compose --env-file docker/config.env -f docker/docker-compose.yml
DOCKERFILE_API = docker/Dockerfile.core
DOCKERFILE_WEB = docker/Dockerfile.web

.PHONY: help prod-start prod-stop prod-logs prod-pull status db-migrate
.PHONY: docker-login docker-login-ghcr docker-login-hub
.PHONY: docker-build docker-build-api docker-build-web
.PHONY: docker-build-amd64 docker-build-amd64-api docker-build-amd64-web
.PHONY: docker-setup-buildx docker-push-multiarch docker-all-multiarch
.PHONY: docker-push docker-push-api docker-push-web docker-all docker-clean
.PHONY: update-api update-web update-all check-health

help:
	@echo "TradingAgents Report — commands:"
	@echo ""
	@echo "Production:"
	@echo "  make prod-start     Pull images and start all services"
	@echo "  make prod-stop      Stop production stack"
	@echo "  make prod-logs      Follow production logs"
	@echo "  make prod-pull      Pull images only"
	@echo "  make db-migrate     Apply Drizzle migrations (web image)"
	@echo ""
	@echo "Images:"
	@echo "  make docker-login            Login to REGISTRY"
	@echo "  make docker-build            Build api + web (host arch)"
	@echo "  make docker-build-amd64      Build linux/amd64 images"
	@echo "  make docker-push             Push api + web"
	@echo "  make docker-all              Build + push"
	@echo "  make docker-all-multiarch    Buildx amd64+arm64 and push"
	@echo ""
	@echo "Updates:"
	@echo "  make update-api     Rolling update tradingagents-api"
	@echo "  make update-web     Rolling update tradingagents-web"
	@echo "  make update-all     Update all services"
	@echo "  make check-health   Curl health endpoints"
	@echo ""
	@echo "Config: docker/config.env (submodule: tradingagents-report-docker)"
	@echo "Versions: VERSION / API_VERSION / WEB_VERSION"

# ============================================================
# Production
# ============================================================

prod-start:
	bash docker/start-prod.sh

prod-stop:
	$(COMPOSE) down
	@echo "Production stack stopped"

prod-logs:
	$(COMPOSE) logs -f

prod-pull:
	$(COMPOSE) pull tradingagents-api tradingagents-web
	@echo "Images pulled"

db-migrate:
	bash docker/migrate.sh

status:
	$(COMPOSE) ps

# ============================================================
# Registry login
# ============================================================

docker-login-ghcr:
	@if [ -z "$(GITHUB_TOKEN)" ]; then echo "Set GITHUB_TOKEN in docker/config.env"; exit 1; fi
	@echo "$(GITHUB_TOKEN)" | docker login ghcr.io -u $(GITHUB_USERNAME) --password-stdin

docker-login-hub:
	@if [ -z "$(DOCKER_PASSWORD)" ]; then echo "Set DOCKER_PASSWORD in docker/config.env"; exit 1; fi
	@echo "$(DOCKER_PASSWORD)" | docker login -u $(DOCKER_USERNAME) --password-stdin

docker-login:
	@if [ "$(REGISTRY)" = "ghcr.io" ]; then $(MAKE) docker-login-ghcr; \
	elif [ "$(REGISTRY)" = "docker.io" ] || [ "$(REGISTRY)" = "" ]; then $(MAKE) docker-login-hub; \
	else echo "Unsupported REGISTRY=$(REGISTRY)"; exit 1; fi

# ============================================================
# Build / push
# ============================================================

docker-build-api:
	@echo "Building $(API_IMAGE)"
	docker build -t $(API_IMAGE) -f $(DOCKERFILE_API) .

docker-build-web:
	@echo "Building $(WEB_IMAGE)"
	@if [ -z "$(VITE_CLERK_PUBLISHABLE_KEY)" ]; then echo "Set VITE_CLERK_PUBLISHABLE_KEY"; exit 1; fi
	docker build -t $(WEB_IMAGE) -f $(DOCKERFILE_WEB) \
		--build-arg VITE_CLERK_PUBLISHABLE_KEY=$(VITE_CLERK_PUBLISHABLE_KEY) .

docker-build: docker-build-api docker-build-web
	@echo "Built $(API_IMAGE) and $(WEB_IMAGE)"

docker-build-amd64-api:
	docker build --platform linux/amd64 -t $(API_IMAGE) -f $(DOCKERFILE_API) .

docker-build-amd64-web:
	@if [ -z "$(VITE_CLERK_PUBLISHABLE_KEY)" ]; then echo "Set VITE_CLERK_PUBLISHABLE_KEY"; exit 1; fi
	docker build --platform linux/amd64 -t $(WEB_IMAGE) -f $(DOCKERFILE_WEB) \
		--build-arg VITE_CLERK_PUBLISHABLE_KEY=$(VITE_CLERK_PUBLISHABLE_KEY) .

docker-build-amd64: docker-build-amd64-api docker-build-amd64-web
	@echo "AMD64 images built"

docker-setup-buildx:
	@docker buildx version >/dev/null 2>&1 || (echo "Docker Buildx required"; exit 1)
	@docker buildx inspect tradingagents-builder >/dev/null 2>&1 || \
		docker buildx create --name tradingagents-builder --driver docker-container --bootstrap
	@docker buildx use tradingagents-builder

docker-push-multiarch: docker-setup-buildx
	@if [ -z "$(VITE_CLERK_PUBLISHABLE_KEY)" ]; then echo "Set VITE_CLERK_PUBLISHABLE_KEY"; exit 1; fi
	docker buildx build --platform linux/amd64,linux/arm64 \
		-t $(API_IMAGE) -f $(DOCKERFILE_API) . --push
	docker buildx build --platform linux/amd64,linux/arm64 \
		-t $(WEB_IMAGE) -f $(DOCKERFILE_WEB) \
		--build-arg VITE_CLERK_PUBLISHABLE_KEY=$(VITE_CLERK_PUBLISHABLE_KEY) . --push
	@echo "Multi-arch images pushed"

docker-all-multiarch: docker-push-multiarch

docker-push-api:
	docker push $(API_IMAGE)

docker-push-web:
	docker push $(WEB_IMAGE)

docker-push: docker-push-api docker-push-web
	@echo "Pushed $(API_IMAGE) and $(WEB_IMAGE)"

docker-all: docker-build docker-push

docker-clean:
	@docker rmi $(API_IMAGE) 2>/dev/null || true
	@docker rmi $(WEB_IMAGE) 2>/dev/null || true

# ============================================================
# Rolling update
# ============================================================

update-api:
	bash docker/zero-downtime-update.sh tradingagents-api

update-web:
	bash docker/zero-downtime-update.sh tradingagents-web

update-all:
	bash docker/zero-downtime-update.sh all

check-health:
	@echo "API:"; curl -fsS http://127.0.0.1:8000/health || echo "API unavailable"
	@echo ""
	@echo "Web:"; curl -fsS http://127.0.0.1:8788/api/health || echo "Web unavailable"
	@echo ""
