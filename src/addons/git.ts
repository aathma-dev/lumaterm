import React from "react";
import { registerAddon } from "../lib/addons";
import { GitPanelContent } from "../components/GitPanel";

registerAddon({
  id: "git",
  label: "Git",
  icon: (color: string) =>
    React.createElement(
      "svg",
      { width: 14, height: 14, viewBox: "0 0 14 14", fill: "none", style: { color } },
      React.createElement("circle", { cx: 7, cy: 2.5, r: 1.8, stroke: "currentColor", strokeWidth: 1.2 }),
      React.createElement("circle", { cx: 7, cy: 11.5, r: 1.8, stroke: "currentColor", strokeWidth: 1.2 }),
      React.createElement("circle", { cx: 11.5, cy: 7, r: 1.8, stroke: "currentColor", strokeWidth: 1.2 }),
      React.createElement("path", { d: "M7 4.3v5.4M8.8 8l1.5-1", stroke: "currentColor", strokeWidth: 1.2 })
    ),
  component: GitPanelContent,
  order: 20,
});
