interface LegendItem {
  label: string;
  color: string;
  /** Renders as an outline ring instead of a filled swatch — for signals that overlay a node
   * (e.g. the circular-dependency border) rather than replacing its fill color. */
  ring?: boolean;
}

export default function Legend({ items }: { items: LegendItem[] }) {
  return (
    <div className="graph-legend">
      {items.map((item) => (
        <div className="legend-item" key={item.label}>
          <span
            className={`legend-swatch${item.ring ? " legend-swatch--ring" : ""}`}
            style={{ "--legend-color": item.color } as React.CSSProperties}
          />
          {item.label}
        </div>
      ))}
    </div>
  );
}
