import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useAppStore } from "../state/store";
import { ResizeHandle } from "./ResizeHandle";

interface GitBranch {
  name: string;
  is_current: boolean;
  is_remote: boolean;
}

interface GitFileStatus {
  path: string;
  status: string;
  staged: boolean;
}

interface GitTag {
  name: string;
  hash: string;
  is_annotated: boolean;
  tagger: string;
  date: string;
  message: string;
}

interface GitCommit {
  hash: string;
  short_hash: string;
  message: string;
  refs: string[];
  parents: string[];
  author: string;
  time_ago: string;
}

interface GitInfo {
  is_repo: boolean;
  current_branch: string;
  branches: GitBranch[];
  tags: GitTag[];
  commits: GitCommit[];
  files: GitFileStatus[];
  ahead: number;
  behind: number;
}

type Section = "branches" | "tags" | "changes" | "graph";

const STATUS_META: { code: string; label: string; darkColor: string; lightColor: string; icon: string }[] = [
  { code: "M", label: "Modified", darkColor: "#e0af68", lightColor: "#df8e1d", icon: "M" },
  { code: "A", label: "Added", darkColor: "#9ece6a", lightColor: "#40a02b", icon: "A" },
  { code: "D", label: "Deleted", darkColor: "#f7768e", lightColor: "#d20f39", icon: "D" },
  { code: "R", label: "Renamed", darkColor: "#7dcfff", lightColor: "#179299", icon: "R" },
  { code: "C", label: "Copied", darkColor: "#bb9af7", lightColor: "#8839ef", icon: "C" },
  { code: "U", label: "Unmerged", darkColor: "#ff9e64", lightColor: "#fe640b", icon: "U" },
  { code: "??", label: "Untracked", darkColor: "#565f89", lightColor: "#8c8fa1", icon: "?" },
];

const LANE_COLORS = [
  "#7aa2f7", "#9ece6a", "#bb9af7", "#e0af68",
  "#f7768e", "#7dcfff", "#ff9e64", "#c0caf5",
];

const SF = "-apple-system, BlinkMacSystemFont, 'SF Pro Text', system-ui, sans-serif";
const MONO = "'SF Mono', Menlo, monospace";

const ROW_HEIGHT = 34;
const LANE_WIDTH = 18;
const NODE_R = 4;

// ── Graph layout engine ──

interface GraphRow {
  commit: GitCommit;
  lane: number;
  activeLanes: number[];
  mergeFrom: number[];
  branchTo: number[];
  isMerge: boolean;
  mergedBranch: string | null;
  // The second-parent hash (the branch that was merged in)
  mergeSourceHash: string | null;
}

function buildGraph(commits: GitCommit[]): { rows: GraphRow[]; mergedBranches: Set<string> } {
  if (commits.length === 0) return { rows: [], mergedBranches: new Set() };

  const byHash = new Map<string, GitCommit>();
  for (const c of commits) byHash.set(c.hash, c);

  const activeLanes: (string | null)[] = [];
  const rows: GraphRow[] = [];
  const mergedBranches = new Set<string>();

  function allocLane(): number {
    const idx = activeLanes.indexOf(null);
    if (idx !== -1) return idx;
    activeLanes.push(null);
    return activeLanes.length - 1;
  }

  function freeLane(lane: number) {
    activeLanes[lane] = null;
  }

  for (const commit of commits) {
    let lane = -1;
    for (let l = 0; l < activeLanes.length; l++) {
      if (activeLanes[l] === commit.hash) { lane = l; break; }
    }

    const mergeFromLanes: number[] = [];
    for (let l = 0; l < activeLanes.length; l++) {
      if (activeLanes[l] === commit.hash && l !== lane) mergeFromLanes.push(l);
    }

    if (lane === -1) lane = allocLane();
    for (const ml of mergeFromLanes) freeLane(ml);

    const isMerge = commit.parents.length > 1;
    let mergedBranch: string | null = null;
    let mergeSourceHash: string | null = null;

    if (isMerge) {
      const mergeMatch = commit.message.match(/Merge (?:branch|pull request)\s+(?:'|#)?([^\s']+)/i);
      if (mergeMatch) {
        mergedBranch = mergeMatch[1];
        mergedBranches.add(mergedBranch);
      }
      mergeSourceHash = commit.parents[1] || null;
    }

    const branchToLanes: number[] = [];

    if (commit.parents.length > 0 && byHash.has(commit.parents[0])) {
      activeLanes[lane] = commit.parents[0];
    } else {
      freeLane(lane);
    }

    for (let p = 1; p < commit.parents.length; p++) {
      if (byHash.has(commit.parents[p])) {
        let parentLane = -1;
        for (let l = 0; l < activeLanes.length; l++) {
          if (activeLanes[l] === commit.parents[p]) { parentLane = l; break; }
        }
        if (parentLane === -1) {
          parentLane = allocLane();
          activeLanes[parentLane] = commit.parents[p];
        }
        branchToLanes.push(parentLane);
      }
    }

    const activeSnapshot: number[] = [];
    for (let l = 0; l < activeLanes.length; l++) {
      if (activeLanes[l] !== null) activeSnapshot.push(l);
    }

    rows.push({
      commit, lane, activeLanes: activeSnapshot,
      mergeFrom: mergeFromLanes, branchTo: branchToLanes,
      isMerge, mergedBranch, mergeSourceHash,
    });
  }

  return { rows, mergedBranches };
}

