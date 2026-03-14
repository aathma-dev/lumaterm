import { useState, useCallback } from "react";
import { useAppStore } from "../state/store";
import { ResizeHandle } from "./ResizeHandle";

export function BrowserPanel() {
  const browserUrl = useAppStore((s) => s.browserUrl);
  const setBrowserUrl = useAppStore((s) => s.setBrowserUrl);
  const browserWidth = useAppStore((s) => s.browserWidth);
  const setBrowserWidth = useAppStore((s) => s.setBrowserWidth);
  const t = useAppStore((s) => s.theme);
  const [inputUrl, setInputUrl] = useState(browserUrl);

  const handleGo = useCallback(() => {
    let url = inputUrl.trim();
    if (!url) return;
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      url = "https://" + url;
    }
    setBrowserUrl(url);
  }, [inputUrl, setBrowserUrl]);

  const hasUrl = browserUrl.trim().length > 0;

  return (
    <div
      style={{
        position: "relative",
        display: "flex",
        flexDirection: "column",
        width: browserWidth,
        minWidth: 200,
        borderLeft: `1px solid ${t.border}`,
        background: t.bg,
      }}
    >
      <ResizeHandle
        direction="vertical"
        position="left"
        onResize={setBrowserWidth}
      />

      {hasUrl ? (
        <>
          <div
            style={{
              display: "flex",
              gap: 6,
              padding: 8,
              borderBottom: `1px solid ${t.border}`,
            }}
          >
            <input
              value={inputUrl}
              onChange={(e) => setInputUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleGo();
              }}
              placeholder="Enter URL..."
              style={{
                flex: 1,
                background: t.bgInput,
                border: `1px solid ${t.border}`,
                color: t.textPrimary,
                padding: "5px 10px",
                borderRadius: 6,
                fontSize: 13,
                outline: "none",
                fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', system-ui, sans-serif",
                transition: "border-color 0.15s",
              }}
              onFocus={(e) => { e.currentTarget.style.borderColor = t.borderActive; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = t.border; }}
            />
            <button
              onClick={handleGo}
              style={{
                background: t.accent,
                border: "none",
                color: "#fff",
                padding: "5px 14px",
                borderRadius: 6,
                cursor: "pointer",
                fontSize: 13,
                fontWeight: 600,
                fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', system-ui, sans-serif",
              }}
            >
              Go
            </button>
          </div>
          <iframe
            src={browserUrl}
            style={{ flex: 1, border: "none", background: "#fff" }}
            sandbox="allow-same-origin allow-scripts allow-popups allow-forms"
            title="Browser Panel"
          />
        </>
      ) : (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            height: "100%",
            gap: 16,
            padding: 24,
            fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', system-ui, sans-serif",
          }}
        >
          <svg
            width="40"
            height="40"
            viewBox="0 0 40 40"
            fill="none"
            style={{ color: t.textMuted, opacity: 0.6 }}
          >
            <circle cx="20" cy="20" r="16" stroke="currentColor" strokeWidth="2" />
            <path d="M4 20h32" stroke="currentColor" strokeWidth="1.5" />
            <path
              d="M20 4c-4 4-6 10-6 16s2 12 6 16c4-4 6-10 6-16s-2-12-6-16z"
              stroke="currentColor"
              strokeWidth="1.5"
            />
          </svg>

          <div style={{ fontSize: 14, color: t.textSecondary, textAlign: "center" }}>
            Enter a URL to browse
          </div>

          <div style={{ display: "flex", gap: 6, width: "100%" }}>
            <input
              value={inputUrl}
              onChange={(e) => setInputUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleGo();
              }}
              placeholder="https://example.com"
              autoFocus
              style={{
                flex: 1,
                background: t.bgInput,
                border: `1px solid ${t.border}`,
                color: t.textPrimary,
                padding: "8px 12px",
                borderRadius: 8,
                fontSize: 13,
                outline: "none",
                fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', system-ui, sans-serif",
                transition: "border-color 0.15s",
              }}
              onFocus={(e) => { e.currentTarget.style.borderColor = t.borderActive; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = t.border; }}
            />
          </div>

          <button
            onClick={handleGo}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              background: t.accentBg,
              border: `1px solid ${t.accentBorder}`,
              color: t.accent,
              padding: "8px 24px",
              borderRadius: 8,
              cursor: "pointer",
              fontSize: 13,
              fontWeight: 500,
              fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', system-ui, sans-serif",
              transition: "all 0.15s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = t.accentBgHover;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = t.accentBg;
            }}
          >
            Navigate
          </button>

          <div style={{ fontSize: 11, color: t.textMuted, opacity: 0.7 }}>
            Press Enter or click Navigate
          </div>
        </div>
      )}
    </div>
  );
}
