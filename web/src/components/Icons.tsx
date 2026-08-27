import type { SVGProps } from "react";

// Hand-rolled, dependency-free line icons (16x16, 1.5 stroke) — kept as simple geometric shapes
// that are easy to draw precisely without an icon library, each chosen to actually mean something
// about its view rather than being decorative: a grid for the metrics dashboard, a network for the
// dependency graph, stacked bars for architectural layers, a folded page for the auto-generated
// diagram, a diamond echoing the symbol-shape language, ascending bars for hotspot ranking.

const base: SVGProps<SVGSVGElement> = {
  width: 15,
  height: 15,
  viewBox: "0 0 16 16",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round",
  strokeLinejoin: "round",
};

export function OverviewIcon() {
  return (
    <svg {...base}>
      <rect x="2" y="2" width="5" height="5" rx="1" />
      <rect x="9" y="2" width="5" height="5" rx="1" />
      <rect x="2" y="9" width="5" height="5" rx="1" />
      <rect x="9" y="9" width="5" height="5" rx="1" />
    </svg>
  );
}

export function GraphIcon() {
  return (
    <svg {...base}>
      <circle cx="8" cy="3" r="1.8" />
      <circle cx="3" cy="12" r="1.8" />
      <circle cx="13" cy="12" r="1.8" />
      <path d="M6.7 4.5 L4.3 10.5 M9.3 4.5 L11.7 10.5" />
    </svg>
  );
}

export function ArchitectureIcon() {
  return (
    <svg {...base}>
      <rect x="2" y="2.5" width="12" height="3" rx="1" />
      <rect x="2" y="6.5" width="12" height="3" rx="1" />
      <rect x="2" y="10.5" width="12" height="3" rx="1" />
    </svg>
  );
}

export function BlueprintIcon() {
  return (
    <svg {...base}>
      <path d="M3 2 H10 L13 5 V14 H3 Z" />
      <path d="M10 2 V5 H13" />
      <path d="M5.5 8.5 L10.5 8.5 M5.5 11 L9 11" />
    </svg>
  );
}

export function SymbolsIcon() {
  return (
    <svg {...base}>
      <path d="M8 2 L14 8 L8 14 L2 8 Z" />
    </svg>
  );
}

export function HotspotsIcon() {
  return (
    <svg {...base}>
      <path d="M3 13 V9 M8 13 V5 M13 13 V2" />
    </svg>
  );
}
