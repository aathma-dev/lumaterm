import { useEffect, useState, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useAppStore } from "../state/store";
import { ResizeHandle } from "./ResizeHandle";

interface DockerPort {
  host_ip: string;
  host_port: string;
  container_port: string;
  protocol: string;
}

interface DockerContainer {
  id: string;
  name: string;
  image: string;
  status: string;
  state: string;
  ports: string;
  port_mappings: DockerPort[];
  created: string;
  is_project: boolean;
}

interface DockerImage {
  id: string;
  repository: string;
  tag: string;
  size: string;
  created: string;
  is_project: boolean;
}

interface DockerVolume {
  name: string;
  driver: string;
  mountpoint: string;
  is_project: boolean;
}

interface DockerInfo {
  available: boolean;
  has_compose: boolean;
  has_dockerfile: boolean;
  compose_file: string;
  containers: DockerContainer[];
  images: DockerImage[];
  volumes: DockerVolume[];
  project_name: string;
}

interface K8sPod {
  name: string;
  namespace: string;
  status: string;
  ready: string;
  restarts: string;
  age: string;
  node: string;
  is_project: boolean;
}

interface K8sService {
  name: string;
  namespace: string;
  svc_type: string;
  cluster_ip: string;
  ports: string;
  age: string;
  is_project: boolean;
}

interface K8sDeployment {
  name: string;
  namespace: string;
  ready: string;
  up_to_date: string;
  available: string;
  age: string;
  is_project: boolean;
}

interface K8sInfo {
  available: boolean;
  has_k8s_files: boolean;
  k8s_files: string[];
  current_context: string;
  current_namespace: string;
  pods: K8sPod[];
  services: K8sService[];
  deployments: K8sDeployment[];
}

type Section = "containers" | "images" | "volumes" | "k8s-pods" | "k8s-services" | "k8s-deployments";

const SF = "-apple-system, BlinkMacSystemFont, 'SF Pro Text', system-ui, sans-serif";
const MONO = "'SF Mono', Menlo, monospace";

const STATE_COLORS: Record<string, string> = {
  running: "#9ece6a",
  exited: "#f7768e",
  paused: "#e0af68",
  restarting: "#7dcfff",
  created: "#bb9af7",
  dead: "#565f89",
};

const POD_STATUS_COLORS: Record<string, string> = {
  Running: "#9ece6a",
  Succeeded: "#7dcfff",
  Pending: "#e0af68",
  Failed: "#f7768e",
  Unknown: "#565f89",
  CrashLoopBackOff: "#f7768e",
  Error: "#f7768e",
  Terminating: "#ff9e64",
};

