# lumaterm — Build & Release Makefile
# Usage: make help

SHELL := /bin/zsh
export PATH := $(HOME)/.cargo/bin:/opt/homebrew/bin:/usr/local/bin:$(PATH)

APP_NAME := lumaterm
VERSION := $(shell grep '"version"' src-tauri/tauri.conf.json | head -1 | sed 's/.*"version": "\(.*\)".*/\1/')
DIST_DIR := dist-releases

.PHONY: help run build clean check version list-targets setup-targets \
        build-mac build-mac-arm build-mac-intel build-mac-universal \
        build-linux-x64 build-linux-arm build-win-x64 build-win-arm build-all \
        bump-patch bump-minor bump-major release checksums

# ── Help ──

help:
	@echo "lumaterm v$(VERSION) — Build & Release"
	@echo ""
	@echo "Development:"
	@echo "  make run              Dev mode"
	@echo "  make check            Type-check Rust + TypeScript"
	@echo ""
	@echo "Build:"
	@echo "  make build            Build for current platform"
	@echo "  make build-mac        macOS ARM + Intel"
	@echo "  make build-mac-arm    macOS ARM64 only"
	@echo "  make build-mac-intel  macOS x86_64 only"
	@echo "  make build-linux-x64  Linux x86_64"
	@echo "  make build-linux-arm  Linux ARM64"
	@echo "  make build-win-x64    Windows x86_64"
	@echo "  make build-win-arm    Windows ARM64"
	@echo "  make build-all        All platforms"
	@echo ""
	@echo "Release:"
	@echo "  make bump-patch       Bump patch version (0.1.0 → 0.1.1)"
	@echo "  make bump-minor       Bump minor version (0.1.0 → 0.2.0)"
	@echo "  make bump-major       Bump major version (0.1.0 → 1.0.0)"
	@echo "  make release          Build, tag, and upload GitHub release"
	@echo "  make checksums        Generate SHA256 checksums for dist"
	@echo ""
	@echo "Utilities:"
	@echo "  make clean            Remove build artifacts"
	@echo "  make version          Show version"
	@echo "  make list-targets     Show Rust targets"
	@echo "  make setup-targets    Install all cross-compile targets"

# ── Development ──

run:
	bun run tauri dev

# ── Build for current platform ──

build:
	bun run tauri build

# ── Target setup ──

setup-targets:
	@echo "Installing cross-compile targets..."
	rustup target add aarch64-apple-darwin
	rustup target add x86_64-apple-darwin
	rustup target add x86_64-unknown-linux-gnu
	rustup target add aarch64-unknown-linux-gnu
	rustup target add x86_64-pc-windows-msvc
	rustup target add aarch64-pc-windows-msvc
	@echo "Done. Installed targets:"
	@rustup target list --installed

# ── macOS Builds ──

build-mac: build-mac-arm build-mac-intel
	@echo "✓ macOS builds complete"

