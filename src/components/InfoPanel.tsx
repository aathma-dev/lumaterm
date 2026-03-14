import React, { useEffect, useState, useCallback, useSyncExternalStore } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useAppStore } from "../state/store";
import { ResizeHandle } from "./ResizeHandle";
import { getAddons, onAddonsChange, type Addon } from "../lib/addons";
// Register all built-in addons
import "../addons";

const SF = "-apple-system, BlinkMacSystemFont, 'SF Pro Text', system-ui, sans-serif";
const MONO = "'SF Mono', Menlo, monospace";

/** Hook to reactively read the addon registry */
function useAddons(): Addon[] {
  return useSyncExternalStore(onAddonsChange, getAddons, getAddons);
}

interface FolderEntry {
  name: string;
  is_dir: boolean;
  size: number;
  modified: string;
}

interface EnvVar {
  key: string;
  value: string;
}

interface EnvFile {
  path: string;
  vars: EnvVar[];
}

interface ProjectTool {
  name: string;
  category: string;
  config_file: string;
  version: string;
}

interface PackageDep {
  name: string;
  version: string;
  dep_type: string;
}

interface PackageManager {
  name: string;
  config_file: string;
  packages: PackageDep[];
}

interface ProjectCommand {
  name: string;
  command: string;
  source: string;
}

interface SystemInfo {
  cwd: string;
  folder_size: string;
  file_count: number;
  dir_count: number;
  entries: FolderEntry[];
  env_vars: EnvVar[];
  env_files: EnvFile[];
  os_name: string;
  os_version: string;
  hostname: string;
  shell: string;
  detected_tools: ProjectTool[];
  package_managers: PackageManager[];
  commands: ProjectCommand[];
}

export function InfoPanel() {
  const addons = useAddons();
  const infoPanelWidth = useAppStore((s) => s.infoPanelWidth);
  const setInfoPanelWidth = useAppStore((s) => s.setInfoPanelWidth);
  const infoPanelTab = useAppStore((s) => s.infoPanelTab);
  const setInfoPanelTab = useAppStore((s) => s.setInfoPanelTab);
  const t = useAppStore((s) => s.theme);

  return (
    <div style={{
      position: "relative", display: "flex", flexDirection: "column",
      width: infoPanelWidth, minWidth: 250,
      borderLeft: `1px solid ${t.border}`, background: t.bgSidebar, fontFamily: SF,
    }}>
      <ResizeHandle direction="vertical" position="left" onResize={setInfoPanelWidth} />

      {/* Tab switcher */}
      <div style={{
        display: "flex", alignItems: "center", gap: 2,
        padding: "6px 8px", borderBottom: `1px solid ${t.border}`,
        background: t.bgSidebar,
      }}>
        {addons.map((addon) => {
          const active = infoPanelTab === addon.id;
          return (
            <button
              key={addon.id}
              onClick={() => setInfoPanelTab(addon.id)}
              style={{
                flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
                padding: "6px 8px", borderRadius: 6,
                fontSize: 11, fontWeight: active ? 600 : 400,
                fontFamily: SF, cursor: "pointer", border: "none",
                background: active ? t.accentBg : "transparent",
                color: active ? t.accent : t.textMuted,
                transition: "all 0.15s",
              }}
              onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = t.bgHover; }}
              onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = "transparent"; }}
            >
              {addon.icon(active ? t.accent : t.textMuted)}
              {addon.label}
            </button>
          );
        })}
      </div>

      {/* Tab content — lazy: only mount once a tab has been visited */}
      <LazyTabContent tab={infoPanelTab} addons={addons} />

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

// ── Lazy Tab Content ──
// Only mounts an addon component the first time its tab is selected, then keeps it alive (hidden via display:none)