// Standalone panel (legacy)
export function DockerPanel() {
  const dockerPanelWidth = useAppStore((s) => s.dockerPanelWidth);
  const setDockerPanelWidth = useAppStore((s) => s.setDockerPanelWidth);
  const t = useAppStore((s) => s.theme);

  return (
    <div style={{ position: "relative", display: "flex", flexDirection: "column", width: dockerPanelWidth, minWidth: 200, borderLeft: `1px solid ${t.border}`, background: t.bgSidebar, fontFamily: SF }}>
      <ResizeHandle direction="vertical" position="left" onResize={setDockerPanelWidth} />
      <ContainerPanelContent />
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// Embeddable content (used by InfoPanel)
export function ContainerPanelContent() {
  const groups = useAppStore((s) => s.groups);
  const activeGroupId = useAppStore((s) => s.activeGroupId);
  const t = useAppStore((s) => s.theme);

  const [dockerInfo, setDockerInfo] = useState<DockerInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Set<Section>>(
    new Set(["containers", "images", "volumes"])
  );
  const [expandedContainer, setExpandedContainer] = useState<string | null>(null);
  const [expandedImage, setExpandedImage] = useState<string | null>(null);
  const [expandedVolume, setExpandedVolume] = useState<string | null>(null);
  const [k8sInfo, setK8sInfo] = useState<K8sInfo | null>(null);
  const [expandedPod, setExpandedPod] = useState<string | null>(null);
  const [expandedService, setExpandedService] = useState<string | null>(null);
  const [expandedDeployment, setExpandedDeployment] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});
  const [openLogIds, setOpenLogIds] = useState<Set<string>>(new Set());
  const [logsContentMap, setLogsContentMap] = useState<Record<string, string>>({});
  const [logsLoadingMap, setLogsLoadingMap] = useState<Record<string, boolean>>({});
  const logsIntervalsRef = useRef<Record<string, ReturnType<typeof setInterval>>>({});

  const cwd = groups[activeGroupId]?.cwd || "";

  const fetchDockerInfo = useCallback(() => {
    if (!cwd) { setDockerInfo(null); return; }
    setLoading(true);
    invoke<DockerInfo>("docker_info", { cwd })
      .then(setDockerInfo)
      .catch(() => setDockerInfo(null))
      .finally(() => setLoading(false));
  }, [cwd]);

  const fetchK8sInfo = useCallback(() => {
    if (!cwd) { setK8sInfo(null); return; }
    invoke<K8sInfo>("k8s_info", { cwd })
      .then(setK8sInfo)
      .catch(() => setK8sInfo(null));
  }, [cwd]);

  const fetchAll = useCallback(() => {
    fetchDockerInfo();
    fetchK8sInfo();
  }, [fetchDockerInfo, fetchK8sInfo]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Auto-refresh every 10 seconds
  useEffect(() => {
    if (!cwd) return;
    const interval = setInterval(fetchAll, 10000);
    return () => clearInterval(interval);
  }, [cwd, fetchAll]);

  const toggleSection = useCallback((section: Section) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(section)) next.delete(section); else next.add(section);
      return next;
    });
  }, []);

  const doContainerAction = useCallback(async (id: string, action: "stop" | "restart" | "remove") => {
    setActionLoading((prev) => ({ ...prev, [id + action]: true }));
    try {
      if (action === "stop") await invoke("docker_container_stop", { containerId: id });
      else if (action === "restart") await invoke("docker_container_restart", { containerId: id });
      else if (action === "remove") await invoke("docker_container_remove", { containerId: id, force: true });
      fetchDockerInfo();
    } catch (e) {
      console.error(`Docker ${action} failed:`, e);
    } finally {
      setActionLoading((prev) => ({ ...prev, [id + action]: false }));
    }
  }, [fetchDockerInfo]);

  const doImageRemove = useCallback(async (id: string) => {
    setActionLoading((prev) => ({ ...prev, ["img-" + id]: true }));
    try {
      await invoke("docker_image_remove", { imageId: id, force: false });
      fetchDockerInfo();
    } catch (e) {
      console.error("Docker image remove failed:", e);
    } finally {
      setActionLoading((prev) => ({ ...prev, ["img-" + id]: false }));
    }
  }, [fetchDockerInfo]);

  const fetchLogs = useCallback(async (containerId: string) => {
    try {
      const logs = await invoke<string>("docker_container_logs", { containerId, tail: 300 });
      setLogsContentMap((prev) => ({ ...prev, [containerId]: logs }));
    } catch (e) {
      setLogsContentMap((prev) => ({ ...prev, [containerId]: `Error fetching logs: ${e}` }));
    }
  }, []);

  const closeLogs = useCallback((containerId: string) => {
    setOpenLogIds((prev) => { const next = new Set(prev); next.delete(containerId); return next; });
    setLogsContentMap((prev) => { const next = { ...prev }; delete next[containerId]; return next; });
    setLogsLoadingMap((prev) => { const next = { ...prev }; delete next[containerId]; return next; });
    if (logsIntervalsRef.current[containerId]) {
      clearInterval(logsIntervalsRef.current[containerId]);
      delete logsIntervalsRef.current[containerId];
    }
  }, []);

  const toggleLogs = useCallback((containerId: string) => {
    if (openLogIds.has(containerId)) {
      closeLogs(containerId);
      return;
    }
    setOpenLogIds((prev) => new Set(prev).add(containerId));
    setLogsLoadingMap((prev) => ({ ...prev, [containerId]: true }));
    fetchLogs(containerId).finally(() => setLogsLoadingMap((prev) => ({ ...prev, [containerId]: false })));
    // Auto-refresh every 3 seconds
    if (logsIntervalsRef.current[containerId]) clearInterval(logsIntervalsRef.current[containerId]);
    logsIntervalsRef.current[containerId] = setInterval(() => fetchLogs(containerId), 3000);
  }, [openLogIds, fetchLogs, closeLogs]);

  // Cleanup all log intervals on unmount
  useEffect(() => {
    return () => {
      Object.values(logsIntervalsRef.current).forEach(clearInterval);
    };
  }, []);

  const runningCount = dockerInfo?.containers.filter((c) => c.state === "running").length ?? 0;
  const projectContainerCount = dockerInfo?.containers.filter((c) => c.is_project).length ?? 0;
  const projectImageCount = dockerInfo?.images.filter((i) => i.is_project).length ?? 0;
  const projectVolumeCount = dockerInfo?.volumes.filter((v) => v.is_project).length ?? 0;

  const sectionHeaderStyle: React.CSSProperties = {
    display: "flex", alignItems: "center", gap: 6,
    padding: "8px 12px", fontSize: 11, fontWeight: 600,
    color: t.textMuted, textTransform: "uppercase",
    letterSpacing: "0.05em", cursor: "pointer", userSelect: "none", fontFamily: SF,
  };

  const chevron = (open: boolean) => (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none"
      style={{ transition: "transform 0.15s", transform: open ? "rotate(90deg)" : "rotate(0deg)" }}>
      <path d="M3.5 2L6.5 5L3.5 8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden", fontFamily: SF }}>
      {/* Not available */}
      {dockerInfo && !dockerInfo.available && (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24, gap: 12 }}>
          <svg width="40" height="40" viewBox="0 0 40 40" fill="none" style={{ color: t.textMuted, opacity: 0.5 }}>
            <rect x="6" y="18" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.5" />
            <rect x="14" y="18" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.5" />
            <rect x="22" y="18" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.5" />
            <rect x="14" y="10" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.5" />
            <line x1="5" y1="5" x2="35" y2="35" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.6" />
          </svg>
          <div style={{ fontSize: 14, color: t.textSecondary }}>Docker not available</div>
          <div style={{ fontSize: 12, color: t.textMuted }}>Install Docker Desktop to use this panel</div>
        </div>
      )}

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
      {cwd && !dockerInfo && loading && <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: t.textMuted, fontSize: 13 }}>Loading...</div>}

      {/* Docker content */}
      {dockerInfo && dockerInfo.available && (
        <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden" }}>
          {/* Project info bar */}
          <div style={{ padding: "10px 12px", borderBottom: `1px solid ${t.border}`, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            {dockerInfo.has_compose && (
              <span style={{ fontSize: 10, fontWeight: 600, color: "#2496ED", background: "rgba(36,150,237,0.12)", border: "1px solid rgba(36,150,237,0.3)", padding: "2px 7px", borderRadius: 4, fontFamily: MONO }}>
                {dockerInfo.compose_file}
              </span>
            )}
            {dockerInfo.has_dockerfile && (
              <span style={{ fontSize: 10, fontWeight: 600, color: "#9ece6a", background: "rgba(158,206,106,0.12)", border: "1px solid rgba(158,206,106,0.3)", padding: "2px 7px", borderRadius: 4, fontFamily: MONO }}>
                Dockerfile
              </span>
            )}
            {k8sInfo?.has_k8s_files && k8sInfo.k8s_files.slice(0, 3).map((f) => (
              <span key={f} style={{ fontSize: 10, fontWeight: 600, color: "#326ce5", background: "rgba(50,108,229,0.12)", border: "1px solid rgba(50,108,229,0.3)", padding: "2px 7px", borderRadius: 4, fontFamily: MONO }}>
                {f}
              </span>
            ))}
            {k8sInfo?.has_k8s_files && k8sInfo.k8s_files.length > 3 && (
              <span style={{ fontSize: 10, color: t.textMuted }}>+{k8sInfo.k8s_files.length - 3} more</span>
            )}
            {!dockerInfo.has_compose && !dockerInfo.has_dockerfile && !k8sInfo?.has_k8s_files && (
              <span style={{ fontSize: 11, color: t.textMuted }}>No container files detected</span>
            )}
            {runningCount > 0 && (
              <span style={{ fontSize: 10, color: "#9ece6a", marginLeft: "auto" }}>
                {runningCount} running
              </span>
            )}
            <button onClick={fetchAll} title="Refresh" style={{ marginLeft: runningCount > 0 ? undefined : "auto", background: "transparent", border: "none", color: t.textMuted, cursor: "pointer", padding: 2, display: "flex", borderRadius: 4, flexShrink: 0 }}
              onMouseEnter={(e) => { e.currentTarget.style.color = t.textPrimary; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = t.textMuted; }}>
              <svg width="12" height="12" viewBox="0 0 14 14" fill="none" style={{ animation: loading ? "spin 1s linear infinite" : "none" }}>
                <path d="M12.5 7a5.5 5.5 0 1 1-1.1-3.3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                <path d="M12.5 2v3.7h-3.7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>

          {/* Containers */}
          <div>
            <div style={sectionHeaderStyle} onClick={() => toggleSection("containers")}>
              {chevron(expandedSections.has("containers"))}
              Containers
              <span style={{ fontSize: 10, color: t.textMuted, fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>
                ({dockerInfo.containers.length})
              </span>
              {projectContainerCount > 0 && (
                <span style={{ fontSize: 9, background: t.accent, color: "#1a1b26", borderRadius: 8, padding: "1px 6px", fontWeight: 700, textTransform: "none", letterSpacing: 0 }} title="Project containers">
                  {projectContainerCount}
                </span>
              )}
              {runningCount > 0 && (
                <span style={{ fontSize: 9, background: "#9ece6a", color: "#1a1b26", borderRadius: 8, padding: "1px 6px", fontWeight: 700, textTransform: "none", letterSpacing: 0 }}>
                  {runningCount}
                </span>
              )}
            </div>
            {expandedSections.has("containers") && (
              <div style={{ padding: "0 8px 8px" }}>
                {dockerInfo.containers.length === 0 && (
                  <div style={{ padding: 8, fontSize: 12, color: t.textMuted, textAlign: "center" }}>No containers</div>
                )}
                {dockerInfo.containers.map((c) => {
                  const stateColor = STATE_COLORS[c.state] || t.textMuted;
                  const isOpen = expandedContainer === c.id;
                  return (
                    <div key={c.id} style={{ borderRadius: 6, marginBottom: 1 }}>
                      <div
                        onClick={() => setExpandedContainer(isOpen ? null : c.id)}
                        style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", borderRadius: 6, fontSize: 12, cursor: "pointer", transition: "background 0.1s", background: c.is_project ? t.accentBg : "transparent" }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = t.bgHover; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = c.is_project ? `${t.accentBg}` : "transparent"; }}
                      >
                        {/* State dot */}
                        <div style={{ width: 8, height: 8, borderRadius: "50%", background: stateColor, flexShrink: 0, boxShadow: c.state === "running" ? `0 0 6px ${stateColor}` : "none" }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontFamily: MONO, fontWeight: 500, color: t.textPrimary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {c.name}
                            {c.is_project && <span style={{ fontSize: 8, color: t.accent, marginLeft: 6, fontWeight: 700, fontFamily: SF, textTransform: "uppercase", letterSpacing: "0.05em" }}>project</span>}
                          </div>
                        </div>
                        <span style={{ fontSize: 9, color: stateColor, fontWeight: 600, textTransform: "uppercase", flexShrink: 0 }}>{c.state}</span>
                        {/* Quick action buttons */}
                        <div style={{ display: "flex", gap: 2, flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
                          {c.state === "running" && (
                            <ActionBtn title="Stop" loading={!!actionLoading[c.id + "stop"]} theme={t} onClick={() => doContainerAction(c.id, "stop")} color="#f7768e">
                              <rect x="3" y="3" width="6" height="6" rx="1" fill="currentColor" />
                            </ActionBtn>
                          )}
                          <ActionBtn title="Restart" loading={!!actionLoading[c.id + "restart"]} theme={t} onClick={() => doContainerAction(c.id, "restart")} color="#e0af68">
                            <path d="M9 3a5 5 0 1 1-2-1.5" stroke="currentColor" strokeWidth="1.3" fill="none" strokeLinecap="round" />
                            <path d="M9 1v2.5H6.5" stroke="currentColor" strokeWidth="1.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                          </ActionBtn>
                          <ActionBtn title="Logs" loading={false} theme={t} onClick={() => toggleLogs(c.id)} color={openLogIds.has(c.id) ? "#7dcfff" : t.textMuted}>
                            <rect x="2" y="2" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.2" fill="none" />
                            <line x1="4" y1="4.5" x2="8" y2="4.5" stroke="currentColor" strokeWidth="0.8" />
                            <line x1="4" y1="6.5" x2="7" y2="6.5" stroke="currentColor" strokeWidth="0.8" />
                            <line x1="4" y1="8.5" x2="6" y2="8.5" stroke="currentColor" strokeWidth="0.8" opacity="0.5" />
                          </ActionBtn>
                          {c.state !== "running" && (
                            <ActionBtn title="Remove" loading={!!actionLoading[c.id + "remove"]} theme={t} onClick={() => doContainerAction(c.id, "remove")} color="#f7768e">
                              <path d="M3 3.5h6M4.5 3.5V3a.5.5 0 0 1 .5-.5h2a.5.5 0 0 1 .5.5v.5M4 5v4M6 5v4M8 5v4M3.5 3.5l.5 6a1 1 0 0 0 1 1h2a1 1 0 0 0 1-1l.5-6" stroke="currentColor" strokeWidth="0.9" fill="none" strokeLinecap="round" />
                            </ActionBtn>
                          )}
                        </div>
                        <svg width="10" height="10" viewBox="0 0 10 10" fill="none"
                          style={{ transition: "transform 0.15s", transform: isOpen ? "rotate(90deg)" : "rotate(0deg)", flexShrink: 0, color: t.textMuted }}>
                          <path d="M3.5 2L6.5 5L3.5 8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </div>
                      {isOpen && (
                        <div style={{ margin: "2px 0 6px 24px", padding: "8px 10px", background: t.bgInput, borderRadius: 6, fontSize: 11, lineHeight: 1.7, fontFamily: MONO }}>
                          <DetailRow label="ID" value={c.id} theme={t} />
                          <DetailRow label="Image" value={c.image} theme={t} />
                          <DetailRow label="Status" value={c.status} theme={t} />
                          <DetailRow label="Created" value={c.created} theme={t} />
                          {/* Port mappings */}
                          {c.port_mappings.length > 0 && (
                            <div style={{ marginTop: 4 }}>
                              <span style={{ color: t.textMuted, fontSize: 10, fontWeight: 600, fontFamily: SF }}>Ports</span>
                              <div style={{ marginTop: 2, display: "flex", flexDirection: "column", gap: 2 }}>
                                {c.port_mappings.map((p, i) => (
                                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                    {p.host_port ? (
                                      <>
                                        <span style={{ color: "#9ece6a", fontSize: 11, fontFamily: MONO }}>
                                          {p.host_ip && p.host_ip !== "0.0.0.0" && p.host_ip !== "::" ? `${p.host_ip}:` : ""}{p.host_port}
                                        </span>
                                        <svg width="10" height="8" viewBox="0 0 10 8" fill="none" style={{ flexShrink: 0 }}>
                                          <path d="M1 4h8M7 2l2 2-2 2" stroke={t.textMuted} strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" />
                                        </svg>
                                        <span style={{ color: "#7dcfff", fontSize: 11, fontFamily: MONO }}>
                                          {p.container_port}/{p.protocol}
                                        </span>
                                      </>
                                    ) : (
                                      <span style={{ color: t.textMuted, fontSize: 11, fontFamily: MONO }}>
                                        {p.container_port}/{p.protocol} (not mapped)
                                      </span>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                          {c.port_mappings.length === 0 && c.ports && (
                            <DetailRow label="Ports" value={c.ports} theme={t} />
                          )}
                        </div>
                      )}
                      {/* Live logs viewer */}
                      {openLogIds.has(c.id) && (
                        <div style={{ margin: "2px 0 6px 24px", borderRadius: 6, overflow: "hidden", border: `1px solid ${t.border}` }}>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "4px 8px", background: t.bgInput, borderBottom: `1px solid ${t.border}` }}>
                            <span style={{ fontSize: 10, fontWeight: 600, color: "#7dcfff", fontFamily: SF }}>Live Logs — {c.name}</span>
                            <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                              {logsLoadingMap[c.id] && <span style={{ fontSize: 9, color: t.textMuted }}>loading...</span>}
                              <button
                                onClick={() => fetchLogs(c.id)}
                                style={{ background: "none", border: "none", cursor: "pointer", color: t.textMuted, padding: 2, display: "flex" }}
                                title="Refresh logs"
                              >
                                <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                                  <path d="M10 3a5 5 0 1 1-2-1.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                                  <path d="M10 1v2.5H7.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                              </button>
                              <button
                                onClick={() => closeLogs(c.id)}
                                style={{ background: "none", border: "none", cursor: "pointer", color: t.textMuted, padding: 2, display: "flex" }}
                                title="Close logs"
                              >
                                <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                                  <path d="M2.5 2.5l5 5M7.5 2.5l-5 5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                                </svg>
                              </button>
                            </div>
                          </div>
                          <LogsView content={logsContentMap[c.id] || (logsLoadingMap[c.id] ? "Loading..." : "No logs available")} />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Images */}
          <div style={{ borderTop: `1px solid ${t.border}` }}>
            <div style={sectionHeaderStyle} onClick={() => toggleSection("images")}>
              {chevron(expandedSections.has("images"))}
              Images
              <span style={{ fontSize: 10, color: t.textMuted, fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>
                ({dockerInfo.images.length})
              </span>
              {projectImageCount > 0 && (
                <span style={{ fontSize: 9, background: t.accent, color: "#1a1b26", borderRadius: 8, padding: "1px 6px", fontWeight: 700, textTransform: "none", letterSpacing: 0 }} title="Project images">
                  {projectImageCount}
                </span>
              )}
            </div>
            {expandedSections.has("images") && (
              <div style={{ padding: "0 8px 8px" }}>
                {dockerInfo.images.length === 0 && (
                  <div style={{ padding: 8, fontSize: 12, color: t.textMuted, textAlign: "center" }}>No images</div>
                )}
                {dockerInfo.images.map((img) => {
                  const isOpen = expandedImage === img.id;
                  return (
                    <div key={`${img.repository}:${img.tag}:${img.id}`} style={{ borderRadius: 6, marginBottom: 1 }}>
                      <div
                        onClick={() => setExpandedImage(isOpen ? null : img.id)}
                        style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 8px", borderRadius: 6, fontSize: 12, cursor: "pointer", transition: "background 0.1s", background: img.is_project ? t.accentBg : "transparent" }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = t.bgHover; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = img.is_project ? t.accentBg : "transparent"; }}
                      >
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0, color: "#7dcfff" }}>
                          <rect x="2" y="2" width="10" height="10" rx="2" stroke="currentColor" strokeWidth="1.2" />
                          <path d="M2 6h10M6 2v10" stroke="currentColor" strokeWidth="1" opacity="0.4" />
                        </svg>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <span style={{ fontFamily: MONO, color: t.textPrimary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {img.repository === "<none>" ? img.id : img.repository}
                          </span>
                          {img.tag !== "<none>" && (
                            <span style={{ fontSize: 9, color: "#7dcfff", background: "rgba(125,207,255,0.12)", padding: "0px 4px", borderRadius: 3, marginLeft: 5, fontFamily: MONO }}>{img.tag}</span>
                          )}
                          {img.is_project && <span style={{ fontSize: 8, color: t.accent, marginLeft: 6, fontWeight: 700, fontFamily: SF, textTransform: "uppercase", letterSpacing: "0.05em" }}>project</span>}
                        </div>
                        <span style={{ fontSize: 10, color: t.textMuted, flexShrink: 0, fontFamily: MONO }}>{img.size}</span>
                        <svg width="10" height="10" viewBox="0 0 10 10" fill="none"
                          style={{ transition: "transform 0.15s", transform: isOpen ? "rotate(90deg)" : "rotate(0deg)", flexShrink: 0, color: t.textMuted }}>
                          <path d="M3.5 2L6.5 5L3.5 8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </div>
                      {isOpen && (
                        <div style={{ margin: "2px 0 6px 30px", padding: "8px 10px", background: t.bgInput, borderRadius: 6, fontSize: 11, lineHeight: 1.7, fontFamily: MONO }}>
                          <DetailRow label="ID" value={img.id} theme={t} />
                          <DetailRow label="Repository" value={img.repository} theme={t} />
                          <DetailRow label="Tag" value={img.tag} theme={t} />
                          <DetailRow label="Size" value={img.size} theme={t} />
                          <DetailRow label="Created" value={img.created} theme={t} />
                          <div style={{ marginTop: 6, display: "flex", gap: 6 }}>
                            <button
                              onClick={(e) => { e.stopPropagation(); doImageRemove(img.id); }}
                              disabled={!!actionLoading["img-" + img.id]}
                              style={{
                                display: "flex", alignItems: "center", gap: 4,
                                padding: "3px 8px", borderRadius: 4, border: `1px solid rgba(247,118,142,0.3)`,
                                background: "rgba(247,118,142,0.08)", color: "#f7768e",
                                fontSize: 10, fontFamily: SF, fontWeight: 600, cursor: "pointer",
                                opacity: actionLoading["img-" + img.id] ? 0.5 : 1,
                              }}
                            >
                              <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                                <path d="M3 3.5h6M4.5 3.5V3a.5.5 0 0 1 .5-.5h2a.5.5 0 0 1 .5.5v.5M4 5v4M6 5v4M8 5v4M3.5 3.5l.5 6a1 1 0 0 0 1 1h2a1 1 0 0 0 1-1l.5-6" stroke="currentColor" strokeWidth="0.9" fill="none" strokeLinecap="round" />
                              </svg>
                              {actionLoading["img-" + img.id] ? "Removing..." : "Remove Image"}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Volumes */}
          <div style={{ borderTop: `1px solid ${t.border}` }}>
            <div style={sectionHeaderStyle} onClick={() => toggleSection("volumes")}>
              {chevron(expandedSections.has("volumes"))}
              Volumes
              <span style={{ fontSize: 10, color: t.textMuted, fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>
                ({dockerInfo.volumes.length})
              </span>
              {projectVolumeCount > 0 && (
                <span style={{ fontSize: 9, background: t.accent, color: "#1a1b26", borderRadius: 8, padding: "1px 6px", fontWeight: 700, textTransform: "none", letterSpacing: 0 }} title="Project volumes">
                  {projectVolumeCount}
                </span>
              )}
            </div>
            {expandedSections.has("volumes") && (
              <div style={{ padding: "0 8px 8px" }}>
                {dockerInfo.volumes.length === 0 && (
                  <div style={{ padding: 8, fontSize: 12, color: t.textMuted, textAlign: "center" }}>No volumes</div>
                )}
                {dockerInfo.volumes.map((vol) => {
                  const isOpen = expandedVolume === vol.name;
                  const shortName = vol.name.length > 30 ? vol.name.slice(0, 12) + "..." + vol.name.slice(-8) : vol.name;
                  return (
                    <div key={vol.name} style={{ borderRadius: 6, marginBottom: 1 }}>
                      <div
                        onClick={() => setExpandedVolume(isOpen ? null : vol.name)}
                        style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 8px", borderRadius: 6, fontSize: 12, cursor: "pointer", transition: "background 0.1s", background: vol.is_project ? t.accentBg : "transparent" }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = t.bgHover; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = vol.is_project ? t.accentBg : "transparent"; }}
                      >
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0, color: "#bb9af7" }}>
                          <ellipse cx="7" cy="4" rx="5" ry="2" stroke="currentColor" strokeWidth="1.2" />
                          <path d="M2 4v6c0 1.1 2.2 2 5 2s5-.9 5-2V4" stroke="currentColor" strokeWidth="1.2" />
                          <path d="M2 7c0 1.1 2.2 2 5 2s5-.9 5-2" stroke="currentColor" strokeWidth="1" opacity="0.4" />
                        </svg>
                        <span style={{ flex: 1, fontFamily: MONO, color: t.textPrimary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {shortName}
                          {vol.is_project && <span style={{ fontSize: 8, color: t.accent, marginLeft: 6, fontWeight: 700, fontFamily: SF, textTransform: "uppercase", letterSpacing: "0.05em" }}>project</span>}
                        </span>
                        <span style={{ fontSize: 10, color: t.textMuted, flexShrink: 0 }}>{vol.driver}</span>
                        <svg width="10" height="10" viewBox="0 0 10 10" fill="none"
                          style={{ transition: "transform 0.15s", transform: isOpen ? "rotate(90deg)" : "rotate(0deg)", flexShrink: 0, color: t.textMuted }}>
                          <path d="M3.5 2L6.5 5L3.5 8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </div>
                      {isOpen && (
                        <div style={{ margin: "2px 0 6px 30px", padding: "8px 10px", background: t.bgInput, borderRadius: 6, fontSize: 11, lineHeight: 1.7, fontFamily: MONO }}>
                          <DetailRow label="Name" value={vol.name} theme={t} />
                          <DetailRow label="Driver" value={vol.driver} theme={t} />
                          <DetailRow label="Mount" value={vol.mountpoint} theme={t} />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Kubernetes Section ── */}
      {k8sInfo && k8sInfo.available && (k8sInfo.has_k8s_files || k8sInfo.pods.length > 0 || k8sInfo.services.length > 0 || k8sInfo.deployments.length > 0) && (
        <div style={{ flex: dockerInfo?.available ? undefined : 1, overflowY: "auto", overflowX: "hidden" }}>
          {/* K8s header bar */}
          <div style={{ padding: "10px 12px", borderTop: `1px solid ${t.border}`, borderBottom: `1px solid ${t.border}`, display: "flex", alignItems: "center", gap: 8 }}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ color: "#326ce5", flexShrink: 0 }}>
              <path d="M8 1L14.5 4.5V11.5L8 15L1.5 11.5V4.5L8 1Z" stroke="currentColor" strokeWidth="1.2" fill="currentColor" fillOpacity="0.1" />
              <circle cx="8" cy="8" r="2.5" stroke="currentColor" strokeWidth="1.2" />
              <path d="M8 5.5V3M8 13v-2.5M5.5 8H3M13 8h-2.5M6 6L4.5 4.5M11.5 11.5L10 10M10 6l1.5-1.5M4.5 11.5L6 10" stroke="currentColor" strokeWidth="0.8" opacity="0.6" />
            </svg>
            <span style={{ fontSize: 12, fontWeight: 600, color: "#326ce5", fontFamily: SF }}>Kubernetes</span>
            <span style={{ fontSize: 10, color: t.textMuted, fontFamily: MONO, marginLeft: "auto", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 150 }} title={k8sInfo.current_context}>
              {k8sInfo.current_context}
            </span>
          </div>

          {/* Namespace info */}
          <div style={{ padding: "6px 12px", borderBottom: `1px solid ${t.border}`, display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 10, color: t.textMuted }}>Namespace:</span>
            <span style={{ fontSize: 11, fontWeight: 600, color: "#326ce5", fontFamily: MONO }}>{k8sInfo.current_namespace}</span>
          </div>

          {/* Pods */}
          <div>
            <div style={sectionHeaderStyle} onClick={() => toggleSection("k8s-pods")}>
              {chevron(expandedSections.has("k8s-pods"))}
              Pods
              <span style={{ fontSize: 10, color: t.textMuted, fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>
                ({k8sInfo.pods.length})
              </span>
              {k8sInfo.pods.filter(p => p.status === "Running").length > 0 && (
                <span style={{ fontSize: 9, background: "#9ece6a", color: "#1a1b26", borderRadius: 8, padding: "1px 6px", fontWeight: 700, textTransform: "none", letterSpacing: 0 }}>
                  {k8sInfo.pods.filter(p => p.status === "Running").length}
                </span>
              )}
            </div>
            {expandedSections.has("k8s-pods") && (
              <div style={{ padding: "0 8px 8px" }}>
                {k8sInfo.pods.length === 0 && (
                  <div style={{ padding: 8, fontSize: 12, color: t.textMuted, textAlign: "center" }}>No pods</div>
                )}
                {k8sInfo.pods.map((pod) => {
                  const statusColor = POD_STATUS_COLORS[pod.status] || t.textMuted;
                  const isOpen = expandedPod === pod.name;
                  return (
                    <div key={pod.name} style={{ borderRadius: 6, marginBottom: 1 }}>
                      <div
                        onClick={() => setExpandedPod(isOpen ? null : pod.name)}
                        style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", borderRadius: 6, fontSize: 12, cursor: "pointer", transition: "background 0.1s", background: pod.is_project ? t.accentBg : "transparent" }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = t.bgHover; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = pod.is_project ? t.accentBg : "transparent"; }}
                      >
                        <div style={{ width: 8, height: 8, borderRadius: "50%", background: statusColor, flexShrink: 0, boxShadow: pod.status === "Running" ? `0 0 6px ${statusColor}` : "none" }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontFamily: MONO, fontWeight: 500, color: t.textPrimary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 11 }}>
                            {pod.name}
                            {pod.is_project && <span style={{ fontSize: 8, color: t.accent, marginLeft: 6, fontWeight: 700, fontFamily: SF, textTransform: "uppercase", letterSpacing: "0.05em" }}>project</span>}
                          </div>
                        </div>
                        <span style={{ fontSize: 9, color: statusColor, fontWeight: 600, flexShrink: 0 }}>{pod.status}</span>
                        <svg width="10" height="10" viewBox="0 0 10 10" fill="none"
                          style={{ transition: "transform 0.15s", transform: isOpen ? "rotate(90deg)" : "rotate(0deg)", flexShrink: 0, color: t.textMuted }}>
                          <path d="M3.5 2L6.5 5L3.5 8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </div>
                      {isOpen && (
                        <div style={{ margin: "2px 0 6px 24px", padding: "8px 10px", background: t.bgInput, borderRadius: 6, fontSize: 11, lineHeight: 1.7, fontFamily: MONO }}>
                          <DetailRow label="Namespace" value={pod.namespace} theme={t} />
                          <DetailRow label="Status" value={pod.status} theme={t} />
                          <DetailRow label="Ready" value={pod.ready} theme={t} />
                          <DetailRow label="Restarts" value={pod.restarts} theme={t} />
                          <DetailRow label="Age" value={pod.age} theme={t} />
                          <DetailRow label="Node" value={pod.node} theme={t} />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Deployments */}
          <div style={{ borderTop: `1px solid ${t.border}` }}>
            <div style={sectionHeaderStyle} onClick={() => toggleSection("k8s-deployments")}>
              {chevron(expandedSections.has("k8s-deployments"))}
              Deployments
              <span style={{ fontSize: 10, color: t.textMuted, fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>
                ({k8sInfo.deployments.length})
              </span>
            </div>
            {expandedSections.has("k8s-deployments") && (
              <div style={{ padding: "0 8px 8px" }}>
                {k8sInfo.deployments.length === 0 && (
                  <div style={{ padding: 8, fontSize: 12, color: t.textMuted, textAlign: "center" }}>No deployments</div>
                )}
                {k8sInfo.deployments.map((dep) => {
                  const isOpen = expandedDeployment === dep.name;
                  const isReady = dep.ready === dep.available && dep.ready !== "0" && dep.ready !== "<none>";
                  return (
                    <div key={dep.name} style={{ borderRadius: 6, marginBottom: 1 }}>
                      <div
                        onClick={() => setExpandedDeployment(isOpen ? null : dep.name)}
                        style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 8px", borderRadius: 6, fontSize: 12, cursor: "pointer", transition: "background 0.1s", background: dep.is_project ? t.accentBg : "transparent" }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = t.bgHover; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = dep.is_project ? t.accentBg : "transparent"; }}
                      >
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0, color: isReady ? "#9ece6a" : "#e0af68" }}>
                          <rect x="2" y="2" width="10" height="10" rx="2" stroke="currentColor" strokeWidth="1.2" />
                          <path d="M5 7h4M7 5v4" stroke="currentColor" strokeWidth="1" opacity="0.5" />
                        </svg>
                        <span style={{ flex: 1, fontFamily: MONO, fontWeight: 500, color: t.textPrimary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 11 }}>
                          {dep.name}
                          {dep.is_project && <span style={{ fontSize: 8, color: t.accent, marginLeft: 6, fontWeight: 700, fontFamily: SF, textTransform: "uppercase", letterSpacing: "0.05em" }}>project</span>}
                        </span>
                        <span style={{ fontSize: 9, color: isReady ? "#9ece6a" : "#e0af68", fontFamily: MONO, flexShrink: 0 }}>
                          {dep.ready || "0"}/{dep.available || "0"}
                        </span>
                        <svg width="10" height="10" viewBox="0 0 10 10" fill="none"
                          style={{ transition: "transform 0.15s", transform: isOpen ? "rotate(90deg)" : "rotate(0deg)", flexShrink: 0, color: t.textMuted }}>
                          <path d="M3.5 2L6.5 5L3.5 8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </div>
                      {isOpen && (
                        <div style={{ margin: "2px 0 6px 30px", padding: "8px 10px", background: t.bgInput, borderRadius: 6, fontSize: 11, lineHeight: 1.7, fontFamily: MONO }}>
                          <DetailRow label="Namespace" value={dep.namespace} theme={t} />
                          <DetailRow label="Ready" value={dep.ready} theme={t} />
                          <DetailRow label="Up-to-date" value={dep.up_to_date} theme={t} />
                          <DetailRow label="Available" value={dep.available} theme={t} />
                          <DetailRow label="Age" value={dep.age} theme={t} />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Services */}
          <div style={{ borderTop: `1px solid ${t.border}` }}>
            <div style={sectionHeaderStyle} onClick={() => toggleSection("k8s-services")}>
              {chevron(expandedSections.has("k8s-services"))}
              Services
              <span style={{ fontSize: 10, color: t.textMuted, fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>
                ({k8sInfo.services.length})
              </span>
            </div>
            {expandedSections.has("k8s-services") && (
              <div style={{ padding: "0 8px 8px" }}>
                {k8sInfo.services.length === 0 && (
                  <div style={{ padding: 8, fontSize: 12, color: t.textMuted, textAlign: "center" }}>No services</div>
                )}
                {k8sInfo.services.map((svc) => {
                  const isOpen = expandedService === svc.name;
                  return (
                    <div key={svc.name} style={{ borderRadius: 6, marginBottom: 1 }}>
                      <div
                        onClick={() => setExpandedService(isOpen ? null : svc.name)}
                        style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 8px", borderRadius: 6, fontSize: 12, cursor: "pointer", transition: "background 0.1s", background: svc.is_project ? t.accentBg : "transparent" }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = t.bgHover; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = svc.is_project ? t.accentBg : "transparent"; }}
                      >
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0, color: "#7dcfff" }}>
                          <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.2" />
                          <path d="M4.5 7h5M7 4.5v5" stroke="currentColor" strokeWidth="0.8" opacity="0.5" />
                        </svg>
                        <span style={{ flex: 1, fontFamily: MONO, fontWeight: 500, color: t.textPrimary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 11 }}>
                          {svc.name}
                          {svc.is_project && <span style={{ fontSize: 8, color: t.accent, marginLeft: 6, fontWeight: 700, fontFamily: SF, textTransform: "uppercase", letterSpacing: "0.05em" }}>project</span>}
                        </span>
                        <span style={{ fontSize: 9, color: t.textMuted, fontFamily: MONO, flexShrink: 0 }}>{svc.svc_type}</span>
                        <svg width="10" height="10" viewBox="0 0 10 10" fill="none"
                          style={{ transition: "transform 0.15s", transform: isOpen ? "rotate(90deg)" : "rotate(0deg)", flexShrink: 0, color: t.textMuted }}>
                          <path d="M3.5 2L6.5 5L3.5 8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </div>
                      {isOpen && (
                        <div style={{ margin: "2px 0 6px 30px", padding: "8px 10px", background: t.bgInput, borderRadius: 6, fontSize: 11, lineHeight: 1.7, fontFamily: MONO }}>
                          <DetailRow label="Namespace" value={svc.namespace} theme={t} />
                          <DetailRow label="Type" value={svc.svc_type} theme={t} />
                          <DetailRow label="Cluster IP" value={svc.cluster_ip} theme={t} />
                          <DetailRow label="Ports" value={svc.ports} theme={t} />
                          <DetailRow label="Age" value={svc.age} theme={t} />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* K8s not available — show centered empty state when Docker is also not available */}
      {(!dockerInfo?.available && k8sInfo && !k8sInfo.available) && (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24, gap: 12 }}>
          <svg width="40" height="40" viewBox="0 0 40 40" fill="none" style={{ color: t.textMuted, opacity: 0.5 }}>
            {/* K8s helm wheel */}
            <circle cx="20" cy="20" r="10" stroke="currentColor" strokeWidth="2" />
            <circle cx="20" cy="20" r="3" stroke="currentColor" strokeWidth="1.5" />
            <line x1="20" y1="10" x2="20" y2="7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            <line x1="20" y1="30" x2="20" y2="33" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            <line x1="10" y1="20" x2="7" y2="20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            <line x1="30" y1="20" x2="33" y2="20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            <line x1="12.9" y1="12.9" x2="10.8" y2="10.8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            <line x1="27.1" y1="27.1" x2="29.2" y2="29.2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            {/* Cross-out line */}
            <line x1="5" y1="5" x2="35" y2="35" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.6" />
          </svg>
          <div style={{ fontSize: 14, color: t.textSecondary }}>Kubernetes not available</div>
          <div style={{ fontSize: 12, color: t.textMuted }}>
            Install <code style={{ background: t.bgInput, padding: "2px 6px", borderRadius: 4, fontSize: 11, fontFamily: "'SF Mono', monospace" }}>kubectl</code> to manage clusters
          </div>
        </div>
      )}

    </div>
  );
}

function LogsView({ content }: { content: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [content]);
  return (
    <div ref={ref} style={{ maxHeight: 250, overflowY: "auto", overflowX: "auto", padding: "6px 8px", background: "#0d1117", fontSize: 10, fontFamily: "'SF Mono', Menlo, monospace", lineHeight: 1.6, color: "#c9d1d9", whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
      {content}
    </div>
  );
}

function ActionBtn({ title, loading, theme: t, onClick, color, children }: {
  title: string; loading: boolean; theme: ReturnType<typeof useAppStore.getState>["theme"];
  onClick: () => void; color: string; children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      title={title}
      style={{
        display: "flex", alignItems: "center", justifyContent: "center",
        width: 20, height: 20, borderRadius: 4, border: "none",
        background: "transparent", color, cursor: loading ? "wait" : "pointer",
        opacity: loading ? 0.4 : 0.7, transition: "opacity 0.15s, background 0.15s",
        padding: 0,
      }}
      onMouseEnter={(e) => { e.currentTarget.style.opacity = "1"; e.currentTarget.style.background = t.bgHover; }}
      onMouseLeave={(e) => { e.currentTarget.style.opacity = loading ? "0.4" : "0.7"; e.currentTarget.style.background = "transparent"; }}
    >
      {loading ? (
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ animation: "spin 1s linear infinite" }}>
          <circle cx="6" cy="6" r="4" stroke="currentColor" strokeWidth="1.5" strokeDasharray="12 8" strokeLinecap="round" />
        </svg>
      ) : (
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">{children}</svg>
      )}
    </button>
  );
}

function DetailRow({ label, value, theme }: { label: string; value: string; theme: ReturnType<typeof useAppStore.getState>["theme"] }) {
  return (
    <div style={{ display: "flex", gap: 8 }}>
      <span style={{ color: theme.textMuted, minWidth: 70, flexShrink: 0, fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', system-ui, sans-serif", fontSize: 10, fontWeight: 600 }}>{label}</span>
      <span style={{ color: theme.textPrimary, wordBreak: "break-all" }}>{value}</span>
    </div>
  );
}
