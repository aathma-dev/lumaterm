import React from "react";
import { registerAddon } from "../lib/addons";
import { ContainerPanelContent } from "../components/DockerPanel";

registerAddon({
  id: "containers",
  label: "Containers",
  icon: (color: string) =>
    React.createElement(
      "svg",
      { width: 14, height: 14, viewBox: "0 0 14 14", fill: "none", style: { color } },
      React.createElement("rect", { x: 1, y: 7, width: 3, height: 3, rx: 0.5, stroke: "currentColor", strokeWidth: 1 }),
      React.createElement("rect", { x: 5.5, y: 7, width: 3, height: 3, rx: 0.5, stroke: "currentColor", strokeWidth: 1 }),
      React.createElement("rect", { x: 10, y: 7, width: 3, height: 3, rx: 0.5, stroke: "currentColor", strokeWidth: 1 }),
      React.createElement("rect", { x: 5.5, y: 3, width: 3, height: 3, rx: 0.5, stroke: "currentColor", strokeWidth: 1 })
    ),
  component: ContainerPanelContent,
  order: 30,
});