function LazyTabContent({ tab, addons }: { tab: string; addons: Addon[] }) {
  const [mounted, setMounted] = useState<Set<string>>(new Set([tab]));

  useEffect(() => {
    setMounted((prev) => {
      if (prev.has(tab)) return prev;
      const next = new Set(prev);
      next.add(tab);
      return next;
    });
  }, [tab]);

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", position: "relative" }}>
      {addons.map((addon) =>
        mounted.has(addon.id) ? (
          <div
            key={addon.id}
            style={{
              display: tab === addon.id ? "flex" : "none",
              flexDirection: "column", flex: 1, overflow: "hidden",
              position: tab === addon.id ? "relative" : "absolute",
              width: "100%", height: "100%",
            }}
          >
            {React.createElement(addon.component)}
          </div>
        ) : null
      )}
    </div>
  );
}

// ── System View ──

type SysSection = "tools" | "files" | "env" | "disk" | string;

export function SystemView() {
  const groups = useAppStore((s) => s.groups);
  const activeGroupId = useAppStore((s) => s.activeGroupId);
  const t = useAppStore((s) => s.theme);

  const [sysInfo, setSysInfo] = useState<SystemInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Set<SysSection>>(
    new Set(["tools", "commands", "files", "env", "env-files", "pkg-npm", "pkg-yarn", "pkg-pnpm", "pkg-bun", "pkg-cargo", "pkg-composer", "pkg-python", "pkg-pip", "pkg-go"])
  );
  const [expandedEnv, setExpandedEnv] = useState<string | null>(null);
  const [expandedPkgManager, setExpandedPkgManager] = useState<string | null>(null);

  const cwd = groups[activeGroupId]?.cwd || "";

  const fetchSystemInfo = useCallback(() => {
    if (!cwd) { setSysInfo(null); return; }
    setLoading(true);
    invoke<SystemInfo>("system_info", { cwd })
      .then(setSysInfo)
      .catch(() => setSysInfo(null))
      .finally(() => setLoading(false));
  }, [cwd]);

  useEffect(() => { fetchSystemInfo(); }, [fetchSystemInfo]);

  const toggleSection = useCallback((section: SysSection) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(section)) next.delete(section); else next.add(section);
      return next;
    });
  }, []);

  const chevron = (open: boolean) => (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none"
      style={{ transition: "transform 0.15s", transform: open ? "rotate(90deg)" : "rotate(0deg)" }}>
      <path d="M3.5 2L6.5 5L3.5 8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );

  const sectionHeaderStyle: React.CSSProperties = {
    display: "flex", alignItems: "center", gap: 6,
    padding: "8px 12px", fontSize: 11, fontWeight: 600,
    color: t.textMuted, textTransform: "uppercase",
    letterSpacing: "0.05em", cursor: "pointer", userSelect: "none", fontFamily: SF,
  };

  function formatSize(bytes: number): string {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  }

  if (!cwd) {
    return (
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24, gap: 12 }}>
        <svg width="40" height="40" viewBox="0 0 40 40" fill="none" style={{ color: t.textMuted, opacity: 0.5 }}>
          <path d="M6 10C6 8.9 6.9 8 8 8h16l4 4h6c1.1 0 2 .9 2 2v16c0 1.1-.9 2-2 2H8c-1.1 0-2-.9-2-2V10z" stroke="currentColor" strokeWidth="2" fill="none" />
          <line x1="5" y1="5" x2="35" y2="35" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.6" />
        </svg>
        <div style={{ fontSize: 14, color: t.textSecondary }}>No working directory</div>
        <div style={{ fontSize: 12, color: t.textMuted }}>Open a terminal to get started</div>
      </div>
    );
  }

  if (loading && !sysInfo) {
    return <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: t.textMuted, fontSize: 13 }}>Loading...</div>;
  }

  if (!sysInfo) return null;

  return (
    <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden" }}>
      {/* System overview cards */}
      <div style={{ padding: "10px 12px", borderBottom: `1px solid ${t.border}` }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <InfoCard label="OS" value={`${sysInfo.os_name} ${sysInfo.os_version}`} theme={t} />
          <InfoCard label="Host" value={sysInfo.hostname} theme={t} />
          <InfoCard label="Shell" value={sysInfo.shell.split("/").pop() || sysInfo.shell} theme={t} />
          <InfoCard label="Folder Size" value={sysInfo.folder_size} theme={t} />
          <InfoCard label="Files" value={String(sysInfo.file_count)} theme={t} />
          <InfoCard label="Directories" value={String(sysInfo.dir_count)} theme={t} />
        </div>
      </div>

      {/* Current path */}
      <div style={{ padding: "8px 12px", borderBottom: `1px solid ${t.border}`, display: "flex", alignItems: "center", gap: 6 }}>
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ color: t.textMuted, flexShrink: 0 }}>
          <path d="M1.5 2.5h3l1 1.5h5v6h-9v-7.5z" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" />
        </svg>
        <span style={{ fontSize: 11, color: t.textSecondary, fontFamily: MONO, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {sysInfo.cwd}
        </span>
        <button onClick={fetchSystemInfo} title="Refresh" style={{ marginLeft: "auto", background: "transparent", border: "none", color: t.textMuted, cursor: "pointer", padding: 2, display: "flex", borderRadius: 4, flexShrink: 0 }}
          onMouseEnter={(e) => { e.currentTarget.style.color = t.textPrimary; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = t.textMuted; }}>
          <svg width="12" height="12" viewBox="0 0 14 14" fill="none" style={{ animation: loading ? "spin 1s linear infinite" : "none" }}>
            <path d="M12.5 7a5.5 5.5 0 1 1-1.1-3.3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
            <path d="M12.5 2v3.7h-3.7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>

      {/* Detected Tools */}
      {sysInfo.detected_tools.length > 0 && (
        <div>
          <div style={sectionHeaderStyle} onClick={() => toggleSection("tools")}>
            {chevron(expandedSections.has("tools"))}
            Project Stack
            <span style={{ fontSize: 10, color: t.textMuted, fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>
              ({sysInfo.detected_tools.length})
            </span>
          </div>
          {expandedSections.has("tools") && (
            <div style={{ padding: "0 12px 8px" }}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {sysInfo.detected_tools.map((tool) => {
                  const catColors: Record<string, { bg: string; border: string; text: string }> = {
                    language: { bg: "rgba(158,206,106,0.12)", border: "rgba(158,206,106,0.3)", text: "#9ece6a" },
                    package_manager: { bg: "rgba(125,207,255,0.12)", border: "rgba(125,207,255,0.3)", text: "#7dcfff" },
                    linter: { bg: "rgba(224,175,104,0.12)", border: "rgba(224,175,104,0.3)", text: "#e0af68" },
                    framework: { bg: "rgba(187,154,247,0.12)", border: "rgba(187,154,247,0.3)", text: "#bb9af7" },
                    build: { bg: "rgba(255,158,100,0.12)", border: "rgba(255,158,100,0.3)", text: "#ff9e64" },
                    ci: { bg: "rgba(122,162,247,0.12)", border: "rgba(122,162,247,0.3)", text: "#7aa2f7" },
                  };
                  const c = catColors[tool.category] || catColors.build;
                  return (
                    <div
                      key={`${tool.name}-${tool.config_file}`}
                      title={`${tool.config_file}${tool.version ? ` v${tool.version}` : ""}`}
                      style={{
                        display: "flex", alignItems: "center", gap: 4,
                        padding: "4px 8px", borderRadius: 6,
                        background: c.bg, border: `1px solid ${c.border}`,
                        fontSize: 11, fontWeight: 500, color: c.text, fontFamily: SF,
                      }}
                    >
                      <span>{tool.name}</span>
                      {tool.version && (
                        <span style={{ fontSize: 9, opacity: 0.7, fontFamily: MONO }}>{tool.version}</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Commands */}
      {sysInfo.commands.length > 0 && (
        <div style={{ borderTop: `1px solid ${t.border}` }}>
          <div style={sectionHeaderStyle} onClick={() => toggleSection("commands")}>
            {chevron(expandedSections.has("commands"))}
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ color: "currentColor", flexShrink: 0 }}>
              <rect x="1" y="1" width="10" height="10" rx="2" stroke="currentColor" strokeWidth="1" fill="none" opacity="0.5" />
              <path d="M3.5 4.5L5.5 6L3.5 7.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
              <line x1="6.5" y1="7.5" x2="8.5" y2="7.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            </svg>
            Commands
            <span style={{ fontSize: 10, color: t.textMuted, fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>
              ({sysInfo.commands.length})
            </span>
          </div>
          {expandedSections.has("commands") && (
            <div style={{ padding: "0 8px 8px" }}>
              {(() => {
                // Group commands by source
                const groups: Record<string, ProjectCommand[]> = {};
                for (const cmd of sysInfo.commands) {
                  if (!groups[cmd.source]) groups[cmd.source] = [];
                  groups[cmd.source].push(cmd);
                }
                const sourceColors: Record<string, string> = {
                  "package.json": "#9ece6a",
                  "Makefile": "#ff9e64",
                  "composer.json": "#f7768e",
                  "Makefile.toml": "#ff9e64",
                  "justfile": "#bb9af7",
                  "Taskfile.yml": "#7dcfff",
                  "Taskfile.yaml": "#7dcfff",
                  "taskfile.yml": "#7dcfff",
                  "pyproject.toml": "#e0af68",
                };
                return Object.entries(groups).map(([source, cmds]) => (
                  <div key={source}>
                    <div style={{
                      fontSize: 10, fontWeight: 600, padding: "6px 8px 3px",
                      color: sourceColors[source] || t.textMuted,
                    }}>
                      {source} ({cmds.length})
                    </div>
                    {cmds.map((cmd) => (
                      <div
                        key={`${source}-${cmd.name}`}
                        style={{
                          display: "flex", alignItems: "center", gap: 6,
                          padding: "3px 8px", borderRadius: 4, fontSize: 11,
                          transition: "background 0.1s", cursor: "default",
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = t.bgHover; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                        title={cmd.command || cmd.name}
                      >
                        <span style={{
                          color: t.textPrimary, fontFamily: MONO, fontWeight: 500, fontSize: 11, flexShrink: 0,
                        }}>
                          {cmd.name}
                        </span>
                        {cmd.command && (
                          <span style={{
                            color: t.textMuted, fontSize: 10, fontFamily: MONO,
                            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1,
                          }}>
                            {cmd.command}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                ));
              })()}
            </div>
          )}
        </div>
      )}

      {/* Package Managers */}
      {sysInfo.package_managers.map((pm) => (
        <div key={pm.name} style={{ borderTop: `1px solid ${t.border}` }}>
          <div style={sectionHeaderStyle} onClick={() => toggleSection(`pkg-${pm.name}`)}>
            {chevron(expandedSections.has(`pkg-${pm.name}`))}
            {pm.name} packages
            <span style={{ fontSize: 10, color: t.textMuted, fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>
              ({pm.packages.length})
            </span>
            <span style={{ fontSize: 9, color: t.textMuted, fontWeight: 400, textTransform: "none", letterSpacing: 0, marginLeft: "auto", fontFamily: MONO }}>
              {pm.config_file}
            </span>
          </div>
          {expandedSections.has(`pkg-${pm.name}`) && (
            <div style={{ padding: "0 8px 8px" }}>
              {pm.packages.length === 0 && (
                <div style={{ padding: 8, fontSize: 12, color: t.textMuted, textAlign: "center" }}>No packages</div>
              )}
              {(() => {
                // Group by dep_type
                const groups: Record<string, PackageDep[]> = {};
                for (const pkg of pm.packages) {
                  const key = pkg.dep_type || "dependencies";
                  if (!groups[key]) groups[key] = [];
                  groups[key].push(pkg);
                }
                return Object.entries(groups).map(([depType, deps]) => (
                  <div key={depType}>
                    <div style={{
                      fontSize: 10, fontWeight: 600, padding: "6px 8px 3px",
                      color: depType.includes("dev") || depType.includes("Dev") ? t.terminal.yellow : t.terminal.green,
                      textTransform: "capitalize",
                    }}>
                      {depType.replace(/([A-Z])/g, " $1").trim()} ({deps.length})
                    </div>
                    {deps.map((pkg) => {
                      const isExpanded = expandedPkgManager === `${pm.name}:${pkg.name}`;
                      return (
                        <div
                          key={`${depType}-${pkg.name}`}
                          style={{
                            display: "flex", alignItems: "center", gap: 6,
                            padding: "3px 8px", borderRadius: 4, fontSize: 11,
                            transition: "background 0.1s", cursor: "default",
                          }}
                          onMouseEnter={(e) => { e.currentTarget.style.background = t.bgHover; }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                          onClick={() => setExpandedPkgManager(isExpanded ? null : `${pm.name}:${pkg.name}`)}
                        >
                          <span style={{ color: t.textPrimary, fontFamily: MONO, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {pkg.name}
                          </span>
                          <span style={{ color: t.textMuted, fontFamily: MONO, fontSize: 10, flexShrink: 0 }}>
                            {pkg.version}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                ));
              })()}
            </div>
          )}
        </div>
      ))}

      {/* Files */}
      <div style={{ borderTop: `1px solid ${t.border}` }}>
        <div style={sectionHeaderStyle} onClick={() => toggleSection("files")}>
          {chevron(expandedSections.has("files"))}
          Files
          <span style={{ fontSize: 10, color: t.textMuted, fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>
            ({sysInfo.entries.length})
          </span>
        </div>
        {expandedSections.has("files") && (
          <div style={{ padding: "0 8px 8px", maxHeight: 300, overflowY: "auto" }}>
            {sysInfo.entries.map((entry) => (
              <div key={entry.name} style={{
                display: "flex", alignItems: "center", gap: 6, padding: "4px 8px",
                borderRadius: 4, fontSize: 12, transition: "background 0.1s",
              }}
                onMouseEnter={(e) => { e.currentTarget.style.background = t.bgHover; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
              >
                {entry.is_dir ? (
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0, color: "#e0af68" }}>
                    <path d="M1.5 3h3.5l1 1.5h5.5v7h-10V3z" stroke="currentColor" strokeWidth="1.1" fill="currentColor" fillOpacity="0.15" strokeLinejoin="round" />
                  </svg>
                ) : (
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0, color: t.textMuted }}>
                    <path d="M3.5 1.5h5l3 3v8h-8v-11z" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" />
                    <path d="M8.5 1.5v3h3" stroke="currentColor" strokeWidth="1" opacity="0.5" />
                  </svg>
                )}
                <span style={{
                  flex: 1, fontFamily: MONO, fontSize: 11,
                  color: entry.is_dir ? "#e0af68" : t.textPrimary,
                  fontWeight: entry.is_dir ? 500 : 400,
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>
                  {entry.name}
                </span>
                {!entry.is_dir && (
                  <span style={{ fontSize: 10, color: t.textMuted, fontFamily: MONO, flexShrink: 0 }}>
                    {formatSize(entry.size)}
                  </span>
                )}
                <span style={{ fontSize: 9, color: t.textMuted, flexShrink: 0, minWidth: 50, textAlign: "right" }}>
                  {entry.modified}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Env Files */}
      {sysInfo.env_files.length > 0 && (
        <div style={{ borderTop: `1px solid ${t.border}` }}>
          <div style={sectionHeaderStyle} onClick={() => toggleSection("env-files")}>
            {chevron(expandedSections.has("env-files"))}
            Env Files
            <span style={{ fontSize: 10, color: t.textMuted, fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>
              ({sysInfo.env_files.length})
            </span>
          </div>
          {expandedSections.has("env-files") && (
            <div style={{ padding: "0 8px 8px" }}>
              {sysInfo.env_files.map((ef) => {
                const isOpen = expandedEnv === `file:${ef.path}`;
                return (
                  <div key={ef.path}>
                    <div
                      onClick={() => setExpandedEnv(isOpen ? null : `file:${ef.path}`)}
                      style={{
                        display: "flex", alignItems: "center", gap: 6, padding: "5px 8px",
                        borderRadius: 4, fontSize: 11, cursor: "pointer", transition: "background 0.1s",
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = t.bgHover; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                    >
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0, color: "#bb9af7" }}>
                        <path d="M3.5 1.5h5l3 3v8h-8v-11z" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" />
                        <path d="M8.5 1.5v3h3" stroke="currentColor" strokeWidth="1" opacity="0.5" />
                        <circle cx="7" cy="8.5" r="1.5" stroke="currentColor" strokeWidth="0.8" opacity="0.6" />
                      </svg>
                      <span style={{ flex: 1, fontFamily: MONO, color: t.textPrimary, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {ef.path}
                      </span>
                      <span style={{ fontSize: 9, color: t.textMuted, flexShrink: 0 }}>
                        {ef.vars.length} var{ef.vars.length !== 1 ? "s" : ""}
                      </span>
                      <svg width="10" height="10" viewBox="0 0 10 10" fill="none"
                        style={{ transition: "transform 0.15s", transform: isOpen ? "rotate(90deg)" : "rotate(0deg)", flexShrink: 0, color: t.textMuted }}>
                        <path d="M3.5 2L6.5 5L3.5 8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </div>
                    {isOpen && (
                      <div style={{ margin: "2px 8px 6px 28px", padding: "6px 8px", background: t.bgInput, borderRadius: 6, fontSize: 10, lineHeight: 1.7 }}>
                        {ef.vars.length === 0 && <div style={{ color: t.textMuted, fontStyle: "italic" }}>Empty file</div>}
                        {ef.vars.map((v) => (
                          <div key={v.key} style={{ display: "flex", gap: 6, fontFamily: MONO }}>
                            <span style={{ color: "#bb9af7", fontWeight: 600, flexShrink: 0 }}>{v.key}</span>
                            <span style={{ color: t.textMuted }}>=</span>
                            <span style={{ color: t.textPrimary, wordBreak: "break-all" }}>{v.value}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* System Environment Variables */}
      <div style={{ borderTop: `1px solid ${t.border}` }}>
        <div style={sectionHeaderStyle} onClick={() => toggleSection("env")}>
          {chevron(expandedSections.has("env"))}
          System Environment
          <span style={{ fontSize: 10, color: t.textMuted, fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>
            ({sysInfo.env_vars.length})
          </span>
        </div>
        {expandedSections.has("env") && (
          <div style={{ padding: "0 8px 8px" }}>
            {sysInfo.env_vars.map((v) => {
              const isOpen = expandedEnv === `sys:${v.key}`;
              const shortValue = v.value.length > 40 ? v.value.slice(0, 40) + "…" : v.value;
              return (
                <div key={v.key}>
                  <div
                    onClick={() => setExpandedEnv(isOpen ? null : `sys:${v.key}`)}
                    style={{
                      display: "flex", alignItems: "center", gap: 6, padding: "4px 8px",
                      borderRadius: 4, fontSize: 11, cursor: "pointer", transition: "background 0.1s",
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = t.bgHover; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                  >
                    <span style={{ color: t.accent, fontFamily: MONO, fontWeight: 600, flexShrink: 0, fontSize: 10 }}>
                      {v.key}
                    </span>
                    {!isOpen && (
                      <span style={{ color: t.textMuted, fontSize: 10, fontFamily: MONO, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {shortValue}
                      </span>
                    )}
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none"
                      style={{ marginLeft: "auto", transition: "transform 0.15s", transform: isOpen ? "rotate(90deg)" : "rotate(0deg)", flexShrink: 0, color: t.textMuted }}>
                      <path d="M3.5 2L6.5 5L3.5 8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                  {isOpen && (
                    <div style={{
                      margin: "2px 8px 6px 20px", padding: "6px 8px",
                      background: t.bgInput, borderRadius: 4,
                      fontSize: 10, fontFamily: MONO, color: t.textPrimary,
                      wordBreak: "break-all", lineHeight: 1.6,
                      maxHeight: 120, overflowY: "auto",
                    }}>
                      {v.value}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function InfoCard({ label, value, theme }: { label: string; value: string; theme: ReturnType<typeof useAppStore.getState>["theme"] }) {
  return (
    <div style={{
      padding: "8px 10px", background: theme.bgInput, borderRadius: 6,
      display: "flex", flexDirection: "column", gap: 2,
    }}>
      <span style={{ fontSize: 9, color: theme.textMuted, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>{label}</span>
      <span style={{ fontSize: 12, color: theme.textPrimary, fontFamily: MONO, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{value}</span>
    </div>
  );
}
