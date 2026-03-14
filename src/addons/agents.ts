import React from "react";
import { registerAddon } from "../lib/addons";
import { AgentsPanelContent } from "../components/AgentsPanel";

registerAddon({
  id: "agents",
  label: "Agents",
  icon: (color: string) =>
    React.createElement(
      "svg",
      { width: 14, height: 14, viewBox: "0 0 14 14", fill: "none", style: { color } },
      // Robot head
      React.createElement("rect", { x: 3, y: 4, width: 8, height: 7, rx: 1.5, stroke: "currentColor", strokeWidth: 1.1 }),
      // Eyes
      React.createElement("circle", { cx: 5.5, cy: 7, r: 0.9, fill: "currentColor" }),
      React.createElement("circle", { cx: 8.5, cy: 7, r: 0.9, fill: "currentColor" }),
      // Antenna
      React.createElement("line", { x1: 7, y1: 4, x2: 7, y2: 2, stroke: "currentColor", strokeWidth: 1.1, strokeLinecap: "round" }),
      React.createElement("circle", { cx: 7, cy: 1.5, r: 0.7, fill: "currentColor" }),
      // Mouth
      React.createElement("line", { x1: 5.5, y1: 9.5, x2: 8.5, y2: 9.5, stroke: "currentColor", strokeWidth: 0.8, strokeLinecap: "round" })
    ),
  component: AgentsPanelContent,
  order: 40,
});
