import React from "react";
import { registerAddon } from "../lib/addons";
import { SystemView } from "../components/InfoPanel";

registerAddon({
  id: "system",
  label: "System",
  icon: (color: string) =>
    React.createElement(
      "svg",
      { width: 14, height: 14, viewBox: "0 0 14 14", fill: "none", style: { color } },
      React.createElement("rect", { x: 1.5, y: 1.5, width: 11, height: 8, rx: 1.5, stroke: "currentColor", strokeWidth: 1.2 }),
      React.createElement("path", { d: "M5 12.5h4M7 9.5v3", stroke: "currentColor", strokeWidth: 1.2, strokeLinecap: "round" })
    ),
  component: SystemView,
  order: 10,
});
