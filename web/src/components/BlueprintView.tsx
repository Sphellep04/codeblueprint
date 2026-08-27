import { useMemo } from "react";
import type { ExplorerData, CodeGraph } from "../types";
import { computeBlueprint } from "../lib/blueprint";
import { LAYER_COLOR } from "../lib/layer";

interface BlueprintViewProps {
  data: ExplorerData;
  codeGraph: CodeGraph;
}

const BOX_WIDTH = 280;
const BOX_HEIGHT = 80;
const BOX_GAP = 70;
const TOP_MARGIN = 40;
const SIDE_MARGIN = 20;
const CANVAS_WIDTH = BOX_WIDTH + SIDE_MARGIN * 2 + 80;

/**
 * The auto-generated architecture diagram: layers stacked in a fixed vertical order (not
 * force-directed — this is meant to read like a diagram, not an exploratory graph) with weighted
 * arrows showing real cross-layer dependencies. Regenerated from computeBlueprint on every render,
 * so unlike a hand-drawn architecture doc it can never drift from the actual codebase.
 */
export default function BlueprintView({ data, codeGraph }: BlueprintViewProps) {
  const blueprint = useMemo(() => computeBlueprint(data, codeGraph), [data, codeGraph]);

  const centerX = SIDE_MARGIN + BOX_WIDTH / 2;
  const indexOf = new Map(blueprint.layers.map((l, i) => [l.layer, i]));
  const positions = new Map(
    blueprint.layers.map((l, i) => [l.layer, { x: centerX, y: TOP_MARGIN + i * (BOX_HEIGHT + BOX_GAP) + BOX_HEIGHT / 2 }])
  );
  const totalHeight = TOP_MARGIN * 2 + blueprint.layers.length * BOX_HEIGHT + Math.max(0, blueprint.layers.length - 1) * BOX_GAP;

  return (
    <div className="blueprint-view">
      <div className="blueprint-canvas" style={{ width: CANVAS_WIDTH, height: totalHeight }}>
        <svg className="blueprint-arrows" width={CANVAS_WIDTH} height={totalHeight}>
          <defs>
            <marker id="blueprint-arrowhead" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
              <path d="M0,0 L8,4 L0,8 Z" fill="#4d7fff" />
            </marker>
          </defs>
          {blueprint.edges.map((e) => {
            const from = positions.get(e.from);
            const to = positions.get(e.to);
            if (!from || !to) return null;
            const distance = Math.abs((indexOf.get(e.to) ?? 0) - (indexOf.get(e.from) ?? 0));
            const bow = distance > 1 ? 70 : 0;
            const midY = (from.y + to.y) / 2;
            return (
              <path
                key={`${e.from}->${e.to}`}
                d={`M ${from.x} ${from.y} C ${from.x + bow} ${midY}, ${to.x + bow} ${midY}, ${to.x} ${to.y}`}
                stroke="#4d7fff"
                strokeWidth={Math.min(5, 1.5 + Math.log2(e.count + 1))}
                fill="none"
                opacity={0.55}
                markerEnd="url(#blueprint-arrowhead)"
              />
            );
          })}
        </svg>
        {blueprint.layers.map((l, i) => (
          <div
            key={l.layer}
            className="blueprint-box"
            style={{
              top: TOP_MARGIN + i * (BOX_HEIGHT + BOX_GAP),
              left: SIDE_MARGIN,
              width: BOX_WIDTH,
              height: BOX_HEIGHT,
              borderColor: LAYER_COLOR[l.layer],
            }}
          >
            <div className="blueprint-box-title" style={{ color: LAYER_COLOR[l.layer] }}>
              {l.layer}
            </div>
            <div className="blueprint-box-count">
              {l.fileCount} file{l.fileCount === 1 ? "" : "s"}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
