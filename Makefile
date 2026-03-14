# lumaterm — Build & Release Makefile
# Usage: make help
# Note: Cross-platform builds run via GitHub Actions (see .github/workflows/release.yml)

SHELL := /bin/zsh
export PATH := $(HOME)/.cargo/bin:/opt/homebrew/bin:/usr/local/bin:$(PATH)

APP_NAME := lumaterm
VERSION := $(shell grep '"version"' src-tauri/tauri.conf.json | head -1 | sed 's/.*"version": "\(.*\)".*/\1/')
DIST_DIR := dist-releases

.PHONY: help run build clean check version \
        bump-patch bump-minor bump-major release

# ── Help ──

help:
	@echo "lumaterm v$(VERSION) — Build & Release"
	@echo ""
	@echo "Development:"
	@echo "  make run              Dev mode with hot reload"
	@echo "  make check            Type-check Rust + TypeScript"
	@echo ""
	@echo "Build:"
	@echo "  make build            Build for current platform"
	@echo ""
	@echo "Release:"
	@echo "  make bump-patch       Bump patch version (0.1.0 → 0.1.1)"
	@echo "  make bump-minor       Bump minor version (0.1.0 → 0.2.0)"
	@echo "  make bump-major       Bump major version (0.1.0 → 1.0.0)"
	@echo "  make release          Tag and push to trigger GitHub Actions release"
	@echo ""
	@echo "Utilities:"
	@echo "  make clean            Remove build artifacts"
	@echo "  make version          Show version"
	@echo ""
	@echo "Cross-platform builds (macOS, Linux, Windows) run via GitHub Actions."
	@echo "Push a version tag (v*) to trigger: git tag v0.1.0 && git push --tags"

# ── Development ──

run:
	bun run tauri dev

# ── Build for current platform ──

build:
	bun run tauri build
	@echo "Build output: src-tauri/target/release/bundle/"

# ── Utilities ──

clean:
	rm -rf $(DIST_DIR)
	cd src-tauri && cargo clean

check:
	cd src-tauri && cargo check
	bunx tsc --noEmit

version:
	@echo "$(APP_NAME) v$(VERSION)"

# ── Version Bumping ──

define bump_version
	@CURRENT=$(VERSION); \
	IFS='.' read -r MAJOR MINOR PATCH <<< "$$CURRENT"; \
	case "$(1)" in \
		major) NEW_VERSION="$$((MAJOR + 1)).0.0" ;; \
		minor) NEW_VERSION="$$MAJOR.$$((MINOR + 1)).0" ;; \
		patch) NEW_VERSION="$$MAJOR.$$MINOR.$$((PATCH + 1))" ;; \
	esac; \
	echo "Bumping version: $$CURRENT → $$NEW_VERSION"; \
	sed -i '' "s/\"version\": \"$$CURRENT\"/\"version\": \"$$NEW_VERSION\"/" src-tauri/tauri.conf.json; \
	sed -i '' "s/\"version\": \"$$CURRENT\"/\"version\": \"$$NEW_VERSION\"/" package.json; \
	sed -i '' "s/^version = \"$$CURRENT\"/version = \"$$NEW_VERSION\"/" src-tauri/Cargo.toml; \
	echo "Updated version to $$NEW_VERSION in:"; \
	echo "  - src-tauri/tauri.conf.json"; \
	echo "  - package.json"; \
	echo "  - src-tauri/Cargo.toml"
endef

bump-patch:
	$(call bump_version,patch)

bump-minor:
	$(call bump_version,minor)

bump-major:
	$(call bump_version,major)

# ── GitHub Release ──
# Commits version bump, tags, and pushes to trigger GitHub Actions release workflow

release:
	@echo "Creating release v$(VERSION)..."
	@git add -A && git commit -m "release: v$(VERSION)" || true
	@git tag -a "v$(VERSION)" -m "Release v$(VERSION)"
	@git push origin HEAD --tags
	@echo ""
	@echo "Release v$(VERSION) tagged and pushed."
	@echo "GitHub Actions will build and publish artifacts."
	@echo "Monitor: gh run watch"
