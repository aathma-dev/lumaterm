import { useEffect, useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useAppStore } from "../state/store";

interface DetectedAgent {
  name: string;
  slug: string;
  description: string;
  config_files: string[];
  config_dirs: string[];
  website: string;
}

interface AgentsInfo {
  agents: DetectedAgent[];
}

const AGENT_COLORS: Record<string, string> = {
  "claude-code": "#D97706",
  cursor: "#8B5CF6",
  gemini: "#3B82F6",
  copilot: "#6366F1",
  aider: "#10B981",
  continue: "#EC4899",
  cline: "#F59E0B",
  windsurf: "#06B6D4",
  "amazon-q": "#F97316",
  openhands: "#EF4444",
  goose: "#84CC16",
  plandex: "#A855F7",
  sweep: "#14B8A6",
  cody: "#FF6B6B",
  codex: "#22D3EE",
  amp: "#FF5733",
};

export function AgentsPanelContent() {
  const t = useAppStore((s) => s.theme);
  const groups = useAppStore((s) => s.groups);
  const activeGroupId = useAppStore((s) => s.activeGroupId);
  const cwd = groups[activeGroupId]?.cwd || "";

  const [info, setInfo] = useState<AgentsInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const fetchAgents = useCallback(async () => {
    if (!cwd) return;
    setLoading(true);
    try {
      const result = await invoke<AgentsInfo>("detect_agents", { cwd });
      setInfo(result);
    } catch {
      setInfo({ agents: [] });
    }
    setLoading(false);
  }, [cwd]);

  useEffect(() => {
    fetchAgents();
  }, [fetchAgents]);

  const toggleExpand = (slug: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden", fontSize: 13, padding: "10px 12px" }}>
      {!cwd && (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24, gap: 12 }}>
          <svg width="40" height="40" viewBox="0 0 40 40" fill="none" style={{ color: t.textMuted, opacity: 0.5 }}>
            <path d="M6 10C6 8.9 6.9 8 8 8h16l4 4h6c1.1 0 2 .9 2 2v16c0 1.1-.9 2-2 2H8c-1.1 0-2-.9-2-2V10z" stroke="currentColor" strokeWidth="2" fill="none" />
            <line x1="5" y1="5" x2="35" y2="35" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.6" />
          </svg>
          <div style={{ fontSize: 14, color: t.textSecondary }}>No working directory</div>
          <div style={{ fontSize: 12, color: t.textMuted }}>Open a terminal to get started</div>
        </div>
      )}

      {cwd && info && info.agents.length > 0 && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 10,
          }}
        >
          <span style={{ fontWeight: 600, color: t.textPrimary }}>AI Agents</span>
          <button
            onClick={fetchAgents}
            title="Refresh"
            style={{
              background: "transparent",
              border: "none",
              color: t.textMuted,
              cursor: "pointer",
              padding: 2,
              display: "flex",
              borderRadius: 4,
              flexShrink: 0,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = t.textPrimary; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = t.textMuted; }}
          >
            <svg width="12" height="12" viewBox="0 0 14 14" fill="none" style={{ animation: loading ? "spin 1s linear infinite" : "none" }}>
              <path d="M12.5 7a5.5 5.5 0 1 1-1.1-3.3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
              <path d="M12.5 2v3.7h-3.7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      )}

      {cwd && info && info.agents.length === 0 && !loading && (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24, gap: 12 }}>
          <svg width="40" height="40" viewBox="0 0 40 40" fill="none" style={{ color: t.textMuted, opacity: 0.5 }}>
            {/* Robot head */}
            <rect x="8" y="12" width="24" height="20" rx="4" stroke="currentColor" strokeWidth="2" />
            {/* Eyes */}
            <circle cx="16" cy="22" r="2.5" fill="currentColor" />
            <circle cx="24" cy="22" r="2.5" fill="currentColor" />
            {/* Antenna */}
            <line x1="20" y1="12" x2="20" y2="5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            <circle cx="20" cy="4" r="2" fill="currentColor" />
            {/* Mouth */}
            <line x1="15" y1="28" x2="25" y2="28" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            {/* Cross-out line */}
            <line x1="5" y1="5" x2="35" y2="35" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.6" />
          </svg>
          <div style={{ fontSize: 14, color: t.textSecondary }}>No agents configured</div>
          <div style={{ fontSize: 12, color: t.textMuted, textAlign: "center" }}>
            Add agent config files like <code style={{ background: t.bgInput, padding: "2px 6px", borderRadius: 4, fontSize: 11, fontFamily: "monospace" }}>CLAUDE.md</code> or <code style={{ background: t.bgInput, padding: "2px 6px", borderRadius: 4, fontSize: 11, fontFamily: "monospace" }}>.cursorrules</code>
          </div>
        </div>
      )}

      {info &&
        info.agents.map((agent) => {
          const expanded = expandedIds.has(agent.slug);
          const agentColor = AGENT_COLORS[agent.slug] || t.accent;

          return (
            <div
              key={agent.slug}
              style={{
                marginBottom: 6,
                borderRadius: 6,
                border: `1px solid ${t.border}`,
                overflow: "hidden",
              }}
            >
              {/* Agent row */}
              <div
                onClick={() => toggleExpand(agent.slug)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "8px 10px",
                  cursor: "pointer",
                  background: t.bgSidebar,
                }}
              >
                {/* Color dot */}
                <div
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    backgroundColor: agentColor,
                    flexShrink: 0,
                  }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontWeight: 600,
                      color: t.textPrimary,
                      fontSize: 12,
                    }}
                  >
                    {agent.name}
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      color: t.textSecondary,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {agent.description}
                  </div>
                </div>
                {/* Expand chevron */}
                <svg
                  width={10}
                  height={10}
                  viewBox="0 0 10 10"
                  fill="none"
                  style={{
                    color: t.textSecondary,
                    transform: expanded ? "rotate(90deg)" : "rotate(0deg)",
                    transition: "transform 0.15s",
                    flexShrink: 0,
                  }}
                >
                  <path
                    d="M3 1L7 5L3 9"
                    stroke="currentColor"
                    strokeWidth={1.5}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>

              {/* Expanded details */}
              {expanded && (
                <div
                  style={{
                    padding: "8px 10px",
                    borderTop: `1px solid ${t.border}`,
                    background: t.bg,
                    fontSize: 11,
                  }}
                >
                  {agent.config_files.length > 0 && (
                    <div style={{ marginBottom: 6 }}>
                      <div
                        style={{
                          color: t.textSecondary,
                          fontSize: 10,
                          textTransform: "uppercase",
                          letterSpacing: "0.5px",
                          marginBottom: 3,
                        }}
                      >
                        Config Files
                      </div>
                      {agent.config_files.map((f) => (
                        <div
                          key={f}
                          style={{
                            color: t.textPrimary,
                            fontFamily: "monospace",
                            fontSize: 11,
                            padding: "1px 0",
                          }}
                        >
                          {f}
                        </div>
                      ))}
                    </div>
                  )}

                  {agent.config_dirs.length > 0 && (
                    <div style={{ marginBottom: 6 }}>
                      <div
                        style={{
                          color: t.textSecondary,
                          fontSize: 10,
                          textTransform: "uppercase",
                          letterSpacing: "0.5px",
                          marginBottom: 3,
                        }}
                      >
                        Config Directories
                      </div>
                      {agent.config_dirs.map((d) => (
                        <div
                          key={d}
                          style={{
                            color: t.textPrimary,
                            fontFamily: "monospace",
                            fontSize: 11,
                            padding: "1px 0",
                          }}
                        >
                          {d}/
                        </div>
                      ))}
                    </div>
                  )}

                  <a
                    href={agent.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      color: t.accent,
                      fontSize: 11,
                      textDecoration: "none",
                    }}
                    onMouseEnter={(e) =>
                      (e.currentTarget.style.textDecoration = "underline")
                    }
                    onMouseLeave={(e) =>
                      (e.currentTarget.style.textDecoration = "none")
                    }
                  >
                    Documentation &rarr;
                  </a>
                </div>
              )}
            </div>
          );
        })}

      {/* Summary bar */}
      {info && info.agents.length > 0 && (
        <div
          style={{
            marginTop: 8,
            padding: "6px 8px",
            borderRadius: 4,
            background: t.accentBg,
            fontSize: 11,
            color: t.textSecondary,
          }}
        >
          {info.agents.length} agent{info.agents.length !== 1 ? "s" : ""} configured
        </div>
      )}
    </div>
  );
}