// Find commits that belong to a merged branch by following the second parent chain
function findMergedCommitIndices(
  rows: GraphRow[],
  mergeIdx: number,
): number[] {
  const mergeRow = rows[mergeIdx];
  if (!mergeRow.mergeSourceHash) return [];

  // Collect all second-parent commit hashes by walking the chain
  const secondParentHashes = new Set<string>();
  const firstParentHashes = new Set<string>();

  // Walk the first parent chain to know what's on the main branch
  let h: string | null = mergeRow.commit.parents[0] || null;
  for (const r of rows) {
    if (r.commit.hash === h) {
      firstParentHashes.add(h);
      h = r.commit.parents[0] || null;
    }
  }

  // Walk the second parent chain
  let current: string | null = mergeRow.mergeSourceHash;
  while (current) {
    if (firstParentHashes.has(current)) break; // reached the branch point
    secondParentHashes.add(current);
    const row = rows.find(r => r.commit.hash === current);
    if (!row) break;
    current = row.commit.parents[0] || null;
  }

  const indices: number[] = [];
  for (let i = mergeIdx + 1; i < rows.length; i++) {
    if (secondParentHashes.has(rows[i].commit.hash)) {
      indices.push(i);
    }
  }
  return indices;
}

// ── Main Component ──

// Standalone panel (legacy, kept for compatibility)
export function GitPanel() {
  const gitPanelWidth = useAppStore((s) => s.gitPanelWidth);
  const setGitPanelWidth = useAppStore((s) => s.setGitPanelWidth);
  const t = useAppStore((s) => s.theme);

  return (
    <div style={{ position: "relative", display: "flex", flexDirection: "column", width: gitPanelWidth, minWidth: 200, borderLeft: `1px solid ${t.border}`, background: t.bgSidebar, fontFamily: SF }}>
      <ResizeHandle direction="vertical" position="left" onResize={setGitPanelWidth} />
      <GitPanelContent />
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// Embeddable content (used by InfoPanel)
export function GitPanelContent() {
  const groups = useAppStore((s) => s.groups);
  const activeGroupId = useAppStore((s) => s.activeGroupId);
  const themeMode = useAppStore((s) => s.themeMode);
  const systemDark = useAppStore((s) => s.systemDark);
  const t = useAppStore((s) => s.theme);
  const infoPanelVisible = useAppStore((s) => s.infoPanelVisible);
  const infoPanelTab = useAppStore((s) => s.infoPanelTab);
  const gitPanelVisible = useAppStore((s) => s.gitPanelVisible);
  const isPanelActive = (infoPanelVisible && infoPanelTab === "git") || gitPanelVisible;

  const [gitInfo, setGitInfo] = useState<GitInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Set<Section>>(
    new Set(["branches", "changes", "graph"])
  );
  const [showRemoteBranches, setShowRemoteBranches] = useState(false);
  const [expandedMerges, setExpandedMerges] = useState<Set<string>>(new Set());
  const [expandedTag, setExpandedTag] = useState<string | null>(null);

  const isDark = themeMode === "dark" || (themeMode === "system" && systemDark);
  const cwd = groups[activeGroupId]?.cwd || "";
  const cwdRef = useRef(cwd);
  cwdRef.current = cwd;
  const lastFetchRef = useRef<number>(0);
  const throttleTimerRef = useRef<number | null>(null);

  const fetchGitInfo = useCallback(() => {
    if (!cwd) { setGitInfo(null); return; }
    const requestCwd = cwd;
    setLoading(true);
    lastFetchRef.current = Date.now();
    invoke<GitInfo>("git_info", { cwd })
      .then((info) => { if (cwdRef.current === requestCwd) setGitInfo(info); })
      .catch(() => { if (cwdRef.current === requestCwd) setGitInfo(null); })
      .finally(() => setLoading(false));
  }, [cwd]);

  // Throttled fetch: at most once every 5s from watcher events
  const fetchGitInfoThrottled = useCallback(() => {
    const elapsed = Date.now() - lastFetchRef.current;
    if (elapsed >= 5000) {
      fetchGitInfo();
    } else if (!throttleTimerRef.current) {
      throttleTimerRef.current = window.setTimeout(() => {
        throttleTimerRef.current = null;
        fetchGitInfo();
      }, 5000 - elapsed);
    }
  }, [fetchGitInfo]);

  useEffect(() => {
    return () => { if (throttleTimerRef.current) clearTimeout(throttleTimerRef.current); };
  }, []);

  useEffect(() => { if (isPanelActive) fetchGitInfo(); }, [fetchGitInfo, isPanelActive]);

  useEffect(() => {
    if (!cwd || !isPanelActive) return;
    invoke("git_watch", { cwd }).catch(() => {});
    const unlisten = listen<string>("git-changed", (event) => {
      if (event.payload === cwd) fetchGitInfoThrottled();
    });
    return () => {
      invoke("git_unwatch", { cwd }).catch(() => {});
      unlisten.then((fn) => fn());
    };
  }, [cwd, fetchGitInfoThrottled, isPanelActive]);

  const toggleSection = useCallback((section: Section) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(section)) next.delete(section); else next.add(section);
      return next;
    });
  }, []);

  const toggleMerge = useCallback((hash: string) => {
    setExpandedMerges((prev) => {
      const next = new Set(prev);
      if (next.has(hash)) next.delete(hash); else next.add(hash);
      return next;
    });
  }, []);

  const { rows: graphRows, mergedBranches } = useMemo(
    () => buildGraph(gitInfo?.commits ?? []),
    [gitInfo?.commits]
  );

  // Build merge ranges using parent-chain walking
  const mergeRanges = useMemo(() => {
    const ranges: { mergeIdx: number; mergeHash: string; hiddenIndices: number[] }[] = [];
    for (let i = 0; i < graphRows.length; i++) {
      const row = graphRows[i];
      if (row.isMerge && row.mergeSourceHash) {
        const indices = findMergedCommitIndices(graphRows, i);
        if (indices.length > 0) {
          ranges.push({ mergeIdx: i, mergeHash: row.commit.hash, hiddenIndices: indices });
        }
      }
    }
    return ranges;
  }, [graphRows]);

  // Filter rows: collapse merged branches unless expanded
  const visibleRows = useMemo(() => {
    if (graphRows.length === 0) return [];

    const hiddenSet = new Set<number>();
    const collapseMarkers = new Map<number, { count: number; mergeHash: string }>();

    for (const range of mergeRanges) {
      if (!expandedMerges.has(range.mergeHash)) {
        for (const idx of range.hiddenIndices) {
          hiddenSet.add(idx);
        }
        // Place a collapse marker at the first hidden index
        if (range.hiddenIndices.length > 0) {
          const firstHidden = range.hiddenIndices[0];
          collapseMarkers.set(firstHidden, {
            count: range.hiddenIndices.length,
            mergeHash: range.mergeHash,
          });
        }
      }
    }

    const result: { row: GraphRow; idx: number; collapsedCount?: number; mergeHash?: string }[] = [];
    for (let i = 0; i < graphRows.length; i++) {
      if (hiddenSet.has(i)) {
        const marker = collapseMarkers.get(i);
        if (marker) {
          result.push({
            row: graphRows[i],
            idx: i,
            collapsedCount: marker.count,
            mergeHash: marker.mergeHash,
          });
        }
        // Skip other hidden indices
        continue;
      }
      result.push({ row: graphRows[i], idx: i });
    }
    return result;
  }, [graphRows, expandedMerges, mergeRanges]);

  const localBranches = gitInfo?.branches.filter((b) => !b.is_remote) ?? [];
  const remoteBranches = gitInfo?.branches.filter((b) => b.is_remote) ?? [];
  const stagedFiles = gitInfo?.files.filter((f) => f.staged) ?? [];
  const unstagedFiles = gitInfo?.files.filter((f) => !f.staged) ?? [];

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
      {/* Empty states */}
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
      {cwd && gitInfo && !gitInfo.is_repo && (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24, gap: 12 }}>
          <svg width="40" height="40" viewBox="0 0 40 40" fill="none" style={{ color: t.textMuted, opacity: 0.5 }}>
            <circle cx="20" cy="8" r="4" stroke="currentColor" strokeWidth="2" />
            <circle cx="20" cy="32" r="4" stroke="currentColor" strokeWidth="2" />
            <circle cx="32" cy="20" r="4" stroke="currentColor" strokeWidth="2" />
            <path d="M20 12v16M24 24l5-4" stroke="currentColor" strokeWidth="2" />
            <line x1="5" y1="5" x2="35" y2="35" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.6" />
          </svg>
          <div style={{ fontSize: 14, color: t.textSecondary }}>Not a Git repository</div>
          <div style={{ fontSize: 12, color: t.textMuted }}>
            Run <code style={{ background: t.bgInput, padding: "2px 6px", borderRadius: 4, fontSize: 11, fontFamily: MONO }}>git init</code>
          </div>
        </div>
      )}
      {cwd && !gitInfo && loading && <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: t.textMuted, fontSize: 13 }}>Loading...</div>}

      {/* Git content */}
      {gitInfo && gitInfo.is_repo && (
        <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden" }}>
          {/* Current branch */}
          <div style={{ padding: "10px 12px", borderBottom: `1px solid ${t.border}`, display: "flex", alignItems: "center", gap: 8 }}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <circle cx="7" cy="3" r="2" stroke={t.accent} strokeWidth="1.3" />
              <circle cx="7" cy="11" r="2" stroke={t.accent} strokeWidth="1.3" />
              <line x1="7" y1="5" x2="7" y2="9" stroke={t.accent} strokeWidth="1.3" />
            </svg>
            <span style={{ fontSize: 13, fontWeight: 600, color: t.accent, fontFamily: MONO }}>{gitInfo.current_branch}</span>
            {(gitInfo.ahead > 0 || gitInfo.behind > 0) && (
              <span style={{ fontSize: 11, color: t.textMuted }}>
                {gitInfo.ahead > 0 && `↑${gitInfo.ahead}`}{gitInfo.ahead > 0 && gitInfo.behind > 0 && " "}{gitInfo.behind > 0 && `↓${gitInfo.behind}`}
              </span>
            )}
            <button onClick={fetchGitInfo} title="Refresh" style={{ marginLeft: "auto", background: "transparent", border: "none", color: t.textMuted, cursor: "pointer", padding: 2, display: "flex", borderRadius: 4, flexShrink: 0 }}
              onMouseEnter={(e) => { e.currentTarget.style.color = t.textPrimary; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = t.textMuted; }}>
              <svg width="12" height="12" viewBox="0 0 14 14" fill="none" style={{ animation: loading ? "spin 1s linear infinite" : "none" }}>
                <path d="M12.5 7a5.5 5.5 0 1 1-1.1-3.3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                <path d="M12.5 2v3.7h-3.7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>

          {/* Branches */}
          <div>
            <div style={sectionHeaderStyle} onClick={() => toggleSection("branches")}>
              {chevron(expandedSections.has("branches"))}
              Branches
              <span style={{ fontSize: 10, color: t.textMuted, fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>({localBranches.length})</span>
            </div>
            {expandedSections.has("branches") && (
              <div style={{ padding: "0 8px 8px" }}>
                {localBranches.map((branch, i) => {
                  const isMerged = mergedBranches.has(branch.name);
                  return (
                    <div key={branch.name} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 8px", borderRadius: 6, fontSize: 12, color: branch.is_current ? t.accent : isMerged ? t.textMuted : t.textSecondary, fontWeight: branch.is_current ? 600 : 400, fontFamily: MONO, background: branch.is_current ? t.accentBg : "transparent" }}>
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0 }}>
                        <circle cx="7" cy="7" r={branch.is_current ? 4 : 3} fill={branch.is_current ? LANE_COLORS[i % LANE_COLORS.length] : "transparent"} stroke={LANE_COLORS[i % LANE_COLORS.length]} strokeWidth="1.5" opacity={isMerged ? 0.4 : 1} />
                      </svg>
                      <span style={{ opacity: isMerged ? 0.6 : 1 }}>{branch.name}</span>
                      {isMerged && (
                        <span style={{ fontSize: 9, color: t.textMuted, background: t.bgInput, padding: "1px 5px", borderRadius: 3, fontFamily: SF, fontWeight: 500, marginLeft: "auto" }}>merged</span>
                      )}
                    </div>
                  );
                })}
                {remoteBranches.length > 0 && (
                  <>
                    <button onClick={() => setShowRemoteBranches(!showRemoteBranches)} style={{ background: "transparent", border: "none", color: t.textMuted, fontSize: 11, cursor: "pointer", padding: "5px 8px", marginTop: 4, display: "flex", alignItems: "center", gap: 4, fontFamily: SF }}>
                      {chevron(showRemoteBranches)}
                      <span>Remote ({remoteBranches.length})</span>
                    </button>
                    {showRemoteBranches && remoteBranches.map((branch) => (
                      <div key={branch.name} style={{ display: "flex", alignItems: "center", gap: 8, padding: "3px 8px 3px 20px", fontSize: 11, color: t.textMuted, fontFamily: MONO, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" style={{ flexShrink: 0 }}>
                          <circle cx="5" cy="5" r="2" stroke={t.textMuted} strokeWidth="1" strokeDasharray="2 1" />
                        </svg>
                        {branch.name}
                      </div>
                    ))}
                  </>
                )}
              </div>
            )}
          </div>

          {/* Tags */}
          {gitInfo.tags.length > 0 && (
            <div style={{ borderTop: `1px solid ${t.border}` }}>
              <div style={sectionHeaderStyle} onClick={() => toggleSection("tags")}>
                {chevron(expandedSections.has("tags"))}
                Tags
                <span style={{ fontSize: 10, color: t.textMuted, fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>({gitInfo.tags.length})</span>
              </div>
              {expandedSections.has("tags") && (
                <div style={{ padding: "0 8px 8px" }}>
                  {gitInfo.tags.map((tag) => {
                    const isOpen = expandedTag === tag.name;
                    return (
                      <div key={tag.name}>
                        <div
                          onClick={() => setExpandedTag(isOpen ? null : tag.name)}
                          style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 8px", borderRadius: 6, fontSize: 12, color: t.textSecondary, cursor: "pointer", transition: "background 0.1s", fontFamily: MONO }}
                          onMouseEnter={(e) => { e.currentTarget.style.background = t.bgHover; }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                        >
                          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0, color: tag.is_annotated ? "#e0af68" : t.textMuted }}>
                            <path d="M2.5 2.5h4.3L12 7.7a.7.7 0 0 1 0 1L8.7 12a.7.7 0 0 1-1 0L2.5 6.8V2.5z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
                            <circle cx="5.5" cy="5.5" r="1" fill="currentColor" />
                          </svg>
                          <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{tag.name}</span>
                          <span style={{ fontSize: 10, color: t.textMuted, fontFamily: MONO, flexShrink: 0 }}>{tag.hash}</span>
                          <svg width="10" height="10" viewBox="0 0 10 10" fill="none"
                            style={{ transition: "transform 0.15s", transform: isOpen ? "rotate(90deg)" : "rotate(0deg)", flexShrink: 0, color: t.textMuted }}>
                            <path d="M3.5 2L6.5 5L3.5 8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </div>
                        {isOpen && (
                          <div style={{ margin: "2px 0 6px 30px", padding: "8px 10px", background: t.bgInput, borderRadius: 6, fontSize: 11, lineHeight: 1.5 }}>
                            {tag.message && <div style={{ color: t.textPrimary, fontWeight: 500, marginBottom: 4 }}>{tag.message}</div>}
                            {tag.tagger && <div style={{ color: t.textMuted, fontFamily: SF }}>By {tag.tagger}</div>}
                            {tag.date && <div style={{ color: t.textMuted, fontFamily: SF }}>{tag.date}</div>}
                            {!tag.is_annotated && <div style={{ color: t.textMuted, fontStyle: "italic", fontFamily: SF }}>Lightweight tag (no annotation)</div>}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Changes */}
          <div style={{ borderTop: `1px solid ${t.border}` }}>
            <div style={sectionHeaderStyle} onClick={() => toggleSection("changes")}>
              {chevron(expandedSections.has("changes"))}
              Changes
              {gitInfo.files.length > 0 && (
                <span style={{ fontSize: 10, background: t.accent, color: "#fff", borderRadius: 8, padding: "1px 6px", fontWeight: 600, textTransform: "none", letterSpacing: 0 }}>{gitInfo.files.length}</span>
              )}
            </div>
            {expandedSections.has("changes") && (
              <div style={{ padding: "0 8px 8px" }}>
                {gitInfo.files.length === 0 && <div style={{ padding: 8, fontSize: 12, color: t.textMuted, textAlign: "center" }}>Working tree clean</div>}
                {stagedFiles.length > 0 && (
                  <>
                    <div style={{ fontSize: 11, fontWeight: 600, color: t.terminal.green, padding: "6px 8px 4px" }}>Staged</div>
                    {stagedFiles.map((f) => <FileEntry key={`s-${f.path}`} file={f} isDark={isDark} theme={t} />)}
                  </>
                )}
                {unstagedFiles.length > 0 && (
                  <>
                    <div style={{ fontSize: 11, fontWeight: 600, color: t.terminal.yellow, padding: "6px 8px 4px" }}>Unstaged</div>
                    {unstagedFiles.map((f) => <FileEntry key={`u-${f.path}`} file={f} isDark={isDark} theme={t} />)}
                  </>
                )}

                {/* Status legend */}
                <div style={{ marginTop: 10, padding: "8px 8px 4px", borderTop: `1px solid ${t.border}` }}>
                  <div style={{ fontSize: 10, color: t.textMuted, marginBottom: 6, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>Legend</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 12px" }}>
                    {STATUS_META.map((s) => (
                      <div key={s.code} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10 }}>
                        <span style={{ fontFamily: MONO, fontWeight: 700, color: isDark ? s.darkColor : s.lightColor, width: 14, textAlign: "center" }}>{s.icon}</span>
                        <span style={{ color: t.textMuted }}>{s.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Commit Graph */}
          <div style={{ borderTop: `1px solid ${t.border}` }}>
            <div style={sectionHeaderStyle} onClick={() => toggleSection("graph")}>
              {chevron(expandedSections.has("graph"))}
              Commit Graph
              <span style={{ fontSize: 10, color: t.textMuted, fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>({gitInfo.commits.length})</span>
            </div>
            {expandedSections.has("graph") && (
              <VirtualCommitList
                visibleRows={visibleRows}
                graphRows={graphRows}
                mergeRanges={mergeRanges}
                expandedMerges={expandedMerges}
                toggleMerge={toggleMerge}
                theme={t}
              />
            )}
          </div>
        </div>
      )}

    </div>
  );
}

// ── Virtual Commit List ──

const COLLAPSED_ROW_HEIGHT = 28;
const OVERSCAN = 10;

function VirtualCommitList({
  visibleRows,
  graphRows,
  mergeRanges,
  expandedMerges,
  toggleMerge,
  theme,
}: {
  visibleRows: { row: GraphRow; idx: number; collapsedCount?: number; mergeHash?: string }[];
  graphRows: GraphRow[];
  mergeRanges: { mergeIdx: number; mergeHash: string; hiddenIndices: number[] }[];
  expandedMerges: Set<string>;
  toggleMerge: (hash: string) => void;
  theme: ReturnType<typeof useAppStore.getState>["theme"];
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(400);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerHeight(entry.contentRect.height);
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
  }, []);

  // Compute row heights and total
  const rowHeights = useMemo(() =>
    visibleRows.map((item) => item.collapsedCount ? COLLAPSED_ROW_HEIGHT : ROW_HEIGHT),
    [visibleRows]
  );

  const totalHeight = useMemo(() =>
    rowHeights.reduce((sum, h) => sum + h, 0),
    [rowHeights]
  );

  // Find visible range
  const { startIdx, endIdx } = useMemo(() => {
    let cumulative = 0;
    let start = 0;
    let end = visibleRows.length;

    for (let i = 0; i < visibleRows.length; i++) {
      if (cumulative + rowHeights[i] > scrollTop) {
        start = Math.max(0, i - OVERSCAN);
        break;
      }
      cumulative += rowHeights[i];
    }

    cumulative = 0;
    for (let i = 0; i < visibleRows.length; i++) {
      cumulative += rowHeights[i];
      if (cumulative > scrollTop + containerHeight) {
        end = Math.min(visibleRows.length, i + 1 + OVERSCAN);
        break;
      }
    }

    return { startIdx: start, endIdx: end };
  }, [scrollTop, containerHeight, visibleRows.length, rowHeights]);

  // Offset for the first visible item
  const offsetTop = useMemo(() => {
    let sum = 0;
    for (let i = 0; i < startIdx; i++) sum += rowHeights[i];
    return sum;
  }, [startIdx, rowHeights]);

  if (visibleRows.length === 0) {
    return <div style={{ padding: 8, fontSize: 12, color: theme.textMuted, textAlign: "center" }}>No commits yet</div>;
  }

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      style={{ overflowY: "auto", maxHeight: "calc(100vh - 200px)", padding: "0 4px 8px" }}
    >
      <div style={{ height: totalHeight, position: "relative" }}>
        <div style={{ position: "absolute", top: offsetTop, left: 0, right: 0 }}>
          {visibleRows.slice(startIdx, endIdx).map((item) => {
            if (item.collapsedCount && item.mergeHash) {
              return (
                <CollapsedMerge
                  key={`collapse-${item.mergeHash}`}
                  count={item.collapsedCount}
                  lane={item.row.lane}
                  activeLanes={item.row.activeLanes}
                  mergedBranch={graphRows[mergeRanges.find(r => r.mergeHash === item.mergeHash)?.mergeIdx ?? 0]?.mergedBranch ?? null}
                  onExpand={() => toggleMerge(item.mergeHash!)}
                  theme={theme}
                />
              );
            }
            return (
              <CommitRow
                key={item.row.commit.hash}
                row={item.row}
                theme={theme}
                isExpanded={expandedMerges.has(item.row.commit.hash)}
                onToggleMerge={item.row.isMerge && item.row.mergeSourceHash ? () => toggleMerge(item.row.commit.hash) : undefined}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Commit Row ──

function CommitRow({
  row, theme, isExpanded, onToggleMerge,
}: {
  row: GraphRow;
  theme: ReturnType<typeof useAppStore.getState>["theme"];
  isExpanded: boolean;
  onToggleMerge?: () => void;
}) {
  const maxLane = Math.max(0, ...row.activeLanes, row.lane, ...row.mergeFrom, ...row.branchTo);
  const svgW = (maxLane + 2) * LANE_WIDTH;
  const cx = row.lane * LANE_WIDTH + LANE_WIDTH / 2 + 4;
  const cy = ROW_HEIGHT / 2;
  const color = LANE_COLORS[row.lane % LANE_COLORS.length];
  const isHead = row.commit.refs.some((r) => r.includes("HEAD"));
  const headRef = row.commit.refs.find((r) => r.includes("HEAD ->"));
  const tagRefs = row.commit.refs.filter((r) => r.startsWith("tag: "));
  const otherRefs = row.commit.refs.filter((r) => !r.includes("HEAD") && !r.startsWith("tag: "));

  return (
    <div
      style={{ display: "flex", alignItems: "center", height: ROW_HEIGHT, borderRadius: 4, cursor: "default", transition: "background 0.1s" }}
      onMouseEnter={(e) => { e.currentTarget.style.background = theme.bgHover; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}>
      <svg width={svgW} height={ROW_HEIGHT} style={{ flexShrink: 0, minWidth: svgW }}>
        {/* Vertical lane lines */}
        {row.activeLanes.map((l) => {
          const lx = l * LANE_WIDTH + LANE_WIDTH / 2 + 4;
          const lc = LANE_COLORS[l % LANE_COLORS.length];
          return <line key={`vl-${l}`} x1={lx} y1={0} x2={lx} y2={ROW_HEIGHT} stroke={lc} strokeWidth={1.5} opacity={0.7} />;
        })}

        {/* Merge curves */}
        {row.mergeFrom.map((ml) => {
          const fromX = ml * LANE_WIDTH + LANE_WIDTH / 2 + 4;
          const mlColor = LANE_COLORS[ml % LANE_COLORS.length];
          return <path key={`mf-${ml}`} d={`M ${fromX} 0 C ${fromX} ${cy * 0.7}, ${cx} ${cy * 0.3}, ${cx} ${cy}`} stroke={mlColor} strokeWidth={2} fill="none" opacity={0.7} />;
        })}

        {/* Branch-out curves */}
        {row.branchTo.map((bl) => {
          const toX = bl * LANE_WIDTH + LANE_WIDTH / 2 + 4;
          const blColor = LANE_COLORS[bl % LANE_COLORS.length];
          return <path key={`bo-${bl}`} d={`M ${cx} ${cy} C ${cx} ${cy + cy * 0.7}, ${toX} ${ROW_HEIGHT - cy * 0.3}, ${toX} ${ROW_HEIGHT}`} stroke={blColor} strokeWidth={2} fill="none" opacity={0.7} />;
        })}

        {/* Node */}
        {row.isMerge ? (
          <g>
            {/* Merge diamond */}
            <rect x={cx - 5} y={cy - 5} width={10} height={10} rx={2} fill={color} transform={`rotate(45 ${cx} ${cy})`} />
            <circle cx={cx} cy={cy} r={2} fill={theme.bgSidebar} />
            {/* Merge arrows pointing inward */}
            {row.branchTo.map((bl) => {
              const toX = bl * LANE_WIDTH + LANE_WIDTH / 2 + 4;
              const blColor = LANE_COLORS[bl % LANE_COLORS.length];
              const dx = toX > cx ? 1 : -1;
              return <circle key={`ma-${bl}`} cx={cx + dx * 8} cy={cy} r={2} fill={blColor} opacity={0.6} />;
            })}
          </g>
        ) : (
          <>
            <circle cx={cx} cy={cy} r={isHead ? NODE_R + 1.5 : NODE_R} fill={isHead ? color : theme.bgSidebar} stroke={color} strokeWidth={2} />
            {isHead && <circle cx={cx} cy={cy} r={NODE_R + 5} fill="none" stroke={color} strokeWidth={1.2} opacity={0.3} />}
          </>
        )}
      </svg>

      {/* Commit info */}
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 1, padding: "2px 8px 2px 2px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 5, minWidth: 0 }}>
          {onToggleMerge && (
            <button onClick={(e) => { e.stopPropagation(); onToggleMerge(); }}
              style={{ background: "transparent", border: "none", cursor: "pointer", padding: 0, color: theme.textMuted, display: "flex", alignItems: "center", flexShrink: 0 }}
              title={isExpanded ? "Collapse merged commits" : "Expand merged commits"}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none"
                style={{ transition: "transform 0.15s", transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)" }}>
                <path d="M5 3L9 7L5 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          )}
          {headRef && (
            <span style={{ fontSize: 9, fontWeight: 700, color: "#fff", background: theme.accent, padding: "1px 5px", borderRadius: 4, whiteSpace: "nowrap", fontFamily: MONO, lineHeight: "14px", flexShrink: 0 }}>
              {headRef.replace("HEAD -> ", "")}
            </span>
          )}
          {otherRefs.map((ref) => (
            <span key={ref} style={{ fontSize: 9, fontWeight: 600, color: theme.accent, background: theme.accentBg, border: `1px solid ${theme.accentBorder}`, padding: "0px 5px", borderRadius: 4, whiteSpace: "nowrap", fontFamily: MONO, lineHeight: "14px", flexShrink: 0 }}>
              {ref.replace("origin/", "o/")}
            </span>
          ))}
          {tagRefs.map((ref) => (
            <span key={ref} style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 9, fontWeight: 600, color: "#e0af68", background: "rgba(224,175,104,0.12)", border: "1px solid rgba(224,175,104,0.3)", padding: "0px 5px", borderRadius: 4, whiteSpace: "nowrap", fontFamily: MONO, lineHeight: "14px", flexShrink: 0 }}>
              <svg width="8" height="8" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0 }}>
                <path d="M2.5 2.5h4.3L12 7.7a.7.7 0 0 1 0 1L8.7 12a.7.7 0 0 1-1 0L2.5 6.8V2.5z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
                <circle cx="5.5" cy="5.5" r="1" fill="currentColor" />
              </svg>
              {ref.replace("tag: ", "")}
            </span>
          ))}
          {row.isMerge && (
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0, color: theme.terminal.magenta }}>
              <path d="M3 2v5c0 2.5 2 5 4 5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
              <path d="M11 2v5c0 2.5-2 5-4 5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
              <circle cx="7" cy="12" r="1.2" fill="currentColor" />
            </svg>
          )}
          <span style={{ fontSize: 12, color: isHead ? theme.textPrimary : theme.textSecondary, fontWeight: isHead ? 500 : 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontFamily: SF }}>
            {row.commit.message}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 10, color: theme.textMuted, fontFamily: MONO }}>
          <span>{row.commit.short_hash}</span>
          <span style={{ fontFamily: SF }}>{row.commit.author}</span>
          <span style={{ fontFamily: SF }}>{row.commit.time_ago}</span>
        </div>
      </div>
    </div>
  );
}

// ── Collapsed Merge Indicator ──

function CollapsedMerge({
  count, lane, activeLanes, mergedBranch, onExpand, theme,
}: {
  count: number;
  lane: number;
  activeLanes: number[];
  mergedBranch: string | null;
  onExpand: () => void;
  theme: ReturnType<typeof useAppStore.getState>["theme"];
}) {
  const maxLane = Math.max(0, ...activeLanes, lane);
  const svgW = (maxLane + 2) * LANE_WIDTH;
  const lx = lane * LANE_WIDTH + LANE_WIDTH / 2 + 4;
  const laneColor = LANE_COLORS[lane % LANE_COLORS.length];

  return (
    <div
      onClick={onExpand}
      style={{ display: "flex", alignItems: "center", height: 28, borderRadius: 4, cursor: "pointer", transition: "background 0.1s", gap: 6 }}
      onMouseEnter={(e) => { e.currentTarget.style.background = theme.bgHover; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
      title="Click to expand merged commits"
    >
      <svg width={svgW} height={28} style={{ flexShrink: 0, minWidth: svgW }}>
        {activeLanes.map((l) => {
          const x = l * LANE_WIDTH + LANE_WIDTH / 2 + 4;
          const lc = LANE_COLORS[l % LANE_COLORS.length];
          return <line key={l} x1={x} y1={0} x2={x} y2={28} stroke={lc} strokeWidth={1.5} opacity={0.25} />;
        })}
        {/* Three dots indicating collapsed commits */}
        <circle cx={lx} cy={8} r={2} fill={laneColor} opacity={0.6} />
        <circle cx={lx} cy={14} r={2} fill={laneColor} opacity={0.6} />
        <circle cx={lx} cy={20} r={2} fill={laneColor} opacity={0.6} />
      </svg>
      <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ color: theme.textMuted, flexShrink: 0 }}>
          <path d="M4 2.5L7.5 6L4 9.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span style={{ fontSize: 11, color: theme.textMuted, fontFamily: SF }}>
          {count} commit{count !== 1 ? "s" : ""}
          {mergedBranch && <span style={{ color: laneColor, fontFamily: MONO, fontWeight: 600 }}> {mergedBranch}</span>}
          <span style={{ fontStyle: "italic", opacity: 0.7 }}> — expand</span>
        </span>
      </div>
    </div>
  );
}

// ── File Entry ──

function FileEntry({ file, isDark, theme }: {
  file: GitFileStatus;
  isDark: boolean;
  theme: ReturnType<typeof useAppStore.getState>["theme"];
}) {
  const meta = STATUS_META.find((s) => s.code === file.status);
  const color = meta ? (isDark ? meta.darkColor : meta.lightColor) : theme.textSecondary;
  const label = meta?.label || file.status;
  const fileName = file.path.split("/").pop() || file.path;
  const dir = file.path.includes("/") ? file.path.slice(0, file.path.lastIndexOf("/") + 1) : "";

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "3px 8px", borderRadius: 4, fontSize: 12, fontFamily: MONO, transition: "background 0.1s", cursor: "default" }}
      title={`${label}: ${file.path}`}
      onMouseEnter={(e) => { e.currentTarget.style.background = theme.bgHover; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}>
      <span style={{ fontSize: 10, fontWeight: 700, color, width: 18, textAlign: "center", flexShrink: 0 }}>{file.status}</span>
      <span style={{ color: theme.textMuted, fontSize: 11, flexShrink: 0 }}>{dir}</span>
      <span style={{ color: theme.textPrimary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{fileName}</span>
    </div>
  );
}