build-mac-arm:
	@echo "Building macOS ARM64..."
	@rustup target list --installed | grep -q aarch64-apple-darwin || \
		(echo "Installing target aarch64-apple-darwin..." && rustup target add aarch64-apple-darwin)
	bun run tauri build --target aarch64-apple-darwin
	@mkdir -p $(DIST_DIR)/macos-arm64
	@cp -r src-tauri/target/aarch64-apple-darwin/release/bundle/dmg/*.dmg $(DIST_DIR)/macos-arm64/ 2>/dev/null || true
	@cp -r src-tauri/target/aarch64-apple-darwin/release/bundle/macos/*.app $(DIST_DIR)/macos-arm64/ 2>/dev/null || true
	@echo "✓ macOS ARM64 build: $(DIST_DIR)/macos-arm64/"

build-mac-intel:
	@echo "Building macOS x86_64..."
	@rustup target list --installed | grep -q x86_64-apple-darwin || \
		(echo "Installing target x86_64-apple-darwin..." && rustup target add x86_64-apple-darwin)
	bun run tauri build --target x86_64-apple-darwin
	@mkdir -p $(DIST_DIR)/macos-x64
	@cp -r src-tauri/target/x86_64-apple-darwin/release/bundle/dmg/*.dmg $(DIST_DIR)/macos-x64/ 2>/dev/null || true
	@cp -r src-tauri/target/x86_64-apple-darwin/release/bundle/macos/*.app $(DIST_DIR)/macos-x64/ 2>/dev/null || true
	@echo "✓ macOS x86_64 build: $(DIST_DIR)/macos-x64/"

build-mac-universal: build-mac-arm build-mac-intel
	@echo "Creating universal macOS binary..."
	@mkdir -p $(DIST_DIR)/macos-universal
	@if [ -f src-tauri/target/aarch64-apple-darwin/release/$(APP_NAME) ] && \
	    [ -f src-tauri/target/x86_64-apple-darwin/release/$(APP_NAME) ]; then \
		lipo -create \
			src-tauri/target/aarch64-apple-darwin/release/$(APP_NAME) \
			src-tauri/target/x86_64-apple-darwin/release/$(APP_NAME) \
			-output $(DIST_DIR)/macos-universal/$(APP_NAME); \
		echo "✓ Universal binary: $(DIST_DIR)/macos-universal/$(APP_NAME)"; \
	else \
		echo "⚠ Could not create universal binary — missing one or both arch builds"; \
	fi

# ── Linux Builds (cross-compile from macOS requires Docker or CI) ──

build-linux-x64:
	@echo "Building Linux x86_64..."
	@rustup target list --installed | grep -q x86_64-unknown-linux-gnu || \
		(echo "Installing target x86_64-unknown-linux-gnu..." && rustup target add x86_64-unknown-linux-gnu)
	bun run tauri build --target x86_64-unknown-linux-gnu
	@mkdir -p $(DIST_DIR)/linux-x64
	@cp src-tauri/target/x86_64-unknown-linux-gnu/release/bundle/deb/*.deb $(DIST_DIR)/linux-x64/ 2>/dev/null || true
	@cp src-tauri/target/x86_64-unknown-linux-gnu/release/bundle/rpm/*.rpm $(DIST_DIR)/linux-x64/ 2>/dev/null || true
	@cp src-tauri/target/x86_64-unknown-linux-gnu/release/bundle/appimage/*.AppImage $(DIST_DIR)/linux-x64/ 2>/dev/null || true
	@echo "✓ Linux x86_64 build: $(DIST_DIR)/linux-x64/"

build-linux-arm:
	@echo "Building Linux ARM64..."
	@rustup target list --installed | grep -q aarch64-unknown-linux-gnu || \
		(echo "Installing target aarch64-unknown-linux-gnu..." && rustup target add aarch64-unknown-linux-gnu)
	bun run tauri build --target aarch64-unknown-linux-gnu
	@mkdir -p $(DIST_DIR)/linux-arm64
	@cp src-tauri/target/aarch64-unknown-linux-gnu/release/bundle/deb/*.deb $(DIST_DIR)/linux-arm64/ 2>/dev/null || true
	@cp src-tauri/target/aarch64-unknown-linux-gnu/release/bundle/rpm/*.rpm $(DIST_DIR)/linux-arm64/ 2>/dev/null || true
	@cp src-tauri/target/aarch64-unknown-linux-gnu/release/bundle/appimage/*.AppImage $(DIST_DIR)/linux-arm64/ 2>/dev/null || true
	@echo "✓ Linux ARM64 build: $(DIST_DIR)/linux-arm64/"

# ── Windows Builds (cross-compile from macOS requires CI) ──

build-win-x64:
	@echo "Building Windows x86_64..."
	@rustup target list --installed | grep -q x86_64-pc-windows-msvc || \
		(echo "Installing target x86_64-pc-windows-msvc..." && rustup target add x86_64-pc-windows-msvc)
	bun run tauri build --target x86_64-pc-windows-msvc
	@mkdir -p $(DIST_DIR)/windows-x64
	@cp src-tauri/target/x86_64-pc-windows-msvc/release/bundle/msi/*.msi $(DIST_DIR)/windows-x64/ 2>/dev/null || true
	@cp src-tauri/target/x86_64-pc-windows-msvc/release/bundle/nsis/*.exe $(DIST_DIR)/windows-x64/ 2>/dev/null || true
	@echo "✓ Windows x86_64 build: $(DIST_DIR)/windows-x64/"

build-win-arm:
	@echo "Building Windows ARM64..."
	@rustup target list --installed | grep -q aarch64-pc-windows-msvc || \
		(echo "Installing target aarch64-pc-windows-msvc..." && rustup target add aarch64-pc-windows-msvc)
	bun run tauri build --target aarch64-pc-windows-msvc
	@mkdir -p $(DIST_DIR)/windows-arm64
	@cp src-tauri/target/aarch64-pc-windows-msvc/release/bundle/msi/*.msi $(DIST_DIR)/windows-arm64/ 2>/dev/null || true
	@cp src-tauri/target/aarch64-pc-windows-msvc/release/bundle/nsis/*.exe $(DIST_DIR)/windows-arm64/ 2>/dev/null || true
	@echo "✓ Windows ARM64 build: $(DIST_DIR)/windows-arm64/"

# ── Build All ──

build-all: build-mac build-linux-x64 build-linux-arm build-win-x64 build-win-arm
	@echo ""
	@echo "═══════════════════════════════════════"
	@echo "  $(APP_NAME) v$(VERSION) — All builds complete"
	@echo "  Output: $(DIST_DIR)/"
	@echo "═══════════════════════════════════════"

# ── Utilities ──

clean:
	rm -rf $(DIST_DIR)
	cd src-tauri && cargo clean

check:
	cd src-tauri && cargo check
	bunx tsc --noEmit

version:
	@echo "$(APP_NAME) v$(VERSION)"

list-targets:
	@echo "Available targets:"
	@echo "  macOS:   aarch64-apple-darwin, x86_64-apple-darwin"
	@echo "  Linux:   x86_64-unknown-linux-gnu, aarch64-unknown-linux-gnu"
	@echo "  Windows: x86_64-pc-windows-msvc, aarch64-pc-windows-msvc"
	@echo ""
	@echo "Installed targets:"
	@rustup target list --installed

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

# ── Checksums ──

checksums:
	@echo "Generating SHA256 checksums..."
	@cd $(DIST_DIR) && find . -type f \( -name "*.dmg" -o -name "*.app" -o -name "*.deb" -o -name "*.rpm" \
		-o -name "*.AppImage" -o -name "*.msi" -o -name "*.exe" \) -exec shasum -a 256 {} \; > checksums-sha256.txt
	@echo "Checksums written to $(DIST_DIR)/checksums-sha256.txt"
	@cat $(DIST_DIR)/checksums-sha256.txt

# ── GitHub Release ──

release: build checksums
	@echo ""
	@echo "Creating GitHub release v$(VERSION)..."
	@git add -A && git commit -m "release: v$(VERSION)" || true
	@git tag -a "v$(VERSION)" -m "Release v$(VERSION)"
	@git push origin HEAD --tags
	@echo "Uploading release assets to GitHub..."
	@gh release create "v$(VERSION)" \
		--title "$(APP_NAME) v$(VERSION)" \
		--generate-notes \
		$(DIST_DIR)/checksums-sha256.txt \
		$$(find $(DIST_DIR) -type f \( -name "*.dmg" -o -name "*.deb" -o -name "*.rpm" \
			-o -name "*.AppImage" -o -name "*.msi" -o -name "*.exe" \) 2>/dev/null)
	@echo ""
	@echo "Release v$(VERSION) published!"
	@echo "Release URL: $$(gh release view v$(VERSION) --json url -q .url)"
